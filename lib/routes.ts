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

const pt = (p: LatLng) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });

/**
 * Renvoie la polyline ENCODÉE de l'itinéraire, ou `null` si aucun trajet n'est trouvé.
 *
 * Ne jette jamais : les deux appelants traitent l'absence d'itinéraire comme un cas normal
 * (repli sur le tracé à vol d'oiseau), pas comme une erreur.
 */
export async function fetchRoutePolyline(
  origin: LatLng,
  destination: LatLng,
  opts: { mode?: ModeItineraire; etapes?: LatLng[]; cle: string } ,
): Promise<string | null> {
  const { mode = 'WALK', etapes = [], cle } = opts;
  if (!cle) return null;
  try {
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': cle,
        // Sans FieldMask, Routes API répond 400 : le champ est OBLIGATOIRE.
        'X-Goog-FieldMask': 'routes.polyline.encodedPolyline',
      },
      body: JSON.stringify({
        origin: pt(origin),
        destination: pt(destination),
        ...(etapes.length ? { intermediates: limiterEtapes(etapes).map(pt) } : {}),
        travelMode: mode,
      }),
    });
    const j = await res.json();
    const enc = j?.routes?.[0]?.polyline?.encodedPolyline;
    if (enc) return enc;
  } catch { /* on tente le repli */ }
  return fetchLegacyPolyline(origin, destination, etapes, mode, cle);
}

/**
 * Repli sur l'ancienne Directions API.
 *
 * Nécessaire tant que la clé en service n'autorise pas Routes API : sans ce repli, migrer le
 * code AVANT d'avoir ouvert Routes API sur la clé ferait disparaître silencieusement le
 * tracé suivant les routes (les deux écrans traitent `null` comme « pas d'itinéraire »).
 * Ce chemin mourra de lui-même le jour où Google coupera la legacy — d'où l'ordre : Routes
 * d'abord, celui-ci seulement en secours.
 */
async function fetchLegacyPolyline(
  origin: LatLng,
  destination: LatLng,
  etapes: LatLng[],
  mode: ModeItineraire,
  cle: string,
): Promise<string | null> {
  try {
    const c = (p: LatLng) => `${p.lat},${p.lng}`;
    const wp = etapes.map(c).join('|');
    const url =
      `https://maps.googleapis.com/maps/api/directions/json?origin=${c(origin)}` +
      `&destination=${c(destination)}${wp ? `&waypoints=${wp}` : ''}` +
      `&mode=${mode === 'DRIVE' ? 'driving' : 'walking'}&key=${cle}`;
    const j = await (await fetch(url)).json();
    return j?.status === 'OK' ? (j.routes?.[0]?.overview_polyline?.points ?? null) : null;
  } catch {
    return null;
  }
}
