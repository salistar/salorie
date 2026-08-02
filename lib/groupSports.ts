// Sports de groupe — matchs, terrains & réservations, 100% Firestore, best-effort.
//
// MODÈLE (3 collections top-level) :
//  - `sport_matches`     : une session de sport organisée (foot, tennis…) qu'on peut
//                          rejoindre jusqu'à la capacité. hostUid = organisateur.
//  - `sport_fields`      : un terrain/lieu (proposé par un user → approved:false → modéré
//                          par l'admin web, comme community_routes). Les terrains approuvés
//                          sont réservables.
//  - `sport_reservations`: un créneau réservé sur un terrain (avec détection de conflit :
//                          pas 2 réservations CONFIRMÉES qui se chevauchent sur le même terrain).
//
//  `uid` = email sanitizé (emailToDocId) — même convention de clé que partout dans l'app.
//
// CONCURRENCE : joinMatch/leaveMatch passent par runTransaction (capacité, participants,
//  passage automatique du status à 'full'/'open') pour éviter les surréservations.
//
// LIMITES (règles Firestore) : ces 3 collections top-level exigent des règles dédiées
//  (lecture signedIn ; write host/participant). Tant qu'elles ne sont pas déployées, les
//  écritures échouent silencieusement (best-effort, jamais de crash côté mobile).
import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  runTransaction,
  serverTimestamp,
  limit as fsLimit,
} from 'firebase/firestore';
import { db, emailToDocId } from './firebase';

const norm = (e: string) => (e || '').trim().toLowerCase();

export type Sport =
  | 'football'
  | 'tennis'
  | 'basketball'
  | 'volleyball'
  | 'badminton'
  | 'running'
  | 'padel'
  | 'other';

export const SPORTS: Sport[] = [
  'football', 'tennis', 'basketball', 'volleyball', 'badminton', 'running', 'padel', 'other',
];

export type MatchStatus = 'open' | 'full' | 'cancelled' | 'done';
export type ReservationStatus = 'pending' | 'confirmed' | 'cancelled';

export interface SportMatch {
  id: string;
  sport: Sport;
  title: string;
  fieldId?: string;
  placeName: string;
  lat?: number;
  lng?: number;
  dateTs: number;          // début du match (ms epoch)
  durationMin: number;
  capacity: number;
  participants: string[];  // uid[] (= email sanitizé)
  hostUid: string;
  status: MatchStatus;
  createdTs: number;
}

export interface SportField {
  id: string;
  name: string;
  sport: Sport[];          // sports praticables sur ce terrain
  address: string;
  lat?: number;
  lng?: number;
  pricePerHour?: number;
  ownerUid?: string;
  approved: boolean;
}

export interface SportReservation {
  id: string;
  fieldId: string;
  matchId?: string;
  uid: string;
  startTs: number;
  endTs: number;
  status: ReservationStatus;
}

// ---- helpers de sanitisation -------------------------------------------------

const sanitizeSport = (s?: string): Sport =>
  (SPORTS as string[]).includes(s || '') ? (s as Sport) : 'other';

const num = (v: any): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

// =============================================================================
// MATCHS
// =============================================================================

/**
 * Crée un match. L'hôte est automatiquement le 1er participant.
 * Best-effort : renvoie l'id créé ou null.
 */
export async function createMatch(
  email: string,
  input: {
    sport: Sport | string;
    title?: string;
    fieldId?: string;
    placeName: string;
    lat?: number;
    lng?: number;
    dateTs: number;
    durationMin?: number;
    capacity?: number;
  }
): Promise<string | null> {
  const uid = emailToDocId(norm(email));
  if (!uid) return null;
  const placeName = (input?.placeName || '').trim().slice(0, 120);
  const dateTs = num(input?.dateTs);
  if (!placeName || !dateTs) return null;
  try {
    const sport = sanitizeSport(String(input.sport));
    const capacity = Math.max(1, Math.min(1000, Math.round(num(input?.capacity) || 2)));
    const payload: Omit<SportMatch, 'id'> = {
      sport,
      title: (input.title || '').trim().slice(0, 120) || placeName,
      fieldId: input.fieldId || undefined,
      placeName,
      lat: num(input?.lat),
      lng: num(input?.lng),
      dateTs,
      durationMin: Math.max(1, Math.min(1440, Math.round(num(input?.durationMin) || 60))),
      capacity,
      participants: [uid],
      hostUid: uid,
      status: 'open',
      createdTs: Date.now(),
    };
    // On retire les champs undefined (Firestore refuse `undefined`).
    const clean: any = { ...payload, createdAt: serverTimestamp() };
    Object.keys(clean).forEach((k) => clean[k] === undefined && delete clean[k]);
    const ref = await addDoc(collection(db, 'sport_matches'), clean);
    return ref.id;
  } catch (e) {
    console.warn('[groupSports] createMatch failed', e);
    return null;
  }
}

