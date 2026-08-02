// Épingle les projections (jumeau métabolique / budget) ET leur cohérence avec
// le TDEE canonique : estimateTDEE() doit être l'INVERSE de recommendedTargetFor()
// (mêmes offsets lose −500 / gain +300) — c'est la divergence que l'audit signalait.
import { estimateTDEE, projectWeight, weeklyRate, weeksToGoal } from '../lib/projections';
import { recommendedTargetFor } from '../lib/adaptiveTDEE';

describe('projections.estimateTDEE', () => {
  test('inverse des offsets canoniques', () => {
    expect(estimateTDEE({ dailyCalories: 2000, goal: 'lose' })).toBe(2500); // cible = déficit → +500
    expect(estimateTDEE({ dailyCalories: 2500, goal: 'gain' })).toBe(2200); // cible = surplus → −300
  });
  test('fallback maintien ≈ 31 kcal/kg, puis cible', () => {
    expect(estimateTDEE({ goal: 'maintain', weight: 70 })).toBe(2170); // 70 × 31
    expect(estimateTDEE({})).toBe(2000); // défaut
  });
});

describe('cohérence projections ↔ TDEE canonique', () => {
  // recommendedTargetFor(estimateTDEE(cible, goal), goal) doit redonner la cible.
  test('lose : aller-retour cible→TDEE→cible', () => {
    const cible = 2000;
    const tdee = estimateTDEE({ dailyCalories: cible, goal: 'lose' });
    expect(recommendedTargetFor(tdee, 'lose')).toBe(cible);
  });
  test('gain : aller-retour cible→TDEE→cible', () => {
    const cible = 2500;
    const tdee = estimateTDEE({ dailyCalories: cible, goal: 'gain' });
    expect(recommendedTargetFor(tdee, 'gain')).toBe(cible);
  });
});

describe('projectWeight & weeklyRate', () => {
  test('projectWeight : déficit de 500 kcal/j sur 7 j → ≈ −0,45 kg', () => {
    // maintenance = 80 × 31 = 2480 ; intake 1980 = déficit 500
    expect(projectWeight({ weight: 80, goal: 'maintain' }, 1980, 7)).toBeCloseTo(79.5, 1);
  });
  test('weeklyRate : déficit → rythme négatif (perte)', () => {
    const r = weeklyRate({ weight: 80, goal: 'maintain', dailyCalories: 1980 });
    expect(r).toBeLessThan(0);
  });
  test('weeksToGoal : null si poids/objectif manquants', () => {
    expect(weeksToGoal({ weight: 80 })).toBeNull();
    expect(weeksToGoal({ targetWeight: 75 })).toBeNull();
  });
});

describe('weeksToGoal', () => {
  test('estime les semaines quand la cible va dans le bon sens', () => {
    // poids 80 → 75 (perte), cible 1980 kcal (déficit) → rythme négatif → ~12 sem
    const w = weeksToGoal({ weight: 80, targetWeight: 75, goal: 'maintain', dailyCalories: 1980 });
    expect(w).toBeGreaterThan(0);
    expect(Number.isInteger(w as number)).toBe(true);
  });
  test('null si la cible va dans le mauvais sens', () => {
    // veut prendre (75→80... ici target 85>80) mais mange en déficit → incohérent → null
    expect(weeksToGoal({ weight: 80, targetWeight: 85, goal: 'maintain', dailyCalories: 1980 })).toBeNull();
  });
  test('null si rythme ~0 (cible = maintenance)', () => {
    // dailyCalories = maintenance (80×31=2480) → rythme nul → null
    expect(weeksToGoal({ weight: 80, targetWeight: 75, goal: 'maintain', dailyCalories: 2480 })).toBeNull();
  });
});
