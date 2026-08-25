import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createHash } from 'crypto';
import { RedisService } from '../redis.service';
import { SecretsService } from '../secrets.service';

/**
 * Server-side Gemini. The API key stays in the backend env (GEMINI_API_KEY) and
 * never ships in the client bundle — the app calls /ai/* instead of Gemini.
 *
 * OPTIMISATION : cache Redis des générations texte (clé = hash modèle+prompt) →
 * un prompt identique ne re-déclenche PAS d'appel Gemini. Additif, réponses
 * inchangées (mêmes textes), juste moins d'appels + plus rapide.
 */
/**
 * Le texte d'une reponse de fournisseur, quelle que soit sa forme.
 *
 * Trois formes coexistent : OpenAI (`choices[].message.content`), Cloudflare
 * (`result.response`) et Anthropic (`content[].text`).
 *
 * ## Le piege, et il a coute cher
 *
 * Cloudflare rend `result.response` **deja analyse** quand le modele emet du
 * JSON : un objet, pas une chaine. L'ancienne version faisait `String(text)`,
 * ce qui vaut alors « [object Object] » — quinze caracteres, non vides, donc
 * acceptes comme une reponse valide et journalises comme un succes.
 *
 * Consequence, verifiee le 25/08/2026 en interrogeant Cloudflare directement :
 * la meme question posee en prose rend une `string`, posee en JSON rend un
 * `object`. Donc TOUTE fonctionnalite qui demandait du JSON — analyses
 * hebdomadaires, plans de repas, analyse d'aliments — recevait
 * « [object Object] », echouait a l'analyser, et retombait en silence sur son
 * contenu hors-ligne. Les journaux disaient « texte servi par cloudflare ».
 * Depuis le 14/08/2026, date ou la cascade est passee sur Cloudflare en tete.
 *
 * On serialise donc l'objet au lieu de le stringifier : les appelants
 * extraient un `{...}` du texte et l'analysent, c'est exactement ce qu'ils
 * attendent.
 */
export function enTexte(v: any): string {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  // Un objet ou un tableau : c'est du JSON deja analyse par le fournisseur. On le
  // rend a l'etat de texte plutot que d'en faire « [object Object] ».
  try {
    return JSON.stringify(v).trim();
  } catch {
    return '';
  }
}

export function texteDeLaReponse(j: any): string {
  return enTexte(
    j?.choices?.[0]?.message?.content
      || j?.result?.response
      || (Array.isArray(j?.content) ? j.content.map((c: any) => c?.text || '').join('') : ''),
  );
}

@Injectable()
export class AiService {
  private readonly logger = new Logger('AiService');
  private defaultModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  // Client reconstruit quand la cle change. Il etait auparavant fige a la construction
  // du service : une cle corrigee dans l'admin — ou meme dans l'env — n'etait prise en
  // compte qu'apres redemarrage du conteneur.
  private genAI: GoogleGenerativeAI | null = null;
  private genAIKey = '';

  constructor(private redis: RedisService, private secrets: SecretsService) {}

  /** Client Gemini courant, ou null si aucune cle n'est configuree (admin ou env). */
  private async client(): Promise<GoogleGenerativeAI | null> {
    const key = await this.secrets.get('GEMINI_API_KEY');
    if (!key) { this.genAI = null; this.genAIKey = ''; return null; }
    if (key !== this.genAIKey) { this.genAI = new GoogleGenerativeAI(key); this.genAIKey = key; }
    return this.genAI;
  }

  /**
   * Plafond MENSUEL d'appels Gemini (protection coût, exigence B5). Incrémente
   * `gemini:count:YYYY-MM` dans Redis et bloque au-delà de GEMINI_MONTHLY_CAP.
   * - Non configuré (cap absent/≤0) → pas de plafond (comportement historique).
   * - Redis indisponible → dégrade OUVERT (impossible de compter sans lui) ; le
   *   rate-limit par utilisateur (controllers) reste la 1re barrière.
   * Appelé UNIQUEMENT juste avant un vrai appel Gemini (pas sur un cache-hit).
   */
  private async guardGeminiBudget(units = 1): Promise<void> {
    const cap = parseInt(process.env.GEMINI_MONTHLY_CAP || '0', 10);
    if (!cap || cap <= 0) return;
    const now = new Date();
    const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const n = await this.redis.incrCounter(`gemini:count:${month}`, units);
    if (n != null && n > cap) {
      this.logger.warn(`Plafond Gemini mensuel atteint (${n}/${cap})`);
      throw new Error('Quota IA mensuel atteint — réessaie le mois prochain.');
    }
  }

