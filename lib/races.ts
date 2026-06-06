// Races backend — built on Firestore (real-time via onSnapshot), the same data
// layer the rest of the app already uses. Two features:
//  - Group races (live): everyone updates their position/distance, all listen live.
//  - Virtual challenges ("Conqueror"-style): accumulate distance over time along a
//    famous route; your solo runs feed your progress.
import {
  collection, doc, setDoc, getDoc, getDocs, onSnapshot, query, where,
  orderBy, serverTimestamp, updateDoc, addDoc, increment, limit,
} from 'firebase/firestore';
import { db, emailToDocId } from './firebase';

export interface RaceParticipant {
  email: string; name: string; imageUrl?: string;
  distanceM: number; lat?: number; lng?: number; finished?: boolean;
  updatedAt?: any;
}
export interface Race {
  id: string; name: string; createdBy: string; createdByName?: string;
  status: 'open' | 'live' | 'done'; goalKm: number; createdAt?: any; startedAt?: any;
}

// ─────────────── GROUP RACES (live) ───────────────
export async function createRace(email: string, name: string, raceName: string, goalKm: number): Promise<string> {
  const ref = await addDoc(collection(db, 'races'), {
    name: raceName, createdBy: email, createdByName: name, status: 'open',
    goalKm, createdAt: serverTimestamp(),
  });
  await joinRace(ref.id, email, name);
  return ref.id;
}

export async function joinRace(raceId: string, email: string, name: string, imageUrl?: string) {
  await setDoc(doc(db, 'races', raceId, 'participants', emailToDocId(email)), {
    email, name, imageUrl: imageUrl || '', distanceM: 0, finished: false, updatedAt: serverTimestamp(),
  }, { merge: true });
}

export function listenOpenRaces(cb: (races: Race[]) => void) {
  // Single-field where-in (no composite index needed); sort client-side.
  const q = query(collection(db, 'races'), where('status', 'in', ['open', 'live']), limit(30));
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Race[];
    list.sort((a, b) => ((b.createdAt as any) || 0) - ((a.createdAt as any) || 0));
    cb(list);
  }, (e) => { console.warn('[races] listen failed', e); cb([]); });
}

export async function getRace(raceId: string): Promise<Race | null> {
  const s = await getDoc(doc(db, 'races', raceId));
  return s.exists() ? ({ id: s.id, ...(s.data() as any) }) : null;
}

export function listenRaceParticipants(raceId: string, cb: (p: RaceParticipant[]) => void) {
  return onSnapshot(collection(db, 'races', raceId, 'participants'), (snap) => {
    const list = snap.docs.map((d) => d.data() as RaceParticipant);
    list.sort((a, b) => (b.distanceM || 0) - (a.distanceM || 0));
    cb(list);
  }, () => cb([]));
}

export async function updateRaceProgress(raceId: string, email: string, distanceM: number, lat?: number, lng?: number) {
  try {
    await updateDoc(doc(db, 'races', raceId, 'participants', emailToDocId(email)), {
      distanceM: Math.round(distanceM), ...(lat != null ? { lat, lng } : {}), updatedAt: serverTimestamp(),
    });
  } catch { /* not joined */ }
}

export async function setRaceStatus(raceId: string, status: 'open' | 'live' | 'done') {
  await updateDoc(doc(db, 'races', raceId), { status, ...(status === 'live' ? { startedAt: serverTimestamp() } : {}) });
}

export async function finishMyRace(raceId: string, email: string) {
  try { await updateDoc(doc(db, 'races', raceId, 'participants', emailToDocId(email)), { finished: true, updatedAt: serverTimestamp() }); } catch {}
}

// ─────────────── VIRTUAL CHALLENGES ("Conqueror") ───────────────
export interface Challenge {
  id: string; name: string; totalKm: number; emoji: string;
  // simple route the progress marker travels along (start -> waypoints -> end)
  route: { lat: number; lng: number }[];
}
export interface ChallengeProgress { email: string; name: string; imageUrl?: string; cumulativeKm: number; updatedAt?: any; }

// Preset virtual routes (inspired by The Conqueror). Routes are illustrative paths.
export const CHALLENGES: Challenge[] = [
  { id: 'casa-loop', name: 'Casablanca Corniche', totalKm: 10, emoji: '🌊', route: [{ lat: 33.5899, lng: -7.6680 }, { lat: 33.6050, lng: -7.6900 }, { lat: 33.6150, lng: -7.7100 }] },
  { id: 'paris-marathon', name: 'Paris Marathon', totalKm: 42, emoji: '🗼', route: [{ lat: 48.8738, lng: 2.2950 }, { lat: 48.8606, lng: 2.3376 }, { lat: 48.8462, lng: 2.3372 }, { lat: 48.8530, lng: 2.3700 }] },
  { id: 'great-wall', name: 'Great Wall of China', totalKm: 21, emoji: '🧱', route: [{ lat: 40.4319, lng: 116.5704 }, { lat: 40.4400, lng: 116.5900 }, { lat: 40.4500, lng: 116.6100 }] },
  { id: 'route66', name: 'Route 66 (mini)', totalKm: 30, emoji: '🛣️', route: [{ lat: 35.0844, lng: -106.6504 }, { lat: 35.1107, lng: -106.6100 }, { lat: 35.2000, lng: -106.5000 }] },
];

export function getChallenge(id: string): Challenge | undefined { return CHALLENGES.find((c) => c.id === id); }

export async function joinChallenge(challengeId: string, email: string, name: string, imageUrl?: string) {
  await setDoc(doc(db, 'challenges', challengeId, 'participants', emailToDocId(email)), {
    email, name, imageUrl: imageUrl || '', cumulativeKm: 0, updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function getMyChallengeProgress(challengeId: string, email: string): Promise<number | null> {
  const s = await getDoc(doc(db, 'challenges', challengeId, 'participants', emailToDocId(email)));
  return s.exists() ? ((s.data() as any).cumulativeKm || 0) : null;
}

export function listenChallengeBoard(challengeId: string, cb: (p: ChallengeProgress[]) => void) {
  return onSnapshot(collection(db, 'challenges', challengeId, 'participants'), (snap) => {
    const list = snap.docs.map((d) => d.data() as ChallengeProgress);
    list.sort((a, b) => (b.cumulativeKm || 0) - (a.cumulativeKm || 0));
    cb(list);
  }, () => cb([]));
}

// Called when a solo run finishes: add the distance to every challenge the user joined.
export async function addDistanceToJoinedChallenges(email: string, km: number) {
  if (!email || km <= 0) return;
  for (const c of CHALLENGES) {
    const ref = doc(db, 'challenges', c.id, 'participants', emailToDocId(email));
    try {
      const s = await getDoc(ref);
      if (s.exists()) await updateDoc(ref, { cumulativeKm: increment(km), updatedAt: serverTimestamp() });
    } catch { /* not joined */ }
  }
}
