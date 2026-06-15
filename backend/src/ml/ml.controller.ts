import { Body, Controller, Get, Post, Query, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { MlService } from './ml.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';

@UseGuards(FirebaseAuthGuard)
@Controller('ml')
export class MlController {
  constructor(private ml: MlService) {}

  /** Prévision de poids + plateau pour l'utilisateur authentifié. */
  @Get('weight-forecast')
  weightForecast(@Req() req: any, @Query('targetWeight') target?: string) {
    const email = req.user?.uid || req.user?.email;
    if (!email) throw new BadRequestException('no user');
    return this.ml.weightForecast(email, target ? Number(target) : undefined);
  }

  /** Recommandation de repas selon macros restantes + objectif. */
  @Post('meal-reco')
  mealReco(@Body() body: any) {
    return this.ml.mealReco(body || {});
  }

  /** Vision via MODÈLE LOCAL auto-hébergé (Ollama) + repli API food — PAS Gemini. */
  @Post('vision')
  visionLocal(@Body() body: any) {
    if (!body?.imageBase64) throw new BadRequestException('imageBase64 required');
    if (typeof body.imageBase64 !== 'string' || body.imageBase64.length > 8_000_000)
      throw new BadRequestException('invalid image');
    return this.ml.visionLocal(String(body.prompt || 'Describe the food/drink and return JSON.'), body.imageBase64, body.mimeType);
  }

  /** Estimation de portion (grammes) à partir d'une photo (Gemini Vision serveur). */
  @Post('portion-estimate')
  portionEstimate(@Body() body: any) {
    if (!body?.imageBase64) throw new BadRequestException('imageBase64 required');
    if (typeof body.imageBase64 !== 'string' || body.imageBase64.length > 8_000_000)
      throw new BadRequestException('invalid image');
    return this.ml.portionEstimate(body.imageBase64, body.foodName);
  }
}
