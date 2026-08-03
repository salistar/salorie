import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';

/**
 * Guard super-admin : exige l'en-tête `x-admin-key` === ADMIN_API_KEY.
 * Sans ADMIN_API_KEY défini côté serveur, toutes les routes protégées sont fermées.
 * (Fix audit : factorise la logique admin dupliquée copier-coller dans plusieurs contrôleurs.)
 */
@Injectable()
export class AdminKeyGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const key = process.env.ADMIN_API_KEY;
    const provided = req.headers && req.headers['x-admin-key'];
    if (!key || provided !== key) throw new ForbiddenException('admin key invalide');
    return true;
  }
}
