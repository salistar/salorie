// Les libelles de scoreFood suivent-ils reellement la langue demandee ?
//
// Ce test existe a cause d'un piege rencontre en l'ecrivant : safeCtx normalise le
// contexte champ par champ et ne recopiait pas `lang`. Tout le cablage etait donc inerte
// — l'application serait restee en francais sans qu'aucune erreur ne le signale, et
// aucun type ne l'aurait vu. Un test qui compare deux langues l'attrape, pas une
// relecture.
import { scoreFood, type ObjectiveContext, type FoodCandidate } from '../lib/objective/scoring';

const base: ObjectiveContext = {
  goal: 'lose',
  tdee: 2200,
  dailyKcalTarget: 1800,
  remainingKcal: 900,
  macroTargets: { protein: 120, carbs: 180, fat: 60 },
  remainingMacros: { protein: 60, carbs: 90, fat: 30 },
  diet: [],
  allergies: [],
  dislikes: [],
  conditions: [],
};

// Aliment tres sucre : declenche la reason « diabete » quand la condition est declaree.
const sugary: FoodCandidate = {
  name: 'soda',
  kcal: 150,
  protein: 0,
  carbs: 39,
  fat: 0,
  tags: ['sugary'],
};

describe('scoreFood — langue des reasons', () => {
  it('sans langue : francais, comme avant', () => {
    const r = scoreFood(sugary, { ...base, conditions: ['diabetes'] });
    expect(r.reasons.join(' | ')).toMatch(/diabete|diabète/i);
    expect(r.reasons.join(' | ')).toMatch(/medecin|médecin/i);
  });

  it('lang=en : aucun libelle francais', () => {
    const r = scoreFood(sugary, { ...base, conditions: ['diabetes'], lang: 'en' });
    const all = r.reasons.join(' | ');
    expect(all).toMatch(/diabetes/i);
    expect(all).toMatch(/doctor/i);
    // Le point qui compte : plus aucune trace de francais.
    expect(all).not.toMatch(/medecin|médecin|a limiter|à limiter/i);
  });

  it('lang=ar : libelles arabes', () => {
    const r = scoreFood(sugary, { ...base, conditions: ['diabetes'], lang: 'ar' });
    const all = r.reasons.join(' | ');
    expect(all).toMatch(/[؀-ۿ]/); // au moins un caractere arabe
    expect(all).not.toMatch(/medecin|médecin|doctor/i);
  });

  it('langue inconnue : repli francais plutot que libelle vide', () => {
    const r = scoreFood(sugary, { ...base, conditions: ['diabetes'], lang: 'zz' as any });
    expect(r.reasons.join(' | ')).toMatch(/diabete|diabète/i);
    r.reasons.forEach((x) => expect(x.trim().length).toBeGreaterThan(0));
  });

  it('les trois langues donnent le MEME score : seul le libelle change', () => {
    const fr = scoreFood(sugary, { ...base, conditions: ['diabetes'] });
    const en = scoreFood(sugary, { ...base, conditions: ['diabetes'], lang: 'en' });
    const ar = scoreFood(sugary, { ...base, conditions: ['diabetes'], lang: 'ar' });
    expect(en.fit).toBe(fr.fit);
    expect(ar.fit).toBe(fr.fit);
    expect(en.verdict).toBe(fr.verdict);
    expect(en.reasons.length).toBe(fr.reasons.length);
  });
});
