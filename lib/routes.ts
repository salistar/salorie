/**
 * Itinéraires via la **Routes API** de Google.
 *
 * Remplace l'ancienne Directions API (`maps/api/directions/json`), que Google a classée
 * « legacy » : elle reste active sur les projets ANCIENS mais ne peut plus être activée sur
 * un projet récent. Constaté le 5 août 2026 en créant la clé du projet `salistar-salorie` :
 *   « You're calling a legacy API, which is not enabled for your project…
 *     switch to the Places API (New) or Routes API »
 * L'app continuait de fonctionner uniquement parce que sa clé appartenait au projet
 * `gowithsally-475813`, antérieur à cette fermeture.
 *
 * La polyline renvoyée est encodée dans le MÊME format que l'ancienne API
 * (`overview_polyline.points` → `polyline.encodedPolyline`), donc les décodeurs existants
 * des écrans restent valables tels quels.
 */
import { auth } from './firebaseAuth';

export type LatLng = { lat: number; lng: number };

export type ModeItineraire = 'WALK' | 'DRIVE';

// Routes API refuse au-delà de 25 points intermédiaires. L'ancienne API avait la même
// limite, mais elle tronquait silencieusement ; ici la requête échouerait entièrement.
const MAX_ETAPES = 25;

/**
 * Échantillonne à intervalle régulier en conservant TOUJOURS les extrémités : un simple
 * `slice(0, 25)` couperait la fin du parcours et l'itinéraire s'arrêterait au milieu.
 */
export function limiterEtapes(points: LatLng[], max = MAX_ETAPES): LatLng[] {
  if (points.length <= max) return points;
  const pas = (points.length - 1) / (max - 1);
  const out: LatLng[] = [];
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * pas)]);
  return out;
}

/**
 * Renvoie la polyline ENCODÉE de l'itinéraire, ou `null` si aucun trajet n'est trouvé.
 *
 * DEPUIS LE 14 AOÛT 2026, L'APPEL PART DU BACKEND, PLUS DU TÉLÉPHONE.
 *
 * L'app appelait `routes.googleapis.com` en direct avec `EXPO_PUBLIC_GOOGLE_MAPS_KEY`,
 * donc avec une clé embarquée dans l'APK — extractible par quiconque, et facturée à
 * Salorie. Surtout, cette clé ne pouvait être protégée par AUCUNE restriction :
 *
 *  - restriction par référent → mesurée le 13 août 2026, elle a fait tomber l'API en
 *    « 403 Requests from referer <empty> are blocked » : un `fetch` React Native
 *    n'envoie pas de référent ;
 *  - restriction par application Android → inapplicable, la signature n'est pas
 *    transmise sur un appel HTTP ordinaire.
 *
 * La clé était donc condamnée à rester ouverte à tout Internet. Depuis le serveur,
 * l'appel part d'une IP fixe : la clé peut enfin être restreinte par adresse IP.
 *
 * Ne jette jamais : les deux appelants traitent l'absence d'itinéraire comme un cas
 * normal (repli sur le tracé à vol d'oiseau), pas comme une erreur.
 */
export async function fetchRoutePolyline(
  origin: LatLng,
  destination: LatLng,
  opts: { mode?: ModeItineraire; etapes?: LatLng[] } = {},
): Promise<string | null> {
  const { mode = 'WALK', etapes = [] } = opts;
  const API_URL = (process.env.EXPO_PUBLIC_API_URL || '').trim();
  if (!API_URL) return null;
  try {
    const tok = await auth.currentUser?.getIdToken().catch(() => null);
    // Timeout dur : sans lui, un backend lent figerait l'écran sur le tracé manquant.
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(`${API_URL}/ml/route`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
      },
      body: JSON.stringify({
        origin,
        destination,
        mode,
        // On échantillonne AVANT l'envoi : inutile de faire transiter mille points que le
        // serveur réduirait à 25. Il applique le même algorithme en garde-fou.
        ...(etapes.length ? { etapes: limiterEtapes(etapes) } : {}),
      }),
      signal: ctrl.signal,
    });
    clearTimeout(to);
    if (!res.ok) return null;
    const j = await res.json();
    return j?.polyline ?? null;
  } catch {
    return null;
  }
}


/*
 * Le repli sur l'ancienne Directions API a été retiré le 5 août 2026, après vérification
 * qu'il était devenu PROVABLEMENT mort : la clé en service (projet salistar-salorie)
 * n'autorise que Maps JavaScript API et Routes API, et un appel legacy avec elle répond
 * `REQUEST_DENIED`. Le garder ne protégeait de rien — il ajoutait un aller-retour réseau
 * inutile à chaque échec, et surtout la fausse impression d'avoir un filet.
 * Il n'avait de sens que pendant la fenêtre où le code était migré mais la clé pas encore
 * autorisée sur Routes API.
 */
