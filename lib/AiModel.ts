import { CONFIG } from '../constants/config';
import { UserProfile } from './firebase';
import { computeNutritionTargets, nutritionAdvice } from './nutrition';
import { geminiShim } from './aiProxy';

// Gemini now runs server-side via the backend /ai proxy (no key in the client).
const genAI = geminiShim;

// Model tiers — use the cheap/fast model for simple structured tasks (micros,
// insights, tips) and reserve the standard flash model for richer generation.
const MODEL = process.env.EXPO_PUBLIC_GEMINI_MODEL || 'gemini-2.5-flash';
const MODEL_LITE = process.env.EXPO_PUBLIC_GEMINI_LITE_MODEL || 'gemini-2.0-flash-lite';

export interface NutritionalPlan {
  dailyCalories: number;
  proteins: number; // in grams
  carbs: number; // in grams
  fats: number; // in grams
  waterIntake: number; // in liters
  advice: string[];
}

// Fully DETERMINISTIC now — Mifflin-St Jeor + macro rules + canned localized
// advice. Zero Gemini calls (this used to be one AI round-trip per onboarding).
export const generateNutritionalPlan = async (userProfile: Partial<UserProfile>, language: 'en' | 'fr' | 'ar' = 'en'): Promise<NutritionalPlan> => {
  const t = computeNutritionTargets(userProfile);
  console.log('[nutrition] computed targets (no AI)', t);
  return {
    dailyCalories: t.dailyCalories,
    proteins: t.proteins,
    carbs: t.carbs,
    fats: t.fats,
    waterIntake: t.waterIntake,
    advice: nutritionAdvice((userProfile as any).goal, language),
  };
};

export interface BentoInsight {
  summary: string;
  topFood: string;
  hydrationStatus: string;
  recommendation: string;
  exerciseAnalysis: string;
  healthScore: number;
}

export interface MultilangBentoInsight {
  healthScore: number;
  // One object per language so the doc can be read instantly in any locale
  // without another AI call.
  en: Omit<BentoInsight, 'healthScore'>;
  fr: Omit<BentoInsight, 'healthScore'>;
  ar: Omit<BentoInsight, 'healthScore'>;
  /** 'ai' if Gemini produced it, 'computed' if the offline fallback did. */
  source?: 'ai' | 'computed';
}

/**
 * Generates a Bento insight block translated in EN / FR / AR in a SINGLE
 * Gemini round-trip. Used by InsightsService for period-scoped cards
 * (this week / this month / all time) so switching the UI language is free
 * after the first generation.
 *
 * `periodLabel` is a human hint for the prompt ("this week", "this month", …).
 */
