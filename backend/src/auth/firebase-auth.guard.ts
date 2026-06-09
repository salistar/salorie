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
