import { Injectable, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import * as crypto from 'crypto';
import { FirebaseService } from '../firebase.service';

/**
 * Strava — import des séances depuis la montre / le téléphone de l'utilisateur.
 *
 * POURQUOI CÔTÉ SERVEUR, ET PAS DANS L'APP
 * L'échange OAuth exige le `client_secret` de l'application Strava. Le poser dans
 * l'app mobile reviendrait à le publier : un APK se décompile. Le jeton de
 * rafraîchissement, lui, vaut un accès permanent au compte Strava de la
 * personne — il ne doit jamais atteindre le client non plus. Les deux vivent ici.
 *
 * OÙ ATTERRISSENT LES SÉANCES
 * Dans la MÊME forme que celles de Health Connect (`ImportedSession` de
 * lib/health.ts) : { name, calories, durationMin, startISO }. L'app les écrit
 * ensuite comme n'importe quelle activité. Aucun modèle parallèle : une séance
 * Strava et une séance de la montre sont la même chose pour le reste de l'app.
 *
 * ⚠ CE QUI N'EST PAS COUVERT : les webhooks Strava (import à la volée dès qu'une
 * séance se termine). Ici l'import est TIRÉ par l'utilisateur. Le webhook
 * demanderait une URL publique vérifiée et un abonnement Strava ; c'est un
 * second chantier, pas un oubli.
 */

const AUTORISER = 'https://www.strava.com/oauth/authorize';
const JETON = 'https://www.strava.com/oauth/token';
const API = 'https://www.strava.com/api/v3';

/** Le `state` ne vit que dix minutes : au-delà, un lien capté dans un historique
 *  de navigation ou un journal de serveur mandataire ne rattache plus rien. */
const VALIDITE_STATE_MS = 10 * 60 * 1000;

/** Types Strava → libellés du projet, alignés sur EXERCISE_LABELS de lib/health.ts
 *  pour qu'une séance de course s'affiche pareil qu'elle vienne de la montre ou
 *  de Strava. */
const LIBELLES: Record<string, string> = {
  Run: 'Course à pied', TrailRun: 'Trail', VirtualRun: 'Course (tapis)',
  Ride: 'Vélo', VirtualRide: 'Vélo (salle)', MountainBikeRide: 'VTT',
  Walk: 'Marche', Hike: 'Randonnée', Swim: 'Natation',
  WeightTraining: 'Musculation', Workout: 'Séance', Yoga: 'Yoga',
  Crossfit: 'HIIT', Soccer: 'Football', Tennis: 'Tennis', Badminton: 'Badminton',
  Elliptical: 'Elliptique', Rowing: 'Rameur', StairStepper: 'Escalier',
};

export interface SeanceImportee {
  name: string;
  calories: number;
  durationMin: number;
  startISO: string;
  /** Propre à Strava : sert à ouvrir la séance et à ne pas la réimporter. */
  stravaId: number;
  distanceKm: number;
}

@Injectable()
export class StravaService {
  constructor(private fb: FirebaseService) {}

  private get clientId() { return String(process.env.STRAVA_CLIENT_ID || ''); }
  private get clientSecret() { return String(process.env.STRAVA_CLIENT_SECRET || ''); }
  private get redirect() { return String(process.env.STRAVA_REDIRECT_URI || ''); }

  /** Configuré ou non. Sans cela, l'app afficherait un bouton qui mène à une
   *  page d'erreur Strava — mieux vaut ne pas l'afficher du tout. */
  estConfigure(): boolean {
    return !!(this.clientId && this.clientSecret && this.redirect);
  }

  private exigeConfiguration() {
    if (!this.estConfigure()) {
      throw new ServiceUnavailableException(
        "L'intégration Strava n'est pas configurée sur ce serveur.",
      );
    }
  }

  // ── LE `state`, ET POURQUOI IL EST SIGNÉ ─────────────────────────────────
  //
  // Strava renvoie le navigateur sur notre URL de retour avec `code` et `state`.
  // Rien d'autre n'identifie l'utilisateur : le retour arrive dans un navigateur
  // qui ne porte PAS notre jeton d'authentification.
  //
  // Si le `state` était le simple identifiant de l'utilisateur, il suffirait
  // d'appeler l'URL de retour avec le `state` de quelqu'un d'autre et son propre
  // `code` pour brancher SON Strava sur le compte de la victime — ou l'inverse,
  // rattacher le Strava d'autrui à son propre compte. Le `state` est donc SIGNÉ :
  // le serveur ne fait confiance qu'à ce qu'il a lui-même émis.
  //
  // Le secret est celui du serveur (`FEATURES_USER_SECRET`, déjà présent). En son
  // absence on refuse de démarrer le flux plutôt que de signer avec une valeur
  // vide, ce qui reviendrait à ne pas signer.

  private secretSignature(): string {
    const s = String(process.env.FEATURES_USER_SECRET || '');
    if (!s) {
      throw new ServiceUnavailableException(
        'FEATURES_USER_SECRET manquant : impossible de signer le retour OAuth.',
      );
    }
    return s;
  }

  private signer(charge: string): string {
    return crypto.createHmac('sha256', this.secretSignature()).update(charge).digest('base64url');
  }

  private fabriquerState(uid: string): string {
    const charge = `${uid}.${Date.now()}`;
    return `${Buffer.from(charge).toString('base64url')}.${this.signer(charge)}`;
  }

  /** Rend l'uid si — et seulement si — nous avons émis ce `state` et qu'il est frais. */
  verifierState(state: string): string {
    const [chargeB64, signature] = String(state || '').split('.');
    if (!chargeB64 || !signature) throw new BadRequestException('Retour Strava invalide.');
    const charge = Buffer.from(chargeB64, 'base64url').toString();

    // Comparaison à temps constant : une comparaison ordinaire laisse mesurer où
    // deux signatures divergent, et donc les reconstituer octet par octet.
    const attendu = Buffer.from(this.signer(charge));
    const recu = Buffer.from(signature);
    if (attendu.length !== recu.length || !crypto.timingSafeEqual(attendu, recu)) {
      throw new BadRequestException('Retour Strava invalide.');
    }

    const sep = charge.lastIndexOf('.');
    const uid = charge.slice(0, sep);
    const emis = Number(charge.slice(sep + 1));
    if (!uid || !Number.isFinite(emis)) throw new BadRequestException('Retour Strava invalide.');
    if (Date.now() - emis > VALIDITE_STATE_MS) {
      throw new BadRequestException('Le lien Strava a expiré. Relancez la connexion.');
    }
    return uid;
  }

  /** L'URL sur laquelle envoyer l'utilisateur. */
  urlAutorisation(uid: string): string {
    this.exigeConfiguration();
    const p = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirect,
      response_type: 'code',
      // `activity:read_all` couvre aussi les séances marquées privées : sans lui,
      // quelqu'un qui masque ses sorties n'importerait rien et croirait à une panne.
      scope: 'activity:read_all',
      // `force` : sans cela Strava renvoie sans rien demander si l'utilisateur a
      // déjà autorisé, et une réautorisation après révocation échoue en silence.
      approval_prompt: 'force',
      state: this.fabriquerState(uid),
    });
    return `${AUTORISER}?${p.toString()}`;
  }

  // ── LES JETONS ───────────────────────────────────────────────────────────
  //
  // `strava_tokens/{uid}` est FERMÉ au client par les règles Firestore (ni
  // lecture ni écriture). Le SDK Admin les contourne légitimement. Un jeton de
  // rafraîchissement Strava vaut un accès permanent : il n'a rien à faire dans
  // une collection que l'application peut lire, fût-ce la sienne.

  private ref(uid: string) {
    return this.fb.db().collection('strava_tokens').doc(uid);
  }

  private async echanger(corps: Record<string, string>): Promise<any> {
    const r = await fetch(JETON, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        ...corps,
      }),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      throw new BadRequestException(`Strava a refusé l'échange (${r.status}). ${detail.slice(0, 200)}`);
    }
    return r.json();
  }

  /** Fin du flux : on troque le code contre des jetons et on les range. */
  async finaliser(uid: string, code: string): Promise<{ athlete: string }> {
    this.exigeConfiguration();
    const j = await this.echanger({ code, grant_type: 'authorization_code' });
    const athlete = j?.athlete || {};
    await this.ref(uid).set({
      access_token: j.access_token,
      refresh_token: j.refresh_token,
      expires_at: Number(j.expires_at || 0),
      athleteId: athlete.id || null,
      athleteNom: [athlete.firstname, athlete.lastname].filter(Boolean).join(' ') || null,
      lieA: uid,
      connecteLe: Date.now(),
    });
    return { athlete: [athlete.firstname, athlete.lastname].filter(Boolean).join(' ') || 'Strava' };
  }

  /** Un jeton d'accès valide, rafraîchi si besoin. */
  private async accesValide(uid: string): Promise<string> {
    const s = await this.ref(uid).get();
    if (!s.exists) throw new BadRequestException('Compte Strava non relié.');
    const d = s.data() as any;

    // Marge de soixante secondes : un jeton qui expire pendant l'appel produirait
    // un 401 que l'utilisateur lirait comme « Strava est en panne ».
    if (Number(d.expires_at || 0) * 1000 > Date.now() + 60_000) return d.access_token;

    const j = await this.echanger({ refresh_token: d.refresh_token, grant_type: 'refresh_token' });
    await this.ref(uid).set(
      { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Number(j.expires_at || 0) },
      { merge: true },
    );
    return j.access_token;
  }

  async etat(uid: string): Promise<{ configure: boolean; connecte: boolean; athlete?: string; dernierImport?: number }> {
    if (!this.estConfigure()) return { configure: false, connecte: false };
    const s = await this.ref(uid).get();
    if (!s.exists) return { configure: true, connecte: false };
    const d = s.data() as any;
    return { configure: true, connecte: true, athlete: d.athleteNom || 'Strava', dernierImport: d.dernierImport || 0 };
  }

  /**
   * Les séances depuis le dernier import.
   *
   * ⚠ LE DÉDOUBLONNAGE EST DOUBLE, ET C'EST VOULU. On demande à Strava ce qui
   * est postérieur au dernier import (`after`), ET on renvoie l'identifiant
   * Strava de chaque séance pour que l'app écarte ce qu'elle a déjà écrit. Le
   * seul `after` ne suffit pas : une séance enregistrée en retard porte une date
   * de DÉBUT antérieure au dernier import et serait perdue si on avançait le
   * curseur seul — et réimportée en double si on ne l'avançait pas.
   */
  async importer(uid: string, depuisMs?: number): Promise<{ seances: SeanceImportee[] }> {
    this.exigeConfiguration();
    const acces = await this.accesValide(uid);
    const s = await this.ref(uid).get();
    const d = (s.data() || {}) as any;

    // Par défaut : trente jours. Un premier import ne doit pas rapatrier dix ans
    // d'historique et noyer le journal alimentaire du jour.
    const defaut = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const apres = Math.floor(Number(depuisMs ?? d.dernierImport ?? defaut) / 1000);

    const r = await fetch(`${API}/athlete/activities?after=${apres}&per_page=100`, {
      headers: { authorization: `Bearer ${acces}` },
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      throw new BadRequestException(`Strava a refusé la lecture (${r.status}). ${detail.slice(0, 200)}`);
    }
    const brutes: any[] = await r.json();

    const seances: SeanceImportee[] = (Array.isArray(brutes) ? brutes : []).map((a) => ({
      name: LIBELLES[a.type] || a.name || 'Séance',
      // `kilojoules` n'existe que sur les activités avec capteur de puissance.
      // À défaut, Strava ne donne pas de calories sur cette route : on renvoie 0
      // plutôt qu'une estimation inventée — une valeur fausse dans un journal
      // nutritionnel fausse le bilan de la journée, ce qui est pire que rien.
      calories: Math.round(Number(a.kilojoules || 0) * 0.239),
      durationMin: Math.round(Number(a.moving_time || 0) / 60),
      startISO: String(a.start_date || ''),
      stravaId: Number(a.id || 0),
      distanceKm: Math.round(Number(a.distance || 0) / 100) / 10,
    })).filter((x) => x.startISO && x.durationMin > 0);

    await this.ref(uid).set({ dernierImport: Date.now() }, { merge: true });
    return { seances };
  }

  /** Délier. On révoque CHEZ STRAVA avant d'oublier : effacer nos jetons sans
   *  révoquer laisserait l'autorisation active côté Strava, invisible et
   *  indéfinie, pour quelqu'un qui a justement demandé à couper le lien. */
  async delier(uid: string): Promise<{ ok: true }> {
    const s = await this.ref(uid).get();
    if (s.exists) {
      const d = s.data() as any;
      try {
        await fetch('https://www.strava.com/oauth/deauthorize', {
          method: 'POST',
          headers: { authorization: `Bearer ${d.access_token}` },
        });
      } catch {
        /* Strava injoignable : on efface quand même côté nous, sinon l'utilisateur
           reste prisonnier d'un lien qu'il a demandé à rompre. */
      }
      await this.ref(uid).delete();
    }
    return { ok: true };
  }
}
