// Convertit un produit OpenFoodFacts (OFF) en FoodCandidate scorable par
// scoreFood, avec dérivation de tags nutritionnels selon LES MÊMES SEUILS que
// le backend (scoring.service). 100% on-device, aucune dépendance réseau.
//
// Seuils (par 100 g, alignés backend) :
//   sugars      > 22.5  → 'high_sugar'
//   salt        > 1.5   → 'high_sodium'   (ou sodium > 0.6)
//   saturated   > 5     → 'saturated_fat'
//   nova        = 4     → 'ultra_processed'
//   allergens   →         'gluten' | 'lactose' | 'peanut' | 'nuts'
//   pork (nom/catégorie) → 'pork'
import type { FoodCandidate } from './scoring';

/** Forme partielle du produit OFF (world.openfoodfacts.org api v2). */
export interface OffProduct {
  product_name?: string;
  brands?: string;
  categories?: string;
  categories_tags?: string[];
  nova_group?: number | string;
  nutriments?: Record<string, any>;
  allergens?: string;
  allergens_tags?: string[];
  /** Traces éventuelles (ex: 'en:milk') — unies aux allergènes côté backend. */
  traces_tags?: string[];
  ingredients_text?: string;
  [k: string]: any;
}

/** Nombre fini, sinon undefined (distingue "0" d'"absent"). */
function n(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const x = Number(v);
  return Number.isFinite(x) ? x : undefined;
}

/** Chaîne normalisée (minuscule, sans accents). */
function norm(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * true si le produit est comestible (aliment/boisson avec des kcal), false si
 * catégorie non-alimentaire (hygiène, cosmétique, animalerie…) ou aucune
 * information calorique exploitable.
 */
export function edible(product?: OffProduct | null): boolean {
  const p = product || {};
  const nut = p.nutriments || {};
  const kcal = n(nut['energy-kcal_100g']) ?? n(nut['energy-kcal_serving']) ?? n(nut['energy-kcal']);
  const kj = n(nut['energy_100g']) ?? n(nut['energy-kj_100g']);
  const hasEnergy = (kcal != null && kcal > 0) || (kj != null && kj > 0);

  const catHay = norm(
    [p.categories, (p.categories_tags || []).join(' ')].filter(Boolean).join(' '),
  );
  // Catégories clairement NON alimentaires → non comestible d'office.
  const NON_FOOD = /(hygien|cosmetic|beaut|shampoo|shampooing|savon|soap|dentifrice|toothpaste|deodorant|deodorant|makeup|maquillage|parfum|perfume|lessive|detergent|nettoyant|cleaning|petfood|pet-food|nourriture pour (chien|chat)|dog|cat food|litiere|litter|piles|batter(y|ie)|tabac|tobacco|cigarette)/;
  if (NON_FOOD.test(catHay)) return false;

  // Sans aucune énergie exploitable → on ne peut pas scorer un aliment.
  return hasEnergy;
}

/** Dérive les tags nutritionnels d'un produit OFF (mêmes seuils que le backend). */
function deriveTags(p: OffProduct): string[] {
  const nut = p.nutriments || {};
  const tags = new Set<string>();

  const sugars = n(nut['sugars_100g']);
  const salt = n(nut['salt_100g']);
  const sodium = n(nut['sodium_100g']);
  const satFat = n(nut['saturated-fat_100g']);

  if (sugars != null && sugars > 22.5) tags.add('high_sugar');
  if ((salt != null && salt > 1.5) || (sodium != null && sodium > 0.6)) tags.add('high_sodium');
  if (satFat != null && satFat > 5) tags.add('saturated_fat');

  const nova = n(p.nova_group);
  if (nova === 4) tags.add('ultra_processed');

  // --- Allergènes : allergens_tags UNION traces_tags + champ texte (aligné
  //     sur offToTags backend qui fusionne allergens_tags et traces_tags). ---
  const allergenHay = norm(
    [
      (p.allergens_tags || []).join(' '),
      (p.traces_tags || []).join(' '),
      p.allergens,
    ]
      .filter(Boolean)
      .join(' '),
  );
  if (/\b(gluten|ble|wheat|orge|barley|seigle|rye)\b/.test(allergenHay)) tags.add('gluten');
  if (/\b(lactose|milk|lait|dairy)\b/.test(allergenHay)) tags.add('lactose');
  if (/\b(peanut|arachide|cacahuet)\b/.test(allergenHay)) tags.add('peanut');
  if (/\b(nut|nuts|noix|amande|almond|noisette|hazelnut|cajou|cashew|pistache|pistachio|walnut|pecan)\b/.test(allergenHay)) tags.add('nuts');

  // --- Porc (nom / catégorie / ingrédients). -------------------------------
  const porkHay = norm(
    [p.product_name, p.categories, (p.categories_tags || []).join(' '), p.ingredients_text]
      .filter(Boolean)
      .join(' '),
  );
  // Union des mots-clés porc offTags + offToTags backend (saindoux/gelatine…).
  if (/\b(porc|pork|jambon|ham|bacon|lardon|saucisson|chorizo|salami|prosciutto|coppa|saindoux|gelatine|gélatine)/.test(porkHay)) {
    tags.add('pork');
  }

  return Array.from(tags);
}

/**
 * Convertit un produit OFF en FoodCandidate (macros /100 g + tags dérivés).
 * kcal/macros retombent sur 0 si absents ; les tags reflètent les seuils.
 */
export function offToFood(product: OffProduct): FoodCandidate {
  const p = product || {};
  const nut = p.nutriments || {};
  const round1 = (v: number | undefined) => (v == null ? 0 : Math.round(v * 10) / 10);
  const name = [p.product_name, p.brands].filter(Boolean).join(' · ') || 'produit';
  return {
    name,
    kcal: round1(n(nut['energy-kcal_100g'])),
    protein: round1(n(nut['proteins_100g'])),
    carbs: round1(n(nut['carbohydrates_100g'])),
    fat: round1(n(nut['fat_100g'])),
    tags: deriveTags(p),
  };
}
