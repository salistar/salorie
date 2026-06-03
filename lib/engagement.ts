// Moteur d'engagement Salorie — calcule, 100% cote client a partir des donnees
// deja en cache (logs, weightHistory, profile), les leviers de retention :
//   - TDEE ADAPTATIF (depense reelle estimee via tendance poids + apports, facon MacroFactor)
//   - cible calorique recommandee selon l'objectif
//   - STREAK de logging
//   - ACHIEVEMENTS / badges
//   - LECON du jour (coaching facon Noom)
import AsyncStorage from '@react-native-async-storage/async-storage';
import { emailToDocId } from './firebase';

const KCAL_PER_KG = 7700; // ~7700 kcal pour 1 kg de masse

export type Confidence = 'low' | 'medium' | 'high';
export interface Achievement { id: string; title: string; desc: string; icon: string; unlocked: boolean; }
export interface Lesson { title: string; body: string; }
export interface EngagementData {
  adaptiveTDEE: number | null;
  recommendedTarget: number | null;
  staticTarget: number | null;
  avgIntake: number | null;
  weightTrendKgPerWeek: number | null;
  confidence: Confidence;
  streak: number;
  daysTracked: number;
  weighIns: number;
  totalLogs: number;
  achievements: Achievement[];
  lesson: Lesson;
  goal: string;
}

// Micro-lecons de coaching (rotation quotidienne). Courtes, actionnables (style Noom).
const LESSONS: Lesson[] = [
  { title: "La regularite bat la perfection", body: "Logger chaque jour, meme approximativement, compte plus qu un jour parfait. L app apprend de ta tendance, pas d un seul repas." },
  { title: "Proteines = satiete", body: "Vise une source de proteines a chaque repas : tu te sentiras rassasie plus longtemps et tu preserves ton muscle en deficit." },
  { title: "L eau d abord", body: "La soif se deguise souvent en faim. Un grand verre d eau avant de grignoter coupe les fausses fringales." },
  { title: "Le poids fluctue, la tendance compte", body: "Ton poids varie de 1-2 kg par jour (eau, sel, sommeil). Regarde la COURBE sur 2 semaines, pas le chiffre du matin." },
  { title: "Assiette = moitie legumes", body: "Remplis la moitie de ton assiette de legumes : volume et fibres pour peu de calories." },
  { title: "Bouge apres les repas", body: "10 min de marche apres manger ameliorent la glycemie et la digestion. Petit effort, grand effet." },
  { title: "Dors pour maigrir", body: "Moins de 6 h de sommeil augmente la faim (ghreline) et les envies de sucre. Le sommeil fait partie du plan." },
  { title: "Planifie, ne devine pas", body: "Decider la veille de ce que tu mangeras reduit les choix impulsifs. 2 minutes de planning economisent des centaines de calories." },
  { title: "Pas d aliments interdits", body: "L interdiction nourrit l obsession. Un carre de chocolat logue vaut mieux qu une tablette en cachette." },
  { title: "Les liquides comptent", body: "Sodas, jus, lattes et alcool ajoutent des calories invisibles. Logue-les comme un repas." },
  { title: "Celebre les non-scale victories", body: "Vetements plus amples, plus d energie, meilleur sommeil : la balance n est pas le seul juge du progres." },
  { title: "Le deficit raisonnable gagne", body: "Un deficit de ~500 kcal par jour (~0,5 kg par semaine) est tenable et preserve le muscle. Trop agressif = reprise." },
  { title: "Mange en pleine conscience", body: "Pose la fourchette entre les bouchees, sans ecran. Ton cerveau met 20 min a sentir la satiete." },
  { title: "Prepare ton environnement", body: "Ce qui est visible est mange. Mets les fruits en avant, range les snacks. La volonte fatigue, pas l environnement." },
];

const ds = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

function evalAchievements(s: { streak: number; daysTracked: number; weighIns: number; totalLogs: number }): Achievement[] {
  const A = (id: string, title: string, desc: string, icon: string, unlocked: boolean): Achievement => ({ id, title, desc, icon, unlocked });
  return [
    A('first_log', 'First step', 'Log your first meal', '🍽️', s.totalLogs >= 1),
    A('streak_3', 'Getting started', '3-day logging streak', '🔥', s.streak >= 3),
    A('streak_7', 'On a roll', '7-day streak', '🔥', s.streak >= 7),
    A('streak_14', 'Committed', '14-day streak', '⚡', s.streak >= 14),
    A('streak_30', 'Unstoppable', '30-day streak', '🏆', s.streak >= 30),
    A('days_7', 'First week', '7 days tracked', '📅', s.daysTracked >= 7),
    A('days_30', 'Habit formed', '30 days tracked', '📆', s.daysTracked >= 30),
    A('weigh_1', 'Step on', 'First weigh-in', '⚖️', s.weighIns >= 1),
    A('weigh_5', 'Trend setter', '5 weigh-ins', '📉', s.weighIns >= 5),
    A('logs_50', 'Power logger', '50 logs total', '💪', s.totalLogs >= 50),
  ];
}

