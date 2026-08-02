import { Body, Controller, Post, UseGuards, BadRequestException, Req, HttpException } from '@nestjs/common';
import { AiService } from './ai.service';
import { RedisService } from '../redis.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';

@UseGuards(FirebaseAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private ai: AiService, private redis: RedisService) {}

  // Anti-abus : 30 appels IA / min / utilisateur (coût Gemini). 429 au-delà.
  private async limit(req: any, bucket: string) {
    const uid = req?.user?.uid || 'anon';
    const ok = await this.redis.rateLimit(`ai:${bucket}:${uid}`, 30, 60);
    if (!ok) throw new HttpException('Trop de requêtes IA — réessaie dans une minute.', 429);
  }

  @Post('generate')
  async generate(@Body() body: { prompt?: string; model?: string }, @Req() req: any) {
    await this.limit(req, 'gen');
    if (!body?.prompt || typeof body.prompt !== 'string') throw new BadRequestException('prompt required');
    if (body.prompt.length > 20000) throw new BadRequestException('prompt too long');
    return { text: await this.ai.generate(body.prompt, body.model) };
  }

  @Post('vision')
  async vision(@Body() body: { prompt?: string; imageBase64?: string; mimeType?: string; model?: string }, @Req() req: any) {
    await this.limit(req, 'vis');
    if (!body?.prompt || !body?.imageBase64) throw new BadRequestException('prompt and imageBase64 required');
    // S-fix : borne la taille de l'image AVANT tout envoi cloud (anti-abus coût/mémoire).
    if (typeof body.imageBase64 !== 'string' || body.imageBase64.length > 8_000_000)
      throw new BadRequestException('image too large');
    return { text: await this.ai.vision(body.prompt, body.imageBase64, body.mimeType || 'image/jpeg', body.model) };
  }

  // Vocal → texte : faster-whisper local (fallback Gemini). Limite 10 Mo base64.
  @Post('transcribe')
  async transcribe(@Body() body: { audioBase64?: string; mimeType?: string; language?: string }, @Req() req: any) {
    await this.limit(req, 'stt');
    if (!body?.audioBase64) throw new BadRequestException('audioBase64 required');
    if (body.audioBase64.length > 10_000_000) throw new BadRequestException('audio too large');
    return this.ai.transcribe(body.audioBase64, body.mimeType || 'audio/mp4', body.language);
  }
}
