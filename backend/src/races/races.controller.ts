import { Controller, Get, Post, Put, Delete, Param, Body, Headers, Req, UseGuards, ForbiddenException } from '@nestjs/common';
import { RacesService } from './races.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';

// Courses virtuelles + médailles.
//  - Routes /admin/* : protégées par X-Admin-Key (si ADMIN_API_KEY défini) — web admin.
//  - Routes app : protégées par FirebaseAuthGuard (token utilisateur).
@Controller('races')
export class RacesController {
  constructor(private svc: RacesService) {}

  private admin(k?: string) {
    const key = process.env.ADMIN_API_KEY;
    if (key && k !== key) throw new ForbiddenException('admin key invalide');
  }

  // ── Admin ──
  @Post('admin')
  create(@Body() dto: any, @Headers('x-admin-key') k?: string) { this.admin(k); return this.svc.createRace(dto); }
  @Get('admin')
  list(@Headers('x-admin-key') k?: string) { this.admin(k); return this.svc.listRaces(); }
  @Put('admin/:id')
  update(@Param('id') id: string, @Body() dto: any, @Headers('x-admin-key') k?: string) { this.admin(k); return this.svc.updateRace(id, dto); }
  @Delete('admin/:id')
  remove(@Param('id') id: string, @Headers('x-admin-key') k?: string) { this.admin(k); return this.svc.deleteRace(id); }
  @Post('admin/:id/generate-medals')
  genMedals(@Param('id') id: string, @Headers('x-admin-key') k?: string) { this.admin(k); return this.svc.generateMedals(id); }

  // ── App (token Firebase) ──
  @Get('active')
  @UseGuards(FirebaseAuthGuard)
  active() { return this.svc.listActive(); }

  @Get('medals/me')
  @UseGuards(FirebaseAuthGuard)
  myMedals(@Req() req: any) { return this.svc.getUserMedals(req.user.uid); }

  @Get(':id')
  @UseGuards(FirebaseAuthGuard)
  get(@Param('id') id: string) { return this.svc.getRace(id); }

  @Get(':id/leaderboard')
  @UseGuards(FirebaseAuthGuard)
  board(@Param('id') id: string) { return this.svc.leaderboard(id); }

  @Post(':id/join')
  @UseGuards(FirebaseAuthGuard)
  join(@Param('id') id: string, @Req() req: any, @Body() b: any) {
    return this.svc.join(id, req.user.uid, req.user.email || '', b?.userName || req.user.name || req.user.email || 'Coureur');
  }

  @Post(':id/progress')
  @UseGuards(FirebaseAuthGuard)
  progress(@Param('id') id: string, @Req() req: any, @Body() b: any) {
    return this.svc.progress(id, req.user.uid, Number(b?.km) || 0);
  }

  @Post(':id/finish')
  @UseGuards(FirebaseAuthGuard)
  finish(@Param('id') id: string, @Req() req: any) { return this.svc.finish(id, req.user.uid); }
}
