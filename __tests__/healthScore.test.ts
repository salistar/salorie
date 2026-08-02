// Épingle le comportement du SCORE SANTÉ ON-DEVICE (lib/healthScore.ts).
// But : garantir que le Nutri-Score simplifié (scan code-barres + étiquette OCR)
// reste déterministe — mêmes nutriments → même grade/score/verdict/couleur — et
// qu'un futur changement de seuils ne casse pas silencieusement le calcul.
// Pur calcul hors-ligne : aucun réseau, aucune dépendance à Date.now().
import { computeHealthScore, VERDICT_TXT } from '../lib/healthScore';
import type { Nutriments } from '../lib/healthScore';

const GRADE_COLOR = {
  A: '#16A34A', B: '#65A30D', C: '#D97706', D: '#EA580C', E: '#DC2626',
} as const;

describe('computeHealthScore — entrées dégénérées', () => {
  test('objet vide {} → branche approx, grade B neutre', () => {
    const r = computeHealthScore({});
    expect(r.approx).toBe(true);
    expect(r.grade).toBe('B');
    expect(r.score).toBe(73);
    expect(r.verdict).toBe('good');
    expect(r.color).toBe(GRADE_COLOR.B);
  });

  test('null en entrée → traité comme {} (pas de crash)', () => {
    const r = computeHealthScore(null as unknown as Nutriments);
    expect(r.grade).toBe('B');
    expect(r.score).toBe(73);
    expect(r.approx).toBe(true);
  });

  test('undefined en entrée → traité comme {}', () => {
    const r = computeHealthScore(undefined as unknown as Nutriments);
    expect(r.grade).toBe('B');
    expect(r.approx).toBe(true);
  });

  test('valeurs non numériques (string) coercées via Number()', () => {
    // kcal:'100' → branche full (sugars présent) ; Number('100')=100
    const r = computeHealthScore({ kcal: '100' as unknown as number, sugars: 5 });
    expect(r.approx).toBe(false);
    expect(r.grade).toBe('B');
    expect(r.score).toBe(69);
  });

  test('NaN sur une macro → ramené à 0 via (Number(x) || 0)', () => {
    const r = computeHealthScore({ kcal: NaN, sugars: 5 });
    expect(r.approx).toBe(false);
    expect(r.score).toBe(71);
    expect(r.grade).toBe('B');
  });
});

describe('computeHealthScore — détection de la branche (approx vs full)', () => {
  test('hasFull=true dès que sugars est présent', () => {
    expect(computeHealthScore({ sugars: 0, kcal: 0 }).approx).toBe(false);
  });

  test('hasFull=true dès que satFat est présent', () => {
    expect(computeHealthScore({ satFat: 0, kcal: 0 }).approx).toBe(false);
  });

  test('hasFull=true dès que salt est présent', () => {
    expect(computeHealthScore({ salt: 0.05 }).approx).toBe(false);
  });

  test('hasFull=true dès que sodium est présent', () => {
    expect(computeHealthScore({ sodium: 0.1, kcal: 0 }).approx).toBe(false);
  });

  test('approx=true si seules les macros kcal/prot/gluc/lip sont connues', () => {
    expect(computeHealthScore({ kcal: 250, carbs: 25, fat: 8, protein: 5 }).approx).toBe(true);
  });

  test('fibres seules NE déclenchent PAS la branche full (reste approx)', () => {
    // fiber n'est pas dans le test hasFull → produit OCR sans sucres/sat/sel
    expect(computeHealthScore({ kcal: 0, fiber: 99, protein: 99 }).approx).toBe(true);
  });
});

describe('computeHealthScore — branche full (Nutri-Score complet)', () => {
  test('produit sain (peu de négatifs, beaucoup de fibres+protéines) → A', () => {
    const r = computeHealthScore({ kcal: 50, sugars: 1, satFat: 0.2, salt: 0.05, fiber: 6, protein: 10 });
    expect(r.approx).toBe(false);
    expect(r.grade).toBe('A');
    expect(r.verdict).toBe('good');
    expect(r.score).toBe(91);
    expect(r.color).toBe(GRADE_COLOR.A);
  });

  test('malbouffe (énergie/sucres/sat/sel élevés) → E', () => {
    const r = computeHealthScore({ kcal: 550, sugars: 50, satFat: 12, salt: 2.5, fiber: 0, protein: 2 });
    expect(r.grade).toBe('E');
    expect(r.verdict).toBe('bad');
    expect(r.score).toBe(9);
    expect(r.color).toBe(GRADE_COLOR.E);
  });

  test('score plancher 0 sur produit extrême (clamp bas)', () => {
    const r = computeHealthScore({ kcal: 900, sugars: 50, satFat: 12, salt: 3, fiber: 0, protein: 0 });
    expect(r.score).toBe(0);
    expect(r.grade).toBe('E');
  });

  test('positifs plafonnés (fibres+protéines) → raw=-10, score 91 (jamais 100)', () => {
    // sugars:0 force la branche full ; fibre/protéine énormes → positive=10
    const r = computeHealthScore({ kcal: 0, sugars: 0, fiber: 99, protein: 99 });
    expect(r.approx).toBe(false);
    expect(r.score).toBe(91); // le clamp 100 n'est pas atteignable : min raw = -10
    expect(r.grade).toBe('A');
  });
});

