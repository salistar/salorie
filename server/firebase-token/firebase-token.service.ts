import {
  Injectable,
  OnModuleInit,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import * as admin from 'firebase-admin';
import { createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * Mints Firebase custom tokens for authenticated Clerk users.
 *
 * Flow:
 *   1. Verify the Clerk session JWT against Clerk's JWKS (signature + issuer).
 *   2. Resolve the user's primary email via the Clerk Backend API (the email
 *      is NOT in the default session token and must be fetched server-side so
 *      the client can't spoof it).
 *   3. Mint a Firebase custom token with uid = sanitized email, which matches
 *      the Firestore document key the app uses everywhere (users/{email}).
 *
 * Required env:
 *   CLERK_JWKS_URL     e.g. https://evident-drake-70.clerk.accounts.dev/.well-known/jwks.json
 *   CLERK_ISSUER       e.g. https://evident-drake-70.clerk.accounts.dev
 *   CLERK_SECRET_KEY   sk_test_... / sk_live_...
 *   FIREBASE_SERVICE_ACCOUNT   the service-account JSON, stringified (single line)
 */
@Injectable()
export class FirebaseTokenService implements OnModuleInit {
  private jwks: ReturnType<typeof createRemoteJWKSet>;

  onModuleInit() {
    const jwksUrl = process.env.CLERK_JWKS_URL;
    if (!jwksUrl) throw new Error('CLERK_JWKS_URL is not set');
    this.jwks = createRemoteJWKSet(new URL(jwksUrl));

    if (!admin.apps.length) {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
      if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set');
      const serviceAccount = JSON.parse(raw);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }
  }

  /** Verify the Clerk token and return its payload (sub + optional email claim). */
  private async verifyClerk(token: string): Promise<{ sub: string; email?: string }> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: process.env.CLERK_ISSUER,
      });
      if (!payload.sub) throw new Error('no sub');
      return { sub: payload.sub, email: payload.email as string | undefined };
    } catch {
      throw new UnauthorizedException('Invalid Clerk token');
    }
  }

  /** Fetch the user's primary email from Clerk's Backend API (not spoofable). */
  private async fetchPrimaryEmail(userId: string): Promise<string> {
    const secret = process.env.CLERK_SECRET_KEY;
    if (!secret) throw new InternalServerErrorException('CLERK_SECRET_KEY not set');

    const res = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    if (!res.ok) {
      throw new UnauthorizedException('Could not resolve Clerk user');
    }
    const u: any = await res.json();
    const primaryId = u.primary_email_address_id;
    const match = (u.email_addresses || []).find((e: any) => e.id === primaryId);
    const email = match?.email_address || u.email_addresses?.[0]?.email_address;
    if (!email) throw new UnauthorizedException('User has no email');
    return String(email).trim().toLowerCase();
  }

  /**
   * Main entry: Clerk bearer token in → Firebase custom token out.
   */
  async mintFirebaseToken(clerkToken: string): Promise<{ token: string; uid: string }> {
    const { sub, email: claimEmail } = await this.verifyClerk(clerkToken);
    // Prefer the signed `email` claim (not spoofable). Fall back to the Clerk
    // Backend API only if no claim is present and a secret key is configured.
    let email = claimEmail ? String(claimEmail).trim().toLowerCase() : '';
    if (!email && process.env.CLERK_SECRET_KEY) email = await this.fetchPrimaryEmail(sub);
    if (!email) throw new UnauthorizedException('No email claim on token');
    // uid = sanitized email = Firestore doc key used across the app.
    const uid = email;
    const token = await admin.auth().createCustomToken(uid, { email });
    return { token, uid };
  }
}
