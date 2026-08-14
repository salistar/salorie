// Verdict halal (et contraintes de régime) sur un produit scanné.
// ---------------------------------------------------------------------------
// Le manque n'était PAS la préférence — `lib/dietPrefs.ts` gère « halal » depuis
// longtemps et l'injecte dans les prompts de plans de repas. Le manque était le
// VERDICT : scanner un produit ne disait rien de sa compatibilité. C'est pourtant
// le geste quotidien, et c'est ce que personne ne fait sur ce marché.
//
// RÈGLE FONDATRICE — la prudence, pas la complaisance.
// On ne déclare JAMAIS « compatible » par défaut. Sans liste d'ingrédients, le
// verdict est « à vérifier », jamais « bon ». Se tromper dans ce sens fait manger à
// quelqu'un ce qu'il refuse, sur la foi de notre app : c'est une trahison, pas un
// bug. Se tromper dans l'autre sens lui fait seulement reposer un paquet.
//
// Trois niveaux, dans le vocabulaire du fiqh alimentaire :
//   · haram    — interdit sans ambiguïté (porc, alcool, gélatine non certifiée) ;
//   · mashbouh — douteux, d'origine possiblement animale et non précisée ;
//   · certifié — le fabricant revendique une certification (label OFF).

export type StatutHalal = 'certifie' | 'compatible' | 'doute' | 'incompatible';

export type VerdictHalal = {
  statut: StatutHalal;
  /** Ce qui a déclenché le verdict, tel quel : l'utilisateur doit pouvoir juger. */
  detecte: string[];
  /** Clé de raison, traduite à l'affichage. */
  raison: 'certifie' | 'haram' | 'mashbouh' | 'sans-ingredients' | 'aucun-probleme';
};

/** Normalise : minuscules, sans accents, ponctuation ramenée à des espaces. */
function norm(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9؀-ۿ]+/g, ' ')
    .trim();
}

// ── HARAM : interdit, sans discussion ──────────────────────────────────────
const HARAM: { motif: RegExp; nom: string }[] = [
  { motif: /\b(porc|pork|schwein|cerdo|maiale|jambon|ham|bacon|lardon|lard|saindoux|couenne)\b/, nom: 'porc' },
  { motif: /\b(chorizo|salami|saucisson|prosciutto|coppa|pancetta|mortadelle|pepperoni)\b/, nom: 'charcuterie de porc' },
  { motif: /\b(sanglier|boar)\b/, nom: 'sanglier' },
  // Alcool. `alcool` seul est trop large (« alcool cétylique » est un émulsifiant
  // cosmétique, « sans alcool » est une mention rassurante) : on cible les formes
  // qui indiquent réellement une boisson ou un solvant éthylique.
  { motif: /\b(ethanol|alcool ethylique|ethyl alcohol|vin|wine|biere|beer|rhum|rum|whisky|vodka|liqueur|kirsch|cognac|champagne)\b/, nom: 'alcool' },
  { motif: /\be\s?120\b|\bcochenille\b|\bcarmin\b|\bcarmine\b|\bacide carminique\b/, nom: 'E120 carmin (insecte)' },
  { motif: /\bpresure animale\b|\banimal rennet\b/, nom: 'présure animale' },
  { motif: /\be\s?441\b/, nom: 'E441 gélatine' },
  { motif: /\be\s?542\b/, nom: 'E542 phosphate d os' },
];

// ── MASHBOUH : douteux, origine non précisée ───────────────────────────────
// Ces ingrédients EXISTENT en version végétale comme animale. Les déclarer haram
// serait faux ; les ignorer serait imprudent. On les signale pour que la personne
// décide — c'est exactement le rôle d'un scanner, pas de trancher à sa place.
const MASHBOUH: { motif: RegExp; nom: string }[] = [
  { motif: /\bgelatine\b|\bgelatin\b|\bجيلاتين\b/, nom: 'gélatine (origine non précisée)' },
  { motif: /\be\s?47[12]\b|\bmono et diglycerides\b|\bmonoglycerides\b|\bdiglycerides\b/, nom: 'E471/E472 mono- et diglycérides' },
  { motif: /\be\s?422\b|\bglycerine\b|\bglycerol\b/, nom: 'E422 glycérine' },
  { motif: /\be\s?920\b|\bl cysteine\b|\bcysteine\b/, nom: 'E920 L-cystéine' },
  { motif: /\bpresure\b|\brennet\b/, nom: 'présure (origine non précisée)' },
  { motif: /\baromes naturels\b|\bnatural flavou?rs?\b/, nom: 'arômes naturels (origine non précisée)' },
  { motif: /\bshortening\b|\bgraisse animale\b|\banimal fat\b/, nom: 'graisse animale' },
  { motif: /\be\s?631\b|\be\s?627\b/, nom: 'E631/E627 (origine possiblement animale)' },
];

