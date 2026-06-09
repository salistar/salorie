import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Server-side Gemini. The API key stays in the backend env (GEMINI_API_KEY) and
 * never ships in the client bundle — the app calls /ai/* instead of Gemini.
 */
@Injectable()
export class AiService {
  private genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
  private defaultModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  async generate(prompt: string, model?: string): Promise<string> {
    if (!this.genAI) throw new Error('GEMINI_API_KEY not configured');
    const m = this.genAI.getGenerativeModel({ model: model || this.defaultModel });
    const r = await m.generateContent(prompt);
    return (await r.response).text();
  }

  async vision(prompt: string, imageBase64: string, mimeType = 'image/jpeg', model?: string): Promise<string> {
    if (!this.genAI) throw new Error('GEMINI_API_KEY not configured');
    const m = this.genAI.getGenerativeModel({ model: model || this.defaultModel });
    const r = await m.generateContent([
      { text: prompt },
      { inlineData: { data: imageBase64, mimeType } },
    ]);
    return (await r.response).text();
  }
}
