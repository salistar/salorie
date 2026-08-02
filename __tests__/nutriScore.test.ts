// Épingle le comportement du Nutri-Score (lib/nutriScore.ts), algorithme 2017
// aliments solides. But : garantir que la note affichée (scan étiquette / code-barres)
// reste stable et qu'un futur changement ne casse pas silencieusement le calcul.
// Logique PURE : pas de réseau, pas de Date.now() → tests déterministes.
import { nutriScore, GRADE_COLOR, NutriGrade } from '../lib/nutriScore';

describe('nutriScore', () => {
  // Aliment « neutre » : tout à zéro → N=0, P=0, score=0 → grade B (0 <= 2).
  test('tout à zéro → score 0, grade B', () => {
    expect(nutriScore({
      energyKcal: 0, sugars: 0, satFat: 0, sodiumMg: 0, fiber: 0, protein: 0,
    })).toEqual({ score: 0, grade: 'B' });
  });

  test('valeurs négatives clampées à 0 (pts strictement >) → score 0, grade B', () => {
    expect(nutriScore({
      energyKcal: -100, sugars: -5, satFat: -1, sodiumMg: -50,
      fiber: -2, protein: -3, fruitVegPct: -10,
    })).toEqual({ score: 0, grade: 'B' });
  });

  test('fruitVegPct optionnel (absent) traité comme 0', () => {
    // kcal 50 → kJ 209.2 (< 335) → 0 pt énergie ; sucres 5 (> 4.5) → 1 pt → N=1, P=0.
    expect(nutriScore({
      energyKcal: 50, sugars: 5, satFat: 0, sodiumMg: 0, fiber: 0, protein: 0,
    })).toEqual({ score: 1, grade: 'B' });
  });

  // --- Conversion énergie kcal → kJ (×4.184) et points négatifs maximaux ---
  test('points négatifs maximaux : aliment ultra-dense → N saturé, grade E', () => {
    // 1000 kcal → 4184 kJ (>3350) → 10 pts ; sucres 50 (>45) → 10 ; satFat 12 (>10) → 10 ;
    // sodium 1000 (>900) → 10 → N=40, aucun positif → score 40 → E.
    const r = nutriScore({
      energyKcal: 1000, sugars: 50, satFat: 12, sodiumMg: 1000, fiber: 0, protein: 0,
    });
    expect(r.score).toBe(40);
    expect(r.grade).toBe('E');
  });

  test('seuil énergie strict : kJ exactement 335 → 0 pt ; juste au-dessus → 1 pt', () => {
    // energyKcal = 335 / 4.184 = 80.0669… → kJ = 335 (pile) → pts strict > → 0.
    const exact = nutriScore({
      energyKcal: 335 / 4.184, sugars: 0, satFat: 0, sodiumMg: 0, fiber: 0, protein: 0,
    });
    expect(exact.score).toBe(0);
    // un poil au-dessus → 1 pt énergie.
    const above = nutriScore({
      energyKcal: 335 / 4.184 + 0.01, sugars: 0, satFat: 0, sodiumMg: 0, fiber: 0, protein: 0,
    });
    expect(above.score).toBe(1);
  });

  // --- Points positifs : fruits/légumes (bornes 80, 60, 40, strict >) ---
  describe('points fruits/légumes (fvP)', () => {
    const base = { energyKcal: 0, sugars: 0, satFat: 0, sodiumMg: 0, fiber: 0, protein: 0 };
    test('> 80 → 5 pts (score -5)', () => {
      expect(nutriScore({ ...base, fruitVegPct: 81 }).score).toBe(-5);
    });
    test('= 80 (non strict) → 2 pts (score -2)', () => {
      expect(nutriScore({ ...base, fruitVegPct: 80 }).score).toBe(-2);
    });
    test('> 60 → 2 pts', () => {
      expect(nutriScore({ ...base, fruitVegPct: 61 }).score).toBe(-2);
    });
    test('= 60 → 1 pt', () => {
      expect(nutriScore({ ...base, fruitVegPct: 60 }).score).toBe(-1);
    });
    test('> 40 → 1 pt', () => {
      expect(nutriScore({ ...base, fruitVegPct: 41 }).score).toBe(-1);
    });
    test('= 40 → 0 pt', () => {
      expect(nutriScore({ ...base, fruitVegPct: 40 }).score).toBe(0);
    });
  });

  // --- Points fibres et protéines (table pts) ---
  test('fibres : valeur élevée → 5 pts max', () => {
    // fiber 10 (> 4.7) → 5 pts → score -5.
    expect(nutriScore({
      energyKcal: 0, sugars: 0, satFat: 0, sodiumMg: 0, fiber: 10, protein: 0,
    }).score).toBe(-5);
  });

  test('protéines comptées quand N < 11 (fvP=0) → protP retranché', () => {
    // sucres 46 (>45) → N=10 (< 11) ; protéines 10 (>8) → 5 pts → P=5 → score 5 → C.
    expect(nutriScore({
      energyKcal: 0, sugars: 46, satFat: 0, sodiumMg: 0, fiber: 0, protein: 10, fruitVegPct: 0,
    })).toEqual({ score: 5, grade: 'C' });
  });

  // --- La règle clé : si N >= 11 ET fvP < 5, les protéines NE comptent PAS ---
  test('règle protéines : N >= 11 et fvP < 5 → protéines ignorées', () => {
    // N=11 (sucres 46 → 10 + satFat 1.5 → 1), fvP=2 (fruitVeg 70), protéines 10 (protP=5 mais ignoré).
    const avecProt = nutriScore({
      energyKcal: 0, sugars: 46, satFat: 1.5, sodiumMg: 0, fiber: 0, protein: 10, fruitVegPct: 70,
    });
    const sansProt = nutriScore({
      energyKcal: 0, sugars: 46, satFat: 1.5, sodiumMg: 0, fiber: 0, protein: 0, fruitVegPct: 70,
    });
    // Le score est identique → la protéine n'a eu aucun effet (P = fvP seul = 2).
    expect(avecProt).toEqual(sansProt);
    expect(avecProt).toEqual({ score: 9, grade: 'C' });
  });

  test('règle protéines : N >= 11 mais fvP = 5 → protéines comptées', () => {
    // satFat 15 (>10 →10) + sucres 50 (>45 →10) + énergie 600 kcal (2510 kJ → 7) → N=27 ;
    // fvP=5 (fruitVeg 90) → protéines 20 (>8 →5) comptées → P=10 → score 17 → D.
    const r = nutriScore({
      energyKcal: 600, sugars: 50, satFat: 15, sodiumMg: 0, fiber: 0, protein: 20, fruitVegPct: 90,
    });
    expect(r).toEqual({ score: 17, grade: 'D' });
    // Sans protéines, le score serait plus élevé (P=5) → confirme que la protéine a bien compté.
    const sansProt = nutriScore({
      energyKcal: 600, sugars: 50, satFat: 15, sodiumMg: 0, fiber: 0, protein: 0, fruitVegPct: 90,
    });
    expect(sansProt.score).toBe(22);
  });

  // --- Frontières exactes des grades (A/B/C/D/E) ---
  describe('frontières des grades', () => {
    test('score = -1 → A (borne haute de A)', () => {
      // N=4 (sucres 19 → 4), fibres 5 (>4.7 →5) → P=5 → score -1.
      expect(nutriScore({
        energyKcal: 0, sugars: 19, satFat: 0, sodiumMg: 0, fiber: 5, protein: 0,
      })).toEqual({ score: -1, grade: 'A' });
    });

    test('score = 0 → B (borne basse de B)', () => {
      // N=5 (sucres 23 → 5), fibres 5 → P=5 → score 0.
      expect(nutriScore({
        energyKcal: 0, sugars: 23, satFat: 0, sodiumMg: 0, fiber: 5, protein: 0,
      })).toEqual({ score: 0, grade: 'B' });
    });

    test('score = 2 → B (borne haute de B)', () => {
      // N=7 (sucres 32 → 7), fibres 5 → P=5 → score 2.
      expect(nutriScore({
        energyKcal: 0, sugars: 32, satFat: 0, sodiumMg: 0, fiber: 5, protein: 0,
      })).toEqual({ score: 2, grade: 'B' });
    });

    test('score = 3 → C (borne basse de C)', () => {
      // N=8 (sucres 37 → 8), fibres 5 → P=5 → score 3.
      expect(nutriScore({
        energyKcal: 0, sugars: 37, satFat: 0, sodiumMg: 0, fiber: 5, protein: 0,
      })).toEqual({ score: 3, grade: 'C' });
    });

    test('score = 10 → C (borne haute de C)', () => {
      // N=10 (sucres 46 → 10), aucun positif → score 10.
      expect(nutriScore({
        energyKcal: 0, sugars: 46, satFat: 0, sodiumMg: 0, fiber: 0, protein: 0,
      })).toEqual({ score: 10, grade: 'C' });
    });

    test('score = 11 → D (borne basse de D)', () => {
      // N=11 (sucres 46 → 10 + satFat 1.5 → 1) → score 11.
      expect(nutriScore({
        energyKcal: 0, sugars: 46, satFat: 1.5, sodiumMg: 0, fiber: 0, protein: 0,
      })).toEqual({ score: 11, grade: 'D' });
    });

    test('score = 18 → D (borne haute de D)', () => {
      // N=18 (sucres 46 → 10 + satFat 8.5 → 8) → score 18.
      expect(nutriScore({
        energyKcal: 0, sugars: 46, satFat: 8.5, sodiumMg: 0, fiber: 0, protein: 0,
      })).toEqual({ score: 18, grade: 'D' });
    });

    test('score = 19 → E (borne basse de E)', () => {
      // N=19 (sucres 46 → 10 + satFat 9.5 → 9) → score 19.
      expect(nutriScore({
        energyKcal: 0, sugars: 46, satFat: 9.5, sodiumMg: 0, fiber: 0, protein: 0,
      })).toEqual({ score: 19, grade: 'E' });
    });
  });

  // --- Cas réalistes (sanity check) ---
  test('cas réaliste : pomme (riche en fruits) → grade A', () => {
    const r = nutriScore({
      energyKcal: 52, sugars: 10, satFat: 0.1, sodiumMg: 1, fiber: 2.4, protein: 0.3, fruitVegPct: 100,
    });
    expect(r).toEqual({ score: -5, grade: 'A' });
  });

  test('cas réaliste : snack industriel → grade E', () => {
    const r = nutriScore({
      energyKcal: 550, sugars: 55, satFat: 12, sodiumMg: 600, fiber: 1, protein: 6,
    });
    expect(r).toEqual({ score: 31, grade: 'E' });
  });
});

describe('GRADE_COLOR', () => {
  test('expose une couleur pour chaque grade A..E', () => {
    expect(GRADE_COLOR).toEqual({
      A: '#038141', B: '#85BB2F', C: '#FECB02', D: '#EE8100', E: '#E63E11',
    });
  });

  test('chaque grade renvoyé par nutriScore a une couleur associée', () => {
    const grades: NutriGrade[] = ['A', 'B', 'C', 'D', 'E'];
    for (const g of grades) {
      expect(GRADE_COLOR[g]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});
