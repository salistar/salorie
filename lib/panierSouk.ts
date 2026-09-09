// Panier du souk — un budget en dirhams, une liste de courses par étal.
// ---------------------------------------------------------------------------
// Le problème que ça résout n'est pas nutritionnel, il est ÉCONOMIQUE. Toutes les
// apps de nutrition raisonnent en calories ; au Maroc, la contrainte qui décide
// vraiment de ce qu'on mange est le budget de la semaine. Une app qui propose du
// saumon à quelqu'un dont le panier fait 200 DH ne se trompe pas de calcul, elle
// se trompe de pays.
//
// DÉTERMINISTE, comme les assiettes du Ramadan : le même budget donne le même
// panier, ça fonctionne hors connexion, et ça se teste.
//
// Méthode, en trois temps :
//   1. LE SOCLE. Certains produits ne se discutent pas — farine, huile, sel,
//      épices, oignons, thé. Sans eux on ne cuisine pas, quel que soit le budget.
//      Ils sont servis d'abord.
//   2. LES PROTÉINES. Le poste le plus cher et le plus vite sacrifié quand l'argent
//      manque. On y consacre une part fixe du reste, en commençant par le meilleur
//      rapport protéines/dirham — au Maroc, ce sont les œufs, les sardines et les
//      légumineuses, pas la viande rouge.
//   3. LE FRAIS. Légumes et fruits absorbent ce qui reste.
//
// Ce que ce module ne prétend PAS faire : établir un menu équilibré validé par un
// nutritionniste. Il compose un panier plausible et honnête dans une contrainte
// d'argent, et affiche ce qu'il coûte.

export type Produit = {
  id: string;
  /** Nom francais — la langue de reference du jeu de donnees. */
  n: string;
  ar?: string;
  /**
   * Nom anglais. Ajoute le 09/09/2026 : l'ecran affichait son interface en
   * anglais et ses 50 produits en francais, parce que la donnee n'avait que
   * deux langues sur trois. Le code etait juste, la table etait incomplete —
   * un defaut qu'aucun test ni `tsc` ne pouvait voir.
   */
  en?: string;
  etal: string;
  unite: string;
  prix: number;
  k: number;
  p: number;
  c: number;
  f: number;
  /** Produit de base : on ne cuisine pas sans lui. */
  base?: boolean;
};

export type LigneAchat = {
  produit: Produit;
  quantite: number;
  cout: number;
};

export type Panier = {
  lignes: LigneAchat[];
  cout: number;
  budget: number;
  /** Énergie totale du panier, en kcal — sert à dire si la semaine « tient ». */
  kcal: number;
  proteines: number;
  /** Couverture énergétique estimée : 1 = la semaine est couverte. */
  couverture: number;
};

/** Besoin énergétique par personne et par jour, pour estimer la couverture. */
const KCAL_JOUR_DEFAUT = 2000;

/** Part du budget restant consacrée aux protéines, une fois le socle acheté. */
const PART_PROTEINES = 0.45;

/** Quantité par unité d'achat, en grammes — pour convertir prix et nutrition. */
function grammesParUnite(u: string): number {
  switch (u) {
    case 'kg':
    case 'L':
      return 1000;
    case '250g':
      return 250;
    case '200g':
      return 200;
    case 'douzaine':
      return 12 * 55; // un œuf ≈ 55 g
    case 'pot':
      return 125;
    case 'botte':
      return 60;
    case 'unité':
      return 200; // un pain
    case 'sachet':
      return 20;
    default:
      return 100;
  }
}

/** Protéines par dirham — le critère qui compte quand le budget est serré. */
/**
 * Le nom a afficher dans la langue courante, avec repli sur le francais.
 * ⚠ Une SEULE fonction pour tout le module : le selecteur etait ecrit deux
 * fois dans l'ecran (une pour l'etal, une pour la ligne), et les deux
 * ignoraient l'anglais de la meme facon. Deux copies, deux fois le meme oubli.
 */
export function nomDans(langue: string, o: { n: string; ar?: string; en?: string }): string {
  if (langue === 'ar' && o.ar) return o.ar;
  if (langue === 'en' && o.en) return o.en;
  return o.n;
}

/**
 * L'unite, dans la langue courante.
 * ---------------------------------------------------------------------------
 * ⚠ ON NE TRADUIT PAS LA DONNEE, ON TRADUIT L'AFFICHAGE.
 * `unite` est aussi la CLE que lit `grammesParUnite` pour convertir un achat en
 * grammes. Ecrire « dozen » dans `prix-souk.json` casserait ce calcul en
 * silence : la conversion retomberait sur son defaut, et le panier annoncerait
 * une couverture nutritionnelle fausse. La table vit donc ici.
 *
 * Constate le 09/09/2026 sur l'emulateur : apres avoir traduit les 50 noms de
 * produits, l'ecran anglais affichait encore « 1 douzaine » et « 14 unite ».
 * L'arabe, lui, les affichait en francais depuis toujours.
 */
const UNITES: Record<string, { en: string; ar: string }> = {
  kg: { en: 'kg', ar: 'كغ' },
  L: { en: 'L', ar: 'ل' },
  'unité': { en: 'unit', ar: 'وحدة' },
  douzaine: { en: 'dozen', ar: 'درزن' },
  botte: { en: 'bunch', ar: 'حزمة' },
  pot: { en: 'tub', ar: 'علبة' },
  sachet: { en: 'packet', ar: 'كيس' },
  '250g': { en: '250g', ar: '250غ' },
  '200g': { en: '200g', ar: '200غ' },
};

