// Marketplace de parcours UGC — 100% Firestore, best-effort (try/catch partout).
//
// DESIGN (modération externe) :
//  - Tout parcours proposé par un utilisateur est écrit dans la collection top-level
//    `community_routes` avec status:'pending'. Rien n'est PUBLIC tant qu'un admin
//    (web, hors de ce dépôt) ne passe pas le status à 'approved'.
//  - getApprovedRoutes() ne lit QUE les parcours approuvés → la liste publique reste
//    vide tant qu'aucun admin n'a modéré (comportement voulu).
//  - getMySubmissions(email) permet à l'auteur de voir SES propres soumissions
//    (tous statuts) pour suivre l'état de modération.
//
// LIMITES (cf. skipped) : la collection a besoin d'une RÈGLE Firestore (read approved
// si signedIn, create si authorId == auth.uid) — non déployable depuis ce dépôt mobile.
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  orderBy,
  serverTimestamp,
  limit as fsLimit,
} from 'firebase/firestore';
import { db, emailToDocId } from './firebase';

const norm = (e: string) => (e || '').trim().toLowerCase();

export interface RouteWaypoint {
  name: string;
  lat: number;
  lng: number;
  atKm: number;
}

export interface CommunityRoute {
  id?: string;
  authorId: string;            // docId (= email sanitizé) de l'auteur
  authorName: string;
  name: string;
  description: string;
  totalKm: number;
  waypoints: RouteWaypoint[];
  status: 'pending' | 'approved' | 'rejected';
  createdAt?: any;
}

export interface RouteInput {
  name: string;
  description?: string;
  totalKm?: number;
  authorName?: string;
  waypoints?: Array<Partial<RouteWaypoint>>;
}

/** Nettoie/normalise les étapes saisies au clavier (nom + lat/lng + atKm). */
function sanitizeWaypoints(raw: Array<Partial<RouteWaypoint>> = []): RouteWaypoint[] {
  return raw
    .map((w) => ({
      name: (w?.name || '').toString().trim().slice(0, 80),
      lat: Number(w?.lat),
      lng: Number(w?.lng),
      atKm: Number(w?.atKm) || 0,
    }))
    .filter((w) => w.name.length > 0 && Number.isFinite(w.lat) && Number.isFinite(w.lng));
}

/**
 * Soumet un parcours proposé par l'utilisateur (status:'pending').
 * Rien de public avant modération admin. Best-effort : renvoie l'id ou null.
 */
export async function submitRoute(email: string, route: RouteInput): Promise<string | null> {
  try {
    const authorId = emailToDocId(email);
    const name = (route?.name || '').trim().slice(0, 100);
    if (!authorId || !name) return null;

    const payload: Omit<CommunityRoute, 'id'> = {
      authorId,
      authorName: (route.authorName || norm(email).split('@')[0] || '').slice(0, 60),
      name,
      description: (route.description || '').trim().slice(0, 500),
      totalKm: Number(route.totalKm) || 0,
      waypoints: sanitizeWaypoints(route.waypoints),
      status: 'pending',
      createdAt: serverTimestamp(),
    };

    const ref = await addDoc(collection(db, 'community_routes'), payload);
    return ref.id;
  } catch (e) {
    console.warn('[communityRoutes] submitRoute failed', e);
    return null;
  }
}

/** Lit les parcours APPROUVÉS (status=='approved'). Best-effort → [] si erreur. */
export async function getApprovedRoutes(): Promise<CommunityRoute[]> {
  try {
    const ref = collection(db, 'community_routes');
    // where seul (sans orderBy) → évite d'exiger un index composite ; tri client.
    const q = query(ref, where('status', '==', 'approved'), fsLimit(100));
    const snap = await getDocs(q);
    const rows: CommunityRoute[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    rows.sort((a, b) => {
      const tA = (a.createdAt as any)?.seconds || 0;
      const tB = (b.createdAt as any)?.seconds || 0;
      return tB - tA;
    });
    return rows;
  } catch (e) {
    console.warn('[communityRoutes] getApprovedRoutes failed', e);
    return [];
  }
}

/** Lit MES soumissions (tous statuts) pour suivre la modération. Best-effort. */
export async function getMySubmissions(email: string): Promise<CommunityRoute[]> {
  try {
    const authorId = emailToDocId(email);
    if (!authorId) return [];
    const ref = collection(db, 'community_routes');
    const q = query(ref, where('authorId', '==', authorId), fsLimit(100));
    const snap = await getDocs(q);
    const rows: CommunityRoute[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    rows.sort((a, b) => {
      const tA = (a.createdAt as any)?.seconds || 0;
      const tB = (b.createdAt as any)?.seconds || 0;
      return tB - tA;
    });
    return rows;
  } catch (e) {
    console.warn('[communityRoutes] getMySubmissions failed', e);
    return [];
  }
}