export const generateMultilangBentoInsights = async (
  userProfile: Partial<UserProfile>,
  logs: any[],
  periodLabel: string,
): Promise<MultilangBentoInsight> => {
  const model = genAI.getGenerativeModel({ model: MODEL_LITE });
  const logsSummary = logs
    .slice(-200)
    .map(l => `${l.date}: ${l.name} (${l.calories} ${l.type === 'water' ? 'ml' : 'kcal'}, ${l.type}${l.intensity ? ', ' + l.intensity : ''})`)
    .join('\n');

  const prompt = `
You are a nutrition & fitness analyst. Analyse the user's ${periodLabel} logs.
User goal: ${userProfile.goal}
Current weight: ${userProfile.weight}kg

Logs (${logs.length}):
${logsSummary || 'No logs yet.'}

Return ONLY strict JSON, no backticks, with this exact shape:
{
  "healthScore": number,              // 0-100, consistency + goal adherence
  "en": { "summary": "...", "topFood": "...", "hydrationStatus": "...", "recommendation": "...", "exerciseAnalysis": "..." },
  "fr": { "summary": "...", "topFood": "...", "hydrationStatus": "...", "recommendation": "...", "exerciseAnalysis": "..." },
  "ar": { "summary": "...", "topFood": "...", "hydrationStatus": "...", "recommendation": "...", "exerciseAnalysis": "..." }
}

Rules:
- summary: 1 sentence overlook of the ${periodLabel}.
- topFood: most frequent food/category, or "—" if none.
- hydrationStatus: one word (Excellent / Good / Low / Dehydrated / Unknown and translations).
- recommendation: < 15 words, actionable.
- exerciseAnalysis: 1-2 sentences on the activity log — intensity, frequency, burned kcal trend.
- The "fr" fields MUST be in French, the "ar" fields MUST be in Arabic, the "en" fields in English.
`;

  try {
    console.log('\x1b[32m[API→Gemini] generateMultilangBentoInsights REQUEST\x1b[0m', {
      model: 'gemini-2.5-flash',
      periodLabel,
      profile: { goal: userProfile.goal, weight: userProfile.weight },
      logsCount: logs.length,
      promptChars: prompt.length,
    });
    const t0 = Date.now();
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    console.log('\x1b[34m[API←Gemini] generateMultilangBentoInsights RESPONSE\x1b[0m', {
      ms: Date.now() - t0,
      chars: text.length,
      preview: text.slice(0, 400),
    });
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid AI response');
    const parsed = JSON.parse(jsonMatch[0]);

    // Patch: Gemini occasionally omits a field. Fill any missing slot from the
    // deterministic offline computation so every card always has content.
    const offline = buildOfflineMultilangInsight(logs, periodLabel);
    const langs: Array<'en' | 'fr' | 'ar'> = ['en', 'fr', 'ar'];
    const keys: Array<keyof Omit<BentoInsight, 'healthScore'>> = [
      'summary', 'topFood', 'hydrationStatus', 'recommendation', 'exerciseAnalysis',
    ];
    for (const l of langs) {
      parsed[l] = parsed[l] || {};
      for (const k of keys) {
        const v = parsed[l][k];
        if (!v || typeof v !== 'string' || !v.trim() || v === '—') {
          parsed[l][k] = (offline as any)[l][k];
        }
      }
    }
    if (typeof parsed.healthScore !== 'number' || !parsed.healthScore) {
      parsed.healthScore = offline.healthScore;
    }
    console.log('\x1b[34m[API←Gemini] generateMultilangBentoInsights PARSED\x1b[0m', {
      healthScore: parsed.healthScore,
      en_summary: parsed.en?.summary,
      fr_summary: parsed.fr?.summary,
      ar_summary: parsed.ar?.summary,
      exerciseAnalysis_en: parsed.en?.exerciseAnalysis,
    });
    return { ...parsed, source: 'ai' as const };
  } catch (e) {
    console.warn('\x1b[34m[API←Gemini] generateMultilangBentoInsights FAILED — offline fallback:\x1b[0m', (e as Error).message);
    return buildOfflineMultilangInsight(logs, periodLabel);
  }
};

/**
 * Deterministic, no-AI fallback. Computes a meaningful 3-language summary from
 * the raw logs so the analytics cards never show "—" when the model is down.
 */
