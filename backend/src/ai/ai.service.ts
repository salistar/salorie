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

  async generate(prompt: string, model?: string): Promise<string> {
    const genAI = await this.client();
    if (!genAI) throw new Error('GEMINI_API_KEY not configured');
    const m = model || this.defaultModel;
    const key = `ai:gen:${createHash('sha1').update(m + '|' + prompt).digest('hex')}`;
    const cached = await this.redis.getJSON<string>(key);
    if (cached != null) { this.logger.log('cache HIT /ai/generate'); return cached; }
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
  private visionModel = process.env.GEMINI_VISION_MODEL || 'gemini-2.5-flash-lite';

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
