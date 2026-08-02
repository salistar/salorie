import { Body, Controller, Get, Post, Query, Req, Headers, UseGuards, BadRequestException, ForbiddenException, HttpException } from '@nestjs/common';
import { MlService } from './ml.service';
import { RedisService } from '../redis.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';

@UseGuards(FirebaseAuthGuard)
@Controller('ml')
export class MlController {
  constructor(private ml: MlService, private redis: RedisService) {}

  // Clé admin (web admin / back-office) : bypass la vérification d'identité si valide.
  private isAdmin(k?: string) {
    const key = process.env.ADMIN_API_KEY;
    return !!key && k === key;
  }

  // S-fix : anti-abus sur les endpoints IA coûteux (Gemini Vision) — 30/min/user, 429 au-delà.
  private async limit(req: any, bucket: string) {
    const uid = req?.user?.uid || 'anon';
    const ok = await this.redis.rateLimit(`ml:${bucket}:${uid}`, 30, 60);
    if (!ok) throw new HttpException('Trop de requêtes — réessaie dans une minute.', 429);
  }

  /** Prévision de poids + plateau pour l'utilisateur authentifié. */
  // S-fix IDOR : si un email/uid est fourni en query, il DOIT correspondre à
  // l'utilisateur authentifié (sinon lecture du poids d'autrui). X-Admin-Key valide bypass.
  @Get('weight-forecast')
  weightForecast(
    @Req() req: any,
    @Query('targetWeight') target?: string,
    @Query('email') email?: string,
    @Query('uid') uid?: string,
    @Headers('x-admin-key') k?: string,
  ) {
    const self = req.user?.uid || req.user?.email;
    if (!self) throw new BadRequestException('no user');
    const requested = String(email || uid || '').trim();
    if (requested && !this.isAdmin(k)) {
      const want = requested.toLowerCase();
      const myEmail = String(req.user?.email || '').trim().toLowerCase();
      const myUid = String(req.user?.uid || '').trim().toLowerCase();
      if (want !== myEmail && want !== myUid) {
        throw new ForbiddenException('Accès interdit à cette prévision');
      }
    }
    const targetFor = this.isAdmin(k) && requested ? requested : self;
    return this.ml.weightForecast(targetFor, target ? Number(target) : undefined);
  }

  /** Recommandation de repas selon macros restantes + objectif. */
  @Post('meal-reco')
  mealReco(@Body() body: any) {
    return this.ml.mealReco(body || {});
  }

  /** Vision via MODÈLE LOCAL auto-hébergé (Ollama) + repli API food — PAS Gemini. */
  @Post('vision')
  async visionLocal(@Body() body: any, @Req() req: any) {
    await this.limit(req, 'vision');
    if (!body?.imageBase64) throw new BadRequestException('imageBase64 required');
    if (typeof body.imageBase64 !== 'string' || body.imageBase64.length > 8_000_000)
      throw new BadRequestException('invalid image');
    return this.ml.visionLocal(String(body.prompt || 'Describe the food/drink and return JSON.'), body.imageBase64, body.mimeType);
  }

  /** Estimation de portion (grammes) à partir d'une photo (Gemini Vision serveur). */
  @Post('portion-estimate')
  async portionEstimate(@Body() body: any, @Req() req: any) {
    await this.limit(req, 'portion');
    if (!body?.imageBase64) throw new BadRequestException('imageBase64 required');
    if (typeof body.imageBase64 !== 'string' || body.imageBase64.length > 8_000_000)
      throw new BadRequestException('invalid image');
    return this.ml.portionEstimate(body.imageBase64, body.foodName);
  }
}
