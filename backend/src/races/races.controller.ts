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
    // Clé OBLIGATOIRE : sans ADMIN_API_KEY défini, les routes admin sont fermées.
    if (!key || k !== key) throw new ForbiddenException('admin key invalide');
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
  @Get('admin/medals')
  allMedals(@Headers('x-admin-key') k?: string) { this.admin(k); return this.svc.listAllMedals(); }

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
  // Leaderboard PUBLIC entre coureurs authentifiés : on expose le classement
  // (nom d'affichage + score + rang) SANS PII (pas d'email, pas d'uid Firebase).
  async board(@Param('id') id: string) {
    const rows: any[] = await this.svc.leaderboard(id);
    // S-fix : ne JAMAIS exposer un email dans le classement public. Les anciens membres
    // inscrits sans nom ont pu voir leur email stocké comme userName → on le masque.
    const safeName = (raw: any) => {
      const s = String(raw || '').trim();
      return !s || s.includes('@') ? 'Coureur' : s;
    };
    return rows.map((p: any) => ({
      name: safeName(p.userName),       // nom d'affichage (garde la forme mobile: `name`)
      userName: safeName(p.userName),   // rétro-compat clients existants
      cumulativeKm: p.cumulativeKm || 0,
      rank: p.rank || 0,
      finishedAt: p.finishedAt ?? null,
      startedAt: p.startedAt ?? null,
    }));
  }

  @Post(':id/join')
  @UseGuards(FirebaseAuthGuard)
  join(@Param('id') id: string, @Req() req: any, @Body() b: any) {
    // S-fix : ne pas stocker l'email comme nom d'affichage public (fallback générique).
    return this.svc.join(id, req.user.uid, req.user.email || '', b?.userName || req.user.name || 'Coureur');
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
