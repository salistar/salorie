/**
 * Les contraintes alimentaires, côté demande à l'IA.
 * ---------------------------------------------------------------------------
 * `lib/dietPrefs.ts` stocke les préférences (halal, végétarien, keto, sans
 * gluten, FODMAP) et fabrique la phrase injectée dans les prompts de plan de
 * repas. Pour le public visé, `halal` n'est pas une option parmi d'autres :
 * c'est la raison pour laquelle quelqu'un choisit cette application.
 *
 * ⚠ CE MODULE DEMANDE, IL NE GARANTIT PAS. La phrase part dans un prompt ; rien
 * ici ne vérifie que le modèle l'a respectée. La garantie, quand elle existe,
 * vient de `lib/halal.ts` — le verdict au scan, bâti sur la règle inverse : ne
 * jamais déclarer « compatible » sans preuve. Les deux modules se ressemblent et
 * ne promettent pas la même chose ; les confondre serait coûteux.
 *
 * Écrans concernés : `/preferences` (499 lignes) et `/vitals` (383), tous deux
 * sans aucun test avant le 13/09/2026.
 */
const magasin = new Map<string, string>();
let enPanne = false;

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => {
    if (enPanne) throw new Error('stockage indisponible');
    return magasin.has(k) ? magasin.get(k)! : null;
  }),
  setItem: jest.fn(async (k: string, v: string) => {
    if (enPanne) throw new Error('stockage indisponible');
    magasin.set(k, v);
  }),
}));

import { getDietPrefs, setDietPrefs, dietPromptHint, type DietPref } from '../lib/dietPrefs';

const CLE = 'diet_prefs_v1';
const AUCUNE: DietPref = {
  halal: false, vegetarian: false, keto: false, glutenFree: false,
  lowFodmap: false, conditions: [],
};

beforeEach(() => {
  magasin.clear();
  enPanne = false;
});

describe('getDietPrefs — lecture et tolerance', () => {
  it('tout est desactive par defaut', async () => {
    // Opt-in : on n'impose a personne un regime qu'il n'a pas demande.
    expect(await getDietPrefs()).toEqual(AUCUNE);
  });

  it('relit ce qui a ete enregistre', async () => {
    await setDietPrefs({ ...AUCUNE, halal: true, conditions: ['diabetes'] });
    const p = await getDietPrefs();
    expect(p.halal).toBe(true);
    expect(p.conditions).toEqual(['diabetes']);
  });

  it('un objet PARTIEL d une ancienne version reste lisible', async () => {
    // Le merge sur les defauts existe pour ca : une preference enregistree avant
    // l'ajout de `lowFodmap` ou de `conditions` ne doit pas rendre `undefined`,
    // sinon `p.conditions.map(...)` jetterait a l'ecran.
    magasin.set(CLE, JSON.stringify({ halal: true }));
    const p = await getDietPrefs();
    expect(p.halal).toBe(true);
    expect(p.lowFodmap).toBe(false);
    expect(p.conditions).toEqual([]);
  });

  it('un contenu illisible rend les defauts, sans jeter', async () => {
    for (const sale of ['', '{pas du json', 'null', '[]', '42']) {
      magasin.set(CLE, sale);
      const p = await getDietPrefs();
      expect(p.halal).toBe(false);
      expect(Array.isArray(p.conditions)).toBe(true);
    }
  });

  it('un stockage en panne rend les defauts', async () => {
    enPanne = true;
    expect(await getDietPrefs()).toEqual(AUCUNE);
    await expect(setDietPrefs({ ...AUCUNE, halal: true })).resolves.toBeUndefined();
  });

  it('⚠ UNE PREFERENCE ABIMEE DISPARAIT EN SILENCE', () => {
    // `{...DEFAUTS, ...parsed}` ecrase le defaut par la valeur stockee, quelle
    // qu'elle soit. Un `halal: null` — ecriture partielle, migration ratee — se
    // retrouve donc faux, et l'utilisateur recoit des suggestions non halal sans
    // qu'un ecran ne l'ait prevenu.
    //
    // Ce test CONSIGNE le comportement, il ne le benit pas. `lib/halal.ts`, lui,
    // refuse par principe de conclure sans preuve. Aligner les deux serait un
    // arbitrage produit : imposer la contrainte en cas de doute ne fait que
    // retrecir les suggestions, tandis que la perdre fait manger a quelqu'un ce
    // qu'il refuse. Je le signale plutot que de le changer seul.
    const abime = { ...AUCUNE, ...(JSON.parse('{"halal":null}') || {}) };
    expect(dietPromptHint(abime as DietPref, 'fr')).toBe('');
  });
});

