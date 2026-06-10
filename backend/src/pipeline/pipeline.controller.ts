import { Controller, Get, Post, Param, Query, Headers, ForbiddenException } from '@nestjs/common';
import { PipelineService } from './pipeline.service';

// Gateway de lecture (CQRS read-side) sur le miroir Mongo. Protégé par X-Admin-Key
// si ADMIN_API_KEY est défini (sinon ouvert — dev). Le web admin appelle ces routes.
@Controller('pipeline')
export class PipelineController {
  constructor(private pipeline: PipelineService) {}

  private auth(key?: string) {
    const expected = process.env.ADMIN_API_KEY;
    if (expected && key !== expected) throw new ForbiddenException('admin key invalide');
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
  features(@Param('userId') userId: string, @Headers('x-admin-key') k?: string) {
    this.auth(k); return this.pipeline.getFeatures(userId);
  }

  // Déclenche un cycle CDC à la demande (admin).
  @Post('sync')
  async sync(@Headers('x-admin-key') k?: string) { this.auth(k); return this.pipeline.runCdc(); }
}
