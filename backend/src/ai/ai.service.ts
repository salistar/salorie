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

  async generate(prompt: string, model?: string): Promise<string> {
    if (!this.genAI) throw new Error('GEMINI_API_KEY not configured');
    const m = model || this.defaultModel;
    const key = `ai:gen:${createHash('sha1').update(m + '|' + prompt).digest('hex')}`;
    const cached = await this.redis.getJSON<string>(key);
    if (cached != null) { this.logger.log('cache HIT /ai/generate'); return cached; }
    const gm = this.genAI.getGenerativeModel({ model: m });
    const r = await gm.generateContent(prompt);
    const text = (await r.response).text();
    if (text) await this.redis.setJSON(key, text, 21600); // cache 6 h
    return text;
  }

  // Vision : modèle LITE par défaut (latence 2-3× plus faible que flash, suffisant
  // pour reconnaître un plat / une machine). Overridable par GEMINI_VISION_MODEL.
  private visionModel = process.env.GEMINI_VISION_MODEL || 'gemini-2.5-flash-lite';
  async vision(prompt: string, imageBase64: string, mimeType = 'image/jpeg', model?: string): Promise<string> {
    if (!this.genAI) throw new Error('GEMINI_API_KEY not configured');
    const m = this.genAI.getGenerativeModel({ model: model || this.visionModel });
    const r = await m.generateContent([
      { text: prompt },
      { inlineData: { data: imageBase64, mimeType } },
    ]);
    return (await r.response).text();
  }
}
