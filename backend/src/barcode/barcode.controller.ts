import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { createHmac } from 'crypto';
import { BarcodeService } from './barcode.service';
import { RedisService } from '../redis.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { ObjectiveContext } from '../objective/objective.types';

/**
 * BarcodeController — "code-barres → verdict + alternatives + inconnus".
 *
 *  - POST /barcode/analyze       : produit → verdict vs objectif du jour.
 *  - POST /barcode/alternatives  : meilleures options de la même catégorie.
 *  - POST /barcode/pending       : soumet un produit inconnu (étiquette).
 *  - GET  /barcode/admin/pending            : file d'attente (x-admin-key).
 *  - POST /barcode/admin/pending/:id/validate : valide → custom_products.
 *  - POST /barcode/admin/pending/:id/reject   : rejette.
 *
 * Routes app : STATELESS (l'objectif du jour est fourni dans le body).
 * Routes admin : protégées par X-Admin-Key (même schéma que RacesController).
 */
@Controller('barcode')
export class BarcodeController {
  constructor(
    private readonly svc: BarcodeService,
    private readonly redis: RedisService,
  ) {}

  // Même garde admin que RacesController.admin() : clé OBLIGATOIRE.
  private admin(k?: string) {
    const key = process.env.ADMIN_API_KEY;
    if (!key || k !== key) throw new ForbiddenException('admin key invalide');
  }

  /**
   * Anti-abus sur les endpoints VISION coûteux (lookups OpenFoodFacts en cascade) :
   * 60 req/min par uid (routes stateless → uid dans le body), sinon repli sur l'IP.
   * Best-effort : dégrade OUVERT si Redis KO (rateLimit renvoie true), 429 si dépassé.
   */
  private async throttle(bucket: string, uid: string | undefined, req: any) {
    const id = (uid && String(uid).slice(0, 128)) || req?.ip || 'anon';
    const ok = await this.redis.rateLimit(`barcode:${bucket}:${id}`, 60, 60);
    if (!ok) throw new HttpException('Trop de requêtes — réessaie dans une minute.', 429);
  }

  /**
   * Garde d'entrée sur les images d'étiquette (base64) reçues par /pending :
   * fail-fast en 400 AVANT le service si l'image est présente mais invalide
   * (au lieu du drop silencieux de storeLabelImage). Cohérent avec les seuils
   * du service : taille décodée <= 8 Mo + magic-bytes JPEG (FFD8FF) / PNG
   * (89504E47). Image absente → autorisé (l'image d'étiquette est optionnelle).
   */
  private assertValidImage(imageBase64?: string) {
    if (imageBase64 == null || imageBase64 === '') return;
    if (typeof imageBase64 !== 'string') {
      throw new BadRequestException('image invalide');
    }
    const raw = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    let buf: Buffer;
    try {
      buf = Buffer.from(raw, 'base64');
    } catch {
      throw new BadRequestException('image invalide');
    }
    if (!buf.length) throw new BadRequestException('image invalide');
    if (buf.length > 8 * 1024 * 1024) {
      throw new BadRequestException('image trop volumineuse (max 8 Mo)');
    }
    const isJpeg = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    const isPng =
      buf.length > 8 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47;
    if (!isJpeg && !isPng) {
      throw new BadRequestException('format image non supporté (JPEG/PNG requis)');
    }
  }

  // ── App (stateless) ──

  // Garde Firebase ajoutee le 14 aout 2026 (audit). Ces deux routes IA etaient les
  // SEULES du module accessibles sans authentification : un anonyme pouvait declencher
  // la cascade a 60 appels/min par IP — et sans limite du tout si Redis tombait, le
  // rate-limit degradant OUVERT. L'app envoie deja le jeton (lib/objective/api.ts,
  // headers() identique a aiProxy) : aucun appelant legitime n'est casse.
  // L'uid du throttle vient desormais de req.user (identite verifiee), plus du body
  // que le client pouvait faire varier pour multiplier les buckets.
  @UseGuards(FirebaseAuthGuard)
  @Post('analyze')
  async analyze(
    @Req() req: any,
    @Body()
    body: {
      barcode?: string;
      product?: any;
      objective?: Partial<ObjectiveContext> | null;
    },
  ) {
    await this.throttle('analyze', req?.user?.uid, req);
    return this.svc.analyze({
      barcode: body?.barcode,
      product: body?.product,
      objective: body?.objective,
    });
  }

  @UseGuards(FirebaseAuthGuard)
  @Post('alternatives')
  async alternatives(
    @Req() req: any,
    @Body()
    body: {
      barcode?: string;
      category?: string;
      objective?: Partial<ObjectiveContext> | null;
    },
  ) {
    await this.throttle('alternatives', req?.user?.uid, req);
    return this.svc.alternatives({
      barcode: body?.barcode,
      category: body?.category,
      objective: body?.objective,
    });
  }

  /**
   * POST /barcode/pending — soumet un produit inconnu (authentifié).
   * L'uid est dérivé de req.user (jamais du body), throttlé (cap strict
   * 20/jour via Redis) puis PSEUDONYMISÉ (HMAC-SHA256, même schéma RGPD que
   * ml.service.recordScanFeedback) avant stockage : on ne persiste jamais
   * l'uid Firebase en clair.
   */
  @UseGuards(FirebaseAuthGuard)
  @Post('pending')
  async pending(
    @Req() req: any,
    @Body()
    body: { barcode?: string; imageBase64?: string; name?: string },
  ) {
    // Validation image (taille <= 8 Mo + magic-bytes JPEG/PNG) : rejet 400
    // AVANT throttle/service si l'image fournie est invalide.
    this.assertValidImage(body?.imageBase64);
    const uid = String(req?.user?.uid || '');
    await this.throttle('pending', uid, req);
    // Cap strict best-effort : 20 soumissions / jour / user.
    const ok = await this.redis.rateLimit(`barcode:pending:daily:${uid}`, 20, 86400);
    if (!ok) throw new HttpException('Limite quotidienne atteinte — réessaie demain.', 429);

    const secret =
      process.env.AL_HASH_SECRET || process.env.ADMIN_API_KEY || 'salorie-active-learning';
    const uidHash = uid
      ? createHmac('sha256', secret).update(uid).digest('hex').slice(0, 24)
      : null;

    return this.svc.submitPending({
      barcode: body?.barcode,
      imageBase64: body?.imageBase64,
      name: body?.name,
      uidHash,
    });
  }

  // ── Admin (x-admin-key) ──

  @Get('admin/pending')
  listPending(@Headers('x-admin-key') k?: string) {
    this.admin(k);
    return this.svc.listPending();
  }

  @Post('admin/pending/:id/validate')
  validate(@Param('id') id: string, @Headers('x-admin-key') k?: string) {
    this.admin(k);
    return this.svc.validatePending(id);
  }

  @Post('admin/pending/:id/reject')
  reject(@Param('id') id: string, @Headers('x-admin-key') k?: string) {
    this.admin(k);
    return this.svc.rejectPending(id);
  }
}