export async function loadEngagement(email: string): Promise<EngagementData> {
  const docId = emailToDocId(email);
  const [logsRaw, weightRaw, profileRaw] = await Promise.all([
    AsyncStorage.getItem(`logs_${docId}`),
    AsyncStorage.getItem(`weight_${docId}`),
    AsyncStorage.getItem(`profile_${docId}`),
  ]);
  const logs: any[] = logsRaw ? JSON.parse(logsRaw) : [];
  const weightHistory: any[] = weightRaw ? JSON.parse(weightRaw) : [];
  const profile: any = profileRaw ? JSON.parse(profileRaw) : {};
  const goal: string = profile.goal || 'maintain';
  const staticTarget: number | null =
    profile.dailyCalories || profile.targetCalories || profile.calorieGoal || profile.calories || null;

  // --- apports quotidiens (repas) ---
  const intakeByDate: Record<string, number> = {};
  const mealDates = new Set<string>();
  for (const l of logs) {
    if (l?.type === 'meal') {
      intakeByDate[l.date] = (intakeByDate[l.date] || 0) + (l.calories || 0);
      mealDates.add(l.date);
    }
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const windowDays = 21;
  const windowStart = new Date(today); windowStart.setDate(today.getDate() - (windowDays - 1));

  const intakeVals: number[] = [];
  for (const [d, v] of Object.entries(intakeByDate)) {
    const dd = new Date(d);
    if (dd >= windowStart && dd <= today && v > 0) intakeVals.push(v);
  }
  const avgIntake = intakeVals.length ? Math.round(intakeVals.reduce((a, b) => a + b, 0) / intakeVals.length) : null;

  // --- tendance poids + TDEE adaptatif ---
  const sortedW = weightHistory
    .filter((w: any) => w?.date && typeof w?.weight === 'number')
    .sort((a: any, b: any) => (a.date < b.date ? -1 : 1));
  const wInWindow = sortedW.filter((w: any) => new Date(w.date) >= windowStart);
  const useW = wInWindow.length >= 2 ? wInWindow : sortedW.slice(-8);

  let weightTrendKgPerWeek: number | null = null;
  let adaptiveTDEE: number | null = null;
  if (useW.length >= 2 && avgIntake != null) {
    const first = useW[0];
    const last = useW[useW.length - 1];
    const days = Math.max(1, (new Date(last.date).getTime() - new Date(first.date).getTime()) / 86400000);
    const changeKg = last.weight - first.weight;
    weightTrendKgPerWeek = +((changeKg / days) * 7).toFixed(2);
    const tdee = Math.round(avgIntake - (changeKg * KCAL_PER_KG) / days);
    adaptiveTDEE = tdee >= 1000 && tdee <= 6000 ? tdee : null; // garde-fou anti-aberration
  }

  let confidence: Confidence = 'low';
  if (intakeVals.length >= 14 && useW.length >= 3) confidence = 'high';
  else if (intakeVals.length >= 7 && useW.length >= 2) confidence = 'medium';

  let recommendedTarget: number | null = null;
  if (adaptiveTDEE != null) {
    if (goal === 'lose') recommendedTarget = Math.max(1200, adaptiveTDEE - 500);
    else if (goal === 'gain') recommendedTarget = adaptiveTDEE + 350;
    else recommendedTarget = adaptiveTDEE;
  }

  // --- streak (jours consecutifs avec un repas, en tolerant 'aujourd hui pas encore logue') ---
  const countStreakFrom = (offset: number) => {
    let s = 0;
    for (let i = offset; ; i++) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      if (mealDates.has(ds(d))) s++; else break;
    }
    return s;
  };
  let streak = countStreakFrom(0);
  if (streak === 0) streak = countStreakFrom(1); // aujourd hui pas encore logue -> on compte depuis hier

  const daysTracked = mealDates.size;
  const weighIns = sortedW.length;
  const totalLogs = logs.length;

  const achievements = evalAchievements({ streak, daysTracked, weighIns, totalLogs });
  const lesson = LESSONS[Math.floor(Date.now() / 86400000) % LESSONS.length];

  return {
    adaptiveTDEE, recommendedTarget, staticTarget, avgIntake, weightTrendKgPerWeek,
    confidence, streak, daysTracked, weighIns, totalLogs, achievements, lesson, goal,
  };
}
