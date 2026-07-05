import { Controller, Post, Query, UseGuards } from '@nestjs/common';
import { InsightsService } from './insights.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';

@UseGuards(FirebaseAuthGuard)
@Controller('insights')
export class InsightsController {
  constructor(private insights: InsightsService) {}

  // Manual trigger of the nightly precompute (for testing / on-demand refresh).
  @Post('precompute')
  precompute(@Query('max') max?: string) {
    return this.insights.precomputeAll(max ? parseInt(max, 10) : 1000);
  }
}
