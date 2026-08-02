// lib/antiCheat.ts
// ─────────────────────────────────────────────────────────────────────────────
// Anti-triche / preuve d'effort (#7)
//
// Détecte les déplacements GPS invraisemblables (téléport, vitesse aberrante,
// saut de coordonnées) afin de ne PAS gonfler artificiellement la distance d'une
// course. Pur calcul, sans dépendance : haversine (mètres) / temps (secondes)
// = vitesse (m/s), comparée à un seuil plausible selon l'activité.
//
// Utilisé par app/(app)/run.tsx : avant d'ajouter un segment de distance, on
// vérifie isPlausibleMove(point précédent, point courant). Si le mouvement est
// implausible, le point est ignoré (la distance n'est pas augmentée).
// ─────────────────────────────────────────────────────────────────────────────

/** Rayon terrestre moyen, en mètres. */
const EARTH_RADIUS_M = 6371000;

/**
 * Distance haversine entre deux coordonnées (lat/lng en degrés), en mètres.
 * Identique à la formule utilisée dans run.tsx — dupliquée ici pour que la lib
 * reste autonome (aucune logique de course existante n'est touchée).
 */
function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const la1 = (lat1 * Math.PI) / 180;
  const la2 = (lat2 * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * Vitesse maximale plausible (en km/h) pour une activité donnée.
 *
 * - marche / course (walk, run, running, jog…) : 30 km/h  (sprinteur d'élite ~37,
 *   on garde une marge mais on coupe le téléport)
 * - vélo (bike, cycling, ride…)                : 80 km/h  (descente rapide)
 * - défaut / inconnu                           : 120 km/h (filet de sécurité large)
 *
 * @param activity libellé d'activité, insensible à la casse (optionnel).
 */
export function maxSpeedFor(activity?: string): number {
  const a = (activity || '').toLowerCase();
  if (/walk|run|jog|marche|course|jogg|stroll|hike|rando|مشي|جري|ركض/.test(a)) return 30;
  if (/bike|cycl|ride|velo|vélo|دراجة/.test(a)) return 80;
  return 120;
}

/**
 * Indique si le déplacement entre le point précédent (prevLat/prevLng @ prevTs)
 * et le point courant (lat/lng @ ts) est PLAUSIBLE.
 *
 * Retourne `false` (= mouvement à ignorer) si :
 *  - les horodatages sont invalides ou le saut temporel est nul/négatif
 *    (Δt <= 0 → vitesse infinie, donc téléport),
 *  - la vitesse calculée (distance/temps) dépasse le seuil plausible de
 *    l'activité (maxSpeedFor).
 *
 * Retourne `true` dans tous les autres cas (y compris déplacement nul à un
 * instant ultérieur : Δt > 0 et distance 0 → vitesse 0, plausible).
 *
 * @param prevLat latitude du point précédent (degrés)
 * @param prevLng longitude du point précédent (degrés)
 * @param prevTs  horodatage du point précédent (millisecondes epoch)
 * @param lat     latitude du point courant (degrés)
 * @param lng     longitude du point courant (degrés)
 * @param ts      horodatage du point courant (millisecondes epoch)
 * @param activity libellé d'activité pour choisir le seuil (optionnel)
 */
export function isPlausibleMove(
  prevLat: number,
  prevLng: number,
  prevTs: number,
  lat: number,
  lng: number,
  ts: number,
  activity?: string,
): boolean {
  // Coordonnées / horodatages invalides → on ne peut rien valider : on rejette.
  if (
    !Number.isFinite(prevLat) || !Number.isFinite(prevLng) ||
    !Number.isFinite(lat) || !Number.isFinite(lng) ||
    !Number.isFinite(prevTs) || !Number.isFinite(ts)
  ) {
    return false;
  }

  // Saut temporel nul ou négatif → vitesse non définie / téléport instantané.
  const dtSec = (ts - prevTs) / 1000;
  if (dtSec <= 0) return false;

  const distM = haversineM(prevLat, prevLng, lat, lng);
  const speedKmh = (distM / dtSec) * 3.6;

  return speedKmh <= maxSpeedFor(activity);
}
