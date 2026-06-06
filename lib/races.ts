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
// Points of interest along a virtual route. Each one sits at a given distance
// (atKm) from the start; as you progress you "reach" them and can see a photo /
// Street View of the real place + point your phone at it in AR.
export interface ChallengePOI { name: string; lat: number; lng: number; atKm: number; }
export interface Challenge {
  id: string; name: string; totalKm: number; emoji: string;
  // simple route the progress marker travels along (start -> waypoints -> end)
  route: { lat: number; lng: number }[];
  pois?: ChallengePOI[];
}
export interface ChallengeProgress { email: string; name: string; imageUrl?: string; cumulativeKm: number; updatedAt?: any; }

// Same Google key the maps use; Street View Static + Places work with it too.
const GOOGLE_MAPS_KEY = 'AIzaSyAa1lBSroSXA-Om4mio84-SWAcmzQgYv8w';

// A real street-level photo of a place (gracefully returns a "no imagery" tile
// when Street View has no coverage at that exact point).
export function streetViewUrl(lat: number, lng: number, w = 600, h = 360): string {
  return `https://maps.googleapis.com/maps/api/streetview?size=${w}x${h}&location=${lat},${lng}&fov=85&pitch=5&source=outdoor&key=${GOOGLE_MAPS_KEY}`;
}
// A satellite/hybrid thumbnail centered on a place — always renders (good fallback).
export function staticMapUrl(lat: number, lng: number, w = 600, h = 360, zoom = 16): string {
  return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=${zoom}&size=${w}x${h}&maptype=hybrid&markers=color:red%7C${lat},${lng}&key=${GOOGLE_MAPS_KEY}`;
}

// Preset virtual routes (inspired by The Conqueror). Routes are illustrative paths.
export const CHALLENGES: Challenge[] = [
  {
    id: 'casa-loop', name: 'Casablanca Corniche', totalKm: 10, emoji: '🌊',
    route: [{ lat: 33.6065, lng: -7.6360 }, { lat: 33.5980, lng: -7.6700 }, { lat: 33.5930, lng: -7.6880 }],
    pois: [
      { name: 'Mosquée Hassan II', lat: 33.6086, lng: -7.6326, atKm: 0 },
      { name: 'Phare d\'El Hank', lat: 33.6126, lng: -7.6447, atKm: 2.5 },
      { name: 'Plage Aïn Diab', lat: 33.5930, lng: -7.6700, atKm: 5.5 },
      { name: 'Morocco Mall', lat: 33.5793, lng: -7.7050, atKm: 10 },
    ],
  },
  {
    id: 'paris-marathon', name: 'Paris Marathon', totalKm: 42, emoji: '🗼',
    route: [{ lat: 48.8738, lng: 2.2950 }, { lat: 48.8606, lng: 2.3376 }, { lat: 48.8462, lng: 2.3372 }, { lat: 48.8530, lng: 2.3700 }],
    pois: [
      { name: 'Arc de Triomphe', lat: 48.8738, lng: 2.2950, atKm: 0 },
      { name: 'Place de la Concorde', lat: 48.8656, lng: 2.3212, atKm: 10 },
      { name: 'Musée du Louvre', lat: 48.8606, lng: 2.3376, atKm: 20 },
      { name: 'Cathédrale Notre-Dame', lat: 48.8530, lng: 2.3499, atKm: 31 },
      { name: 'Place de la Bastille', lat: 48.8531, lng: 2.3692, atKm: 42 },
    ],
  },
  {
    id: 'great-wall', name: 'Great Wall of China', totalKm: 21, emoji: '🧱',
    route: [{ lat: 40.4319, lng: 116.5704 }, { lat: 40.4400, lng: 116.5900 }, { lat: 40.4500, lng: 116.6100 }],
    pois: [
      { name: 'Mutianyu Gate', lat: 40.4319, lng: 116.5704, atKm: 0 },
      { name: 'Watchtower 14', lat: 40.4400, lng: 116.5900, atKm: 10 },
      { name: 'Watchtower 23', lat: 40.4500, lng: 116.6100, atKm: 21 },
    ],
  },
  {
    id: 'route66', name: 'Route 66 (mini)', totalKm: 30, emoji: '🛣️',
    route: [{ lat: 35.0844, lng: -106.6504 }, { lat: 35.1107, lng: -106.6100 }, { lat: 35.2000, lng: -106.5000 }],
    pois: [
      { name: 'Downtown Albuquerque', lat: 35.0844, lng: -106.6504, atKm: 0 },
      { name: 'Nob Hill Route 66', lat: 35.0790, lng: -106.6010, atKm: 12 },
      { name: 'Sandia Foothills', lat: 35.1500, lng: -106.5300, atKm: 30 },
    ],
  },
];

export function getChallenge(id: string): Challenge | undefined { return CHALLENGES.find((c) => c.id === id); }

export async function joinChallenge(challengeId: string, email: string, name: string, imageUrl?: string) {
  await setDoc(doc(db, 'challenges', challengeId, 'participants', emailToDocId(email)), {
    email, name, imageUrl: imageUrl || '', cumulativeKm: 0, updatedAt: serverTimestamp(),
  }, { merge: true });
}

// Set the absolute cumulative distance for a challenge (used by the live/sim
// navigation to push progress as you advance). Merges so it works even if the
// participant doc is sparse.
export async function setChallengeProgress(challengeId: string, email: string, km: number) {
  if (!challengeId || !email) return;
  try {
    await setDoc(
      doc(db, 'challenges', challengeId, 'participants', emailToDocId(email)),
      { cumulativeKm: Math.max(0, km), updatedAt: serverTimestamp() },
      { merge: true }
    );
  } catch (e) { console.warn('[challenge] setChallengeProgress failed', e); }
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
