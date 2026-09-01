import { Body, Controller, Get, Post, Query, Req, Headers, UseGuards, BadRequestException, ForbiddenException, HttpException } from '@nestjs/common';
import { MlService } from './ml.service';
import { RedisService } from '../redis.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { AdminKeyGuard } from '../auth/admin-key.guard';

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

  /** Taille max d'une image décodée acceptée sur les endpoints vision (8 Mo). */
  private static readonly MAX_IMAGE_BYTES = 8 * 1024 * 1024;

  /**
   * Garde de sécurité pour les endpoints vision : valide qu'une image base64
   * (sans préfixe data-URI) est bien un JPEG (FF D8 FF) ou un PNG (89 50 4E 47)
   * et que sa taille décodée reste sous la limite. Rejette sinon (BadRequest).
   * N'altère PAS l'image renvoyée : validation en lecture seule.
   */
  private assertValidImage(imageBase64: unknown): void {
    if (typeof imageBase64 !== 'string' || imageBase64.length === 0)
      throw new BadRequestException('invalid image');
    // Tolère un éventuel préfixe data-URI pour la validation (le service reçoit le base64 tel quel).
    const b64 = imageBase64.startsWith('data:')
      ? imageBase64.slice(imageBase64.indexOf(',') + 1)
      : imageBase64;
    let buf: Buffer;
    try {
      buf = Buffer.from(b64, 'base64');
    } catch {
      throw new BadRequestException('invalid image');
    }
    if (buf.length === 0 || buf.length > MlController.MAX_IMAGE_BYTES)
      throw new BadRequestException('invalid image');
    const isJpeg = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    const isPng =
      buf.length > 8 &&
      buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    if (!isJpeg && !isPng) throw new BadRequestException('invalid image');
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
    this.assertValidImage(body.imageBase64);
    return this.ml.visionLocal(String(body.prompt || 'Describe the food/drink and return JSON.'), body.imageBase64, body.mimeType);
  }

  /** Estimation de portion (grammes) à partir d'une photo (Gemini Vision serveur). */
  @Post('portion-estimate')
  async portionEstimate(@Body() body: any, @Req() req: any) {
    await this.limit(req, 'portion');
    if (!body?.imageBase64) throw new BadRequestException('imageBase64 required');
    this.assertValidImage(body.imageBase64);
    return this.ml.portionEstimate(body.imageBase64, body.foodName);
  }

  /** Active learning : enregistre une correction de scan (image + vrai label) pour ré-entraîner.
   *  Anti-abus : 30 envois / min / utilisateur (sinon saturation disque du volume partagé). */
  @Post('feedback')
  async recordFeedback(@Req() req: any, @Body() body: any) {
    const uid = req.user?.uid || req.user?.email || 'anon';
    const ok = await this.redis.rateLimit(`mlfb:${uid}`, 30, 60);
    if (!ok) throw new HttpException('Trop de requêtes — réessaie dans une minute.', 429);
    const b64 = body?.imageBase64;
    if (typeof b64 !== 'string' || b64.length < 100)
      throw new BadRequestException('invalid image');
    this.assertValidImage(b64);
    if (body?.mimeType && !['image/jpeg', 'image/png'].includes(String(body.mimeType)))
      throw new BadRequestException('invalid mimeType');
    return this.ml.recordScanFeedback(body, uid);
  }

  /** Stats du dataset collecté (utilisateur authentifié). */
  @Get('feedback/stats')
  feedbackStats() {
    return this.ml.feedbackStats();
  }

  /** Chaque palier de vision repondra-t-il vraiment ? Interroge chaque
   *  fournisseur pour verifier que le modele qu'on appellera existe encore, et
   *  avec `?essai=1` lui envoie une vraie image.
   *  Ne renvoie aucune cle — seulement des noms de modeles.
   *
   *  ⚠ NE JAMAIS INSERER UNE ROUTE ENTRE UN `@UseGuards` ET SON `@Get`.
   *  C'est ce que j'ai fait le 01/09/2026 : le garde de `cascade-stats` s'est
   *  retrouve au-dessus de CETTE methode, et `cascade-stats` est parti en
   *  production sans protection — lisible par n'importe quel utilisateur
   *  authentifie, alors qu'il expose la telemetrie de la cascade et la part du
   *  cloud payant. Les decorateurs s'appliquent a ce qui SUIT, et un commentaire
   *  entre deux ne les separe pas visuellement pour autant. */
  @UseGuards(AdminKeyGuard)
  @Get('vision-tiers')
  visionTiers(@Query('essai') essai?: string) {
    // `?essai=1` envoie une vraie image a chaque fournisseur. Plus lent et
    // facturable au jeton pres, donc jamais par defaut.
    return this.ml.sonderPaliersVision(essai === '1');
  }

  /** Télémétrie cascade vision : usage par tier + taux cloud payant / cache (admin).
   *  Protégé par AdminKeyGuard (en-tête x-admin-key) EN PLUS de l'auth Firebase. */
  @UseGuards(AdminKeyGuard)
  @Get('cascade-stats')
  cascadeStats() {
    return this.ml.getCascadeStats();
  }

  /**
   * Serie temporelle des appels IA — par jour, genre (vision/texte) et moteur, avec la
   * latence moyenne. C'est ce que `cascade-stats` ne pouvait pas donner : il ne renvoie
   * que des totaux cumules depuis toujours, donc aucune courbe possible.
   * Retention 40 jours ; `days` borne a 40.
   */
  /**
   * Itineraire (Routes API) cote SERVEUR. L'app appelait Google directement avec une cle
   * embarquee dans l'APK, impossible a restreindre : un fetch React Native n'envoie ni
   * referent ni signature Android. Depuis ici, l'appel part d'une IP fixe et la cle peut
   * enfin etre restreinte par adresse IP.
   * Limite de debit reutilisee : 30/min/utilisateur, comme les autres endpoints couteux.
   */
  @Post('route')
  async route(
    @Req() req: any,
    @Body() body: { origin?: any; destination?: any; mode?: 'WALK' | 'DRIVE'; etapes?: any[] },
  ) {
    await this.limit(req, 'route');
    const pt = (p: any) =>
      p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng))
        ? { lat: Number(p.lat), lng: Number(p.lng) }
        : null;
    const o = pt(body?.origin);
    const d = pt(body?.destination);
    if (!o || !d) throw new BadRequestException('origin et destination requis ({lat,lng})');
    const etapes = Array.isArray(body?.etapes)
      ? body.etapes.map(pt).filter((x): x is { lat: number; lng: number } => !!x)
      : [];
    const mode = body?.mode === 'DRIVE' ? 'DRIVE' : 'WALK';
    return this.ml.computeRoute(o, d, mode, etapes);
  }

  @UseGuards(AdminKeyGuard)
  @Get('ai-timeline')
  aiTimeline(@Query('days') days?: string) {
    const d = Math.min(40, Math.max(1, parseInt(days || '14', 10) || 14));
    return this.ml.getAiTimeline(d);
  }
}
