// Recherche d'un produit par code-barres — version navigateur.
// ---------------------------------------------------------------------------
// Le mobile scanne le code avec la caméra ; le web le fait TAPER. J'avais classé
// cet écran « bloqué par le matériel » à tort : la caméra n'est qu'un moyen
// d'obtenir treize chiffres, et un clavier les obtient très bien. La partie qui
// compte — interroger OpenFoodFacts et lire la fiche — n'a jamais eu besoin
// d'un appareil photo.
//
// Mêmes champs demandés que `lib/fatsecret.ts` du mobile, pour que les deux
// clients affichent la même fiche pour le même produit.

const CHAMPS =
  'product_name,brands,categories,categories_tags,nova_group,allergens,allergens_tags,' +
  'ingredients_text,nutriments,image_front_small_url';

export interface ProduitOFF {
  code: string;
  nom: string;
  marque: string;
  image: string;
  /** Valeurs pour 100 g, telles qu'OpenFoodFacts les publie. */
  kcal100: number;
  prot100: number;
  gluc100: number;
  lip100: number;
  sucres100: number;
  satures100: number;
  sodiumMg100: number;
  fibres100: number;
  allergenes: string[];
  ingredients: string;
  nova: number | null;
}

const nb = (v: any): number => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

/**
 * Un code-barres valide : 8 à 14 chiffres. On filtre AVANT l'appel réseau —
 * OpenFoodFacts répond « introuvable » pour n'importe quelle chaîne, ce qui
 * ferait passer une faute de frappe pour un produit absent du catalogue.
 */
export function codeValide(code: string): boolean {
  return /^[0-9]{8,14}$/.test(code.trim());
}

/** Cache mémoire : re-taper le même code dans la session ne rappelle pas l'API. */
const cache = new Map<string, ProduitOFF | null>();

export async function chercherProduit(code: string, signal?: AbortSignal): Promise<ProduitOFF | null> {
  const c = code.trim();
  if (!codeValide(c)) return null;
  if (cache.has(c)) return cache.get(c) ?? null;

  const url = `https://world.openfoodfacts.org/api/v2/product/${c}.json?fields=${CHAMPS}`;
  let rep: Response;
  try {
    // Pas d'en-tête `User-Agent` ici, contrairement au mobile : un navigateur
    // refuse de le laisser écrire, et l'ajouter déclencherait un préflight CORS
    // qu'OpenFoodFacts n'accepte pas — la requête échouerait entièrement.
    rep = await fetch(url, { headers: { Accept: 'application/json' }, signal });
  } catch (e: any) {
    if (e?.name === 'AbortError') throw e;
    return null;
  }
  if (!rep.ok) return null;

  const data = await rep.json().catch(() => null);
  if (!data || data.status !== 1 || !data.product) {
    // Négatif mis en cache : un code absent du catalogue le reste, inutile de
    // rappeler l'API à chaque frappe.
    cache.set(c, null);
    return null;
  }

  const p = data.product;
  const n = p.nutriments || {};
  const produit: ProduitOFF = {
    code: c,
    nom: String(p.product_name || '').trim(),
    marque: String(p.brands || '').trim(),
    image: String(p.image_front_small_url || ''),
    kcal100: nb(n['energy-kcal_100g']),
    prot100: nb(n.proteins_100g),
    gluc100: nb(n.carbohydrates_100g),
    lip100: nb(n.fat_100g),
    sucres100: nb(n.sugars_100g),
    satures100: nb(n['saturated-fat_100g']),
    // OpenFoodFacts publie le sodium en GRAMMES ; le Nutri-Score le veut en
    // milligrammes. Oublier ce facteur 1000 donnerait un sodium quasi nul et
    // une note bien trop flatteuse sur tous les produits salés.
    sodiumMg100: nb(n.sodium_100g) * 1000,
    fibres100: nb(n.fiber_100g),
    allergenes: Array.isArray(p.allergens_tags)
      ? p.allergens_tags.map((a: string) => String(a).replace(/^[a-z]{2}:/, '')).filter(Boolean)
      : [],
    ingredients: String(p.ingredients_text || '').trim(),
    nova: Number.isFinite(Number(p.nova_group)) ? Number(p.nova_group) : null,
  };
  cache.set(c, produit);
  return produit;
}

/** Valeurs ramenées à une portion, arrondies. */
export function pourPortion(p: ProduitOFF, grammes: number) {
  const f = Math.max(0, grammes) / 100;
  return {
    kcal: Math.round(p.kcal100 * f),
    prot: Math.round(p.prot100 * f * 10) / 10,
    gluc: Math.round(p.gluc100 * f * 10) / 10,
    lip: Math.round(p.lip100 * f * 10) / 10,
  };
}
