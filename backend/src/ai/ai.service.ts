import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createHash } from 'crypto';
import { RedisService } from '../redis.service';

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
  private genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
  private defaultModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  constructor(private redis: RedisService) {}

  // #16 — plafond MENSUEL d'appels Gemini (protection coût, principe "≤10% payant").
  //   GEMINI_MONTHLY_CAP=0 (défaut) → désactivé. Compteur souple via Redis (une
  //   légère sous/sur-estimation sous forte concurrence est acceptable pour un
  //   plafond de sécurité). Au plafond → on jette : les appelants (cascade vision,
  //   insights) gèrent l'erreur et retombent gracieusement sur le reste.
  private async guardGeminiBudget(): Promise<void> {
    const cap = Number(process.env.GEMINI_MONTHLY_CAP || 0);
    if (!cap) return;
    const month = new Date().toISOString().slice(0, 7); // YYYY-MM
    const key = `gemini:count:${month}`;
    let n = 0;
    try { n = (await this.redis.getJSON<number>(key)) || 0; } catch {}
    if (n >= cap) {
      this.logger.warn(`Gemini cap mensuel atteint (${n}/${cap}) pour ${month} — appel refusé`);
      throw new Error('Gemini monthly cap reached');
    }
    try { await this.redis.setJSON(key, n + 1, 3456000); } catch {} // TTL ~40 j
  }

  async generate(prompt: string, model?: string): Promise<string> {
    if (!this.genAI) throw new Error('GEMINI_API_KEY not configured');
    const m = model || this.defaultModel;
    const key = `ai:gen:${createHash('sha1').update(m + '|' + prompt).digest('hex')}`;
    const cached = await this.redis.getJSON<string>(key);
    if (cached != null) { this.logger.log('cache HIT /ai/generate'); return cached; }
    await this.guardGeminiBudget();
    const gm = this.genAI.getGenerativeModel({ model: m });
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
    if (!this.genAI) throw new Error('GEMINI_API_KEY not configured');
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
    if (!this.genAI) throw new Error('GEMINI_API_KEY not configured');
    await this.guardGeminiBudget();
    const m = this.genAI.getGenerativeModel({ model: model || this.visionModel });
    const r = await m.generateContent([
      { text: prompt },
      { inlineData: { data: imageBase64, mimeType } },
    ]);
    return (await r.response).text();
  }
}
