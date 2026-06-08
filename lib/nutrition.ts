// Deterministic nutrition math — NO AI calls.
// Calorie targets via the Mifflin-St Jeor equation + activity factor + goal,
// macro split and water intake by standard rules. Used to replace the Gemini
// call for the onboarding nutritional plan (and meal-plan targets).
import { UserProfile } from './firebase';

export interface NutritionTargets {
  dailyCalories: number;
  proteins: number; // g
  carbs: number;    // g
  fats: number;     // g
  waterIntake: number; // liters
}

function ageFromBirthdate(b?: string | Date): number {
  if (!b) return 30;
  const d = new Date(b as any);
  if (isNaN(d.getTime())) return 30;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return Math.max(13, Math.min(100, a));
}

function heightCm(p: Partial<UserProfile>): number {
  const h: any = (p as any).height;
  if (typeof h === 'number') return h;                    // already cm
  if (h && (h.feet != null || h.inches != null)) {
    return Math.round(((Number(h.feet) || 0) * 12 + (Number(h.inches) || 0)) * 2.54);
  }
  return 170;
}

// Activity factor from workoutFrequency (handles numbers or strings like "3-4").
function activityFactor(freq?: any): number {
  let n = 0;
  if (typeof freq === 'number') n = freq;
  else if (typeof freq === 'string') { const m = freq.match(/\d+/); n = m ? parseInt(m[0], 10) : 0; }
  if (n <= 0) return 1.2;       // sedentary
  if (n <= 1) return 1.3;
  if (n <= 3) return 1.45;      // light
  if (n <= 5) return 1.6;       // moderate
  return 1.75;                  // very active
}

export function computeNutritionTargets(p: Partial<UserProfile>): NutritionTargets {
  const weight = Number((p as any).weight) || 70;       // kg
  const cm = heightCm(p);
  const age = ageFromBirthdate((p as any).birthdate);
  const isMale = String((p as any).gender || '').toLowerCase().startsWith('m');

  // Mifflin-St Jeor BMR
  const bmr = 10 * weight + 6.25 * cm - 5 * age + (isMale ? 5 : -161);
  let tdee = bmr * activityFactor((p as any).workoutFrequency);

  // Goal adjustment
  const goal = String((p as any).goal || 'maintain').toLowerCase();
  if (goal.includes('lose') || goal.includes('perd') || goal.includes('lean')) tdee -= 500;
  else if (goal.includes('gain') || goal.includes('prise') || goal.includes('muscle') || goal.includes('bulk')) tdee += 400;

  const dailyCalories = Math.max(1200, Math.round(tdee / 10) * 10);

  // Macros: protein ~1.8 g/kg, fat 25% kcal, carbs = remainder.
  const proteins = Math.round(weight * 1.8);
  const fats = Math.round((dailyCalories * 0.25) / 9);
  const carbs = Math.max(0, Math.round((dailyCalories - proteins * 4 - fats * 9) / 4));
  const waterIntake = Math.round((weight * 0.035) * 10) / 10; // ~35 ml/kg → L

  return { dailyCalories, proteins, carbs, fats, waterIntake };
}

// Canned, localized advice per goal — 0 AI. Keeps the plan fully offline.
export function nutritionAdvice(goal: string | undefined, lang: 'en' | 'fr' | 'ar'): string[] {
  const g = String(goal || 'maintain').toLowerCase();
  const kind = g.includes('lose') || g.includes('perd') ? 'lose' : (g.includes('gain') || g.includes('muscle') || g.includes('prise') ? 'gain' : 'maintain');
  const A: Record<string, Record<string, string[]>> = {
    en: {
      lose: ['Aim for a steady 0.5 kg/week loss — avoid crash diets.', 'Prioritize protein and fiber to stay full.', 'Walk 8–10k steps daily to widen your deficit.'],
      gain: ['Eat in a small surplus and lift progressively.', 'Spread protein across 3–4 meals.', 'Sleep 7–9 h — muscle grows at rest.'],
      maintain: ['Keep meals balanced and consistent.', 'Stay hydrated and move daily.', 'Weigh weekly to catch drift early.'],
    },
    fr: {
      lose: ['Vise une perte régulière de 0,5 kg/semaine — évite les régimes drastiques.', 'Priorise protéines et fibres pour la satiété.', 'Marche 8–10k pas/jour pour creuser le déficit.'],
      gain: ['Mange en léger surplus et augmente les charges.', 'Répartis les protéines sur 3–4 repas.', 'Dors 7–9 h — le muscle pousse au repos.'],
      maintain: ['Garde des repas équilibrés et réguliers.', 'Reste hydraté et bouge chaque jour.', 'Pèse-toi chaque semaine pour ajuster tôt.'],
    },
    ar: {
      lose: ['استهدف خسارة ثابتة 0.5 كغ/أسبوع — تجنّب الحميات القاسية.', 'أعطِ الأولوية للبروتين والألياف للشبع.', 'امشِ 8–10 آلاف خطوة يوميًا لتوسيع العجز.'],
      gain: ['تناول فائضًا بسيطًا وزِد الأوزان تدريجيًا.', 'وزّع البروتين على 3–4 وجبات.', 'نَم 7–9 ساعات — العضلات تنمو أثناء الراحة.'],
      maintain: ['حافظ على وجبات متوازنة ومنتظمة.', 'ابقَ رطبًا وتحرّك يوميًا.', 'زِن نفسك أسبوعيًا لرصد أي انحراف مبكرًا.'],
    },
  };
  return (A[lang] || A.en)[kind];
}
