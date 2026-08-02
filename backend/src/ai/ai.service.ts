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
    if (!this.genAI) throw new Error('GEMINI_API_KEY not configured');
    const m = model || this.defaultModel;
    const key = `ai:gen:${createHash('sha1').update(m + '|' + prompt).digest('hex')}`;
    const cached = await this.redis.getJSON<string>(key);
    if (cached != null) { this.logger.log('cache HIT /ai/generate'); return cached; }
    await this.guardGeminiBudget();
    // Timeout dur (30 s) : un appel Gemini bloqué ne fige pas la requête indéfiniment.
    const gm = this.genAI.getGenerativeModel({ model: m }, { timeout: 30000 });
    const r = await gm.generateContent(prompt);
    const text = (await r.response).text();
    if (text) await this.redis.setJSON(key, text, 21600); // cache 6 h
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
    const m = this.genAI.getGenerativeModel({ model: model || this.visionModel }, { timeout: 30000 });
    const r = await m.generateContent([
      { text: prompt },
      { inlineData: { data: imageBase64, mimeType } },
    ]);
    return (await r.response).text();
  }
}
