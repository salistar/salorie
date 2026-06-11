import { auth } from './firebaseAuth';

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
export const raceProgress = (id: string, km: number) => authFetch(`/races/${id}/progress`, { method: 'POST', body: JSON.stringify({ km }) });
export const finishRace = (id: string) => authFetch(`/races/${id}/finish`, { method: 'POST' });
// Médailles
export const getMyMedals = () => authFetch('/races/medals/me');
// Journal (actus publiées depuis le back-office web)
export const getNews = () => authFetch('/news');
// Orgs B2B
export const getMyOrgs = () => authFetch('/orgs/mine');
export const joinOrg = (code: string, userName?: string) => authFetch('/orgs/join', { method: 'POST', body: JSON.stringify({ code, userName }) });
export const getMyClients = () => authFetch('/orgs/clients');
