import { MlService } from './ml.service';

// Tests UNITAIRES des méthodes STATIQUES PURES de MlService (aucune DB / réseau).
// On n'instancie jamais le service : on appelle MlService.xxx(...) directement.
describe('MlService — méthodes statiques pures', () => {
  const DAY = 86_400_000;

  // ---------------------------------------------------------------------------
  // linearRegression
  // ---------------------------------------------------------------------------
  describe('linearRegression', () => {
    it('n < 2 → slope 0, r2 0, intercept = y du seul point', () => {
      expect(MlService.linearRegression([])).toEqual({ slope: 0, intercept: 0, r2: 0 });
      expect(MlService.linearRegression([{ x: 5, y: 42 }])).toEqual({
        slope: 0,
        intercept: 42,
        r2: 0,
      });
    });

    it('droite parfaite y = 2x + 1 → slope 2, intercept 1, r2 = 1', () => {
      const pts = [
        { x: 0, y: 1 },
        { x: 1, y: 3 },
        { x: 2, y: 5 },
        { x: 3, y: 7 },
      ];
      const r = MlService.linearRegression(pts);
      expect(r.slope).toBeCloseTo(2, 6);
      expect(r.intercept).toBeCloseTo(1, 6);
      expect(r.r2).toBeCloseTo(1, 6);
    });

    it('pente négative parfaite y = -3x + 10 → slope -3, r2 = 1', () => {
      const pts = [
        { x: 0, y: 10 },
        { x: 1, y: 7 },
        { x: 2, y: 4 },
      ];
      const r = MlService.linearRegression(pts);
      expect(r.slope).toBeCloseTo(-3, 6);
      expect(r.intercept).toBeCloseTo(10, 6);
      expect(r.r2).toBeCloseTo(1, 6);
    });

    it('tous les x identiques (denom 0) → slope 0', () => {
      const pts = [
        { x: 5, y: 1 },
        { x: 5, y: 2 },
        { x: 5, y: 3 },
      ];
      const r = MlService.linearRegression(pts);
      expect(r.slope).toBe(0);
    });

    it('points bruités → r2 dans [0,1] et < 1', () => {
      const pts = [
        { x: 0, y: 1 },
        { x: 1, y: 2.2 },
        { x: 2, y: 1.9 },
        { x: 3, y: 4.1 },
        { x: 4, y: 3.7 },
      ];
      const r = MlService.linearRegression(pts);
      expect(r.r2).toBeGreaterThan(0);
      expect(r.r2).toBeLessThanOrEqual(1);
      expect(r.slope).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // ema
  // ---------------------------------------------------------------------------
  describe('ema', () => {
    it('tableau vide → []', () => {
      expect(MlService.ema([])).toEqual([]);
    });

    it('premier élément inchangé (seed = values[0])', () => {
      const out = MlService.ema([10, 20, 30], 0.3);
      expect(out[0]).toBe(10);
      expect(out).toHaveLength(3);
    });

    it('valeurs constantes → série constante', () => {
      expect(MlService.ema([5, 5, 5, 5], 0.5)).toEqual([5, 5, 5, 5]);
    });

    it('lissage : chaque sortie suit la formule alpha*v + (1-alpha)*prev', () => {
      const out = MlService.ema([10, 20, 30], 0.3);
      expect(out[1]).toBeCloseTo(0.3 * 20 + 0.7 * 10, 6); // 13
      expect(out[2]).toBeCloseTo(0.3 * 30 + 0.7 * out[1], 6); // 18.1
    });

    it('alpha par défaut = 0.3', () => {
      const out = MlService.ema([0, 100]);
      expect(out[1]).toBeCloseTo(30, 6);
    });

    it('série croissante → EMA retarde la valeur brute (lissage)', () => {
      const vals = [1, 2, 3, 4, 5];
      const out = MlService.ema(vals, 0.3);
      // chaque point lissé < valeur brute correspondante (sauf le seed)
      for (let i = 1; i < vals.length; i++) {
        expect(out[i]).toBeLessThan(vals[i]);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // forecastFromEntries
  // ---------------------------------------------------------------------------
  describe('forecastFromEntries', () => {
    const base = Date.UTC(2026, 0, 1);

    it('< 2 points → not_enough_data', () => {
      const r0 = MlService.forecastFromEntries([]);
      expect(r0).toMatchObject({ ok: false, reason: 'not_enough_data', count: 0, minPointsNeeded: 2 });

      const r1 = MlService.forecastFromEntries([{ weight: 80, ts: base }]);
      expect(r1).toMatchObject({ ok: false, reason: 'not_enough_data', count: 1 });
    });

    it('entrées non finies filtrées → not_enough_data si < 2 valides', () => {
      const r = MlService.forecastFromEntries([
        { weight: 80, ts: base },
        { weight: NaN, ts: base + DAY },
        { weight: 79, ts: Infinity },
      ]);
      expect(r).toMatchObject({ ok: false, reason: 'not_enough_data', count: 1 });
    });

    it('perte de poids → direction "losing", trend négatif', () => {
      const entries = [
        { weight: 85, ts: base },
        { weight: 84, ts: base + 7 * DAY },
        { weight: 83, ts: base + 14 * DAY },
        { weight: 82, ts: base + 21 * DAY },
      ];
      const r: any = MlService.forecastFromEntries(entries);
      expect(r.ok).toBe(true);
      expect(r.model).toBe('linear_regression+ema');
      expect(r.direction).toBe('losing');
      expect(r.trendKgPerWeek).toBeLessThan(0);
      expect(r.count).toBe(4);
    });

    it('prise de poids → direction "gaining", trend positif', () => {
      const entries = [
        { weight: 70, ts: base },
        { weight: 71, ts: base + 7 * DAY },
        { weight: 72, ts: base + 14 * DAY },
        { weight: 73, ts: base + 21 * DAY },
      ];
      const r: any = MlService.forecastFromEntries(entries);
      expect(r.direction).toBe('gaining');
      expect(r.trendKgPerWeek).toBeGreaterThan(0);
    });

    it('poids stable → direction "stable"', () => {
      const entries = [
        { weight: 80, ts: base },
        { weight: 80, ts: base + 7 * DAY },
        { weight: 80, ts: base + 14 * DAY },
      ];
      const r: any = MlService.forecastFromEntries(entries);
      expect(r.direction).toBe('stable');
      expect(r.trendKgPerWeek).toBe(0);
    });

    it('plateau détecté : variation récente < 100g/sem et >= 4 points', () => {
      // poids quasi-plat sur les 14 derniers jours, >= 4 points
      const entries = [
        { weight: 80.0, ts: base },
        { weight: 80.02, ts: base + 4 * DAY },
        { weight: 79.99, ts: base + 8 * DAY },
        { weight: 80.01, ts: base + 12 * DAY },
        { weight: 80.0, ts: base + 13 * DAY },
      ];
      const r: any = MlService.forecastFromEntries(entries);
      expect(r.plateau).toBe(true);
    });

    it('pas de plateau si < 4 points même avec faible pente', () => {
      const entries = [
        { weight: 80.0, ts: base },
        { weight: 80.01, ts: base + 7 * DAY },
        { weight: 80.0, ts: base + 14 * DAY },
      ];
      const r: any = MlService.forecastFromEntries(entries);
      expect(r.plateau).toBe(false);
    });

    it('entrées non triées → triées en interne (même résultat)', () => {
      const ordered = [
        { weight: 85, ts: base },
        { weight: 84, ts: base + 7 * DAY },
        { weight: 83, ts: base + 14 * DAY },
      ];
      const shuffled = [ordered[2], ordered[0], ordered[1]];
      const a: any = MlService.forecastFromEntries(ordered);
      const b: any = MlService.forecastFromEntries(shuffled);
      expect(b.trendKgPerWeek).toBeCloseTo(a.trendKgPerWeek, 6);
      expect(b.currentWeight).toBeCloseTo(a.currentWeight, 6);
    });

    it('projection vers targetWeight en perte de poids → daysToGoal > 0, etaTs futur', () => {
      const entries = [
        { weight: 90, ts: base },
        { weight: 89, ts: base + 7 * DAY },
        { weight: 88, ts: base + 14 * DAY },
        { weight: 87, ts: base + 21 * DAY },
      ];
      const r: any = MlService.forecastFromEntries(entries, 80);
      expect(r.projection).not.toBeNull();
      expect(r.projection.targetWeight).toBe(80);
      expect(r.projection.daysToGoal).toBeGreaterThan(0);
      expect(r.projection.etaTs).toBeGreaterThan(entries[entries.length - 1].ts);
      expect(r.projection.weeklyRate).toBeLessThan(0);
    });

    it('pas de projection si objectif déjà atteint (daysToGoal négatif)', () => {
      // perte de poids mais cible AU-DESSUS du poids actuel → daysToGoal < 0
      const entries = [
        { weight: 90, ts: base },
        { weight: 89, ts: base + 7 * DAY },
        { weight: 88, ts: base + 14 * DAY },
        { weight: 87, ts: base + 21 * DAY },
      ];
      const r: any = MlService.forecastFromEntries(entries, 95);
      expect(r.projection).toBeNull();
    });

    it('pas de projection sans targetWeight', () => {
      const entries = [
        { weight: 90, ts: base },
        { weight: 89, ts: base + 7 * DAY },
        { weight: 88, ts: base + 14 * DAY },
      ];
      const r: any = MlService.forecastFromEntries(entries);
      expect(r.projection).toBeNull();
    });

    it('currentWeight et confidence sont des nombres bornés', () => {
      const entries = [
        { weight: 85, ts: base },
        { weight: 84, ts: base + 7 * DAY },
        { weight: 83, ts: base + 14 * DAY },
      ];
      const r: any = MlService.forecastFromEntries(entries);
      expect(typeof r.currentWeight).toBe('number');
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(1);
    });
  });

  // ---------------------------------------------------------------------------
  // recommendMeals
  // ---------------------------------------------------------------------------
  describe('recommendMeals', () => {
    const remaining = { kcal: 600, p: 40, c: 60, f: 20 };

    it('structure de retour ok + métadonnées', () => {
      const r = MlService.recommendMeals(remaining, 'maintain');
      expect(r.ok).toBe(true);
      expect(r.model).toBe('macro_fit_scoring');
      expect(r.goal).toBe('maintain');
      expect(r.remaining).toEqual(remaining);
      expect(Array.isArray(r.recommendations)).toBe(true);
    });

    it('résultats triés par score décroissant', () => {
      const r = MlService.recommendMeals(remaining, 'lose');
      const scores = r.recommendations.map((m: any) => m.score);
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i]);
      }
    });

    it('limite respectée (limit = 3)', () => {
      const r = MlService.recommendMeals(remaining, 'maintain', 3);
      expect(r.recommendations).toHaveLength(3);
    });

    it('limite par défaut = 5', () => {
      const r = MlService.recommendMeals(remaining, 'maintain');
      expect(r.recommendations).toHaveLength(5);
    });

    it('macros négatives clampées à 0', () => {
      const r = MlService.recommendMeals({ kcal: -100, p: -5, c: -10, f: -3 }, 'maintain');
      expect(r.remaining).toEqual({ kcal: 0, p: 0, c: 0, f: 0 });
    });

    it('valeurs manquantes (undefined/NaN) → 0', () => {
      const r = MlService.recommendMeals({} as any, 'maintain');
      expect(r.remaining).toEqual({ kcal: 0, p: 0, c: 0, f: 0 });
    });

    it('goalBonus : un aliment taggé "lose" est mieux noté en objectif lose qu\'en gain', () => {
      // "Crevettes sautées" est taggé lose+highP, dense en protéines, pas taggé gain.
      const find = (res: any, name: string) =>
        res.recommendations.find((m: any) => m.name === name);
      const lose = MlService.recommendMeals(remaining, 'lose', 20);
      const gain = MlService.recommendMeals(remaining, 'gain', 20);
      const crevLose = find(lose, 'Crevettes sautées (150g)');
      const crevGain = find(gain, 'Crevettes sautées (150g)');
      expect(crevLose).toBeDefined();
      expect(crevGain).toBeDefined();
      // bonus d'objectif (+12) + priorité protéine plus forte en lose → score supérieur
      expect(crevLose.score).toBeGreaterThan(crevGain.score);
    });

    it('objectif "lose" → top recommandation est riche en protéines', () => {
      const r = MlService.recommendMeals(remaining, 'lose', 5);
      const top = r.recommendations[0];
      expect(top.proteinDensity).toBeGreaterThan(0);
      // les premiers résultats en lose doivent être taggés lose ou highP
      const tags: string[] = top.tags;
      expect(tags.some((t) => t === 'lose' || t === 'highP')).toBe(true);
    });

    it('chaque reco porte score et proteinDensity numériques', () => {
      const r = MlService.recommendMeals(remaining, 'maintain', 5);
      for (const m of r.recommendations) {
        expect(typeof (m as any).score).toBe('number');
        expect(typeof (m as any).proteinDensity).toBe('number');
        expect((m as any).proteinDensity).toBeGreaterThanOrEqual(0);
      }
    });

    it('peu de kcal restantes → pas de pénalité kcalOver (rem.kcal <= 50)', () => {
      // ne doit pas crasher et renvoyer des recos valides même avec budget kcal nul
      const r = MlService.recommendMeals({ kcal: 0, p: 30, c: 0, f: 0 }, 'lose', 5);
      expect(r.recommendations.length).toBe(5);
      expect(r.recommendations.every((m: any) => Number.isFinite(m.score))).toBe(true);
    });

    it('goal par défaut = maintain', () => {
      const r = MlService.recommendMeals(remaining);
      expect(r.goal).toBe('maintain');
    });
  });
});
