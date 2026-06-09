import { Body, Controller, Post, UseGuards, BadRequestException } from '@nestjs/common';
import { AiService } from './ai.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';

@UseGuards(FirebaseAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private ai: AiService) {}

  @Post('generate')
  async generate(@Body() body: { prompt?: string; model?: string }) {
    if (!body?.prompt || typeof body.prompt !== 'string') throw new BadRequestException('prompt required');
    if (body.prompt.length > 20000) throw new BadRequestException('prompt too long');
    return { text: await this.ai.generate(body.prompt, body.model) };
  }

  @Post('vision')
  async vision(@Body() body: { prompt?: string; imageBase64?: string; mimeType?: string; model?: string }) {
    if (!body?.prompt || !body?.imageBase64) throw new BadRequestException('prompt and imageBase64 required');
    return { text: await this.ai.vision(body.prompt, body.imageBase64, body.mimeType || 'image/jpeg', body.model) };
  }
}
