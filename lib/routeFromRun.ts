// Transformer une course déjà faite en parcours communautaire.
//
// POURQUOI : `community-routes` demandait de saisir chaque étape AU CLAVIER — nom du lieu,
// latitude, longitude. Personne ne fait ça. Résultat : un écran de contribution que
// personne n'alimente, donc une bibliothèque vide, donc aucune raison d'y revenir.
// Or le GPS de `run.tsx` produit exactement la donnée manquante. « Publier ma sortie de
// dimanche » supprime toute la friction.
//
// Le tracé brut (un point toutes les ~3 s) est inutilisable tel quel : une course d'une
// heure fait ~1200 points, là où un parcours se lit avec 5 à 10 étapes. On échantillonne
// donc À DISTANCE ÉGALE plutôt qu'à intervalle de temps : un coureur qui s'arrête au feu
// rouge ne doit pas générer dix étapes au même endroit.

export type TrackPoint = { lat: number; lng: number };

/** Distance en mètres entre deux points (haversine). */
function haversine(a: TrackPoint, b: TrackPoint): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Longueur totale du tracé, en mètres. */
export function trackLength(track: TrackPoint[]): number {
  let total = 0;
  for (let i = 1; i < track.length; i++) total += haversine(track[i - 1], track[i]);
  return total;
}

export type RouteStop = { name: string; lat: number; lng: number; atKm: number };

/**
 * Réduit un tracé à `count` étapes réparties à distance égale.
 *
 * Départ et arrivée sont TOUJOURS conservés : ce sont les deux seules étapes dont la
 * position a un sens pour quelqu'un qui découvre le parcours (où je commence, où je
 * finis). Les intermédiaires ne sont là que pour donner la forme du tracé.
 */
export function sampleStops(track: TrackPoint[], count = 6): RouteStop[] {
  const pts = track.filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng));
  if (pts.length < 2) return [];

  const n = Math.max(2, Math.min(count, pts.length));
  const total = trackLength(pts);
  if (total <= 0) return [];

  // Distance cumulée à chaque point : permet de viser une distance cible sans réinterpoler.
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + haversine(pts[i - 1], pts[i]));

  const stops: RouteStop[] = [];
  for (let s = 0; s < n; s++) {
    const target = (total * s) / (n - 1);
    // Premier point ayant dépassé la distance cible.
    let idx = cum.findIndex((d) => d >= target);
    if (idx < 0) idx = pts.length - 1;
    stops.push({
      name: '',                       // rempli par l'appelant (traduit) ou par l'utilisateur
      lat: +pts[idx].lat.toFixed(6),  // ~0,1 m : au-delà c'est du bruit GPS
      lng: +pts[idx].lng.toFixed(6),
      atKm: +(cum[idx] / 1000).toFixed(2),
    });
  }
  return stops;
}

/**
 * Nomme les étapes dans la langue de l'utilisateur. Ce sont des repères de progression,
 * pas des toponymes : on ne peut pas deviner « Place Mohammed V » depuis des coordonnées
 * sans appel de géocodage inverse (coûteux, et hors ligne il échouerait). L'utilisateur
 * peut de toute façon les renommer avant d'envoyer.
 */
export function labelStops(stops: RouteStop[], lang: string): RouteStop[] {
  const T: Record<string, { start: string; end: string; step: string }> =
    {
      fr: { start: 'Départ', end: 'Arrivée', step: 'Étape' },
      ar: { start: 'الانطلاق', end: 'الوصول', step: 'محطة' },
      en: { start: 'Start', end: 'Finish', step: 'Point' },
    };
  const t = T[lang] || T.en;
  return stops.map((s, i) => ({
    ...s,
    name: i === 0 ? t.start : i === stops.length - 1 ? t.end : `${t.step} ${i}`,
  }));
}

/** Nom par défaut du parcours : lisible, et distinct d'une sortie à l'autre. */
export function defaultRouteName(km: number, lang: string, dateIso: string): string {
  const d = dateIso.slice(0, 10);
  if (lang === 'fr') return `Parcours ${km.toFixed(1)} km — ${d}`;
  if (lang === 'ar') return `مسار ${km.toFixed(1)} كم — ${d}`;
  return `${km.toFixed(1)} km route — ${d}`;
}

/**
 * Un tracé mérite-t-il d'être proposé ?
 *
 * Filtre volontairement strict : une bibliothèque communautaire meurt de ses parcours
 * inutiles bien plus vite que de son manque de contenu. On écarte les sorties trop
 * courtes et les tracés trop pauvres en points pour avoir une forme exploitable.
 */
export function isRouteWorthy(track: TrackPoint[], km: number): boolean {
  return km >= 1 && track.length >= 8;
}
