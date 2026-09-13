/**
 * Créditer une course : trois compteurs, et aucun droit d'échouer bruyamment.
 * ---------------------------------------------------------------------------
 * `lib/progressHooks.creditKm()` est appelé à la fin d'une course. Il alimente
 * trois choses qui n'ont rien à voir entre elles — le défi annuel, l'XP de
 * l'avatar, et le total de kilomètres que lisent Sadaqa et les récompenses.
 *
 * Deux exigences contradictoires, et c'est tout l'intérêt du module :
 *
 *   - il ne doit JAMAIS faire échouer la fin d'une course. Quelqu'un qui vient
 *     de courir 10 km ne doit pas voir une erreur parce qu'un compteur de jeu
 *     n'a pas pu s'écrire ;
 *   - mais il ne doit pas perdre les kilomètres en silence non plus, parce que
 *     ces kilomètres financent des repas (Sadaqa). Un total qui repart de zéro,
 *     personne ne le signale — on croit simplement avoir moins couru.
 *
 * Écrans concernés : `/race-live` (615 lignes) et `/ar-ghost` (560), aucun test
 * avant le 13/09/2026.
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

const kmAnnuels: number[] = [];
const xpAjoute: number[] = [];
let defiCasse = false;
let avatarCasse = false;

jest.mock('../lib/annualChallenge', () => ({
  addAnnualKm: jest.fn(async (km: number) => {
    if (defiCasse) throw new Error('defi indisponible');
    kmAnnuels.push(km);
    return {} as any;
  }),
}));
jest.mock('../lib/avatar', () => ({
  addXp: jest.fn(async (n: number) => {
    if (avatarCasse) throw new Error('avatar indisponible');
    xpAjoute.push(n);
    return {} as any;
  }),
}));

import { creditKm } from '../lib/progressHooks';

const CLE_TOTAL = 'race_total_km';

beforeEach(() => {
  magasin.clear();
  kmAnnuels.length = 0;
  xpAjoute.length = 0;
  defiCasse = false;
  avatarCasse = false;
  enPanne = false;
});

describe('creditKm — ce qui est credite', () => {
  it('alimente les trois compteurs d un coup', async () => {
    await creditKm(10);
    expect(kmAnnuels).toEqual([10]);
    expect(xpAjoute).toEqual([100]);          // 10 XP / km
    expect(magasin.get(CLE_TOTAL)).toBe('10');
  });

  it('le total s accumule d une course a l autre', async () => {
    await creditKm(5.25);
    await creditKm(4.5);
    expect(magasin.get(CLE_TOTAL)).toBe('9.75');
  });

  it('le total est arrondi au centieme, pas laisse en flottant', () => {
    // Sans l'arrondi, trois courses suffisent a stocker
    // « 9.750000000000002 », qui finit tel quel dans l'ecran Sadaqa.
    return creditKm(0.1).then(() => creditKm(0.2)).then(() => {
      expect(magasin.get(CLE_TOTAL)).toBe('0.3');
    });
  });

  it('l XP est arrondi a l entier', async () => {
    await creditKm(3.14);
    expect(xpAjoute).toEqual([31]);
  });
});

describe('creditKm — ce qui n est PAS credite', () => {
  it('une distance nulle ou negative ne touche a rien', async () => {
    for (const km of [0, -1, -0.5]) {
      await creditKm(km);
    }
    expect(kmAnnuels).toEqual([]);
    expect(xpAjoute).toEqual([]);
    expect(magasin.has(CLE_TOTAL)).toBe(false);
  });

  it('une distance incalculable non plus', async () => {
    // Une course sans point GPS rend NaN ; le crediter propagerait le NaN
    // jusqu'au total, et Sadaqa afficherait « NaN repas finances ».
    for (const km of [NaN, Infinity, undefined as any, null as any, 'x' as any]) {
      await creditKm(km);
    }
    expect(kmAnnuels).toEqual([]);
    expect(magasin.has(CLE_TOTAL)).toBe(false);
  });
});

describe('creditKm — quand une piece casse', () => {
  it('⚠ CHAQUE COMPTEUR EST ISOLE : un qui tombe n emporte pas les autres', async () => {
    // Trois `try/catch` separes, et c'est deliberate. Un seul bloc aurait fait
    // perdre l'XP et le total des qu'un defi annuel indisponible jetait.
    defiCasse = true;
    await creditKm(8);
    expect(kmAnnuels).toEqual([]);            // celui-la est perdu
    expect(xpAjoute).toEqual([80]);           // les deux autres passent
    expect(magasin.get(CLE_TOTAL)).toBe('8');
  });

  it('l avatar peut tomber sans emporter les kilometres', async () => {
    avatarCasse = true;
    await creditKm(8);
    expect(kmAnnuels).toEqual([8]);
    expect(magasin.get(CLE_TOTAL)).toBe('8');
  });

  it('le stockage peut tomber sans faire echouer la fin de course', async () => {
    enPanne = true;
    await expect(creditKm(8)).resolves.toBeUndefined();
    expect(kmAnnuels).toEqual([8]);
  });

  it('tout peut tomber a la fois : la promesse se resout quand meme', async () => {
    // C'est la garantie qui compte pour l'ecran : `creditKm` ne jette jamais.
    defiCasse = true; avatarCasse = true; enPanne = true;
    await expect(creditKm(12)).resolves.toBeUndefined();
  });
});

describe('creditKm — le total lu par Sadaqa', () => {
  it('repart du total deja enregistre', async () => {
    magasin.set(CLE_TOTAL, '120.5');
    await creditKm(2.25);
    expect(magasin.get(CLE_TOTAL)).toBe('122.75');
  });

  it('⚠ UN TOTAL CORROMPU EST REMIS A ZERO, EN SILENCE', () => {
    // `parseFloat(brut) || 0` : une valeur illisible — ecriture interrompue,
    // migration ratee — fait repartir le cumul de zero sans un mot. Ces
    // kilometres-la financent des repas dans l'ecran Sadaqa ; les perdre ne
    // provoque aucune erreur, juste un compteur qui a rajeuni.
    //
    // Le choix se defend (mieux vaut repartir que bloquer), mais il merite
    // d'etre vu : ce test echouera le jour ou quelqu'un decide de conserver
    // l'ancienne valeur ou d'en journaliser la perte.
    magasin.set(CLE_TOTAL, 'abc');
    return creditKm(3).then(() => {
      expect(magasin.get(CLE_TOTAL)).toBe('3');
    });
  });

  it('un total partiellement numerique est lu jusqu ou il est lisible', async () => {
    // `parseFloat('12abc')` vaut 12 : on ne perd pas tout pour un octet de trop.
    magasin.set(CLE_TOTAL, '12abc');
    await creditKm(1);
    expect(magasin.get(CLE_TOTAL)).toBe('13');
  });

  it('la cle est bien celle que les autres modules lisent', async () => {
    // `lib/sadaqa.ts` et `lib/rewards.ts` lisent `race_total_km` en dur. La
    // renommer ici les couperait tous les deux, sans erreur nulle part.
    await creditKm(1);
    expect([...magasin.keys()]).toEqual(['race_total_km']);
  });
});
