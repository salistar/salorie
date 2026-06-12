import { Controller, Get, Post, Put, Delete, Param, Body, Headers, Req, UseGuards, ForbiddenException } from '@nestjs/common';
import { OrgsService } from './orgs.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';

// B2B multi-tenant (coach / club / assureur / white-label).
//  - /orgs/admin/*  : super-admin (X-Admin-Key) — créer/gérer les organisations.
//  - /orgs/*        : utilisateur (token Firebase) — mes orgs, rejoindre, gérer mes membres/clients.
@Controller('orgs')
export class OrgsController {
  constructor(private svc: OrgsService) {}
  // Clé OBLIGATOIRE : sans ADMIN_API_KEY défini, les routes admin sont fermées.
  private admin(k?: string) { const key = process.env.ADMIN_API_KEY; if (!key || k !== key) throw new ForbiddenException('admin key invalide'); }

  // ── Super-admin ──
  @Post('admin')
  create(@Body() dto: any, @Headers('x-admin-key') k?: string) { this.admin(k); return this.svc.createOrg(dto); }
  @Get('admin')
  list(@Headers('x-admin-key') k?: string) { this.admin(k); return this.svc.listOrgs(); }
  @Put('admin/:id')
  update(@Param('id') id: string, @Body() dto: any, @Headers('x-admin-key') k?: string) { this.admin(k); return this.svc.updateOrg(id, dto); }
  @Delete('admin/:id')
  remove(@Param('id') id: string, @Headers('x-admin-key') k?: string) { this.admin(k); return this.svc.deleteOrg(id); }
  @Get('admin/:id/members')
  adminMembers(@Param('id') id: string, @Headers('x-admin-key') k?: string) { this.admin(k); return this.svc.listMembers(id); }
  @Post('admin/:id/invite')
  adminInvite(@Param('id') id: string, @Body() b: any, @Headers('x-admin-key') k?: string) { this.admin(k); return this.svc.createInvite(id, b?.role, b?.email, b?.coachUserId); }

  // ── App (token Firebase) ──
  @Get('mine')
  @UseGuards(FirebaseAuthGuard)
  mine(@Req() req: any) { return this.svc.myOrgs(req.user.uid); }

  @Post('join')
  @UseGuards(FirebaseAuthGuard)
  join(@Req() req: any, @Body() b: any) {
    return this.svc.joinByCode(req.user.uid, req.user.email || '', b?.userName || req.user.name || req.user.email || 'Membre', b?.code || '');
  }

  @Get(':id/members')
  @UseGuards(FirebaseAuthGuard)
  members(@Param('id') id: string) { return this.svc.listMembers(id); }

  @Post(':id/invite')
  @UseGuards(FirebaseAuthGuard)
  invite(@Param('id') id: string, @Req() req: any, @Body() b: any) {
    // un coach/owner crée une invite ; coachUserId = lui-même par défaut (rattache le client)
    return this.svc.createInvite(id, b?.role || 'client', b?.email || '', b?.coachUserId || req.user.uid);
  }

  @Get('clients')
  @UseGuards(FirebaseAuthGuard)
  clients(@Req() req: any) { return this.svc.clientsOfCoach(req.user.uid); }
}