describe('computeHealthScore — conversion du sodium', () => {
  test('sodium direct (g→mg) : 0.5 g = 500 mg', () => {
    const r = computeHealthScore({ sodium: 0.5, kcal: 100 });
    expect(r.score).toBe(62);
    expect(r.grade).toBe('C');
  });

  test('sel (g×400) : 1.25 g ≈ 500 mg → même résultat que sodium 0.5', () => {
    const r = computeHealthScore({ salt: 1.25, kcal: 100 });
    expect(r.score).toBe(62);
    expect(r.grade).toBe('C');
  });

  test('sodium a priorité sur salt quand les deux sont fournis', () => {
    // sodium:0.5 (=500mg) utilisé ; salt:99 ignoré
    const r = computeHealthScore({ sodium: 0.5, salt: 99, kcal: 100 });
    expect(r.score).toBe(62);
    expect(r.grade).toBe('C');
  });
});

describe('computeHealthScore — branche approx (étiquette OCR)', () => {
  test('produit sain approx → A', () => {
    const r = computeHealthScore({ kcal: 50, carbs: 2, fat: 0.5, protein: 10 });
    expect(r.approx).toBe(true);
    expect(r.grade).toBe('A');
    expect(r.score).toBe(78);
    expect(r.verdict).toBe('good');
  });

  test('produit gras/sucré approx → D', () => {
    const r = computeHealthScore({ kcal: 550, carbs: 60, fat: 30, protein: 2 });
    expect(r.approx).toBe(true);
    expect(r.grade).toBe('D');
    expect(r.score).toBe(44);
    expect(r.verdict).toBe('bad');
  });

  test('produit moyen approx → C / ok', () => {
    const r = computeHealthScore({ kcal: 250, carbs: 25, fat: 8, protein: 5 });
    expect(r.grade).toBe('C');
    expect(r.verdict).toBe('ok');
    expect(r.score).toBe(64);
  });

  test('glucides pondérés ×0.6 puis arrondis (proxy sucres)', () => {
    // carbs:31 → nCarb=3 → round(3*0.6)=round(1.8)=2 ; kcal=400→4, fat=18→4 → raw=10 → C
    const r = computeHealthScore({ kcal: 400, carbs: 31, fat: 18, protein: 0 });
    expect(r.grade).toBe('C');
    expect(r.score).toBe(55);
  });
});

describe('computeHealthScore — frontières de grade (sur raw)', () => {
  test('raw=-1 → A (borne haute de A)', () => {
    // approx : protein=4 → pProt=1, négatifs=0 → raw=-1
    const r = computeHealthScore({ kcal: 0, carbs: 0, fat: 0, protein: 4 });
    expect(r.grade).toBe('A');
  });

  test('raw=0 → B (juste au-dessus de A)', () => {
    const r = computeHealthScore({ kcal: 0, carbs: 0, fat: 0, protein: 0 });
    expect(r.grade).toBe('B');
  });

  test('raw=2 → B (borne haute de B)', () => {
    // approx fat=10 → nFat=2, raw=2
    const r = computeHealthScore({ kcal: 0, carbs: 0, fat: 10, protein: 0 });
    expect(r.grade).toBe('B');
  });

  test('raw=3 → C (premier C)', () => {
    // approx fat=11 → nFat=3, raw=3
    const r = computeHealthScore({ kcal: 0, carbs: 0, fat: 11, protein: 0 });
    expect(r.grade).toBe('C');
  });

  test('raw=10 → C (borne haute de C)', () => {
    const r = computeHealthScore({ kcal: 400, carbs: 31, fat: 18, protein: 0 });
    expect(r.grade).toBe('C');
  });

  test('raw=11 → D (premier D)', () => {
    const r = computeHealthScore({ kcal: 400, carbs: 31, fat: 22, protein: 0 });
    expect(r.grade).toBe('D');
  });

  test('raw élevé → E (au-delà de 18)', () => {
    // malbouffe full : raw=35 → E
    const r = computeHealthScore({ kcal: 550, sugars: 50, satFat: 12, salt: 2.5, fiber: 0, protein: 2 });
    expect(r.grade).toBe('E');
  });
});

