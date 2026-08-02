import { Controller, Get, Param, Query, Req, Headers, UseGuards, ForbiddenException } from '@nestjs/common';
import { UsersService } from './users.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';

@UseGuards(FirebaseAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  // Clé admin (web admin / back-office) : bypass la vérification d'identité si valide.
  private isAdmin(k?: string) {
    const key = process.env.ADMIN_API_KEY;
    return !!key && k === key;
  }

  // S-fix (CRITIQUE) : la liste globale des profils est réservée au back-office
  // (X-Admin-Key). Sans garde, tout token Firebase valide aspirait la PII de tous les
  // users (email, poids, objectif, pushToken). `max` est aussi borné (1..500).
  @Get()
  list(@Query('max') max?: string, @Headers('x-admin-key') k?: string) {
    if (!this.isAdmin(k)) throw new ForbiddenException('Liste réservée à l\'administration');
    const n = Math.min(Math.max(parseInt(max || '200', 10) || 200, 1), 500);
    return this.users.list(n);
  }

  // S-fix IDOR : un user ne peut lire QUE son propre profil (:id = son email ou uid).
  // L'appelant avec X-Admin-Key valide est autorisé sur n'importe quel :id.
  @Get(':id')
  get(@Param('id') id: string, @Req() req: any, @Headers('x-admin-key') k?: string) {
    if (!this.isAdmin(k)) {
      const u = req?.user || {};
      const self = String(id || '').trim().toLowerCase();
      const email = String(u.email || '').trim().toLowerCase();
      const uid = String(u.uid || '').trim().toLowerCase();
      if (!self || (self !== email && self !== uid)) {
        throw new ForbiddenException('Accès interdit à ce profil');
      }
    }
    return this.users.get(id);
  }
}
