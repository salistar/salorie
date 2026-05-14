import { GoogleGenerativeAI } from '@google/generative-ai';
import { CONFIG } from '../constants/config';
import { UserProfile } from './firebase';

const genAI = new GoogleGenerativeAI(CONFIG.geminiApiKey);

export interface NutritionalPlan {
  dailyCalories: number;
  proteins: number; // in grams
  carbs: number; // in grams
  fats: number; // in grams
  waterIntake: number; // in liters
  advice: string[];
}

export const generateNutritionalPlan = async (userProfile: Partial<UserProfile>, language: 'en' | 'fr' | 'ar' = 'en'): Promise<NutritionalPlan> => {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const langLabel = language === 'fr' ? 'French' : language === 'ar' ? 'Arabic' : 'English';

  const prompt = `
    Analyze this user profile for a fitness and nutrition plan:
    - Gender: ${userProfile.gender}
    - Goal: ${userProfile.goal} (e.g., lose, gain, maintain weight)
    - Workout Frequency: ${userProfile.workoutFrequency}
    - Birthdate: ${userProfile.birthdate}
    - Height: ${userProfile.height?.feet} feet ${userProfile.height?.inches} inches
    - Weight: ${userProfile.weight} kg

    Based on this data, provide a structured nutritional plan in JSON format.
    Return ONLY the JSON object with the following keys:
    {
      "dailyCalories": number,
      "proteins": number (in grams),
      "carbs": number (in grams),
      "fats": number (in grams),
      "waterIntake": number (in liters),
      "advice": [string, string, string]
    }
    IMPORTANT: The "advice" array strings MUST be written in ${langLabel}.
    Be accurate and professional. Use the Mifflin-St Jeor Equation for BMR and apply Activity Factor.
  `;

  try {
    console.log('\x1b[32m[API→Gemini] generateNutritionalPlan REQUEST\x1b[0m', {
      model: 'gemini-2.5-flash',
      language,
      profile: userProfile,
      promptChars: prompt.length,
    });
    const t0 = Date.now();
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    console.log('\x1b[34m[API←Gemini] generateNutritionalPlan RESPONSE\x1b[0m', {
      ms: Date.now() - t0,
      chars: text.length,
      preview: text.slice(0, 300),
    });

    // Extract JSON from the response (sometimes Gemini wraps JSON in code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid AI response');

    const parsed = JSON.parse(jsonMatch[0]);
    console.log('\x1b[34m[API←Gemini] generateNutritionalPlan PARSED\x1b[0m', parsed);
    return parsed;
  } catch (error) {
    console.warn('\x1b[34m[API←Gemini] generateNutritionalPlan FAILED:\x1b[0m', (error as Error).message);
    throw error;
  }
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
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
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
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

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
