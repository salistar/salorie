// Appels authentifiés vers le module Strava du backend.
//
// Le backend fait tout le travail sensible : il détient le secret client, signe
// l'état OAuth en HMAC-SHA256 et garde les jetons dans une collection que les
// règles Firestore rendent illisible depuis le client (`strava_tokens`, allow
// read, write: if false). L'application ne voit jamais un jeton Strava.
//
// ⚠ LE PARCOURS N'A PAS BESOIN DE LIEN PROFOND, ET C'EST DÉLIBÉRÉ.
// Strava renvoie vers `/strava/retour`, qui répond une PAGE — pas du JSON — et
// invite l'utilisateur à revenir dans Salorie. L'application n'a donc rien à
// intercepter : elle rouvre l'écran, redemande l'état, et voit la connexion
// faite. Un lien profond ajouterait un schéma d'URL à déclarer, à tester sur
// deux systèmes, et une panne de plus quand il ne se déclenche pas.
import { auth } from './firebaseAuth';

const API = (process.env.EXPO_PUBLIC_API_URL || '').trim();

async function appel(chemin: string, opts: any = {}): Promise<any> {
  if (!API) throw new Error('EXPO_PUBLIC_API_URL non configuré');
  const tok = await auth.currentUser?.getIdToken().catch(() => null);
  const res = await fetch(`${API}${chemin}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    // Le code HTTP seul ne dit rien à qui lit le journal trois jours plus tard.
    let detail = '';
    try { detail = (await res.json())?.message || ''; } catch { /* corps vide */ }
    throw new Error(detail || `${chemin} a répondu ${res.status}`);
  }
  return res.json();
}

export type EtatStrava = {
  /** Le serveur a-t-il ses identifiants Strava ? Sans eux, rien n'est possible. */
  configure: boolean;
  connecte: boolean;
  athlete?: string;
  dernierImport?: number;
};

export type SeanceImportee = {
  id?: string;
  nom?: string;
  type?: string;
  distanceKm?: number;
  dureeMin?: number;
  calories?: number;
  date?: number;
};

export const etatStrava = (): Promise<EtatStrava> => appel('/strava/etat');

export const lienStrava = (): Promise<{ url: string }> => appel('/strava/lien');

/** `depuis` en millisecondes epoch : ne réimporte que ce qui suit cette date. */
export const importerStrava = (depuis?: number): Promise<{ seances: SeanceImportee[] }> =>
  appel(`/strava/importer${depuis ? `?depuis=${depuis}` : ''}`, { method: 'POST' });

export const delierStrava = (): Promise<{ ok: true }> =>
  appel('/strava/lien', { method: 'DELETE' });
