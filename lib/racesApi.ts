import { auth } from './firebaseAuth';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Appels app authentifiés (token Firebase) vers le backend Mongo : courses
// virtuelles, médailles, organisations B2B.
const API = (process.env.EXPO_PUBLIC_API_URL || '').trim();

async function authFetch(path: string, opts: any = {}): Promise<any> {
  if (!API) throw new Error('EXPO_PUBLIC_API_URL non configuré');
  const tok = await auth.currentUser?.getIdToken().catch(() => null);
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}), ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json();
}

// Courses
export const getActiveRaces = () => authFetch('/races/active');
export const getRace = (id: string) => authFetch(`/races/${id}`);
export const getRaceBoard = (id: string) => authFetch(`/races/${id}/leaderboard`);
export const joinRace = (id: string, userName?: string) => authFetch(`/races/${id}/join`, { method: 'POST', body: JSON.stringify({ userName }) });
// Progression OFFLINE-FIRST : si le réseau échoue, on garde le MAX de km par course
// en file locale, rejoué au retour réseau (flushPendingRaceProgress, appelé par OfflineBanner).
const RACE_Q_KEY = 'pending_race_progress_v1';
export const raceProgress = async (id: string, km: number) => {
  try {
    return await authFetch(`/races/${id}/progress`, { method: 'POST', body: JSON.stringify({ km }) });
  } catch (e) {
    try {
      const raw = await AsyncStorage.getItem(RACE_Q_KEY);
      const q: Record<string, number> = raw ? JSON.parse(raw) : {};
      q[id] = Math.max(q[id] || 0, km); // on ne garde que le meilleur cumul
      await AsyncStorage.setItem(RACE_Q_KEY, JSON.stringify(q));
    } catch {}
    throw e;
  }
};
export const flushPendingRaceProgress = async (): Promise<number> => {
  let q: Record<string, number> = {};
  try { const raw = await AsyncStorage.getItem(RACE_Q_KEY); q = raw ? JSON.parse(raw) : {}; } catch { return 0; }
  const ids = Object.keys(q);
  if (!ids.length) return 0;
  let done = 0;
  for (const id of ids) {
    try {
      await authFetch(`/races/${id}/progress`, { method: 'POST', body: JSON.stringify({ km: q[id] }) });
      delete q[id]; done++;
    } catch { /* toujours hors-ligne → on garde */ }
  }
  try { await AsyncStorage.setItem(RACE_Q_KEY, JSON.stringify(q)); } catch {}
  return done;
};
export const finishRace = (id: string) => authFetch(`/races/${id}/finish`, { method: 'POST' });
// Médailles
export const getMyMedals = () => authFetch('/races/medals/me');
// Journal (actus publiées depuis le back-office web)
export const getNews = () => authFetch('/news');
// Orgs B2B
export const getMyOrgs = () => authFetch('/orgs/mine');
export const joinOrg = (code: string, userName?: string) => authFetch('/orgs/join', { method: 'POST', body: JSON.stringify({ code, userName }) });
export const getMyClients = () => authFetch('/orgs/clients');