describe('computeHealthScore — seuils pts() (comparaison stricte value > t)', () => {
  test('valeur EXACTEMENT égale au seuil ne compte pas (satFat=1 → 0 point)', () => {
    const r = computeHealthScore({ satFat: 1, kcal: 0 });
    expect(r.grade).toBe('B'); // raw=0
    expect(r.score).toBe(73);
  });

  test('valeur au-dessus du seuil compte (satFat=1.5 → 1 point négatif)', () => {
    const r = computeHealthScore({ satFat: 1.5, kcal: 0 });
    expect(r.score).toBe(71); // raw=1
  });

  test('fibres/sat manquants en branche full → traités comme 0', () => {
    const r = computeHealthScore({ sugars: 0, kcal: 0 });
    expect(r.grade).toBe('B');
    expect(r.score).toBe(73);
  });
});

describe('computeHealthScore — cohérence du verdict et de la couleur', () => {
  test('A et B → good ; C → ok ; D et E → bad', () => {
    expect(computeHealthScore({ kcal: 50, sugars: 1, satFat: 0.2, salt: 0.05, fiber: 6, protein: 10 }).verdict).toBe('good'); // A
    expect(computeHealthScore({ kcal: 0, carbs: 0, fat: 0, protein: 0 }).verdict).toBe('good'); // B
    expect(computeHealthScore({ kcal: 250, carbs: 25, fat: 8, protein: 5 }).verdict).toBe('ok'); // C
    expect(computeHealthScore({ kcal: 550, carbs: 60, fat: 30, protein: 2 }).verdict).toBe('bad'); // D
    expect(computeHealthScore({ kcal: 550, sugars: 50, satFat: 12, salt: 2.5, fiber: 0, protein: 2 }).verdict).toBe('bad'); // E
  });

  test('la couleur correspond toujours au grade', () => {
    const cases: Nutriments[] = [
      { kcal: 50, sugars: 1, satFat: 0.2, salt: 0.05, fiber: 6, protein: 10 },
      { kcal: 0, carbs: 0, fat: 0, protein: 0 },
      { kcal: 250, carbs: 25, fat: 8, protein: 5 },
      { kcal: 550, carbs: 60, fat: 30, protein: 2 },
      { kcal: 550, sugars: 50, satFat: 12, salt: 2.5, fiber: 0, protein: 2 },
    ];
    for (const c of cases) {
      const r = computeHealthScore(c);
      expect(r.color).toBe(GRADE_COLOR[r.grade]);
    }
  });

  test('score toujours borné dans [0, 100]', () => {
    const cases: Nutriments[] = [
      {},
      { kcal: 0, sugars: 0, fiber: 99, protein: 99 },
      { kcal: 900, sugars: 50, satFat: 12, salt: 3, fiber: 0, protein: 0 },
      { kcal: 550, carbs: 60, fat: 30, protein: 2 },
    ];
    for (const c of cases) {
      const r = computeHealthScore(c);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
    }
  });

  test('déterminisme : deux appels identiques → résultat identique', () => {
    const input: Nutriments = { kcal: 250, carbs: 25, fat: 8, protein: 5 };
    expect(computeHealthScore(input)).toEqual(computeHealthScore(input));
  });
});

describe('VERDICT_TXT — libellés trilingues', () => {
  test('contient en / fr / ar', () => {
    expect(Object.keys(VERDICT_TXT).sort()).toEqual(['ar', 'en', 'fr']);
  });

  test('chaque langue couvre les 3 verdicts good/ok/bad', () => {
    for (const lang of ['en', 'fr', 'ar'] as const) {
      expect(VERDICT_TXT[lang].good).toBeTruthy();
      expect(VERDICT_TXT[lang].ok).toBeTruthy();
      expect(VERDICT_TXT[lang].bad).toBeTruthy();
    }
  });

  test('libellés français attendus', () => {
    expect(VERDICT_TXT.fr.good).toBe('Bon produit');
    expect(VERDICT_TXT.fr.ok).toBe('Moyen');
    expect(VERDICT_TXT.fr.bad).toBe('À éviter');
  });

  test('le verdict renvoyé par computeHealthScore est une clé valide de VERDICT_TXT.fr', () => {
    const r = computeHealthScore({ kcal: 250, carbs: 25, fat: 8, protein: 5 });
    expect(VERDICT_TXT.fr[r.verdict]).toBeTruthy();
  });
});
