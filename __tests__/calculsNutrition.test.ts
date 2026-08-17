import { objectifEau, kcalDepuisMacros } from '../web/lib/calculsNutrition';

/**
 * Les deux règles du lot nutrition qui décident de ce qui entre dans le journal
 * de quelqu'un. Elles vivent côté web mais se testent ici : ce sont des
 * fonctions pures, sans React ni Next, et la suite `logic` les transpile telles
 * quelles.
 */

describe('objectifEau', () => {
  it('applique 33 ml par kilo au repos', () => {
    // 70 × 33 = 2310, arrondi aux 50 ml → 2300.
    expect(objectifEau(70, 'sedentaire', false)).toBe(2300);
  });

  it('majore selon l’activité puis la chaleur', () => {
    expect(objectifEau(70, 'modere', false)).toBe(2650); // +350
    expect(objectifEau(70, 'intense', false)).toBe(3050); // +750
    expect(objectifEau(70, 'intense', true)).toBe(3550); // +750 +500
  });

  it('retombe sur 70 kg quand le poids est absent ou absurde', () => {
    // Le cas qui compte : un profil sans poids renseigné. Sans ce repli,
    // l'objectif vaudrait 0 ml — un écran qui annonce à quelqu'un qu'il n'a
    // rien à boire de la journée.
    expect(objectifEau(0, 'sedentaire', false)).toBe(2300);
    expect(objectifEau(NaN, 'sedentaire', false)).toBe(2300);
    expect(objectifEau(-12, 'sedentaire', false)).toBe(2300);
  });

  it('borne un poids aberrant à 300 kg', () => {
    // Une faute de frappe (« 7000 » au lieu de « 70 ») donnerait 231 litres.
    expect(objectifEau(7000, 'sedentaire', false)).toBe(objectifEau(300, 'sedentaire', false));
  });

  it('rend toujours un multiple de 50', () => {
    for (const p of [52, 63.4, 81, 99.9, 120]) {
      expect(objectifEau(p, 'modere', true) % 50).toBe(0);
    }
  });
});

describe('kcalDepuisMacros', () => {
  it('applique 4/4/9 kcal par gramme', () => {
    // 20×4 + 50×4 + 10×9 = 80 + 200 + 90 = 370
    expect(kcalDepuisMacros(20, 50, 10)).toBe(370);
  });

  it('traite les valeurs manquantes ou négatives comme zéro', () => {
    // Un formulaire à moitié rempli ne doit pas produire un NaN, qui
    // s'écrirait tel quel dans le journal et casserait tous les totaux.
    expect(kcalDepuisMacros(NaN, 50, 10)).toBe(290);
    expect(kcalDepuisMacros(-20, 50, 10)).toBe(290);
    expect(kcalDepuisMacros(0, 0, 0)).toBe(0);
  });

  it('arrondit à l’entier', () => {
    expect(Number.isInteger(kcalDepuisMacros(10.3, 20.7, 5.1))).toBe(true);
  });
});