describe('dietPromptHint — la phrase envoyee au modele', () => {
  it('aucune contrainte : phrase VIDE, pas une phrase creuse', () => {
    // Injecter « Respecte ces contraintes : . » couterait des jetons et
    // derouterait le modele pour rien.
    expect(dietPromptHint(AUCUNE, 'fr')).toBe('');
    expect(dietPromptHint(AUCUNE, 'ar')).toBe('');
    expect(dietPromptHint(AUCUNE)).toBe('');
  });

  it('nomme la contrainte dans la langue demandee', () => {
    const halal = { ...AUCUNE, halal: true };
    expect(dietPromptHint(halal, 'fr')).toBe('Respecte ces contraintes alimentaires : halal.');
    expect(dietPromptHint(halal, 'en')).toBe('Respect these dietary constraints: halal.');
    expect(dietPromptHint(halal, 'ar')).toBe('احترم هذه القيود الغذائية: حلال.');
  });

  it('l arabe utilise sa propre virgule', () => {
    // La virgule latine dans une phrase arabe se place mal a l'ecran et se lit
    // mal par le modele : « ، » est la bonne.
    const deux = { ...AUCUNE, halal: true, glutenFree: true };
    expect(dietPromptHint(deux, 'ar')).toContain('حلال، خالٍ من الغلوتين');
    expect(dietPromptHint(deux, 'fr')).toContain('halal, sans gluten');
  });

  it('l ordre est stable, et halal vient en premier', () => {
    // Un ordre qui varierait casserait le cache de prompt cote fournisseur et
    // rendrait deux plans differents pour les memes preferences.
    const tout: DietPref = {
      halal: true, vegetarian: true, keto: true, glutenFree: true,
      lowFodmap: true, conditions: [],
    };
    expect(dietPromptHint(tout, 'fr')).toBe(
      'Respecte ces contraintes alimentaires : halal, végétarien, cétogène (pauvre en glucides), sans gluten, pauvre en FODMAP.',
    );
  });

  it('une langue inconnue retombe sur l anglais', () => {
    // Mieux vaut une consigne comprise par le modele qu'une phrase absente.
    const halal = { ...AUCUNE, halal: true };
    expect(dietPromptHint(halal, 'es')).toBe('Respect these dietary constraints: halal.');
    expect(dietPromptHint(halal, '')).toBe('Respect these dietary constraints: halal.');
  });

  it('⚠ les CONDITIONS MEDICALES ne partent PAS dans cette phrase', () => {
    // Diabete, hypertension, insuffisance renale : elles sont traitees par le
    // moteur objectif (`lib/objective/scoring.ts`), pas glissees dans un prompt.
    // C'est deliberate — une consigne de regime medical confiee a un modele
    // generatif, sans verification, serait un conseil de sante non verifie.
    // Quiconque « corrigerait » cet oubli fera echouer ce test, et devra lire
    // cette ligne avant de le faire.
    const malade: DietPref = { ...AUCUNE, conditions: ['diabetes', 'kidney'] };
    expect(dietPromptHint(malade, 'fr')).toBe('');
    const halalMalade: DietPref = { ...AUCUNE, halal: true, conditions: ['hypertension'] };
    expect(dietPromptHint(halalMalade, 'fr')).toBe('Respecte ces contraintes alimentaires : halal.');
  });

  it('un objet absent ne fait pas planter l ecran', () => {
    // `p && p[k]` : appele avant que les preferences ne soient chargees, le
    // helper doit rendre une phrase vide plutot que jeter au milieu du rendu.
    expect(dietPromptHint(null as any, 'fr')).toBe('');
    expect(dietPromptHint(undefined as any)).toBe('');
  });
});
