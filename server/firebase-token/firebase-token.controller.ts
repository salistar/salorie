import { Controller, Post, Headers, UnauthorizedException } from '@nestjs/common';
import { FirebaseTokenService } from './firebase-token.service';

@Controller()
export class FirebaseTokenController {
  constructor(private readonly svc: FirebaseTokenService) {}

  /**
   * POST /firebase-token
   * Header: Authorization: Bearer <clerk session token>
   * Returns: { token: <firebase custom token>, uid: <email> }
   *
   * The mobile app calls this from lib/firebaseAuth.ts and then runs
   * signInWithCustomToken(auth, token).
   */
  @Post('firebase-token')
  async mint(@Headers('authorization') authHeader?: string) {
    const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
    if (!token) throw new UnauthorizedException('Missing Authorization bearer token');
    return this.svc.mintFirebaseToken(token);
  }
}