function buildOfflineMultilangInsight(logs: any[], periodLabel: string): MultilangBentoInsight {
  const meals = logs.filter(l => l.type === 'meal');
  const activities = logs.filter(l => l.type === 'activity');
  const waters = logs.filter(l => l.type === 'water');

  const totalKcal = meals.reduce((a, l) => a + (l.calories || 0), 0);
  const burnedKcal = activities.reduce((a, l) => a + (l.calories || 0), 0);
  const totalWaterMl = waters.reduce((a, l) => a + (l.calories || 0), 0);
  const days = new Set(logs.map(l => l.date)).size || 1;
  const avgWaterMl = Math.round(totalWaterMl / days);

  // top food
  const freq: Record<string, number> = {};
  for (const m of meals) freq[m.name] = (freq[m.name] || 0) + 1;
  const topFood = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

  const hydrationEN = avgWaterMl >= 2200 ? 'Excellent' : avgWaterMl >= 1500 ? 'Good' : avgWaterMl >= 800 ? 'Low' : 'Dehydrated';
  const hydrationFR = avgWaterMl >= 2200 ? 'Excellent' : avgWaterMl >= 1500 ? 'Bon' : avgWaterMl >= 800 ? 'Faible' : 'Déshydraté';
  const hydrationAR = avgWaterMl >= 2200 ? 'ممتاز' : avgWaterMl >= 1500 ? 'جيد' : avgWaterMl >= 800 ? 'منخفض' : 'جفاف';

  const healthScore = Math.max(0, Math.min(100,
    Math.round(40 + (meals.length > 0 ? 20 : 0) + (activities.length * 3) + (avgWaterMl / 100)),
  ));

  const en = {
    summary: `${meals.length} meals and ${activities.length} workouts logged over ${days} day(s).`,
    topFood,
    hydrationStatus: hydrationEN,
    recommendation: avgWaterMl < 1500
      ? 'Add 500 ml of water tomorrow to hit your target.'
      : activities.length < 3
        ? 'Aim for at least 3 workouts this period.'
        : 'Keep up the consistency — you are on track!',
    exerciseAnalysis: activities.length
      ? `${activities.length} sessions, ~${burnedKcal} kcal burned ${periodLabel}.`
      : `No activity logged ${periodLabel}.`,
  };
  const fr = {
    summary: `${meals.length} repas et ${activities.length} séances enregistrés sur ${days} jour(s).`,
    topFood,
    hydrationStatus: hydrationFR,
    recommendation: avgWaterMl < 1500
      ? 'Ajoute 500 ml d\'eau demain pour atteindre ton objectif.'
      : activities.length < 3
        ? 'Vise au moins 3 séances sur cette période.'
        : 'Continue comme ça — tu es sur la bonne voie !',
    exerciseAnalysis: activities.length
      ? `${activities.length} séances, ~${burnedKcal} kcal brûlées ${periodLabel === 'this week' ? 'cette semaine' : periodLabel === 'this month' ? 'ce mois-ci' : 'au total'}.`
      : `Aucune activité enregistrée ${periodLabel === 'this week' ? 'cette semaine' : periodLabel === 'this month' ? 'ce mois-ci' : ''}.`,
  };
  const ar = {
    summary: `${meals.length} وجبات و ${activities.length} تمارين خلال ${days} يوم.`,
    topFood,
    hydrationStatus: hydrationAR,
    recommendation: avgWaterMl < 1500
      ? 'أضف 500 مل من الماء غدًا لتحقيق هدفك.'
      : activities.length < 3
        ? 'استهدف 3 جلسات على الأقل خلال هذه الفترة.'
        : 'استمر هكذا — أنت على الطريق الصحيح!',
    exerciseAnalysis: activities.length
      ? `${activities.length} جلسات، تم حرق ~${burnedKcal} سعرة حرارية.`
      : 'لا يوجد نشاط مسجل.',
  };
  return { healthScore, en, fr, ar, source: 'computed' };
}

export const generateBentoInsights = async (
  userProfile: Partial<UserProfile>,
  logs: any[],
  language: 'en' | 'fr' | 'ar' = 'en'
): Promise<BentoInsight> => {
  const model = genAI.getGenerativeModel({ model: MODEL_LITE });

  const langLabel = language === 'fr' ? 'French' : language === 'ar' ? 'Arabic' : 'English';
  const logsSummary = logs.map(l => `${l.date}: ${l.name} (${l.calories} kcal, ${l.type})`).join('\n');

  const prompt = `
    Analyze this user's nutritional and activity logs for the past 7 days:
    User Goal: ${userProfile.goal}
    Current Weight: ${userProfile.weight}kg

    Logs:
    ${logsSummary || "No logs yet."}

    Generate a personalized "Bento Grid" analysis in JSON format.
    Return ONLY the JSON object with these keys:
    {
      "summary": "Short 1-sentence weekly overlook",
      "topFood": "The most frequent food item or category logged",
      "hydrationStatus": "One word status (e.g. Excellent, Dehydrated, Good)",
      "recommendation": "One actionable next step for the user (staying under 15 words)",
      "healthScore": number (0-100 score based on consistency and goals)
    }
    IMPORTANT: All text fields (summary, topFood, hydrationStatus, recommendation) MUST be written in ${langLabel}.
  `;

  try {
    console.log('\x1b[32m[API→Gemini] generateBentoInsights REQUEST\x1b[0m', {
      model: 'gemini-2.5-flash',
      language,
      logsCount: logs.length,
      promptChars: prompt.length,
    });
    const t0 = Date.now();
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    console.log('\x1b[34m[API←Gemini] generateBentoInsights RESPONSE\x1b[0m', {
      ms: Date.now() - t0,
      chars: text.length,
      preview: text.slice(0, 300),
    });
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid AI response');
    const parsed = JSON.parse(jsonMatch[0]);
    console.log('\x1b[34m[API←Gemini] generateBentoInsights PARSED\x1b[0m', parsed);
    return parsed;
  } catch (error) {
    console.error('\x1b[34m[API←Gemini] generateBentoInsights FAILED:\x1b[0m', error);
    return {
      summary: "Track more meals to get AI insights!",
      topFood: "None yet",
      hydrationStatus: "Unknown",
      recommendation: "Log your first meal to start.",
      healthScore: 0
    };
  }
};

