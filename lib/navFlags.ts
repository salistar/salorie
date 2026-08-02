// navFlags — mapping ROUTE → clé de feature-flag, utilisé par les hubs de navigation
// (Accueil / Coach / Défis) pour MASQUER les tuiles dont le flag est OFF (évite les
// culs-de-sac). Additif : ne masque QUE les routes dont le flag figure dans FLAG_KEYS.
//
// Règle générale : flag = nom de la route (ex. /(app)/fasting → 'fasting').
// EXCEPTIONS : quelques routes partagent un même flag « famille ».
import { FlagMap, isEnabled } from './featureFlags';

/** Flags « gérables » : on ne masque une tuile que si SON flag figure ici. */
export const FLAG_KEYS: ReadonlySet<string> = new Set([
  'meal-plan', 'nutrients', 'meal-builder', 'food-recognition', 'voice-log',
  'label-scan', 'rep-counter', 'run', 'workout-plans', 'fasting', 'ai-coach',
  'social', 'races', 'medals', 'virtual-races', 'health', 'metabolic-twin',
  'adaptive-tdee', 'calorie-budget', 'streaks', 'fridge-recipes', 'substitutions',
  'body-measurements', 'sleep-tracker', 'mood-tracker', 'smart-hydration',
  'meal-templates', 'progress-photos', 'nutri-score', 'import-recipe',
  'shopping-list', 'restaurant-mode', 'receipt-ocr', 'ai-meal-plan', 'battle',
  'health-export', 'vitals', 'microbiome', 'body-composition',
]);

/** Routes qui NE mappent PAS 1:1 vers leur nom (plusieurs routes → un flag famille). */
const ROUTE_EXCEPTIONS: Record<string, string> = {
  'scan-analysis': 'food-recognition',
  'scan-camera': 'food-recognition',
  'scan-barcode': 'food-recognition',
  'live-twin': 'metabolic-twin',
  'meal-plan-history': 'meal-plan',
  'city-challenges': 'virtual-races',
  'race-live': 'virtual-races',
  'leagues': 'social',
};

/** Normalise une route ('/fasting', '/challenge?id=1') en segment ('fasting', 'challenge'). */
function routeSegment(route: string): string {
  return String(route || '')
    .replace(/^\//, '')      // slash de tête
    .split('?')[0]           // query string
    .split('/')[0];          // sous-chemins éventuels
}

/**
 * Clé de flag GÉRÉE pour une route, ou null si la route n'est pas gérée
 * (flag hors FLAG_KEYS → tuile laissée intacte).
 */
export function flagForRoute(route: string): string | null {
  const seg = routeSegment(route);
  const key = ROUTE_EXCEPTIONS[seg] || seg;
  return FLAG_KEYS.has(key) ? key : null;
}

/**
 * Une tuile qui navigue vers `route` doit-elle être RENDUE ?
 *   - route non gérée (flag hors FLAG_KEYS) → true (intacte).
 *   - route gérée → isEnabled(flags, flag) (défaut true si flag absent).
 * Pas de hook : à appeler dans .map/.filter avec les `flags` lus une fois via useFlagsCtx().
 */
export function isRouteEnabled(flags: FlagMap | null | undefined, route: string): boolean {
  const key = flagForRoute(route);
  if (!key) return true;
  return isEnabled(flags, key);
}