export function uniteDans(langue: string, unite: string): string {
  const u = UNITES[unite];
  if (!u) return unite;                       // unite inconnue : on l'affiche telle quelle
  if (langue === 'ar') return u.ar;
  if (langue === 'en') return u.en;
  return unite;
}

export function proteinesParDirham(p: Produit): number {
  if (!p.prix || p.prix <= 0) return 0;
  return ((p.p || 0) * (grammesParUnite(p.unite) / 100)) / p.prix;
}

function ligne(produit: Produit, quantite: number): LigneAchat {
  const q = Math.max(0, Math.round(quantite * 2) / 2); // au demi près
  return { produit, quantite: q, cout: Math.round(q * produit.prix * 10) / 10 };
}

function totaliser(lignes: LigneAchat[], budget: number, personnes: number, jours: number): Panier {
  const utiles = lignes.filter((l) => l.quantite > 0);
  const cout = Math.round(utiles.reduce((s, l) => s + l.cout, 0) * 10) / 10;
  let kcal = 0;
  let proteines = 0;
  for (const l of utiles) {
    const g = grammesParUnite(l.produit.unite) * l.quantite;
    kcal += ((l.produit.k || 0) * g) / 100;
    proteines += ((l.produit.p || 0) * g) / 100;
  }
  const besoin = KCAL_JOUR_DEFAUT * Math.max(1, personnes) * Math.max(1, jours);
  return {
    lignes: utiles,
    cout,
    budget,
    kcal: Math.round(kcal),
    proteines: Math.round(proteines),
    couverture: Math.round((kcal / besoin) * 100) / 100,
  };
}

/**
 * Compose un panier tenant dans le budget.
 *
 * @param produits  Table de prix (assets/data/prix-souk.json).
 * @param budget    Budget en dirhams.
 * @param personnes Nombre de personnes au foyer.
 * @param jours     Durée couverte, en jours.
 */
export function composerPanier(
  produits: Produit[],
  budget: number,
  personnes = 2,
  jours = 7,
): Panier {
  const b = Math.max(0, Number(budget) || 0);
  if (!produits.length || b <= 0) return totaliser([], b, personnes, jours);

  const facteur = (Math.max(1, personnes) * Math.max(1, jours)) / 14; // référence : 2 pers., 7 j
  const lignes: LigneAchat[] = [];
  let reste = b;

  // ── 1. Le socle ───────────────────────────────────────────────────────────
  // Quantités de base pour deux personnes sur une semaine, mises à l'échelle.
  const SOCLE: Record<string, number> = {
    farine: 2, semoule: 1, 'huile-table': 1, sel: 0.5, epices: 2,
    oignon: 1.5, ail: 0.2, coriandre: 3, tomate: 2, pain: 14,
  };
  for (const p of produits.filter((x) => x.base)) {
    const q = (SOCLE[p.id] ?? 1) * facteur;
    const l = ligne(p, q);
    // Même le socle cède si le budget ne suit pas : mieux vaut un panier
    // incomplet qu'un panier impayable.
    if (l.cout <= reste) {
      lignes.push(l);
      reste -= l.cout;
    }
  }

  // ── 2. Les protéines ──────────────────────────────────────────────────────
  const budgetProteines = reste * PART_PROTEINES;
  let resteProteines = budgetProteines;
  const sources = produits
    .filter((p) => (p.p || 0) >= 10 && !lignes.some((l) => l.produit.id === p.id))
    .sort((x, y) => proteinesParDirham(y) - proteinesParDirham(x));

  for (const p of sources) {
    if (resteProteines <= p.prix * 0.5) continue;
    // On plafonne chaque source à un tiers du budget protéines : un panier fait
    // uniquement de sardines est optimal sur le papier et immangeable en vrai.
    const part = Math.min(resteProteines, budgetProteines / 3);
    const q = part / p.prix;
    if (q < 0.5) continue;
    const l = ligne(p, q);
    lignes.push(l);
    resteProteines -= l.cout;
    reste -= l.cout;
    if (resteProteines <= 0) break;
  }

  // ── 3. Le frais ───────────────────────────────────────────────────────────
  const frais = produits
    .filter((p) => ['legumes', 'fruits'].includes(p.etal) && !lignes.some((l) => l.produit.id === p.id))
    .sort((x, y) => x.prix - y.prix);

  for (const p of frais) {
    if (reste <= p.prix * 0.5) break;
    const q = Math.min(2 * facteur, reste / p.prix);
    if (q < 0.5) continue;
    const l = ligne(p, q);
    if (l.cout > reste) continue;
    lignes.push(l);
    reste -= l.cout;
  }

  return totaliser(lignes, b, personnes, jours);
}

/** Regroupe le panier par étal — c'est ainsi qu'on fait ses courses, pas par macro. */
export function parEtal(panier: Panier): { etal: string; lignes: LigneAchat[]; cout: number }[] {
  const groupes = new Map<string, LigneAchat[]>();
  for (const l of panier.lignes) {
    const e = l.produit.etal || 'autre';
    if (!groupes.has(e)) groupes.set(e, []);
    groupes.get(e)!.push(l);
  }
  // L'ordre suit le trajet habituel dans un souk : le sec d'abord, le frais ensuite,
  // la viande et le poisson en dernier pour ne pas les promener au soleil.
  const ordre = ['epicier', 'legumes', 'fruits', 'boucher', 'poissonnier'];
  return [...groupes.entries()]
    .sort((a, b) => ordre.indexOf(a[0]) - ordre.indexOf(b[0]))
    .map(([etal, lignes]) => ({
      etal,
      lignes,
      cout: Math.round(lignes.reduce((s, l) => s + l.cout, 0) * 10) / 10,
    }));
}