  /**
   * Cascade TEXTE, ajoutee le 13 aout 2026. Jusque-la, tout ce qui n'etait pas du scan
   * — coach IA, plan de repas, insights nocturnes, substitutions — passait par Gemini
   * SEUL. Or le compte Gemini n'a plus de credits (429 RESOURCE_EXHAUSTED) : ces quatre
   * fonctionnalites etaient donc mortes, et les insights basculaient en mode hors-ligne
   * chaque nuit sans que rien ne le signale.
   *
   * Ordre : GRATUITS d'abord (Cloudflare Workers AI, Groq), puis du moins cher au plus
   * cher. Chaque provider se saute proprement si sa cle est absente — les cles viennent
   * de l'admin (Firestore) ou de l'environnement, via SecretsService.
   */
  private async textCascade(prompt: string): Promise<{ text: string; engine: string } | null> {
    const ask = async (
      label: string, url: string, keyName: string, model: string,
      hdr?: (k: string) => Record<string, string>, body?: any,
    ): Promise<{ text: string; engine: string } | null> => {
      const key = await this.secrets.get(keyName);
      if (!key) return null;
      try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 30000);
        const r = await fetch(url, {
          method: 'POST',
          headers: hdr ? hdr(key) : { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
          body: JSON.stringify(body || {
            model, max_tokens: 1024, messages: [{ role: 'user', content: prompt }],
          }),
          signal: ctrl.signal,
        });
        clearTimeout(to);
        if (!r.ok) { this.logger.warn(`${label} ${r.status}: ${(await r.text()).slice(0, 160)}`); return null; }
        const j: any = await r.json();
        const s = texteDeLaReponse(j);
        if (s) return { text: s, engine: `${label}:${model}` };
        this.logger.warn(`${label} réponse vide`);
      } catch (e: any) { this.logger.warn(`${label} KO: ${e?.message}`); }
      return null;
    };

    const cfAccount = await this.secrets.get('CF_ACCOUNT_ID');
    const cfModel = process.env.CF_TEXT_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
    const dashBase = process.env.DASHSCOPE_BASE_URL;

