import { computeSadaqa, nextMilestones, KM_PER_MEAL, KM_PER_TREE } from '../lib/sadaqaCalcul';

/**
 * L'impact caritatif annoncé à partir des kilomètres.
 *
 * Ce calcul n'avait aucun test alors qu'il annonce à quelqu'un combien de repas
 * son effort a financés. Il en a maintenant, parce que le web l'importe : deux
 * clients qui donneraient des chiffres différents pour les mêmes kilomètres
 * détruiraient la crédibilité des deux.
 */

describe('computeSadaqa', () => {
  it('accorde un palier seulement une fois atteint', () => {
    // 19 km ne financent aucun repas : le palier se DÉBLOQUE, il ne s'anticipe pas.
    expect(computeSadaqa(19)).toEqual({ meals: 0, trees: 0 });
    expect(computeSadaqa(20)).toEqual({ meals: 1, trees: 0 });
    expect(computeSadaqa(50)).toEqual({ meals: 2, trees: 1 });
  });

  it('tronque vers le bas, jamais vers le haut', () => {
    // Annoncer 3 repas pour 59 km serait promettre ce qui n'est pas acquis.
    expect(computeSadaqa(59).meals).toBe(2);
  });

  it('traite les valeurs absurdes comme zéro', () => {
    for (const v of [0, -40, NaN, Infinity]) {
      expect(computeSadaqa(v as number)).toEqual({ meals: 0, trees: 0 });
    }
  });
});

describe('nextMilestones', () => {
  it('donne la distance restante avant le palier suivant', () => {
    const m = nextMilestones(25);
    expect(m.kmToNextMeal).toBe(15); // 40 - 25
    expect(m.kmToNextTree).toBe(25); // 50 - 25
  });

  it('garde la progression entre 0 et 1', () => {
    for (const km of [0, 7, 20, 33.3, 49, 120]) {
      const m = nextMilestones(km);
      expect(m.mealProgress).toBeGreaterThanOrEqual(0);
      expect(m.mealProgress).toBeLessThan(1);
      expect(m.treeProgress).toBeGreaterThanOrEqual(0);
      expect(m.treeProgress).toBeLessThan(1);
    }
  });

  it('repart à zéro pile sur un palier', () => {
    // À 20 km exactement, le repas vient d'être acquis : la progression vers le
    // suivant repart de 0, elle n'est pas à 100 %.
    expect(nextMilestones(KM_PER_MEAL).mealProgress).toBe(0);
    expect(nextMilestones(KM_PER_TREE).treeProgress).toBe(0);
  });

  it('ne renvoie jamais de distance négative', () => {
    expect(nextMilestones(-10).kmToNextMeal).toBe(KM_PER_MEAL);
  });
});
