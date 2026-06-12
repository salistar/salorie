import { Controller, Get, Post, Put, Delete, Param, Body, Headers, UseGuards, ForbiddenException } from '@nestjs/common';
import { NewsService } from './news.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';

// Journal de l'app : /news/admin/* (back-office, X-Admin-Key) + /news (app, token user).
@Controller('news')
export class NewsController {
  constructor(private svc: NewsService) {}

  private admin(k?: string) {
    const key = process.env.ADMIN_API_KEY;
    // Clé OBLIGATOIRE : sans ADMIN_API_KEY défini, les routes admin sont fermées.
    if (!key || k !== key) throw new ForbiddenException('admin key invalide');
  }

  @Get('admin')
  listAll(@Headers('x-admin-key') k?: string) { this.admin(k); return this.svc.listAll(); }
  @Post('admin')
  create(@Body() dto: any, @Headers('x-admin-key') k?: string) { this.admin(k); return this.svc.create(dto); }
  @Put('admin/:id')
  update(@Param('id') id: string, @Body() dto: any, @Headers('x-admin-key') k?: string) { this.admin(k); return this.svc.update(id, dto); }
  @Delete('admin/:id')
  remove(@Param('id') id: string, @Headers('x-admin-key') k?: string) { this.admin(k); return this.svc.remove(id); }

  @Get()
  @UseGuards(FirebaseAuthGuard)
  list() { return this.svc.listActive(); }
}