/**
 * Liste les matchs. `sport` filtre par discipline ; `upcoming` ne garde que les
 * matchs à venir et non annulés/terminés. Tri client par date croissante.
 * Best-effort → [] si erreur.
 */
export async function listMatches(
  opts: { sport?: Sport | string; upcoming?: boolean } = {}
): Promise<SportMatch[]> {
  try {
    const ref = collection(db, 'sport_matches');
    // where seul (pas d'orderBy) → évite d'exiger un index composite ; tri client.
    const q = opts.sport
      ? query(ref, where('sport', '==', sanitizeSport(String(opts.sport))), fsLimit(100))
      : query(ref, fsLimit(100));
    const snap = await getDocs(q);
    let rows: SportMatch[] = snap.docs.map((d) => normalizeMatch(d.id, d.data()));
    if (opts.upcoming) {
      const now = Date.now();
      rows = rows.filter(
        (m) => m.status !== 'cancelled' && m.status !== 'done' && m.dateTs + m.durationMin * 60000 >= now
      );
    }
    rows.sort((a, b) => a.dateTs - b.dateTs);
    return rows;
  } catch (e) {
    console.warn('[groupSports] listMatches failed', e);
    return [];
  }
}

function normalizeMatch(id: string, d: any): SportMatch {
  return {
    id,
    sport: sanitizeSport(d?.sport),
    title: d?.title || '',
    fieldId: d?.fieldId || undefined,
    placeName: d?.placeName || '',
    lat: num(d?.lat),
    lng: num(d?.lng),
    dateTs: num(d?.dateTs) || 0,
    durationMin: num(d?.durationMin) || 60,
    capacity: num(d?.capacity) || 0,
    participants: Array.isArray(d?.participants) ? d.participants : [],
    hostUid: d?.hostUid || '',
    status: (['open', 'full', 'cancelled', 'done'] as string[]).includes(d?.status) ? d.status : 'open',
    createdTs: num(d?.createdTs) || 0,
  };
}

/**
 * Rejoint un match (transaction : contrôle capacité, ajoute le participant, passe
 * le status à 'full' si la capacité est atteinte). Idempotent (déjà inscrit → ok).
 * Renvoie { ok, reason? }. Best-effort (jamais de crash).
 */
export async function joinMatch(
  email: string,
  matchId: string
): Promise<{ ok: boolean; reason?: 'empty' | 'notfound' | 'full' | 'closed' | 'error' }> {
  const uid = emailToDocId(norm(email));
  if (!uid || !matchId) return { ok: false, reason: 'empty' };
  try {
    const ref = doc(db, 'sport_matches', matchId);
    const res = await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return { ok: false, reason: 'notfound' as const };
      const d: any = snap.data() || {};
      const status = d.status || 'open';
      if (status === 'cancelled' || status === 'done') return { ok: false, reason: 'closed' as const };
      const participants: string[] = Array.isArray(d.participants) ? d.participants : [];
      if (participants.includes(uid)) return { ok: true }; // déjà inscrit → idempotent
      const capacity = num(d.capacity) || 0;
      if (capacity > 0 && participants.length >= capacity) return { ok: false, reason: 'full' as const };
      const next = [...participants, uid];
      const nextStatus = capacity > 0 && next.length >= capacity ? 'full' : 'open';
      tx.update(ref, { participants: next, status: nextStatus, updatedAt: serverTimestamp() });
      return { ok: true };
    });
    return res;
  } catch (e) {
    console.warn('[groupSports] joinMatch failed', e);
    return { ok: false, reason: 'error' };
  }
}

