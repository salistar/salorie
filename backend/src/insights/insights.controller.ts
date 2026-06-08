import { Controller, Post, Query } from '@nestjs/common';
import { InsightsService } from './insights.service';

@Controller('insights')
export class InsightsController {
  constructor(private insights: InsightsService) {}

  // Manual trigger of the nightly precompute (for testing / on-demand refresh).
  @Post('precompute')
  precompute(@Query('max') max?: string) {
    return this.insights.precomputeAll(max ? parseInt(max, 10) : 1000);
  }
}