// ───────────────────────── AI MEAL PLANNER ─────────────────────────
export interface MealPlanMeal {
  type: string;        // Breakfast / Lunch / Dinner / Snack (localized)
  title: string;       // dish name
  items: string[];     // ingredients / components
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}
export interface Micro { name: string; amount: string; pct: number; } // pct of RDA (0-100+)
export interface MealPlan {
  meals: MealPlanMeal[];
  totals: { calories: number; protein: number; carbs: number; fat: number };
  micros: Micro[];
  tip: string;
}

export interface MealPlanInput {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  goal?: string;
  diet?: string;            // e.g. "balanced", "high-protein", "vegetarian", "halal"...
  language?: 'en' | 'fr' | 'ar';
}

const langName = (l?: string) => (l === 'fr' ? 'French' : l === 'ar' ? 'Arabic' : 'English');

export const generateMealPlan = async (input: MealPlanInput): Promise<MealPlan> => {
  const model = genAI.getGenerativeModel({ model: MODEL });
  const lang = input.language || 'en';
  const prompt = `
You are a registered dietitian. Build a realistic, tasty ONE-DAY meal plan.

Daily targets:
- Calories: ${input.calories} kcal
- Protein: ${input.protein} g
- Carbs: ${input.carbs} g
- Fat: ${input.fat} g
Goal: ${input.goal || 'maintain'}
Diet preference: ${input.diet || 'balanced, no restriction'}

Write ALL human-readable text (meal types, titles, items, micro names, tip) in ${langName(lang)}.
Return ONLY strict JSON (no backticks, no commentary) with this exact shape:
{
  "meals": [
    { "type": "Breakfast", "title": "...", "items": ["...","..."], "calories": 0, "protein": 0, "carbs": 0, "fat": 0 },
    { "type": "Lunch", "title": "...", "items": ["..."], "calories": 0, "protein": 0, "carbs": 0, "fat": 0 },
    { "type": "Dinner", "title": "...", "items": ["..."], "calories": 0, "protein": 0, "carbs": 0, "fat": 0 },
    { "type": "Snack", "title": "...", "items": ["..."], "calories": 0, "protein": 0, "carbs": 0, "fat": 0 }
  ],
  "totals": { "calories": 0, "protein": 0, "carbs": 0, "fat": 0 },
  "micros": [
    { "name": "Fiber", "amount": "30 g", "pct": 100 },
    { "name": "Sodium", "amount": "1800 mg", "pct": 78 },
    { "name": "Potassium", "amount": "3500 mg", "pct": 74 },
    { "name": "Calcium", "amount": "1000 mg", "pct": 100 },
    { "name": "Iron", "amount": "14 mg", "pct": 78 },
    { "name": "Vitamin C", "amount": "90 mg", "pct": 100 },
    { "name": "Vitamin D", "amount": "12 mcg", "pct": 60 }
  ],
  "tip": "..."
}

Rules:
- The 4 meals' calories/macros MUST sum close (±5%) to the daily targets.
- "micros": estimate the day's key micronutrients with realistic amounts and pct of the adult RDA.
- "tip": one short actionable sentence (< 20 words).
- Keep dishes simple and commonly available.`;

  try {
    console.log('[API->Gemini] generateMealPlan REQUEST', { calories: input.calories, lang });
    const t0 = Date.now();
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    console.log('[API<-Gemini] generateMealPlan RESPONSE', { ms: Date.now() - t0, chars: text.length });
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('Invalid AI response');
    const parsed = JSON.parse(m[0]) as MealPlan;
    if (!parsed.meals || !Array.isArray(parsed.meals)) throw new Error('No meals in response');
    parsed.micros = Array.isArray(parsed.micros) ? parsed.micros : [];
    if (!parsed.totals) {
      parsed.totals = parsed.meals.reduce(
        (a, x) => ({ calories: a.calories + (x.calories || 0), protein: a.protein + (x.protein || 0), carbs: a.carbs + (x.carbs || 0), fat: a.fat + (x.fat || 0) }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
      );
    }
    return parsed;
  } catch (error) {
    console.error('[API<-Gemini] generateMealPlan FAILED:', (error as Error).message);
    throw error;
  }
};

// ──────────────── MICRONUTRIENTS for LOGGED foods ────────────────
export interface MicroReport {
  micros: Micro[];     // estimated day total, pct = % of adult RDA
  highlight: string;   // best-covered nutrient (short)
  gap: string;         // most lacking nutrient + a quick fix (short)
}

export const estimateMicros = async (
  foods: { name: string; calories?: number }[],
  language: 'en' | 'fr' | 'ar' = 'en'
): Promise<MicroReport> => {
  const model = genAI.getGenerativeModel({ model: MODEL_LITE });
  const list = foods.map(f => `- ${f.name}${f.calories ? ` (${Math.round(f.calories)} kcal)` : ''}`).join('\n');
  const prompt = `
You are a registered dietitian. Estimate the TOTAL micronutrients a person consumed today from these logged foods:
${list || '(no foods)'}

Write ALL human-readable text in ${langName(language)}.
Return ONLY strict JSON (no backticks):
{
  "micros": [
    { "name": "Fiber", "amount": "22 g", "pct": 73 },
    { "name": "Sodium", "amount": "1600 mg", "pct": 70 },
    { "name": "Potassium", "amount": "2600 mg", "pct": 55 },
    { "name": "Calcium", "amount": "780 mg", "pct": 78 },
    { "name": "Iron", "amount": "9 mg", "pct": 64 },
    { "name": "Magnesium", "amount": "260 mg", "pct": 62 },
    { "name": "Vitamin C", "amount": "70 mg", "pct": 78 },
    { "name": "Vitamin D", "amount": "3 mcg", "pct": 20 },
    { "name": "Vitamin A", "amount": "600 mcg", "pct": 67 },
    { "name": "Vitamin B12", "amount": "2 mcg", "pct": 83 }
  ],
  "highlight": "...",
  "gap": "..."
}

Rules:
- pct = % of the adult Recommended Daily Allowance (can exceed 100).
- Base the estimate on the foods listed; if the list is empty, return all pct = 0.
- "highlight": the best-covered nutrient, < 12 words.
- "gap": the most lacking nutrient + one food to fix it, < 18 words.`;

  try {
    console.log('[API->Gemini] estimateMicros REQUEST', { foods: foods.length, language });
    const t0 = Date.now();
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    console.log('[API<-Gemini] estimateMicros RESPONSE', { ms: Date.now() - t0, chars: text.length });
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('Invalid AI response');
    const parsed = JSON.parse(m[0]) as MicroReport;
    parsed.micros = Array.isArray(parsed.micros) ? parsed.micros : [];
    parsed.highlight = parsed.highlight || '';
    parsed.gap = parsed.gap || '';
    return parsed;
  } catch (error) {
    console.error('[API<-Gemini] estimateMicros FAILED:', (error as Error).message);
    throw error;
  }
};
