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
    // S-fix : ne pas exposer l'email comme nom d'affichage (fallback générique).
    return this.svc.joinByCode(req.user.uid, req.user.email || '', b?.userName || req.user.name || 'Membre', b?.code || '');
  }

  // S-fix (IDOR) : seuls les MEMBRES ACTIFS de l'org peuvent lister ses membres.
  @Get(':id/members')
  @UseGuards(FirebaseAuthGuard)
  async members(@Param('id') id: string, @Req() req: any) {
    if (!(await this.svc.isActiveMember(id, req.user.uid))) throw new ForbiddenException('Réservé aux membres de l\'organisation');
    return this.svc.listMembers(id);
  }

  // S-fix (CRITIQUE — takeover B2B) : seul un owner/coach ACTIF de CETTE org peut inviter,
  // et le rôle est FORCÉ à 'client' (jamais choisi par l'appelant). L'attribution
  // owner/coach passe exclusivement par la route admin (X-Admin-Key).
  @Post(':id/invite')
  @UseGuards(FirebaseAuthGuard)
  async invite(@Param('id') id: string, @Req() req: any, @Body() b: any) {
    // canManageOrg = membre ACTIF de rôle owner ou coach — équivalent au contrôle en ligne
    // qu'il remplace. Le rôle de l'invitation reste codé en dur : `b?.role` permettrait à un
    // coach d'émettre une invitation « owner » et de prendre l'organisation.
    if (!(await this.svc.canManageOrg(id, req.user.uid))) throw new ForbiddenException('Réservé aux coachs/propriétaires de l\'organisation');
    return this.svc.createInvite(id, 'client', b?.email || '', req.user.uid);
  }

  @Get('clients')
  @UseGuards(FirebaseAuthGuard)
  clients(@Req() req: any) { return this.svc.clientsOfCoach(req.user.uid); }
}