    const tiers: Array<() => Promise<{ text: string; engine: string } | null>> = [
      // GRATUIT — Cloudflare Workers AI, meme quota que la vision (10 000 neurones/jour,
      // mais un appel texte coute une fraction de ce que coute une image).
      // `messages` et NON `prompt` : avec `prompt`, l'API de Cloudflare fait de la
      // COMPLETION BRUTE — le modele n'a pas de tour de parole a terminer, donc il
      // ne s'arrete jamais et remplit ses 1024 jetons. Constate le 22/08/2026 :
      // « reponds exactement par le mot OK » a rendu « OK » repete quarante fois
      // en 12 secondes. Le meme modele en mode conversation s'arrete tout seul.
      // Tous les autres fournisseurs de cette cascade recevaient deja `messages`.
      () => cfAccount
        ? ask('cloudflare', `https://api.cloudflare.com/client/v4/accounts/${cfAccount}/ai/run/${cfModel}`,
            'CF_API_TOKEN', cfModel, undefined,
            { messages: [{ role: 'user', content: prompt }], max_tokens: 1024 })
        : Promise.resolve(null),
      // GRATUIT — Groq, tres rapide.
      () => ask('groq', 'https://api.groq.com/openai/v1/chat/completions', 'GROQ_API_KEY',
        process.env.GROQ_TEXT_MODEL || 'llama-3.3-70b-versatile'),
      // Payants, du moins cher au plus cher.
      () => ask('deepseek', 'https://api.deepseek.com/chat/completions', 'DEEPSEEK_API_KEY',
        process.env.DEEPSEEK_TEXT_MODEL || 'deepseek-chat'),
      () => ask('mistral', 'https://api.mistral.ai/v1/chat/completions', 'MISTRAL_API_KEY',
        process.env.MISTRAL_TEXT_MODEL || 'mistral-small-latest'),
      () => ask('zhipu', 'https://open.bigmodel.cn/api/paas/v4/chat/completions', 'ZHIPU_API_KEY',
        process.env.ZHIPU_TEXT_MODEL || 'glm-4.5v'),
      // MiniMax : endpoint non standard, verifie en POST le 13 aout 2026 (HTTP 200).
      () => ask('minimax', 'https://api.minimaxi.chat/v1/text/chatcompletion_v2', 'MINIMAX_API_KEY',
        process.env.MINIMAX_TEXT_MODEL || 'MiniMax-M2'),
      // DashScope/Qwen : espace de travail Alibaba MaaS prive, d'ou la base URL en env.
      () => dashBase
        ? ask('dashscope', `${dashBase.replace(/\/+$/, '')}/chat/completions`, 'DASHSCOPE_API_KEY',
            process.env.DASHSCOPE_TEXT_MODEL || 'qwen-plus')
        : Promise.resolve(null),
      // Moonshot : endpoint INTERNATIONAL .ai — le .cn refuse cette cle en 401.
      () => ask('moonshot', 'https://api.moonshot.ai/v1/chat/completions', 'MOONSHOT_API_KEY',
        process.env.MOONSHOT_TEXT_MODEL || 'moonshot-v1-8k'),
      () => ask('xai', 'https://api.x.ai/v1/chat/completions', 'XAI_API_KEY',
        process.env.XAI_TEXT_MODEL || 'grok-2-latest'),
      () => ask('openai', 'https://api.openai.com/v1/chat/completions', 'OPENAI_API_KEY',
        process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini'),
      () => ask('anthropic', 'https://api.anthropic.com/v1/messages', 'ANTHROPIC_API_KEY',
        process.env.ANTHROPIC_TEXT_MODEL || 'claude-3-5-haiku-latest',
        (k) => ({ 'Content-Type': 'application/json', 'x-api-key': k, 'anthropic-version': '2023-06-01' }),
        { model: process.env.ANTHROPIC_TEXT_MODEL || 'claude-3-5-haiku-latest', max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }] }),
    ];

    for (const tier of tiers) {
      const t0 = Date.now();
      const res = await tier();
      const ms = Date.now() - t0;
      if (res) {
        this.logger.log(`texte servi par ${res.engine} (${ms}ms)`);
        void this.redis.recordAiCall('text', res.engine, ms);
        return res;
      }
    }
    void this.redis.recordAiCall('text', 'aucun_tier', 0);
    return null;
  }

  async generate(prompt: string, model?: string): Promise<string> {
    const m = model || this.defaultModel;
    const key = `ai:gen:${createHash('sha1').update(m + '|' + prompt).digest('hex')}`;
    const cached = await this.redis.getJSON<string>(key);
    if (cached != null) { this.logger.log('cache HIT /ai/generate'); return cached; }

    // Cascade AVANT Gemini : ses deux premiers tiers sont gratuits, et le compte Gemini
    // est sans credits. L'ordre inverse ferait echouer un appel sur deux inutilement.
    const alt = await this.textCascade(prompt);
    if (alt) { await this.redis.setJSON(key, alt.text, 21600); return alt.text; }

    const genAI = await this.client();
    if (!genAI) throw new Error('aucun provider IA disponible (ni cascade, ni Gemini)');
    await this.guardGeminiBudget();
    // Timeout dur (30 s) : un appel Gemini bloqué ne fige pas la requête indéfiniment.
    const gm = genAI.getGenerativeModel({ model: m }, { timeout: 30000 });
    const r = await gm.generateContent(prompt);
    const text = (await r.response).text();
    if (text) await this.redis.setJSON(key, text, 21600); // cache 6 h
    return text;
  }

  /** TTL du cache meal-plan : 7 jours (un même objectif+budget+conditions donne
   *  le même plan → inutile de re-payer Gemini pendant une semaine). */
  private static readonly MEALPLAN_CACHE_TTL = 604800; // 7 j en secondes

  /**
   * Génère (ou récupère) un plan de repas, caché par hash des ENTRÉES métier
   * (objectif + budget + conditions/restrictions…), pas du prompt brut. Deux
   * requêtes aux mêmes entrées partagent le même plan → 1 seul appel Gemini.
   *
   * ADDITIF : ne change ni la forme de réponse (string) ni la logique de
   * génération (délègue à generate()). Le cache est best-effort : si Redis est
   * KO, getJSON→null / setJSON no-op et on retombe sur une génération normale.
   *
   * @param inputs entrées métier déterminant le plan (sérialisées de façon
   *   STABLE pour la clé de cache). @param prompt prompt envoyé à Gemini.
   */
  async generateMealPlan(
    inputs: Record<string, unknown>,
    prompt: string,
    model?: string,
  ): Promise<string> {
    const genAI = await this.client();
    if (!genAI) throw new Error('GEMINI_API_KEY not configured');
    const m = model || this.defaultModel;
    // Sérialisation stable des entrées : clés triées → même hash quel que soit
    // l'ordre des propriétés fourni par l'appelant.
    const stable = JSON.stringify(inputs ?? {}, Object.keys(inputs ?? {}).sort());
    const key = `mealplan:${createHash('sha1').update(m + '|' + stable).digest('hex')}`;

    // 1) Tentative cache (silencieuse : getJSON renvoie null si Redis KO).
    const cached = await this.redis.getJSON<string>(key);
    if (cached != null) { this.logger.log('cache HIT meal-plan'); return cached; }

    // 2) Miss → génération (délègue à generate(), logique inchangée).
    const text = await this.generate(prompt, m);

    // 3) Mise en cache best-effort (setJSON no-op si Redis KO).
    if (text) await this.redis.setJSON(key, text, AiService.MEALPLAN_CACHE_TTL);
    return text;
  }

  // Vision : modèle LITE par défaut (latence 2-3× plus faible que flash, suffisant
  // pour reconnaître un plat / une machine). Overridable par GEMINI_VISION_MODEL.
  // `gemini-2.5-flash-lite` a ete RETIRE : l'API repond 404 « no longer available
  // to new users. Please update your code to use models/gemini-3.5-flash-lite ».
  // Constate le 25/08/2026 — /ai/vision rendait 500 sur chaque appel, donc trois
  // ecrans morts (scan d'equipement, recettes du frigo, photos de progression).
  private visionModel = process.env.GEMINI_VISION_MODEL || 'gemini-3.5-flash-lite';

  // Transcription : faster-whisper local (rapide, gratuit) → fallback Gemini audio.
  async transcribe(audioBase64: string, mimeType = 'audio/mp4', language?: string): Promise<{ text: string; engine: string }> {
    const whisperUrl = process.env.WHISPER_URL || 'http://whisper:9000';
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 30000);
      const r = await fetch(`${whisperUrl}/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioBase64, language: language || null }),
        signal: ctrl.signal,
      });
      clearTimeout(to);
      if (r.ok) {
        const j: any = await r.json();
        if (typeof j?.text === 'string') return { text: j.text, engine: 'whisper' };
      }
    } catch { /* whisper indisponible → fallback Gemini */ }
    const text = await this.vision('Transcribe this audio exactly as spoken. Reply with ONLY the raw transcription text, nothing else.', audioBase64, mimeType);
    return { text, engine: 'gemini' };
  }
  async vision(prompt: string, imageBase64: string, mimeType = 'image/jpeg', model?: string): Promise<string> {
    const genAI = await this.client();
    if (!genAI) throw new Error('GEMINI_API_KEY not configured');
    await this.guardGeminiBudget();
    const m = genAI.getGenerativeModel({ model: model || this.visionModel }, { timeout: 30000 });
    const r = await m.generateContent([
      { text: prompt },
      { inlineData: { data: imageBase64, mimeType } },
    ]);
    return (await r.response).text();
  }
}
