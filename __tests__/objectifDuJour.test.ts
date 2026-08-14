import {
  objectifDuJour, expliquerObjectifDuJour, PLANCHER_KCAL, AMPLITUDE_MAX,
} from '../lib/objectifDuJour';

// Ce module transforme un score en nombre de calories. La faute grave est de
// pousser quelqu'un à manger TROP PEU sur la foi d'une nuit courte : les tests
// commencent donc par les garde-fous, pas par le cas nominal.
describe('objectifDuJour — les garde-fous d’abord', () => {
  it('ne descend JAMAIS sous le plancher de sécurité', () => {
    for (const base of [1000, 1150, 1250, 1300]) {
      for (const score of [0, 30, 50, 70, 90, 100]) {
        const o = objectifDuJour(base, score, 'lose');
        expect(o.kcal).toBeGreaterThanOrEqual(Math.min(PLANCHER_KCAL, base));
        expect(o.kcal).toBeGreaterThanOrEqual(1000);
      }
    }
  });

  it('borne l’écart à ±10 % de la référence', () => {
    for (const score of [0, 10, 39, 40, 59, 60, 84, 85, 100]) {
      const o = objectifDuJour(2000, score, 'lose');
      expect(Math.abs(o.delta)).toBeLessThanOrEqual(2000 * AMPLITUDE_MAX + 1);
    }
  });

  it('ne suggère rien sans objectif de référence', () => {
    // Inventer une cible pour quelqu'un qui n'en a pas serait pire que se taire.
    expect(objectifDuJour(0, 20).kcal).toBe(0);
    expect(objectifDuJour(NaN as any, 20).kcal).toBe(0);
  });

  it('reste sur la référence si le score est inconnu', () => {
    expect(objectifDuJour(2000, null).kcal).toBe(2000);
    expect(objectifDuJour(2000, undefined).kcal).toBe(2000);
    expect(objectifDuJour(2000, NaN).kcal).toBe(2000);
  });
});

describe('objectifDuJour — modulation', () => {
  it('desserre quand la forme est basse', () => {
    const o = objectifDuJour(2000, 25);
    expect(o.kcal).toBe(2200);
    expect(o.raison).toBe('repos');
  });

  it('desserre à demi quand la récupération est moyenne', () => {
    const o = objectifDuJour(2000, 50);
    expect(o.kcal).toBe(2100);
    expect(o.raison).toBe('menagement');
  });

  it('ne bouge pas dans la zone normale', () => {
    const o = objectifDuJour(2000, 70);
    expect(o.kcal).toBe(2000);
    expect(o.delta).toBe(0);
    expect(o.raison).toBe('normal');
  });

  it('resserre en grande forme — mais SEULEMENT en perte de poids', () => {
    expect(objectifDuJour(2000, 90, 'lose').kcal).toBe(1900);
    // Proposer un déficit à quelqu'un qui veut prendre du muscle irait contre
    // son objectif : la grande forme ne doit pas se retourner contre lui.
    expect(objectifDuJour(2000, 90, 'muscle').kcal).toBe(2000);
    expect(objectifDuJour(2000, 90, 'maintain').kcal).toBe(2000);
    expect(objectifDuJour(2000, 90).kcal).toBe(2000);
  });

  it('reconnaît l’objectif de perte dans plusieurs formulations', () => {
    for (const g of ['lose', 'lose_weight', 'perdre', 'weight_loss', 'Perte de poids']) {
      expect(objectifDuJour(2000, 90, g).kcal).toBe(1900);
    }
  });
});

describe('explications', () => {
  it('donne une phrase dans les trois langues', () => {
    const o = objectifDuJour(2000, 25);
    for (const l of ['fr', 'en', 'ar']) {
      expect(expliquerObjectifDuJour(o, l).length).toBeGreaterThan(15);
    }
  });

  it('retombe sur le français pour une langue inconnue', () => {
    const o = objectifDuJour(2000, 25);
    expect(expliquerObjectifDuJour(o, 'es')).toBe(expliquerObjectifDuJour(o, 'fr'));
  });
});
