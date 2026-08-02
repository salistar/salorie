// Épingle le comportement des insights ON-DEVICE (lib/localInsights.ts) :
// régression linéaire pour la prévision de poids + scoring macro pour la reco repas.
// 100% logique pure : pas de réseau, pas de Date.now() dans le module → déterministe.
import { localWeightForecast, localMealReco } from '../lib/localInsights';

const DAY = 86400000;
const WEEK = 7 * DAY;
// Date de référence fixe (au-dessus de 1e12 → ms) pour des tests déterministes.
const T0 = 1_700_000_000_000; // ~2023-11-14

describe('localWeightForecast', () => {
  test('< 3 points exploitables → {ok:false, not_enough_local_data}', () => {
    expect(localWeightForecast([])).toEqual({
      ok: false,
      reason: 'not_enough_local_data',
      model: 'local',
    });
    expect(localWeightForecast([{ weight: 80, timestamp: T0 }])).toMatchObject({ ok: false });
    expect(
      localWeightForecast([
        { weight: 80, timestamp: T0 },
        { weight: 79, timestamp: T0 + WEEK },
      ]),
    ).toMatchObject({ ok: false, reason: 'not_enough_local_data' });
  });

  test('history null/undefined → {ok:false} (pas de crash)', () => {
    // @ts-expect-error : robustesse aux entrées nulles
    expect(localWeightForecast(null)).toMatchObject({ ok: false });
    // @ts-expect-error : robustesse aux entrées undefined
    expect(localWeightForecast(undefined)).toMatchObject({ ok: false });
  });

  test('points invalides (t<=0, poids <=0, non finis) sont filtrés → peut retomber sous 3', () => {
    const r = localWeightForecast([
      { weight: 80, timestamp: T0 },
      { weight: 0, timestamp: T0 + WEEK }, // poids 0 → filtré
      { weight: 79, date: 'pas une date' }, // date invalide → t=0 → filtré
      { weight: 78, timestamp: T0 + 2 * WEEK },
    ]);
    // seuls 2 points valides restent → ok:false
    expect(r).toMatchObject({ ok: false });
  });

  test('perte de poids régulière → direction losing, count exact, currentWeight arrondi', () => {
    const hist = [
      { weight: 80, timestamp: T0 },
      { weight: 79, timestamp: T0 + WEEK },
      { weight: 78, timestamp: T0 + 2 * WEEK },
      { weight: 77, timestamp: T0 + 3 * WEEK },
    ];
    const r = localWeightForecast(hist);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.model).toBe('local-regression');
    expect(r.count).toBe(4);
    expect(r.currentWeight).toBe(77);
    // -1 kg/semaine
    expect(r.trendKgPerWeek).toBe(-1);
    expect(r.direction).toBe('losing');
  });

  test('prise de poids régulière → direction gaining, pente positive', () => {
    const hist = [
      { weight: 70, timestamp: T0 },
      { weight: 71, timestamp: T0 + WEEK },
      { weight: 72, timestamp: T0 + 2 * WEEK },
    ];
    const r = localWeightForecast(hist);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.direction).toBe('gaining');
    expect(r.trendKgPerWeek).toBe(1);
  });

  test('poids stable (|pente|<0.05) → direction stable', () => {
    const hist = [
      { weight: 75, timestamp: T0 },
      { weight: 75, timestamp: T0 + WEEK },
      { weight: 75, timestamp: T0 + 2 * WEEK },
      { weight: 75, timestamp: T0 + 3 * WEEK },
    ];
    const r = localWeightForecast(hist);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.direction).toBe('stable');
    expect(r.trendKgPerWeek).toBe(0);
    // syy=0 → r2=0 → confidence clampée au plancher 0.2
    expect(r.confidence).toBe(0.2);
  });

  test('plateau : tendance récente quasi nulle ET n>=4 → plateau true', () => {
    // poids identiques → recentAvg=olderAvg → recentKgPerWeek=0
    const hist = [
      { weight: 75, timestamp: T0 },
      { weight: 75, timestamp: T0 + WEEK },
      { weight: 75, timestamp: T0 + 2 * WEEK },
      { weight: 75, timestamp: T0 + 3 * WEEK },
    ];
    const r = localWeightForecast(hist);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plateau).toBe(true);
    expect(r.recentKgPerWeek).toBe(0);
  });

  test('plateau false quand n<4 même si tendance récente nulle', () => {
    const hist = [
      { weight: 75, timestamp: T0 },
      { weight: 75, timestamp: T0 + WEEK },
      { weight: 75, timestamp: T0 + 2 * WEEK },
    ];
    const r = localWeightForecast(hist);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plateau).toBe(false); // n=3 < 4
  });

  test('confidence : n>=6 + données parfaitement linéaires → r2=1 → 0.95 (plafond)', () => {
    const hist = Array.from({ length: 6 }, (_, i) => ({
      weight: 80 - i,
      timestamp: T0 + i * WEEK,
    }));
    const r = localWeightForecast(hist);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.count).toBe(6);
    // r2=1, n>=6 → 1*1=1 → clamp à 0.95
    expect(r.confidence).toBe(0.95);
  });

  test('confidence : n<6 linéaire parfait → r2*0.7 = 0.7', () => {
    const hist = Array.from({ length: 5 }, (_, i) => ({
      weight: 80 - i,
      timestamp: T0 + i * WEEK,
    }));
    const r = localWeightForecast(hist);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // r2=1, n<6 → 1*0.7 = 0.7
    expect(r.confidence).toBe(0.7);
  });

  test('projection vers une cible atteignable (perte) → daysToGoal/etaTs/weeklyRate', () => {
    const hist = [
      { weight: 80, timestamp: T0 },
      { weight: 79, timestamp: T0 + WEEK },
      { weight: 78, timestamp: T0 + 2 * WEEK },
      { weight: 77, timestamp: T0 + 3 * WEEK },
    ];
    // pente -1 kg/sem, current 77, cible 75 → 2 semaines
    const r = localWeightForecast(hist, 75);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.projection).not.toBeNull();
    const proj = r.projection!;
    expect(proj.targetWeight).toBe(75);
    expect(proj.weeklyRate).toBe(-1);
    expect(proj.daysToGoal).toBe(14); // 2 sem * 7
    // etaTs = dernier ts + 2 semaines
    expect(proj.etaTs).toBeCloseTo(T0 + 3 * WEEK + 2 * WEEK, 0);
  });

  test('projection null quand la cible est dans la mauvaise direction (weeks <= 0)', () => {
    // on perd du poids mais on vise PLUS lourd → weeks négatif → pas de projection
    const hist = [
      { weight: 80, timestamp: T0 },
      { weight: 79, timestamp: T0 + WEEK },
      { weight: 78, timestamp: T0 + 2 * WEEK },
    ];
    const r = localWeightForecast(hist, 90);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.projection).toBeNull();
  });

  test('projection null quand cible trop lointaine (weeks >= 520)', () => {
    // pente minuscule mais > 0.02 ; cible très loin → weeks énorme
    const hist = [
      { weight: 80.0, timestamp: T0 },
      { weight: 79.97, timestamp: T0 + WEEK },
      { weight: 79.94, timestamp: T0 + 2 * WEEK },
    ];
    // pente ~ -0.03/sem, descendre de 79.94 à 60 → ~660 sem > 520
    const r = localWeightForecast(hist, 60);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.projection).toBeNull();
  });

  test('projection null quand pas de cible OU pente trop faible (|slope|<=0.02)', () => {
    const hist = [
      { weight: 80, timestamp: T0 },
      { weight: 79, timestamp: T0 + WEEK },
      { weight: 78, timestamp: T0 + 2 * WEEK },
    ];
    // pas de cible → null
    expect(localWeightForecast(hist).ok && localWeightForecast(hist)).toMatchObject({
      projection: null,
    });
    // pente ~0 → null malgré une cible
    const flat = [
      { weight: 75, timestamp: T0 },
      { weight: 75, timestamp: T0 + WEEK },
      { weight: 75, timestamp: T0 + 2 * WEEK },
    ];
    const r = localWeightForecast(flat, 70);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.projection).toBeNull();
  });

  test('toTs : timestamp en SECONDES (<1e12) est converti en ms', () => {
    const sec = Math.floor(T0 / 1000); // secondes
    const hist = [
      { weight: 80, timestamp: sec },
      { weight: 79, timestamp: sec + 7 * 86400 },
      { weight: 78, timestamp: sec + 14 * 86400 },
    ];
    const r = localWeightForecast(hist);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // -1 kg/semaine malgré l'entrée en secondes → conversion correcte
    expect(r.trendKgPerWeek).toBe(-1);
  });

  test('toTs : format .date (ISO) accepté comme le coach', () => {
    const hist = [
      { weight: 80, date: new Date(T0).toISOString() },
      { weight: 79, date: new Date(T0 + WEEK).toISOString() },
      { weight: 78, date: new Date(T0 + 2 * WEEK).toISOString() },
    ];
    const r = localWeightForecast(hist);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.trendKgPerWeek).toBe(-1);
    expect(r.direction).toBe('losing');
  });

  test('poids fournis sous forme de chaînes → Number() les convertit', () => {
    const hist = [
      { weight: '80', timestamp: T0 },
      { weight: '79', timestamp: T0 + WEEK },
      { weight: '78', timestamp: T0 + 2 * WEEK },
    ];
    // La suppression porte sur l'APPEL, pas sur chaque littéral : le tableau se type tout
    // seul en { weight: string }, et c'est seulement en le passant à la fonction que
    // TypeScript proteste. C'est précisément ce que ce test vérifie — la tolérance aux
    // poids arrivant en chaîne depuis le stockage.
    // @ts-expect-error : entrée volontairement mal typée
    const r = localWeightForecast(hist);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.currentWeight).toBe(78);
  });
});