/**
 * Quitte un match (transaction : retire le participant, rouvre le status si le match
 * était 'full'). L'hôte peut aussi se retirer (le match n'est pas supprimé pour autant).
 * Idempotent. Best-effort.
 */
export async function leaveMatch(
  email: string,
  matchId: string
): Promise<{ ok: boolean; reason?: 'empty' | 'notfound' | 'error' }> {
  const uid = emailToDocId(norm(email));
  if (!uid || !matchId) return { ok: false, reason: 'empty' };
  try {
    const ref = doc(db, 'sport_matches', matchId);
    const res = await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return { ok: false, reason: 'notfound' as const };
      const d: any = snap.data() || {};
      const participants: string[] = Array.isArray(d.participants) ? d.participants : [];
      if (!participants.includes(uid)) return { ok: true }; // pas inscrit → idempotent
      const next = participants.filter((p) => p !== uid);
      const status = d.status || 'open';
      // Un match plein qui se libère et n'est pas annulé/terminé redevient 'open'.
      const nextStatus = status === 'full' ? 'open' : status;
      tx.update(ref, { participants: next, status: nextStatus, updatedAt: serverTimestamp() });
      return { ok: true };
    });
    return res;
  } catch (e) {
    console.warn('[groupSports] leaveMatch failed', e);
    return { ok: false, reason: 'error' };
  }
}

/**
 * Annule un match — RÉSERVÉ à l'hôte. Passe le status à 'cancelled'. Best-effort.
 */
