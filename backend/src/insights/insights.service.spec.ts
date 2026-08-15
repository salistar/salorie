import { InsightsService } from './insights.service';

// Tests UNITAIRES de la logique PURE (aucune DB / réseau). Les trois dépendances sont
// des stubs : les méthodes testées ne s'en servent pas. Pas d'appel Gemini.
//
// Le service a gagné `SecretsService` et `AiService` sans que ce fichier suive : `tsc`
// échouait donc ici (TS2554), alors que Jest passait — ts-jest transpile sans vérifier
// les types. Un typecheck rouge que les tests verts masquent finit par être ignoré.
describe('InsightsService — logique pure', () => {
  let svc: InsightsService;
  beforeEach(() => {
    svc = new InsightsService({ db: () => ({}) } as any, {} as any, {} as any);
  });

  describe('weekKey / monthKey', () => {
    it('weekKey → format week_YYYY-Wnn', () => {
      expect(svc.weekKey(new Date('2026-06-26'))).toMatch(/^week_\d{4}-W\d{2}$/);
    });
    it('monthKey → format month_YYYY-MM', () => {
      expect(svc.monthKey(new Date('2026-06-26'))).toBe('month_2026-06');
    });
  });

  describe('inputSignature (minimisation Gemini)', () => {
    const logs = [{ date: '2026-06-25', name: 'Couscous', calories: 600, type: 'meal' }];
    it('déterministe : mêmes entrées → même hash sha1', () => {
      const a = (svc as any).inputSignature({ goal: 'lose', weight: 80 }, logs);
      const b = (svc as any).inputSignature({ goal: 'lose', weight: 80 }, logs);
      expect(a).toBe(b);
      expect(a).toMatch(/^[0-9a-f]{40}$/);
    });
    it('change si objectif / poids / logs changent', () => {
      const base = (svc as any).inputSignature({ goal: 'lose', weight: 80 }, logs);
      expect((svc as any).inputSignature({ goal: 'gain', weight: 80 }, logs)).not.toBe(base);
      expect((svc as any).inputSignature({ goal: 'lose', weight: 81 }, logs)).not.toBe(base);
      const moreLogs = [...logs, { date: '2026-06-26', name: 'X', calories: 100, type: 'meal' }];
      expect((svc as any).inputSignature({ goal: 'lose', weight: 80 }, moreLogs)).not.toBe(base);
    });
    it('insensible à l’ordre des logs (tri interne)', () => {
      const l = [logs[0], { date: '2026-06-24', name: 'Tajine', calories: 700, type: 'meal' }];
      const a = (svc as any).inputSignature({ goal: 'lose', weight: 80 }, l);
      const b = (svc as any).inputSignature({ goal: 'lose', weight: 80 }, [l[1], l[0]]);
      expect(a).toBe(b);
    });
    it('poids arrondi : 80.4 et 80 → même signature', () => {
      const a = (svc as any).inputSignature({ goal: 'lose', weight: 80 }, logs);
      const b = (svc as any).inputSignature({ goal: 'lose', weight: 80.4 }, logs);
      expect(a).toBe(b);
    });
  });

  describe('offline (fallback computed)', () => {
    it('agrège repas/activités/eau en insight trilingue', () => {
      const logs = [
        { date: '2026-06-25', name: 'Couscous', calories: 600, type: 'meal' },
        { date: '2026-06-25', name: 'Course', calories: 300, type: 'activity' },
        { date: '2026-06-25', name: 'Eau', calories: 500, type: 'water' },
      ];
      const r = (svc as any).offline(logs, 'this week');
      expect(r.source).toBe('computed');
      expect(r.healthScore).toBeGreaterThanOrEqual(0);
      expect(r.healthScore).toBeLessThanOrEqual(100);
      expect(r.en.topFood).toBe('Couscous');
      expect(r.fr.summary).toContain('1 repas');
      expect(typeof r.ar.recommendation).toBe('string');
      expect(r.en).toHaveProperty('hydrationStatus');
    });
    it('0 log → topFood "—" sans crash', () => {
      const r = (svc as any).offline([], 'this week');
      expect(r.en.topFood).toBe('—');
      expect(r.source).toBe('computed');
    });
  });
});
