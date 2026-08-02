import { Controller, Post, Query, Headers, UseGuards, ForbiddenException } from '@nestjs/common';
import { InsightsService } from './insights.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';

@UseGuards(FirebaseAuthGuard)
@Controller('insights')
export class InsightsController {
  constructor(private insights: InsightsService) {}

  // Déclenchement manuel du précalcul nocturne (test / rafraîchissement à la demande).
  // S-fix (CRITIQUE) : opération POPULATION-WIDE (traite tous les users + brûle le quota
  // Gemini). Réservée au back-office (X-Admin-Key) — un simple token Firebase ne suffit
  // plus. `max` borné pour éviter un balayage massif.
  @Post('precompute')
  precompute(@Query('max') max?: string, @Headers('x-admin-key') k?: string) {
    const key = process.env.ADMIN_API_KEY;
    if (!key || k !== key) throw new ForbiddenException('Réservé à l\'administration');
    const n = Math.min(Math.max(parseInt(max || '1000', 10) || 1000, 1), 5000);
    return this.insights.precomputeAll(n);
  }
}
