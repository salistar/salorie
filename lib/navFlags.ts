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

  // ── Ajoutees le 09/09/2026 apres l'audit de couverture ──────────────────
  // 33 ecrans de 250+ lignes n'avaient AUCUN interrupteur : en cas d'incident
  // sur l'un d'eux, la seule issue etait de republier une version et d'attendre
  // que le magasin la propage. Chacune de ces cles est desormais doublee d'un
  // `useScreenGate` dans l'ecran correspondant — sans quoi on ne masquerait que
  // la tuile, en laissant l'ecran joignable par lien profond.
  //
  // ⚠ CE QUI N'EST VOLONTAIREMENT PAS ICI, ET POURQUOI.
  //   les ONGLETS (accueil, coach, defis, analytics, profil) : les eteindre
  //     laisserait leur bouton dans la barre, donc un cul-de-sac garanti.
  //   /privacy, /terms, /contact : Google Play EXIGE que la politique de
  //     confidentialite reste atteignable. Un interrupteur dessus est un risque
  //     de retrait, pas une securite.
  //   le JOURNAL et la SAISIE (/diary, /log-manual, /log-food-details,
  //     /log-exercise, /add-water, /update-weight) : c'est la raison d'etre de
  //     l'application. Une application de nutrition qui ne sait plus enregistrer
  //     un repas n'est pas degradee, elle est morte.
  //   /welcome, /oauth-callback, /upgrade : le chemin d'entree et de paiement.
  'challenge', 'ramadan', 'food-database', 'ar-ghost', 'community-routes',
  'feature-requests', 'family', 'field-reserve', 'healthy-recipes', 'marketplace',
  'referral', 'group-sports', 'duo-walk', 'strava', 'readiness', 'import-data',
  'panier-souk', 'equipment-scan',
]);

/**
 * Ce qui ne doit JAMAIS pouvoir s'éteindre — et la raison de chacun.
 * ---------------------------------------------------------------------------
 * Le danger de ce système n'est pas seulement d'oublier un interrupteur : c'est
 * d'en poser un là où il ne faut pas. Un admin qui coupe l'un de ces écrans ne
 * dégrade pas l'application, il la casse — ou fait sauter sa conformité au
 * magasin.
 *
 * Cette liste est LUE, pas recopiée : `__tests__/drapeaux.test.ts` s'en sert
 * pour interdire l'ajout, et `scripts/auditer-features.js` pour ne pas signaler
 * comme un manque ce qui est une décision. Le projet a déjà payé trois fois la
 * divergence entre deux listes censées s'accorder.
 */
export const NON_EXTINGUIBLES: Readonly<Record<string, string>> = {
  privacy: 'Google Play EXIGE une politique de confidentialite atteignable',
  terms: 'conditions d utilisation : meme exigence',
  contact: 'voie de recours obligatoire pour l utilisateur',
  diary: 'le journal alimentaire EST l application',
  'log-manual': 'saisie manuelle : sans elle, plus rien a mesurer',
  'log-food-details': 'detail d un aliment logge',
  'log-exercise': 'saisie d une seance',
  'add-water': 'saisie de l hydratation',
  'update-weight': 'saisie du poids : la mesure de base',
  welcome: 'porte d entree',
  'oauth-callback': 'retour d authentification : le couper enferme dehors',
  upgrade: 'chemin de paiement',
  notifications: 'centre de notifications : rien ne le remplace',
  preferences: 'reglages, dont la langue et le theme',
  'personal-details': 'donnees du compte : droit d acces',
  kitchen: 'hub : le couper isolerait 15 fonctionnalites d un coup',
  // Les ONGLETS : les eteindre laisserait leur bouton dans la barre, donc un
  // cul-de-sac garanti — l'inverse exact du but de ce fichier.
  '': 'onglet accueil',
  coach: 'onglet',
  defis: 'onglet',
  analytics: 'onglet',
  profile: 'onglet',
};

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

  // ── Familles ajoutees le 09/09/2026 ─────────────────────────────────────
  // Meme regle qu'au-dessus : plusieurs ecrans d'une meme fonctionnalite
  // partagent un interrupteur, pour qu'on ne puisse pas en eteindre la moitie
  // et laisser l'autre atteignable.
  'challenge-ar': 'challenge',
  'annual-challenge': 'challenge',
  'workout-details': 'workout-plans',
  'workout-result': 'workout-plans',
  'sadaqa': 'ramadan',
  'register-product': 'food-database',
  'listing-create': 'marketplace',
  'listing-detail': 'marketplace',
  'amis': 'social',
  'rewards': 'referral',
  'match-create': 'group-sports',
  'sport-agenda': 'group-sports',
  'race-chat': 'races',
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