/** Labels OpenFoodFacts revendiquant une certification halal. */
const LABELS_HALAL = /halal/i;

/**
 * Rend le verdict halal d'un produit.
 *
 * @param ingredients  Liste d'ingrédients (texte OFF, toutes langues confondues).
 * @param labels       `labels_tags` d'OpenFoodFacts.
 * @param nom          Nom du produit — parfois le seul indice (« Jambon de Paris »).
 */
export function verdictHalal(
  ingredients?: string,
  labels?: string[],
  nom?: string,
): VerdictHalal {
  const texte = norm(`${ingredients || ''} ${nom || ''}`);
  const detecte: string[] = [];

  // Le haram l'emporte sur tout, y compris sur un label : un produit étiqueté
  // halal qui liste du porc a un problème d'étiquetage, et on signale le porc.
  for (const h of HARAM) if (h.motif.test(texte)) detecte.push(h.nom);
  if (detecte.length) return { statut: 'incompatible', detecte, raison: 'haram' };

  const certifie = (labels || []).some((l) => LABELS_HALAL.test(String(l)));
  if (certifie) return { statut: 'certifie', detecte: ['certification halal'], raison: 'certifie' };

  for (const m of MASHBOUH) if (m.motif.test(texte)) detecte.push(m.nom);
  if (detecte.length) return { statut: 'doute', detecte, raison: 'mashbouh' };

  // Sans liste d'ingrédients, on ne SAIT rien. Le dire est la seule réponse
  // honnête — et c'est justement le cas le plus fréquent sur les produits locaux
  // mal renseignés dans OpenFoodFacts.
  if (!norm(ingredients)) return { statut: 'doute', detecte: [], raison: 'sans-ingredients' };

  return { statut: 'compatible', detecte: [], raison: 'aucun-probleme' };
}

// ── Libellés, dans les trois langues de l'app ──────────────────────────────
const TEXTES: Record<string, Record<string, string>> = {
  fr: {
    certifie: 'Certifié halal',
    compatible: 'Aucun ingrédient problématique',
    doute: 'À vérifier',
    incompatible: 'Non halal',
    'r-certifie': 'Le fabricant revendique une certification halal.',
    'r-haram': 'Contient un ingrédient interdit :',
    'r-mashbouh': "Contient un ingrédient d'origine non précisée :",
    'r-sans-ingredients': "La liste d'ingrédients est absente de la base : impossible de se prononcer.",
    'r-aucun-probleme': "Aucun ingrédient problématique dans la liste connue.",
    avertissement: 'Information indicative, fondée sur la liste d’ingrédients publique. En cas de doute, vérifie l’emballage.',
  },
  en: {
    certifie: 'Halal certified',
    compatible: 'No problematic ingredient',
    doute: 'Needs checking',
    incompatible: 'Not halal',
    'r-certifie': 'The manufacturer claims halal certification.',
    'r-haram': 'Contains a forbidden ingredient:',
    'r-mashbouh': 'Contains an ingredient of unspecified origin:',
    'r-sans-ingredients': 'The ingredient list is missing from the database: no verdict possible.',
    'r-aucun-probleme': 'No problematic ingredient in the known list.',
    avertissement: 'Indicative information based on the public ingredient list. When in doubt, check the packaging.',
  },
  ar: {
    certifie: 'معتمد حلال',
    compatible: 'لا يوجد مكوّن مُشكِل',
    doute: 'يحتاج تحققًا',
    incompatible: 'غير حلال',
    'r-certifie': 'الشركة المصنّعة تعلن اعتمادًا حلالًا.',
    'r-haram': 'يحتوي على مكوّن محرّم:',
    'r-mashbouh': 'يحتوي على مكوّن مجهول المصدر:',
    'r-sans-ingredients': 'قائمة المكوّنات غير متوفرة في قاعدة البيانات: لا يمكن الحكم.',
    'r-aucun-probleme': 'لا يوجد مكوّن مُشكِل في القائمة المعروفة.',
    avertissement: 'معلومة إرشادية مبنية على قائمة المكوّنات العامة. عند الشك، راجع العبوة.',
  },
};

export function libelleStatut(statut: StatutHalal, langue = 'fr'): string {
  return (TEXTES[langue] || TEXTES.fr)[statut];
}

export function libelleRaison(v: VerdictHalal, langue = 'fr'): string {
  const T = TEXTES[langue] || TEXTES.fr;
  const base = T[`r-${v.raison}`];
  return v.detecte.length && v.raison !== 'certifie' ? `${base} ${v.detecte.join(', ')}.` : base;
}

export function avertissementHalal(langue = 'fr'): string {
  return (TEXTES[langue] || TEXTES.fr).avertissement;
}
