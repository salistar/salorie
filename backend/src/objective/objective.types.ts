/**
 * Module "objective" — types fondateurs PARTAGÉS.
 *
 * C'est le cœur réutilisé par les analyses menu / fridge / receipt :
 *  - ObjectiveContext : l'état nutritionnel du jour + contraintes user, fourni
 *    par l'app dans le body de chaque analyse (PAS de Mongo côté backend).
 *  - FoodCandidate    : un aliment candidat (issu d'un menu/frigo/ticket).
 *  - FoodScore        : le verdict de ScoringService.scoreFood.
 *
 * Aucune dépendance runtime : pur TypeScript (interfaces uniquement).
 */

/** Contexte d'objectif du jour, fourni par l'app (jamais persité ici). */
export interface ObjectiveContext {
  /** Identifiant user optionnel (pseudonymisé côté app si besoin). */
  uid?: string;
  /** Objectif global : perte / maintien / prise. */
  goal: 'lose' | 'maintain' | 'gain';
  /** Langue des libelles renvoyes. Absente = francais, comportement historique. */
  lang?: 'fr' | 'en' | 'ar';
  /** Dépense énergétique totale estimée (kcal/jour). */
  tdee: number;
  /** Cible calorique du jour (kcal). */
  dailyKcalTarget: number;
  /** Calories encore disponibles aujourd'hui (kcal). */
  remainingKcal: number;
  /** Cibles macro du jour (grammes). */
  macroTargets: { protein: number; carbs: number; fat: number };
  /** Macros encore disponibles aujourd'hui (grammes). */
  remainingMacros: { protein: number; carbs: number; fat: number };
  /** Régimes suivis (ex: 'halal', 'vegetarian', 'keto', ...). */
  diet: string[];
  /** Allergies (ex: 'peanut', 'gluten', 'lactose', ...). */
  allergies: string[];
  /** Aliments non désirés (préférences). */
  dislikes: string[];
  /**
   * Conditions médicales gérées (défaut []). Guidance diététique conservatrice,
   * PAS un diagnostic. Valeurs reconnues : 'diabetes', 'hypertension',
   * 'high_cholesterol', 'celiac', 'kidney', 'ibs' / 'lowfodmap', 'gout'.
   */
  conditions: string[];
}

/** Un aliment candidat à scorer (par portion). */
export interface FoodCandidate {
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Étiquettes libres normalisées (ex: 'pork', 'peanut', 'highP', 'fried'). */
  tags?: string[];
}

/** Verdict de scoring d'un aliment vs l'objectif courant. */
export interface FoodScore {
  /** Score d'adéquation 0..100 (100 = parfait pour l'objectif). */
  fit: number;
  /** Verdict synthétique. */
  verdict: 'great' | 'ok' | 'avoid';
  /** Raisons lisibles (français) expliquant le score. */
  reasons: string[];
  /** Vrai si bloqué dur (allergie / interdiction alimentaire). */
  blocked?: boolean;
}
