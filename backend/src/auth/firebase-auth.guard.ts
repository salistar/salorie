import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import * as admin from 'firebase-admin';

/**
 * Verifies a Firebase ID token from the `Authorization: Bearer <token>` header.
 * On success, attaches the decoded token to `req.user`. (S3 fix — protects
 * previously-open endpoints from anonymous access.)
 */
@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();

    // Identite ADMIN par cle de service, ajoutee le 13 aout 2026.
    //
    // L'admin web appelle le backend avec `x-admin-key` et SANS jeton Firebase — il
    // n'agit pour aucun utilisateur, il n'en a donc aucun a presenter. Cette garde
    // exigeait pourtant un jeton : /ml/feedback/stats et /ml/feedback/train-request
    // (page Moderation) renvoyaient 401, tout comme /ml/cascade-stats, jamais utilisable
    // depuis sa creation. Le controleur portait deja un helper `isAdmin()` commente
    // « bypass la verification d'identite si valide » : l'intention existait, la garde ne
    // la mettait pas en oeuvre.
    //
    // Sur : ADMIN_API_KEY est un secret de 64 caracteres aleatoires, et son absence fait
    // desormais echouer FERME (cf. pipeline.controller). Une cle vide n'ouvre donc rien.
    const cleAdmin = String(process.env.ADMIN_API_KEY || '').trim();
    const cleFournie = String((req.headers && req.headers['x-admin-key']) || '').trim();
    if (cleAdmin && cleFournie && cleFournie === cleAdmin) {
      req.user = { uid: 'admin', admin: true };
      return true;
    }

    const header: string = (req.headers && req.headers.authorization) || '';
    const token = header.replace(/^Bearer\s+/i, '').trim();
    if (!token) throw new UnauthorizedException('Missing bearer token');

    try {
      if (!admin.apps.length) {
        const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
        if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT missing');
        admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
      }
      req.user = await admin.auth().verifyIdToken(token);
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