export async function cancelMatch(
  email: string,
  matchId: string
): Promise<{ ok: boolean; reason?: 'empty' | 'notfound' | 'forbidden' | 'error' }> {
  const uid = emailToDocId(norm(email));
  if (!uid || !matchId) return { ok: false, reason: 'empty' };
  try {
    const ref = doc(db, 'sport_matches', matchId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return { ok: false, reason: 'notfound' };
    const d: any = snap.data() || {};
    if (d.hostUid !== uid) return { ok: false, reason: 'forbidden' };
    await setDoc(ref, { status: 'cancelled', updatedAt: serverTimestamp() }, { merge: true });
    return { ok: true };
  } catch (e) {
    console.warn('[groupSports] cancelMatch failed', e);
    return { ok: false, reason: 'error' };
  }
}

// =============================================================================
// TERRAINS
// =============================================================================

function normalizeField(id: string, d: any): SportField {
  const sportRaw = Array.isArray(d?.sport) ? d.sport : d?.sport ? [d.sport] : [];
  return {
    id,
    name: d?.name || '',
    sport: sportRaw.map((s: any) => sanitizeSport(String(s))),
    address: d?.address || '',
    lat: num(d?.lat),
    lng: num(d?.lng),
    pricePerHour: num(d?.pricePerHour),
    ownerUid: d?.ownerUid || undefined,
    approved: d?.approved === true,
  };
}

/**
 * Liste les terrains APPROUVÉS (approved==true). `sport` filtre côté client sur
 * les terrains qui proposent la discipline. Best-effort → [].
 */
export async function listFields(
  opts: { sport?: Sport | string } = {}
): Promise<SportField[]> {
  try {
    const ref = collection(db, 'sport_fields');
    const q = query(ref, where('approved', '==', true), fsLimit(100));
    const snap = await getDocs(q);
    let rows: SportField[] = snap.docs.map((d) => normalizeField(d.id, d.data()));
    if (opts.sport) {
      const want = sanitizeSport(String(opts.sport));
      rows = rows.filter((f) => f.sport.includes(want));
    }
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  } catch (e) {
    console.warn('[groupSports] listFields failed', e);
    return [];
  }
}

/**
 * Propose un terrain (approved:false → modération admin web, comme community_routes).
 * Rien n'est réservable tant qu'un admin n'a pas passé approved à true.
 * Best-effort : renvoie l'id ou null.
 */
export async function proposeField(
  email: string,
  input: {
    name: string;
    sport?: Array<Sport | string> | Sport | string;
    address?: string;
    lat?: number;
    lng?: number;
    pricePerHour?: number;
  }
): Promise<string | null> {
  const uid = emailToDocId(norm(email));
  const name = (input?.name || '').trim().slice(0, 120);
  if (!uid || !name) return null;
  try {
    const rawSports = Array.isArray(input.sport) ? input.sport : input.sport ? [input.sport] : [];
    const sport = Array.from(new Set(rawSports.map((s) => sanitizeSport(String(s)))));
    const payload: any = {
      name,
      sport: sport.length ? sport : ['other'],
      address: (input.address || '').trim().slice(0, 200),
      lat: num(input?.lat),
      lng: num(input?.lng),
      pricePerHour: num(input?.pricePerHour),
      ownerUid: uid,
      approved: false, // modération admin
      createdAt: serverTimestamp(),
    };
    Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
    const ref = await addDoc(collection(db, 'sport_fields'), payload);
    return ref.id;
  } catch (e) {
    console.warn('[groupSports] proposeField failed', e);
    return null;
  }
}

// =============================================================================
// RÉSERVATIONS
// =============================================================================

/** Deux intervalles [aStart,aEnd) et [bStart,bEnd) se chevauchent-ils ? */
const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
  aStart < bEnd && bStart < aEnd;

/**
 * Réserve un créneau sur un terrain, avec DÉTECTION DE CONFLIT : refuse si une
 * réservation CONFIRMÉE existante chevauche le créneau sur le même terrain.
 * Crée la réservation avec status:'confirmed' quand le créneau est libre.
 * Renvoie { ok, id?, reason? }. Best-effort (jamais de crash).
 */
export async function reserveField(
  email: string,
  input: { fieldId: string; startTs: number; endTs: number; matchId?: string }
): Promise<{ ok: boolean; id?: string; reason?: 'empty' | 'invalid' | 'conflict' | 'error' }> {
  const uid = emailToDocId(norm(email));
  const fieldId = (input?.fieldId || '').trim();
  const startTs = num(input?.startTs);
  const endTs = num(input?.endTs);
  if (!uid || !fieldId) return { ok: false, reason: 'empty' };
  if (!startTs || !endTs || endTs <= startTs) return { ok: false, reason: 'invalid' };
  try {
    // Détection de conflit : on lit les réservations CONFIRMÉES du terrain et on
    // vérifie qu'aucune ne chevauche le créneau demandé.
    const ref = collection(db, 'sport_reservations');
    const q = query(ref, where('fieldId', '==', fieldId), where('status', '==', 'confirmed'), fsLimit(100));
    const snap = await getDocs(q);
    const clash = snap.docs.some((d) => {
      const r: any = d.data() || {};
      const s = num(r.startTs);
      const e = num(r.endTs);
      if (s == null || e == null) return false;
      return overlaps(startTs, endTs, s, e);
    });
    if (clash) return { ok: false, reason: 'conflict' };

    const payload: any = {
      fieldId,
      matchId: input.matchId || undefined,
      uid,
      startTs,
      endTs,
      status: 'confirmed',
      createdAt: serverTimestamp(),
    };
    Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
    const created = await addDoc(ref, payload);
    return { ok: true, id: created.id };
  } catch (e) {
    console.warn('[groupSports] reserveField failed', e);
    return { ok: false, reason: 'error' };
  }
}

/**
 * Liste les réservations CONFIRMÉES d'un terrain (pour afficher les créneaux occupés).
 * Best-effort → [].
 */
export async function listFieldReservations(fieldId: string): Promise<SportReservation[]> {
  const id = (fieldId || '').trim();
  if (!id) return [];
  try {
    const ref = collection(db, 'sport_reservations');
    const q = query(ref, where('fieldId', '==', id), where('status', '==', 'confirmed'), fsLimit(100));
    const snap = await getDocs(q);
    const rows: SportReservation[] = snap.docs.map((d) => {
      const r: any = d.data() || {};
      return {
        id: d.id,
        fieldId: r.fieldId || id,
        matchId: r.matchId || undefined,
        uid: r.uid || '',
        startTs: num(r.startTs) || 0,
        endTs: num(r.endTs) || 0,
        status: (['pending', 'confirmed', 'cancelled'] as string[]).includes(r.status) ? r.status : 'confirmed',
      };
    });
    rows.sort((a, b) => a.startTs - b.startTs);
    return rows;
  } catch (e) {
    console.warn('[groupSports] listFieldReservations failed', e);
    return [];
  }
}
