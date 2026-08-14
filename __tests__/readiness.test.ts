import { computeReadiness } from '../lib/readiness';

// Cette formule n'était jusqu'ici qu'un affichage. À partir du moment où elle module
// l'objectif calorique du jour (cf. adaptive-tdee), elle décide de ce que quelqu'un
// mange : elle mérite d'être tenue par des tests.
describe('computeReadiness — bornes et monotonie', () => {
  it('reste toujours dans 0-100', () => {
    const cas = [
      { sleepHours: 0, restingHr: 200, activeMinutes: 1000 },
      { sleepHours: 24, restingHr: 30, activeMinutes: 0 },
      { sleepHours: -5 as any, restingHr: -10 as any, activeMinutes: -100 as any },
      {},
    ];
    for (const c of cas) {
      const r = computeReadiness(c);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
      expect(Number.isFinite(r.score)).toBe(true);
    }
  });

  it('récompense une nuit de 7 à 9 h', () => {
    const court = computeReadiness({ sleepHours: 4 }).score;
    const bon = computeReadiness({ sleepHours: 8 }).score;
    expect(bon).toBeGreaterThan(court);
  });

  it('pénalise aussi le TROP dormi', () => {
    const bon = computeReadiness({ sleepHours: 8 }).score;
    expect(computeReadiness({ sleepHours: 12 }).score).toBeLessThan(bon);
  });

  // ⚠️ COMPORTEMENT ÉPINGLÉ, pas approuvé.
  // La pénalité d'excès (-15 par heure au-delà de 9 h) est plus sévère que celle
  // du manque : 12 h donne 55, tandis que 4 h donne 57. Autrement dit, la formule
  // juge une grasse matinée à peine moins bien qu'une nuit blanche — ce que la
  // littérature sur le sommeil ne soutient pas : une privation aiguë dégrade la
  // récupération bien plus qu'un excès.
  //
  // Ce test ne valide donc PAS ce choix, il l'IMMOBILISE : retoucher une
  // heuristique de santé déjà en production, sans données d'usage, n'est pas une
  // décision technique. Le jour où elle est ajustée, ce test échouera et forcera
  // à le faire sciemment.
  it('pin : l’excès de sommeil est actuellement puni presque autant que le manque', () => {
    expect(computeReadiness({ sleepHours: 12 }).score).toBe(55);
    expect(computeReadiness({ sleepHours: 4 }).score).toBe(57);
  });

  it('une FC de repos basse vaut mieux qu’une FC élevée', () => {
    const basse = computeReadiness({ sleepHours: 8, restingHr: 48 }).score;
    const haute = computeReadiness({ sleepHours: 8, restingHr: 85 }).score;
    expect(basse).toBeGreaterThan(haute);
  });

  it('une grosse charge de la veille modère la forme', () => {
    const repose = computeReadiness({ sleepHours: 8, activeMinutes: 20 }).score;
    const charge = computeReadiness({ sleepHours: 8, activeMinutes: 150 }).score;
    expect(charge).toBeLessThan(repose);
  });
});

describe('computeReadiness — entrées manquantes', () => {
  it('sans aucune donnée, rend un score neutre plutôt qu’un zéro', () => {
    // Un zéro afficherait « forme nulle » à quelqu'un qui n'a simplement rien
    // saisi : c'est faux, et décourageant au premier lancement.
    const r = computeReadiness({});
    expect(r.score).toBeGreaterThanOrEqual(60);
  });

  it('redistribue le poids des signaux absents', () => {
    // Avec le seul sommeil, le score doit refléter le sommeil SEUL — pas un
    // sommeil dilué par des zéros implicites.
    expect(computeReadiness({ sleepHours: 8 }).score).toBe(100);
    expect(computeReadiness({ sleepHours: 0 }).score).toBe(0);
  });
});

describe('computeReadiness — verdict et conseil', () => {
  it('classe le score en quatre paliers', () => {
    expect(computeReadiness({ sleepHours: 8 }).label).toBe('great');
    // 4,5 h donne 64 -> 'good' ; il faut descendre sous ~4,1 h pour 'moderate'.
    expect(computeReadiness({ sleepHours: 4.5 }).label).toBe('good');
    expect(computeReadiness({ sleepHours: 3.5 }).label).toBe('moderate');
    expect(computeReadiness({ sleepHours: 2 }).label).toBe('low');
  });

  it('vise le facteur le plus faible', () => {
    expect(computeReadiness({ sleepHours: 4 }).advice).toBe('advice.sleep');
    expect(computeReadiness({ sleepHours: 8, restingHr: 80 }).advice).toBe('advice.recover');
    expect(computeReadiness({ sleepHours: 8, activeMinutes: 150 }).advice).toBe('advice.easy');
    expect(computeReadiness({ sleepHours: 8 }).advice).toBe('advice.go');
  });
});
