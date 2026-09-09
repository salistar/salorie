/**
 * Deux calculs purs que personne ne peut vérifier à l'œil.
 * ---------------------------------------------------------------------------
 * `hydrationPlan` répartit huit verres d'eau entre l'Iftar et le Suhoor. La
 * fenêtre TRAVERSE MINUIT — 19:30 → 05:10 le lendemain. Une soustraction naïve
 * donne une durée NÉGATIVE, et le plan sort dans le désordre ou vide. Le bug ne
 * se voit qu'un mois par an, chez des gens qui jeûnent.
 *
 * `streakOf` compte une série avec un « gel » : un jour manqué par semaine ne la
 * casse pas. Trois règles s'y croisent (budget de gels, pas deux gels d'affilée,
 * la journée en cours qui n'est pas encore loggée). Aucune ne se lit dans le
 * résultat : la série affiche « 12 » et on n'a aucun moyen de savoir si c'est
 * juste. C'est exactement le genre de calcul qui dérive sans que personne ne le
 * remarque.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined),
}));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(), query: jest.fn(), where: jest.fn(),
  getDocs: jest.fn(async () => ({ forEach: () => {} })),
  doc: jest.fn(), getDoc: jest.fn(), setDoc: jest.fn(), updateDoc: jest.fn(),
}));
jest.mock('../lib/firebase', () => ({ db: {}, emailToDocId: (e: string) => e }));

import { hydrationPlan, splitBudget, SUHOOR_SHARE, HYDRATION_TARGET_GLASSES } from '../lib/ramadan';
import { streakOf } from '../lib/streaks';

describe('hydrationPlan : la fenetre traverse minuit', () => {
  it('repartit les verres de l Iftar au Suhoor du LENDEMAIN', () => {
    const p = hydrationPlan('19:30', '05:10', 8);
    expect(p).toHaveLength(8);
    expect(p[0].time).toBe('19:30');
    expect(p[0].label).toBe('iftar');
    expect(p[7].time).toBe('05:10');
    expect(p[7].label).toBe('suhoor');
  });

  it('les horaires progressent, y compris en passant minuit', () => {
    // Le vrai test du wrap : sans lui, la suite redescend a 00:00 et le plan
    // demande de boire quatre verres avant l'Iftar.
    const p = hydrationPlan('19:30', '05:10', 8);
    const minutes = p.map((s) => {
      const [h, m] = s.time.split(':').map(Number);
      return h * 60 + m;
    });
    let precedent = -1;
    let passages = 0;
    for (const m of minutes) {
      if (m < precedent) passages += 1;   // un seul recul autorise : minuit
      precedent = m;
    }
    expect(passages).toBe(1);
  });

  it('une fenetre qui ne traverse PAS minuit reste croissante', () => {
    const p = hydrationPlan('06:00', '18:00', 4);
    expect(p.map((s) => s.time)).toEqual(['06:00', '10:00', '14:00', '18:00']);
  });

  it('cas limites : zero verre, un seul verre', () => {
    expect(hydrationPlan('19:30', '05:10', 0)).toEqual([]);
    expect(hydrationPlan('19:30', '05:10', -3)).toEqual([]);
    const un = hydrationPlan('19:30', '05:10', 1);
    expect(un).toHaveLength(1);
    expect(un[0].time).toBe('19:30');       // pas de division par (n-1) = 0
  });

  it('le defaut est bien huit verres', () => {
    expect(hydrationPlan('19:30', '05:10')).toHaveLength(HYDRATION_TARGET_GLASSES);
  });
});

describe('splitBudget : Suhoor 40 % / Iftar 60 %, sauf les proteines', () => {
  it('repartit les calories selon la part annoncee', () => {
    const b = splitBudget(2000, { protein: 150, carbs: 220, fat: 65 });
    expect(b.suhoor.kcal).toBeCloseTo(2000 * SUHOOR_SHARE, 1);
    expect(b.iftar.kcal).toBeCloseTo(2000 * (1 - SUHOOR_SHARE), 1);
  });

  it('rien ne se perd entre les deux repas', () => {
    // Une part mal ecrite (0.4 / 0.7) ne leve aucune erreur : elle donne
    // simplement a l'utilisateur un budget qui ne correspond plus a sa cible.
    const b = splitBudget(2000, { protein: 150, carbs: 220, fat: 65 });
    expect(b.suhoor.kcal + b.iftar.kcal).toBeCloseTo(2000, 1);
    expect(b.suhoor.carbs + b.iftar.carbs).toBeCloseTo(220, 1);
    expect(b.suhoor.fat + b.iftar.fat).toBeCloseTo(65, 1);
    expect(b.suhoor.protein + b.iftar.protein).toBeCloseTo(150, 1);
    expect(b.suhoor.water + b.iftar.water).toBe(HYDRATION_TARGET_GLASSES);
  });

  it('les proteines sont partagees en deux, pas 40/60', () => {
    // Choix explicite du module : satiete diurne. Un « alignement » sur 40/60
    // serait une regression silencieuse.
    const b = splitBudget(2000, { protein: 150, carbs: 220, fat: 65 });
    expect(b.suhoor.protein).toBeCloseTo(75, 1);
    expect(b.iftar.protein).toBeCloseTo(75, 1);
  });

  it('macros absentes : zero, pas NaN', () => {
    const b = splitBudget(1800, {} as any);
    expect(b.suhoor.protein).toBe(0);
    expect(Number.isNaN(b.iftar.carbs)).toBe(false);
  });
});

describe('streakOf : le gel intelligent', () => {
  // `streakOf` lit l'horloge. Sans la figer, le test passerait ou non selon
  // l'heure d'execution — le pire genre de test.
  const JOUR = 86400000;
  const AUJ = new Date('2026-09-09T12:00:00Z');
  const jours = (n: number) => {
    const s = new Set<string>();
    for (let i = 0; i < n; i++) s.add(new Date(AUJ.getTime() - i * JOUR).toISOString().slice(0, 10));
    return s;
  };

  beforeAll(() => { jest.useFakeTimers().setSystemTime(AUJ); });
  afterAll(() => { jest.useRealTimers(); });

  it('aucune date : serie nulle', () => {
    expect(streakOf(new Set())).toEqual({ streak: 0, freezes: 0 });
  });

  it('des jours consecutifs se comptent tous', () => {
    expect(streakOf(jours(5)).streak).toBe(5);
  });

  it('REGRESSION : une serie parfaite n a consomme AUCUN gel', () => {
    // Le defaut corrige le 09/09/2026. La boucle remonte le temps et depensait un
    // gel en tombant au bout de l'historique — un gel qui ne pontait rien, puisque
    // rien ne le suivait. `freezes` valait donc au moins 1 pour toute serie non
    // vide, et le badge « protege » s'affichait chez des gens qui n'avaient jamais
    // manque un jour. Un badge que tout le monde porte ne recompense personne.
    for (const n of [1, 5, 10, 30]) {
      expect(streakOf(jours(n))).toEqual({ streak: n, freezes: 0 });
    }
  });

  it('aujourd hui pas encore logge : la serie repart d hier', () => {
    // Sans ce rattrapage, la serie tomberait a zero chaque matin jusqu au
    // premier repas — et l utilisateur croirait avoir tout perdu.
    const s = jours(6);
    s.delete(AUJ.toISOString().slice(0, 10));
    expect(streakOf(s).streak).toBe(5);
  });

  it('un jour manque au milieu est GELE, pas fatal', () => {
    const s = jours(10);
    s.delete(new Date(AUJ.getTime() - 4 * JOUR).toISOString().slice(0, 10));
    const r = streakOf(s);
    expect(r.freezes).toBe(1);
    expect(r.streak).toBe(9);           // 10 jours, un gele
  });

  it('deux jours manques D AFFILEE cassent la serie', () => {
    // La regle « pas deux gels consecutifs » : sinon un mois d absence
    // ressemblerait a une serie parfaite.
    const s = jours(12);
    s.delete(new Date(AUJ.getTime() - 3 * JOUR).toISOString().slice(0, 10));
    s.delete(new Date(AUJ.getTime() - 4 * JOUR).toISOString().slice(0, 10));
    expect(streakOf(s).streak).toBe(3);
  });

  it('le budget de gels grandit avec l anciennete de la serie', () => {
    // Un gel par semaine couverte. Sur 20 jours avec deux trous espaces, les
    // deux sont absorbes ; le meme motif sur une serie jeune ne le serait pas.
    const s = jours(20);
    s.delete(new Date(AUJ.getTime() - 5 * JOUR).toISOString().slice(0, 10));
    s.delete(new Date(AUJ.getTime() - 14 * JOUR).toISOString().slice(0, 10));
    const r = streakOf(s);
    expect(r.freezes).toBe(2);
    expect(r.streak).toBe(18);
  });
});
