import { Body, Controller, Post, Req, UseGuards, BadRequestException, HttpException } from '@nestjs/common';
import { ReceiptService } from './receipt.service';
import { ObjectiveContext } from '../objective/objective.types';
import { RedisService } from '../redis.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';

/**
 * ReceiptController — endpoint STATELESS d'analyse de ticket de caisse.
 *
 * POST /receipt/analyze
 *   body : { imageBase64: string, mime?: string, objective?: ObjectiveContext }
 *   ->     { merchant, date, total, lines:[{raw,food,qty,price,verdict?}], ... }
 *
 * Pas de Mongo, pas de persistance : tout est dans la requête/réponse.
 *
 * Sécurité : auth Firebase obligatoire (FirebaseAuthGuard) + anti-abus
 * 60 req/min/uid sur cet endpoint VISION coûteux (pattern BarcodeController).
 */
@UseGuards(FirebaseAuthGuard)
@Controller('receipt')
export class ReceiptController {
  constructor(
    private readonly receipt: ReceiptService,
    private readonly redis: RedisService,
  ) {}

  @Post('analyze')
  async analyze(
    @Req() req: any,
    @Body()
    body: {
      imageBase64?: string;
      mime?: string;
      objective?: Partial<ObjectiveContext> | null;
    },
  ) {
    const uid = req.user?.uid || req.user?.email || 'anon';
    const ok = await this.redis.rateLimit(`receipt:analyze:${String(uid).slice(0, 128)}`, 60, 60);
    if (!ok) throw new HttpException('Trop de requêtes — réessaie dans une minute.', 429);

    const img = body?.imageBase64;
    if (typeof img !== 'string' || img.length < 100) {
      throw new BadRequestException('imageBase64 required');
    }
    if (img.length > 8_000_000) {
      throw new BadRequestException('invalid image (too large)');
    }
    const mime =
      typeof body?.mime === 'string' && body.mime ? body.mime : 'image/jpeg';
    return this.receipt.analyze(img, mime, body?.objective ?? null);
  }
}
