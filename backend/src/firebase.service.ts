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

  /**
   * Verification des jetons, en passant par `ensure()`.
   *
   * Le gateway temps reel appelait `admin.auth()` directement. Or ce module ne
   * s'initialise pas tout seul : sur un backend qui vient de demarrer,
   * `admin.apps` est VIDE tant qu'aucune requete HTTP protegee n'est passee par
   * `FirebaseAuthGuard`, qui l'initialise au vol. La toute premiere connexion
   * socket echouait donc toujours — et toutes les suivantes avec, jusqu'a ce
   * qu'une requete HTTP authentifiee arrive PAR HASARD. Appels du duo, chat de
   * course et presence etaient morts pendant ce temps, sans une ligne de
   * journal. Constate en production le 21/08/2026.
   */
  auth() { this.ensure(); return admin.auth(); }
}
