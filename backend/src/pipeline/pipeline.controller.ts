import { Controller, Get, Post, Param, Query, Headers, Body, ForbiddenException, PayloadTooLargeException, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PipelineService } from './pipeline.service';

// Gateway de lecture (CQRS read-side) sur le miroir Mongo. Protégé par X-Admin-Key
// si ADMIN_API_KEY est défini (sinon ouvert — dev). Le web admin appelle ces routes.
@Controller('pipeline')
export class PipelineController {
  // Borne de taille du payload webhook (anti-DoS mémoire) : 64 KiB sérialisés.
  private static readonly MAX_WEBHOOK_BYTES = 64 * 1024;

  constructor(private pipeline: PipelineService) {}

  private auth(key?: string) {
    const expected = process.env.ADMIN_API_KEY;
    // Clé OBLIGATOIRE : sans ADMIN_API_KEY défini, les routes admin sont fermées.
    if (!expected || key !== expected) throw new ForbiddenException('admin key invalide');
  }

  // Vérifie l'accès à /features/:userId : admin key valide OU le user demande SES
  // propres features (identité prouvée via X-User-Key == secret HMAC(userId), ou
  // en fallback l'admin key). Empêche l'énumération/IDOR des features d'autrui.
  private authFeatures(userId: string, adminKey?: string, userKey?: string) {
    const expectedAdmin = process.env.ADMIN_API_KEY;
    if (expectedAdmin && adminKey === expectedAdmin) return; // admin OK
    // Identité utilisateur : HMAC-SHA256(userId) avec un secret serveur.
    const secret = process.env.FEATURES_USER_SECRET;
    if (secret && userKey) {
      const expected = crypto.createHmac('sha256', secret).update(userId).digest('hex');
      const a = Buffer.from(userKey);
      const b = Buffer.from(expected);
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) return; // le user lit SES features
    }
    throw new ForbiddenException('acces features non autorise');
  }

  // Auth du sink webhook : admin key OU signature HMAC (X-Webhook-Signature) du body brut.
  // Fail-open UNIQUEMENT si aucun secret n'est configuré (parité avec le mode dev "ouvert" des
  // autres routes, et compat avec la livraison interne actuelle qui n'envoie pas d'en-tête).
  // Dès qu'ADMIN_API_KEY ou WEBHOOK_SIGNING_SECRET est défini, l'auth devient obligatoire :
  // configurer alors la livraison outbox pour envoyer X-Admin-Key ou X-Webhook-Signature.
  private authWebhook(rawBody: string, adminKey?: string, signature?: string) {
    const expectedAdmin = process.env.ADMIN_API_KEY;
    const secret = process.env.WEBHOOK_SIGNING_SECRET;
    if (!expectedAdmin && !secret) return; // dev : aucun secret → ouvert (comportement historique)
    if (expectedAdmin && adminKey === expectedAdmin) return; // livraison interne (admin)
    if (secret && signature) {
      const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
      const a = Buffer.from(signature);
      const b = Buffer.from(expected);
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) return;
    }
    throw new ForbiddenException('webhook non autorise');
  }

  @Get('status')
  status(@Headers('x-admin-key') k?: string) { this.auth(k); return this.pipeline.status(); }

  @Get('events')
  events(@Headers('x-admin-key') k?: string, @Query('limit') limit?: string) {
    this.auth(k); return this.pipeline.recentEvents(Math.min(Number(limit) || 50, 200));
  }

  @Get('outbox')
  outbox(@Headers('x-admin-key') k?: string) { this.auth(k); return this.pipeline.outboxItems(); }

  @Get('features/:userId')
  features(
    @Param('userId') userId: string,
    @Headers('x-admin-key') k?: string,
    @Headers('x-user-key') userKey?: string,
  ) {
    this.authFeatures(userId, k, userKey);
    return this.pipeline.getFeatures(userId);
  }

  // Déclenche un cycle CDC à la demande (admin).
  @Post('sync')
  async sync(@Headers('x-admin-key') k?: string) { this.auth(k); return this.pipeline.runCdc(); }

  // Webhook sink interne (reçoit les livraisons outbox). Protégé (admin key OU
  // signature HMAC) + taille du body bornée (anti-DoS mémoire).
  @Post('webhook-sink')
  sink(
    @Body() body: any,
    @Headers('x-admin-key') k?: string,
    @Headers('x-webhook-signature') sig?: string,
  ) {
    // Sérialise une fois : sert à la fois de garde de taille et de base de signature.
    let raw: string;
    try {
      raw = JSON.stringify(body ?? {});
    } catch {
      throw new BadRequestException('body invalide');
    }
    if (Buffer.byteLength(raw, 'utf8') > PipelineController.MAX_WEBHOOK_BYTES) {
      throw new PayloadTooLargeException('payload webhook trop volumineux');
    }
    this.authWebhook(raw, k, sig);
    this.pipeline.recordWebhook(body);
    return { ok: true };
  }

  @Get('webhook-received')
  received(@Headers('x-admin-key') k?: string) { this.auth(k); return this.pipeline.getReceived(); }

  // Enqueue + livre un webhook de test (vérifie la chaîne outbox→livraison).
  @Post('test-outbox')
  testOutbox(@Headers('x-admin-key') k?: string) { this.auth(k); return this.pipeline.enqueueTest(); }
}
