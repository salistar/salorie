import { computeWeightTrend, summarizeWeek } from '../lib/analyticsCompute';

describe('computeWeightTrend', () => {
  test('null si < 2 pesées', () => {
    expect(computeWeightTrend([], 'lose')).toBeNull();
    expect(computeWeightTrend([{ weight: 80 }], 'lose')).toBeNull();
  });
  test('perte (récent < ancien) → falling + good pour lose', () => {
    // newest-first 78,79,80,81 → recent(78,79)=78.5 vs old(80,81)=80.5 → delta −2
    const t = computeWeightTrend([{ weight: 78 }, { weight: 79 }, { weight: 80 }, { weight: 81 }], 'lose');
    expect(t?.direction).toBe('falling');
    expect(t?.good).toBe(true);
    expect(t?.delta).toBeCloseTo(-2, 5);
  });
  test('prise → mauvaise pour lose, bonne pour gain', () => {
    const data = [{ weight: 82 }, { weight: 81 }, { weight: 80 }, { weight: 79 }]; // delta +2
    expect(computeWeightTrend(data, 'lose')?.good).toBe(false);
    expect(computeWeightTrend(data, 'gain')?.good).toBe(true);
  });
  test('variation < 0.3 kg = stable ; good pour maintain', () => {
    const t = computeWeightTrend([{ weight: 80.1 }, { weight: 80.0 }], 'maintain');
    expect(t?.direction).toBe('stable');
    expect(t?.good).toBe(true);
  });
  test('ignore les pesées non numériques', () => {
    expect(computeWeightTrend([{ weight: 78 }, { weight: null }, { weight: 81 }], 'lose')).not.toBeNull();
  });
});

describe('summarizeWeek', () => {
  test('agrège consommé/brûlé/eau/jours actifs', () => {
    const s = summarizeWeek([
      { consumedCalories: 2000, burnedCalories: 300, waterConsumed: 1500, hasActivity: true },
      { consumedCalories: 1800, burnedCalories: 0, waterConsumed: 1000, hasActivity: false },
      { consumedCalories: 2200, burnedCalories: 500, waterConsumed: 2000, hasActivity: true },
    ]);
    expect(s.totalConsumed).toBe(6000);
    expect(s.totalBurned).toBe(800);
    expect(s.totalWater).toBe(4500);
    expect(s.activeDays).toBe(2);
  });
  test('robuste aux champs manquants', () => {
    expect(summarizeWeek([{} as any]).totalConsumed).toBe(0);
  });
});
