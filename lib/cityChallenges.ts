// Défis inter-villes (viralité locale) — 100% Firestore, best-effort (try/catch partout).
//
// MODÈLE :
//  - Un DÉFI = doc top-level `city_challenges/{id}` :
//      { id, title, cityA, cityB, metric('km'|'workouts'|'logs'), startTs, endTs, status }
//    Ces docs sont SEEDÉS côté admin (firebase-admin SDK, bypass règles) — le client ne
//    fait que les LIRE (règle `allow read: if signedIn()`, `write: if false`), exactement
//    comme `races`/`challenges`. Aucune création de défi depuis le mobile.
//  - Chaque contribution vit dans la sous-collection `city_challenges/{id}/contrib/{uid}` :
//      { uid, city, value }  (uid = email sanitizé = emailToDocId — même clé que partout).
//    L'utilisateur n'écrit QUE SA propre ligne (règle `isOwner(uid)`), et `city` doit être
//    l'une des deux villes du défi (cityA|cityB) — le classement somme les contribs par ville.
//  - La VILLE choisie par l'utilisateur est mémorisée sur son doc `users/{uid}.city`
//    (champ déjà owner-writable) pour la pré-remplir d'un défi à l'autre.
//
// Best-effort : tant que les règles Firestore `city_challenges` ne sont pas déployées, les
// lectures/écritures échouent silencieusement (comme family.ts) — l'app ne casse jamais.
import {
  doc,
  getDoc,
  setDoc,
  getDocs,
  collection,
  query,
  where,
  orderBy,
  serverTimestamp,
  limit as firestoreLimit,
} from 'firebase/firestore';
import { db, emailToDocId } from './firebase';

export type CityMetric = 'km' | 'workouts' | 'logs';
export type CityChallengeStatus = 'upcoming' | 'active' | 'done';

export interface CityChallenge {
  id: string;
  title: string;
  cityA: string;
  cityB: string;
  metric: CityMetric;
  startTs: number;         // ms epoch
  endTs: number;           // ms epoch
  status: CityChallengeStatus;
}

export interface CityContribution {
  uid: string;
  city: string;
  value: number;
}

export interface CityStandings {
  cityA: string;
  cityB: string;
  totalA: number;          // somme des contribs de la ville A
  totalB: number;          // somme des contribs de la ville B
  contributors: number;    // nb de participants (toutes villes)
  myValue: number;         // ma propre contribution (0 si non rejoint)
  myCity: string | null;   // ma ville pour ce défi (null si non rejoint)
}

const norm = (s: string) => (s || '').trim();

function coerceChallenge(id: string, d: any): CityChallenge {
  return {
    id,
    title: d?.title || '',
    cityA: d?.cityA || '',
    cityB: d?.cityB || '',
    metric: (d?.metric === 'workouts' || d?.metric === 'logs') ? d.metric : 'km',
    startTs: typeof d?.startTs === 'number' ? d.startTs : 0,
    endTs: typeof d?.endTs === 'number' ? d.endTs : 0,
    status: (d?.status === 'active' || d?.status === 'done' || d?.status === 'upcoming')
      ? d.status
      // Statut déduit si absent : entre start et end → active, après end → done, sinon upcoming.
      : (() => {
          const now = Date.now();
          const s = typeof d?.startTs === 'number' ? d.startTs : 0;
          const e = typeof d?.endTs === 'number' ? d.endTs : 0;
          if (e && now > e) return 'done';
          if (s && now < s) return 'upcoming';
          return 'active';
        })(),
  };
}

/**
 * Liste les défis inter-villes ACTIFS (status != done), triés par date de fin croissante
 * (les plus urgents d'abord). Best-effort : renvoie [] si la collection est illisible.
 * Tri client-side pour éviter d'exiger un index composite.
 */
export async function listCityChallenges(): Promise<CityChallenge[]> {
  try {
    // where status in [active, upcoming] : champ unique → pas d'index composite requis.
    const q = query(
      collection(db, 'city_challenges'),
      where('status', 'in', ['active', 'upcoming']),
      firestoreLimit(50)
    );
    const snap = await getDocs(q);
    const list = snap.docs.map((s) => coerceChallenge(s.id, s.data()));
    list.sort((a, b) => (a.endTs || Infinity) - (b.endTs || Infinity));
    return list;
  } catch (e) {
    // Fallback : certains docs seedés peuvent ne pas avoir de champ `status` → scan simple.
    try {
      const snap = await getDocs(query(collection(db, 'city_challenges'), firestoreLimit(50)));
      const list = snap.docs
        .map((s) => coerceChallenge(s.id, s.data()))
        .filter((c) => c.status !== 'done');
      list.sort((a, b) => (a.endTs || Infinity) - (b.endTs || Infinity));
      return list;
    } catch (e2) {
      console.warn('[cityChallenges] listCityChallenges failed', e2);
      return [];
    }
  }
}

/** Lit un défi par id (best-effort). */
export async function getCityChallenge(id: string): Promise<CityChallenge | null> {
  try {
    if (!id) return null;
    const snap = await getDoc(doc(db, 'city_challenges', id));
    return snap.exists() ? coerceChallenge(snap.id, snap.data()) : null;
  } catch (e) {
    console.warn('[cityChallenges] getCityChallenge failed', e);
    return null;
  }
}

