// Épingle le comportement du TDEE CANONIQUE (lib/adaptiveTDEE.ts).
// But : garantir que l'écran TDEE et le coach (engagement.ts) restent cohérents
// et qu'un futur changement ne casse pas silencieusement les calculs.
import {
  tdeeFromIntakeAndSlope,
  recommendedTargetFor,
  slopeKgPerDay,
  computeAdaptiveTDEE,
} from '../lib/adaptiveTDEE';

describe('TDEE canonique', () => {
  test('tdeeFromIntakeAndSlope : perte de poids → TDEE > apport', () => {
    // apport 2000, pente −0,07 kg/j → 2000 − (−0,07 × 7700) = 2539
    expect(tdeeFromIntakeAndSlope(2000, -0.07)).toBe(2539);
    // poids stable → TDEE = apport
    expect(tdeeFromIntakeAndSlope(2200, 0)).toBe(2200);
  });

  test('garde-fou anti-aberration : hors [1000, 6000] → null', () => {
    expect(tdeeFromIntakeAndSlope(500, 0.1)).toBeNull(); // 500 − 770 = −270
    expect(tdeeFromIntakeAndSlope(9000, -0.5)).toBeNull(); // 12850 > 6000
  });

  test('recommendedTargetFor : offsets lose/gain/maintain + plancher 1200 + arrondi 10', () => {
    expect(recommendedTargetFor(2539, 'lose')).toBe(2040); // 2039 → 2040
    expect(recommendedTargetFor(2539, 'gain')).toBe(2840); // 2839 → 2840
    expect(recommendedTargetFor(2539, 'maintain')).toBe(2540); // 2539 → 2540
    expect(recommendedTargetFor(2539, undefined)).toBe(2540); // défaut = maintien
    expect(recommendedTargetFor(1500, 'lose')).toBe(1200); // 1000 → plancher 1200
  });

  test('slopeKgPerDay : régression sur pesées datées (.timestamp et .date)', () => {
    const now = Date.now();
    // −1 kg sur 10 jours = −0,1 kg/j
    expect(slopeKgPerDay([
      { weight: 80, timestamp: now - 10 * 86400000 },
      { weight: 79, timestamp: now },
    ])).toBeCloseTo(-0.1, 3);
    // accepte aussi les pesées au format .date (ISO) — comme le coach
    expect(slopeKgPerDay([
      { weight: 80, date: new Date(now - 10 * 86400000).toISOString() },
      { weight: 79, date: new Date(now).toISOString() },
    ])).toBeCloseTo(-0.1, 3);
    // < 2 points → 0
    expect(slopeKgPerDay([{ weight: 80, timestamp: now }])).toBe(0);
  });

  test('cohérence écran ↔ coach : computeAdaptiveTDEE passe par le cœur canonique', () => {
    const now = Date.now();
    const logs: { calories: number; timestamp: number }[] = [];
    for (let i = 0; i < 14; i++) logs.push({ calories: 2000, timestamp: now - i * 86400000 });
    const weights = [
      { weight: 80, timestamp: now - 14 * 86400000 },
      { weight: 79, timestamp: now },
    ];
    const r = computeAdaptiveTDEE(logs, weights, 'lose');
    const skpd = slopeKgPerDay(weights);
    // les deux chemins (écran TDEE & coach) DOIVENT donner le même nombre
    expect(r.tdee).toBe(tdeeFromIntakeAndSlope(r.avgIntake, skpd));
    expect(r.recommendedTarget).toBe(recommendedTargetFor(r.tdee as number, 'lose'));
    expect(r.tdee).toBeGreaterThan(r.avgIntake); // on perd du poids → on brûle plus qu'on mange
  });

  test('données insuffisantes → tdee null (pas de TDEE inventé)', () => {
    const r = computeAdaptiveTDEE([{ calories: 2000, timestamp: Date.now() }], [], 'lose');
    expect(r.tdee).toBeNull();
    expect(r.recommendedTarget).toBeNull();
  });
});

describe('slopeKgPerDay — formats de timestamp', () => {
  const now = 1700000000000; // fixe (déterministe)
  test('Firestore Timestamp { seconds }', () => {
    const r = slopeKgPerDay([
      { weight: 80, timestamp: { seconds: (now - 10 * 86400000) / 1000 } },
      { weight: 79, timestamp: { seconds: now / 1000 } },
    ]);
    expect(r).toBeCloseTo(-0.1, 3);
  });
  test('objet { toMillis() }', () => {
    const r = slopeKgPerDay([
      { weight: 80, timestamp: { toMillis: () => now - 10 * 86400000 } },
      { weight: 79, timestamp: { toMillis: () => now } },
    ]);
    expect(r).toBeCloseTo(-0.1, 3);
  });
  test('timestamp absent/0 → point ignoré', () => {
    expect(slopeKgPerDay([{ weight: 80, timestamp: 0 }, { weight: 79, timestamp: null }])).toBe(0);
  });
});
