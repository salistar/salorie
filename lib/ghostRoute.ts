// lib/ghostRoute.ts
// ─────────────────────────────────────────────────────────────────────────────
// Mode Fantôme AR ("AR Ghost Route") — maths PURES & testables du coureur fantôme.
//
// Un "fantôme" virtuel court à une allure cible constante. À tout instant on
// connaît sa distance parcourue (depuis le temps écoulé), on la compare à la
// distance réelle du coureur, et on en déduit où dessiner son sprite à l'écran
// (devant si le fantôme mène, derrière sinon) ainsi que sa taille (proche=grand).
//
// Aucune dépendance, aucun effet de bord : pas de Date.now() ni de Math.random()
// — le temps écoulé est TOUJOURS passé en argument. Ces fonctions sont donc
// déterministes et unit-testables. L'écran app/(app)/ar-ghost.tsx les consomme.
//
// Convention d'angles : identique à app/(app)/challenge-ar.tsx — bearing en
// degrés (0 = Nord, sens horaire), heading boussole appareil idem, et un angle
// écran centré = norm180(bearing - heading) ∈ [-180, 180], 0 = droit devant.
// ─────────────────────────────────────────────────────────────────────────────

/** Rayon terrestre moyen, en mètres (pour hav, si besoin de distances réelles). */
const EARTH_RADIUS_M = 6371000;

/**
 * Ramène un angle en degrés dans l'intervalle [-180, 180) (180 → -180, comme la
 * formule d'origine). RÉ-IMPLÉMENTÉ ICI volontairement (pas importé du screen)
 * pour que la lib reste autonome et testable. Même formule que norm180 de
 * challenge-ar.tsx — donc même convention de signe pour le placement écran.
 */
export function norm180(d: number): number {
  return ((((d + 180) % 360) + 360) % 360) - 180;
}

/**
 * Convertit une allure (secondes par km) en vitesse (mètres / seconde).
 * Ex : 6:00/km = 360 s/km → 1000/360 ≈ 2,78 m/s.
 * Allure invalide (<= 0 ou non finie) → vitesse 0 (fantôme à l'arrêt, jamais NaN).
 */
export function paceToSpeed(secPerKm: number): number {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return 0;
  return 1000 / secPerKm;
}

/**
 * Distance (mètres) couverte par le fantôme après `elapsedSec` à l'allure donnée.
 * = vitesse × temps. Borne basse à 0 (jamais négative).
 */
export function ghostDistanceM(secPerKm: number, elapsedSec: number): number {
  const v = paceToSpeed(secPerKm);
  if (!Number.isFinite(elapsedSec) || elapsedSec <= 0) return 0;
  return v * elapsedSec;
}

/**
 * Écart SIGNÉ entre le fantôme et le coureur, en mètres.
 *  > 0  → le fantôme est DEVANT (il a couvert plus de distance) : il te devance.
 *  < 0  → tu es devant le fantôme : tu mènes.
 *  = 0  → coude à coude.
 * Entrées non finies traitées comme 0.
 */
export function gapM(ghostDistM: number, userDistM: number): number {
  const g = Number.isFinite(ghostDistM) ? ghostDistM : 0;
  const u = Number.isFinite(userDistM) ? userDistM : 0;
  return g - u;
}

/**
 * Angle écran (degrés, centré : 0 = droit devant) où dessiner le fantôme.
 *
 * Le coureur avance dans la direction `travelBearingDeg` (cap de déplacement,
 * issu des 2 derniers points GPS). Le fantôme se trouve SUR cette ligne de
 * course :
 *   - gap >= 0 (fantôme devant)  → dans la direction de marche       = travelBearing
 *   - gap <  0 (fantôme derrière) → dans le dos du coureur            = travelBearing + 180
 * On projette ensuite ce bearing relativement au cap de l'appareil (boussole)
 * via norm180(bearingCible - deviceHeading), exactement comme challenge-ar.tsx.
 *
 * Retourne un angle ∈ [-180, 180). |angle| <= FOV ⇒ le fantôme est dans le champ.
 */
export function ghostScreenAngle(
  travelBearingDeg: number,
  deviceHeadingDeg: number,
  gap: number,
): number {
  const tb = Number.isFinite(travelBearingDeg) ? travelBearingDeg : 0;
  const hd = Number.isFinite(deviceHeadingDeg) ? deviceHeadingDeg : 0;
  // Devant = cap de course ; derrière = cap de course + 180.
  const targetBearing = gap >= 0 ? tb : tb + 180;
  return norm180(targetBearing - hd);
}

/**
 * Taille (px) du sprite fantôme selon la valeur ABSOLUE de l'écart (mètres).
 * Proche (écart ~0) → grand (~MAX) ; loin → petit (~MIN). Décroissance linéaire
 * jusqu'à FAR_M, puis clampée. Toujours dans [MIN, MAX].
 */
export function ghostSize(absGapM: number): number {
  const MAX = 140; // sprite quasi collé (coude à coude)
  const MIN = 44;  // sprite lointain
  const FAR_M = 120; // au-delà de 120 m d'écart : taille mini
  const a = Number.isFinite(absGapM) ? Math.abs(absGapM) : FAR_M;
  const f = Math.min(1, Math.max(0, a / FAR_M)); // 0 (proche) → 1 (loin)
  const size = MAX - (MAX - MIN) * f;
  return Math.round(Math.min(MAX, Math.max(MIN, size)));
}

/**
 * Cap (bearing, degrés, 0 = Nord horaire) du point a vers le point b.
 * Réutilise la formule de bearingTo() de challenge-ar.tsx. Points = {lat,lng}.
 */
export function bearingDeg(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const y = Math.sin(((b.lng - a.lng) * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180);
  const x =
    Math.cos((a.lat * Math.PI) / 180) * Math.sin((b.lat * Math.PI) / 180) -
    Math.sin((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.cos(((b.lng - a.lng) * Math.PI) / 180);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

/**
 * Distance haversine (mètres) entre deux points {lat,lng}. Même formule que
 * haversine() de run.tsx / antiCheat. Fournie au cas où l'écran en a besoin.
 */
export function hav(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}
