import { codeValide, pourPortion, type ProduitOFF } from '../web/lib/codeBarres';

/**
 * Les deux règles pures de la recherche par code-barres.
 *
 * `codeValide` filtre AVANT l'appel réseau : OpenFoodFacts répond
 * « introuvable » pour n'importe quelle chaîne, ce qui ferait passer une faute
 * de frappe pour un produit absent du catalogue.
 */

describe('codeValide', () => {
  it('accepte les longueurs réelles des codes-barres', () => {
    // EAN-8, UPC-A (12), EAN-13, et GTIN-14 pour les cartons.
    for (const c of ['12345678', '012345678905', '3017620422003', '01234567890123']) {
      expect(codeValide(c)).toBe(true);
    }
  });

  it('refuse ce qui n’est pas un code', () => {
    for (const c of ['', '123', 'abcdefgh', '30176204220034567', '3017-6204-2200']) {
      expect(codeValide(c)).toBe(false);
    }
  });

  it('tolère les espaces autour', () => {
    // Un code colle depuis un tableur arrive souvent avec des espaces.
    expect(codeValide('  3017620422003  ')).toBe(true);
  });
});

describe('pourPortion', () => {
  const p = {
    kcal100: 250, prot100: 10, gluc100: 30, lip100: 8,
  } as ProduitOFF;

  it('met les valeurs à l’échelle de la portion', () => {
    expect(pourPortion(p, 200).kcal).toBe(500);
    expect(pourPortion(p, 50).kcal).toBe(125);
  });

  it('rend zéro pour une portion nulle ou négative', () => {
    // Un champ vide ne doit pas produire un NaN qui entrerait dans le journal.
    expect(pourPortion(p, 0).kcal).toBe(0);
    expect(pourPortion(p, -100).kcal).toBe(0);
  });

  it('garde une décimale sur les macros, un entier sur les calories', () => {
    const r = pourPortion(p, 33);
    expect(Number.isInteger(r.kcal)).toBe(true);
    expect(r.prot).toBeCloseTo(3.3, 5);
  });
});
