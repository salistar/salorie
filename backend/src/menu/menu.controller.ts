import { Body, Controller, Post, Req, UseGuards, BadRequestException, HttpException } from '@nestjs/common';
import { MenuService } from './menu.service';
import { ObjectiveContext } from '../objective/objective.types';
import { RedisService } from '../redis.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';

/** Body STATELESS de POST /menu/analyze (aucune persistance Mongo). */
interface MenuAnalyzeBody {
  /** Image base64 (sans préfixe data:). */
  imageBase64: string;
  /** Type MIME (défaut image/jpeg). */
  mime?: string;
  /** Contexte d'objectif du jour, fourni par l'app. */
  objective?: Partial<ObjectiveContext>;
}

/**
 * MenuController — analyse d'une carte de restaurant.
 * POST /menu/analyze { imageBase64, mime?, objective } -> { items, recommended }.
 *
 * Sécurité : auth Firebase obligatoire (FirebaseAuthGuard) + anti-abus
 * 60 req/min/uid sur cet endpoint VISION coûteux (pattern BarcodeController).
 */
@UseGuards(FirebaseAuthGuard)
@Controller('menu')
export class MenuController {
  constructor(
    private readonly menu: MenuService,
    private readonly redis: RedisService,
  ) {}

  @Post('analyze')
  async analyze(@Req() req: any, @Body() body: MenuAnalyzeBody) {
    const uid = req.user?.uid || req.user?.email || 'anon';
    const ok = await this.redis.rateLimit(`menu:analyze:${String(uid).slice(0, 128)}`, 60, 60);
    if (!ok) throw new HttpException('Trop de requêtes — réessaie dans une minute.', 429);

    const img = body?.imageBase64;
    if (typeof img !== 'string' || img.length < 100 || img.length > 8_000_000) {
      throw new BadRequestException('imageBase64 required');
    }

    return this.menu.analyze(
      img,
      body?.mime || 'image/jpeg',
      body?.objective,
    );
  }
}
