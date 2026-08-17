// Recherche d'aliments OpenFoodFacts — une seule implementation pour tout le web.
// ---------------------------------------------------------------------------
// Extrait de la page « Aliments » quand le compositeur de repas a eu besoin de la
// meme chose. Deux copies de ce filtrage auraient diverge : la page Aliments
// ecarte les produits sans calories, et un compositeur qui les garde ajouterait
// des lignes a zero kcal dans un repas — invisible jusqu'a ce que le total soit
// faux.
//
// La source est publique et sert du HTTP simple, donc appelable depuis un
// navigateur sans passer par notre backend.

export type Aliment = {
  code: string;
  nom: string;
  marque: string;
  /** Valeurs POUR 100 g — c'est la convention d'OpenFoodFacts. */
  kcal: number;
  prot: number;
  gluc: number;
  lip: number;
  image?: string;
};

/** Les champs demandes a OFF. En demander moins, c'est charger moins. */
const CHAMPS = 'code,product_name,brands,nutriments,image_small_url';

export function versAliment(p: any): Aliment | null {
  const n = p?.nutriments || {};
  const nom = String(p?.product_name || '').trim();
  // Un produit sans nom ou sans calories n'aide a rien : on l'ecarte plutot que
  // d'afficher une ligne vide qui fait douter du reste.
  const kcal = Number(n['energy-kcal_100g'] ?? n['energy-kcal']);
  if (!nom || !Number.isFinite(kcal) || kcal <= 0) return null;
  return {
    code: String(p?.code || ''),
    nom,
    marque: String(p?.brands || '').split(',')[0].trim(),
    kcal: Math.round(kcal),
    prot: Math.round(Number(n.proteins_100g) || 0),
    gluc: Math.round(Number(n.carbohydrates_100g) || 0),
    lip: Math.round(Number(n.fat_100g) || 0),
    image: p?.image_small_url,
  };
}

/**
 * Cherche des aliments. Rend une liste vide plutot que de lever : un champ de
 * recherche qui casse la page a la premiere requete ratee est pire qu'un champ
 * qui ne trouve rien. L'appelant distingue les deux par la longueur.
 */
export async function chercherAliments(terme: string, taille = 24): Promise<Aliment[]> {
  const q = terme.trim();
  if (q.length < 2) return [];
  const url =
    `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}` +
    `&search_simple=1&action=process&json=1&page_size=${taille}&fields=${CHAMPS}`;
  const rep = await fetch(url);
  const j = await rep.json();
  return (Array.isArray(j?.products) ? j.products : [])
    .map(versAliment)
    .filter(Boolean) as Aliment[];
}

/** Les valeurs d'un aliment pour une quantite donnee, en grammes. */
export function pourQuantite(a: Aliment, grammes: number) {
  const f = Math.max(0, grammes) / 100;
  return {
    kcal: Math.round(a.kcal * f),
    prot: Math.round(a.prot * f),
    gluc: Math.round(a.gluc * f),
    lip: Math.round(a.lip * f),
  };
}