describe('localMealReco', () => {
  test('sortie de base : ok, goal par défaut maintain, limit par défaut = 3', () => {
    const r = localMealReco({ kcal: 800, p: 40, c: 60, f: 20 });
    expect(r.ok).toBe(true);
    expect(r.goal).toBe('maintain');
    expect(r.recommendations).toHaveLength(3);
    // remaining renvoyé tel que sanitisé
    expect(r.remaining).toEqual({ kcal: 800, p: 40, c: 60, f: 20 });
  });

  test('recommandations triées par score décroissant', () => {
    const r = localMealReco({ kcal: 800, p: 40, c: 60, f: 20 }, 'maintain', 5);
    const scores = r.recommendations.map((x) => x.score);
    const sorted = [...scores].sort((a, b) => b - a);
    expect(scores).toEqual(sorted);
  });

  test('limit personnalisé borne le nombre de recommandations', () => {
    expect(localMealReco({ kcal: 500, p: 30, c: 40, f: 15 }, 'maintain', 1).recommendations).toHaveLength(1);
    expect(localMealReco({ kcal: 500, p: 30, c: 40, f: 15 }, 'maintain', 15).recommendations).toHaveLength(15);
  });

  test('remaining négatifs/non numériques sont clampés à 0', () => {
    const r = localMealReco({ kcal: -100, p: -5, c: NaN as any, f: undefined as any });
    expect(r.remaining).toEqual({ kcal: 0, p: 0, c: 0, f: 0 });
  });

  test('remaining null/undefined → tout à 0 (pas de crash)', () => {
    // @ts-expect-error : robustesse à remaining manquant
    const r = localMealReco(null);
    expect(r.remaining).toEqual({ kcal: 0, p: 0, c: 0, f: 0 });
    expect(r.ok).toBe(true);
  });

  test('chaque reco expose name/kcal/p/c/f/score/proteinDensity/tags', () => {
    const r = localMealReco({ kcal: 600, p: 30, c: 50, f: 15 }, 'maintain', 2);
    for (const rec of r.recommendations) {
      expect(typeof rec.name).toBe('string');
      expect(typeof rec.kcal).toBe('number');
      expect(typeof rec.p).toBe('number');
      expect(typeof rec.c).toBe('number');
      expect(typeof rec.f).toBe('number');
      expect(typeof rec.score).toBe('number');
      expect(typeof rec.proteinDensity).toBe('number');
      expect(Array.isArray(rec.tags)).toBe(true);
    }
  });

  test('proteinDensity arrondi à 1e-3 ; cohérent avec p/kcal', () => {
    // grand limit pour récupérer tous les aliments
    const r = localMealReco({ kcal: 500, p: 30, c: 40, f: 10 }, 'maintain', 50);
    const poulet = r.recommendations.find((x) => x.name === 'Blanc de poulet grillé')!;
    expect(poulet).toBeTruthy();
    // 31 / 165 = 0.18787... → arrondi 0.188
    expect(poulet.proteinDensity).toBe(0.188);
  });

  test('goal=lose privilégie le maigre : un aliment "lean" devance en tête', () => {
    const r = localMealReco({ kcal: 500, p: 30, c: 10, f: 10 }, 'lose', 50);
    // le 1er doit être riche en protéines et/ou lean (thon = densité protéique max + lean)
    expect(r.goal).toBe('lose');
    const top = r.recommendations[0];
    expect(top.tags.some((t) => t === 'lean' || t === 'high-protein')).toBe(true);
  });

  test('goal=gain : le scoring favorise les aliments caloriques/protéinés (ordre change vs lose)', () => {
    const loseTop = localMealReco({ kcal: 800, p: 40, c: 60, f: 20 }, 'lose', 15).recommendations.map((x) => x.name);
    const gainTop = localMealReco({ kcal: 800, p: 40, c: 60, f: 20 }, 'gain', 15).recommendations.map((x) => x.name);
    // les deux objectifs ne produisent pas le même classement
    expect(gainTop).not.toEqual(loseTop);
  });

  test('peu de glucides restants (rem.c<30) pénalise les aliments tag "carb"', () => {
    const lowCarb = localMealReco({ kcal: 500, p: 30, c: 10, f: 10 }, 'maintain', 50);
    const highCarb = localMealReco({ kcal: 500, p: 30, c: 100, f: 10 }, 'maintain', 50);
    const riz = 'Riz complet cuit';
    const scoreLow = lowCarb.recommendations.find((x) => x.name === riz)!.score;
    const scoreHigh = highCarb.recommendations.find((x) => x.name === riz)!.score;
    // -15 quand c<30 → score plus bas
    expect(scoreLow).toBe(Math.round((scoreHigh - 15) * 10) / 10);
  });

  test('protéines restantes (rem.p>0) bonifient les aliments à p>=15', () => {
    const withP = localMealReco({ kcal: 500, p: 30, c: 100, f: 10 }, 'maintain', 50);
    const withoutP = localMealReco({ kcal: 500, p: 0, c: 100, f: 10 }, 'maintain', 50);
    const saumon = 'Filet de saumon'; // p=20 (>=15), pas de tag carb → seul le bonus +10 diffère
    const sWith = withP.recommendations.find((x) => x.name === saumon)!.score;
    const sWithout = withoutP.recommendations.find((x) => x.name === saumon)!.score;
    expect(sWith).toBe(Math.round((sWithout + 10) * 10) / 10);
  });
});