/** Persiste la ville préférée de l'utilisateur sur son doc user (owner-writable). */
export async function setMyCity(email: string, city: string): Promise<void> {
  const uid = emailToDocId(email);
  const c = norm(city);
  if (!uid || !c) return;
  try {
    await setDoc(doc(db, 'users', uid), { city: c }, { merge: true });
  } catch (e) {
    console.warn('[cityChallenges] setMyCity failed', e);
  }
}

/** Lit la ville préférée mémorisée (ou null). */
export async function getMyCity(email: string): Promise<string | null> {
  const uid = emailToDocId(email);
  if (!uid) return null;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    const city = snap.exists() ? (snap.data() as any)?.city : null;
    return city ? String(city) : null;
  } catch {
    return null;
  }
}

/**
 * Rejoint un défi en choisissant sa ville : crée (idempotent) ma ligne de contribution
 * à 0 si absente, et mémorise la ville sur mon doc user. La ville DOIT être cityA ou cityB.
 * Best-effort. Renvoie { ok, reason? }.
 */
export async function joinCityChallenge(
  id: string,
  email: string,
  city: string
): Promise<{ ok: boolean; reason?: 'empty' | 'notfound' | 'badcity' | 'error' }> {
  const uid = emailToDocId(email);
  const c = norm(city);
  if (!id || !uid || !c) return { ok: false, reason: 'empty' };
  try {
    const ch = await getCityChallenge(id);
    if (!ch) return { ok: false, reason: 'notfound' };
    if (c !== ch.cityA && c !== ch.cityB) return { ok: false, reason: 'badcity' };

    const ref = doc(db, 'city_challenges', id, 'contrib', uid);
    const existing = await getDoc(ref);
    // merge:true → ne remet pas value à 0 si j'ai déjà contribué (juste (re)cale la ville).
    await setDoc(
      ref,
      {
        uid,
        city: c,
        ...(existing.exists() ? {} : { value: 0 }),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    await setMyCity(email, c);
    return { ok: true };
  } catch (e) {
    console.warn('[cityChallenges] joinCityChallenge failed', e);
    return { ok: false, reason: 'error' };
  }
}

/**
 * Ajoute une contribution (delta) à ma ligne pour un défi. `value` = incrément (>0).
 * On lit l'ancienne valeur et on écrit la somme (Firestore RN gère mal `increment()`
 * hors-ligne dans certains cas → lecture+écriture explicite, comme setChallengeProgress).
 * La ville doit correspondre à l'une des deux du défi. Best-effort.
 */
export async function addContribution(
  id: string,
  email: string,
  city: string,
  value: number
): Promise<boolean> {
  const uid = emailToDocId(email);
  const c = norm(city);
  const delta = Number(value);
  if (!id || !uid || !c || !(delta > 0)) return false;
  try {
    const ch = await getCityChallenge(id);
    if (!ch) return false;
    if (c !== ch.cityA && c !== ch.cityB) return false;

    const ref = doc(db, 'city_challenges', id, 'contrib', uid);
    let prev = 0;
    try {
      const snap = await getDoc(ref);
      prev = snap.exists() ? Number((snap.data() as any)?.value) || 0 : 0;
    } catch { /* best-effort : pas de delta inventé si la lecture échoue */ }

    const next = Math.round((prev + delta) * 100) / 100;
    await setDoc(
      ref,
      { uid, city: c, value: next, updatedAt: serverTimestamp() },
      { merge: true }
    );
    return true;
  } catch (e) {
    console.warn('[cityChallenges] addContribution failed', e);
    return false;
  }
}

/**
 * Classement Ville A vs Ville B : somme des contributions de chaque ville, nb de
 * contributeurs, et ma propre contribution/ville. Best-effort (renvoie des zéros si
 * la sous-collection est illisible).
 */
export async function cityStandings(id: string, myEmail?: string): Promise<CityStandings> {
  const myUid = emailToDocId(myEmail || '');
  const empty = (a: string, b: string): CityStandings => ({
    cityA: a, cityB: b, totalA: 0, totalB: 0, contributors: 0, myValue: 0, myCity: null,
  });
  try {
    const ch = await getCityChallenge(id);
    const a = ch?.cityA || '';
    const b = ch?.cityB || '';
    if (!id) return empty(a, b);

    const snap = await getDocs(collection(db, 'city_challenges', id, 'contrib'));
    let totalA = 0;
    let totalB = 0;
    let myValue = 0;
    let myCity: string | null = null;
    snap.docs.forEach((s) => {
      const d: any = s.data() || {};
      const city = norm(d.city);
      const v = Number(d.value) || 0;
      if (a && city === a) totalA += v;
      else if (b && city === b) totalB += v;
      if (myUid && s.id === myUid) {
        myValue = v;
        myCity = city || null;
      }
    });
    return {
      cityA: a,
      cityB: b,
      totalA: Math.round(totalA * 100) / 100,
      totalB: Math.round(totalB * 100) / 100,
      contributors: snap.size,
      myValue: Math.round(myValue * 100) / 100,
      myCity,
    };
  } catch (e) {
    console.warn('[cityChallenges] cityStandings failed', e);
    return empty('', '');
  }
}
