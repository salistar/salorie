import { Injectable } from '@nestjs/common';
// ⚠ FIREBASE-ADMIN 14 A SUPPRIME L'API A ESPACE DE NOMS.
// `admin.apps`, `admin.app()`, `admin.credential`, `admin.firestore()`,
// `admin.auth()` n'existent plus : seule la forme modulaire subsiste, un point
// d'entree par service. Le compilateur le dit clairement — c'est la rupture la
// plus bruyante de cette montee, et donc la moins dangereuse.
import { initializeApp, getApps, getApp, cert, type App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

@Injectable()
export class FirebaseService {
  private app: App | null = null;

  private ensure(): App {
    if (this.app) return this.app;
    if (getApps().length) { this.app = getApp(); return this.app; }
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT missing');
    this.app = initializeApp({ credential: cert(JSON.parse(raw)) });
    return this.app;
  }

  // ⚠ L'APPLICATION EST PASSEE EXPLICITEMENT, ET C'EST LE MEME DEFAUT QU'EN 2021.
  // Sans argument, `getFirestore()` vise l'application PAR DEFAUT — qui n'existe
  // que si quelqu'un l'a deja initialisee. C'est exactement le piege decrit
  // ci-dessous pour `auth()`, et la forme modulaire permet enfin de le fermer
  // pour de bon : `ensure()` rend l'application, on la donne.
  db() { return getFirestore(this.ensure()); }

  /**
   * Verification des jetons, en passant par `ensure()`.
   *
   * Le gateway temps reel appelait `admin.auth()` directement. Or ce module ne
   * s'initialise pas tout seul : sur un backend qui vient de demarrer, la liste
   * des applications est VIDE tant qu'aucune requete HTTP protegee n'est passee par
   * `FirebaseAuthGuard`, qui l'initialise au vol. La toute premiere connexion
   * socket echouait donc toujours — et toutes les suivantes avec, jusqu'a ce
   * qu'une requete HTTP authentifiee arrive PAR HASARD. Appels du duo, chat de
   * course et presence etaient morts pendant ce temps, sans une ligne de
   * journal. Constate en production le 21/08/2026.
   */
  auth() { return getAuth(this.ensure()); }
}
