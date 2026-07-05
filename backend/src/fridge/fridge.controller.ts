import { Body, Controller, Post, Req, UseGuards, BadRequestException, HttpException } from '@nestjs/common';
import { FridgeService, FridgeAnalysis } from './fridge.service';
import { ObjectiveContext } from '../objective/objective.types';
import { RedisService } from '../redis.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';

/** Body STATELESS de POST /fridge/analyze. */
interface AnalyzeFridgeDto {
  imageBase64: string;
  mime?: string;
  objective?: Partial<ObjectiveContext>;
}

/**
 * FridgeController — endpoint STATELESS d'analyse de frigo.
 * POST /fridge/analyze { imageBase64, mime?, objective }
 *   -> { detected, recipes, shoppingList }
 * Aucune persistance (pas de Mongo / Firestore).
 *
 * Sécurité : auth Firebase obligatoire (FirebaseAuthGuard) + anti-abus
 * 60 req/min/uid sur cet endpoint VISION coûteux (pattern BarcodeController).
 */
@UseGuards(FirebaseAuthGuard)
@Controller('fridge')
export class FridgeController {
  constructor(
    private readonly fridge: FridgeService,
    private readonly redis: RedisService,
  ) {}

  @Post('analyze')
  async analyze(@Req() req: any, @Body() body: AnalyzeFridgeDto): Promise<FridgeAnalysis> {
    const uid = req.user?.uid || req.user?.email || 'anon';
    const ok = await this.redis.rateLimit(`fridge:analyze:${String(uid).slice(0, 128)}`, 60, 60);
    if (!ok) throw new HttpException('Trop de requêtes — réessaie dans une minute.', 429);

    const img = body?.imageBase64;
    if (typeof img !== 'string' || img.length < 100 || img.length > 8_000_000) {
      throw new BadRequestException('imageBase64 required');
    }

    return this.fridge.analyze(img, body?.mime, body?.objective);
  }
}
