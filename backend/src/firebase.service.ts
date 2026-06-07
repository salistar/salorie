import { Injectable } from '@nestjs/common';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseService {
  private app: admin.app.App | null = null;

  private ensure() {
    if (this.app) return this.app;
    if (admin.apps.length) { this.app = admin.app(); return this.app; }
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT missing');
    this.app = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
    return this.app;
  }

  db() { this.ensure(); return admin.firestore(); }
}
