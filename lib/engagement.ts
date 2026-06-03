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
const LESSONS_BY_LANG: Record<string, Lesson[]> = {
  en: [
    { title: "Consistency beats perfection", body: "Logging every day, even roughly, matters more than one perfect day. The app learns from your trend, not a single meal." },
    { title: "Protein = satiety", body: "Aim for a protein source at every meal: you stay full longer and protect muscle while in a deficit." },
    { title: "Water first", body: "Thirst often disguises itself as hunger. A big glass of water before snacking kills false cravings." },
    { title: "Weight fluctuates, the trend matters", body: "Your weight swings 1-2 kg a day (water, salt, sleep). Watch the 2-week CURVE, not the morning number." },
    { title: "Plate = half vegetables", body: "Fill half your plate with vegetables: volume and fiber for very few calories." },
    { title: "Move after meals", body: "A 10-min walk after eating improves blood sugar and digestion. Small effort, big effect." },
    { title: "Sleep to lose weight", body: "Under 6 h of sleep raises hunger (ghrelin) and sugar cravings. Sleep is part of the plan." },
    { title: "Plan, don't guess", body: "Deciding the night before what you'll eat cuts impulsive choices. 2 minutes of planning saves hundreds of calories." },
    { title: "No forbidden foods", body: "Banning a food fuels obsession. One logged square of chocolate beats a whole secret bar." },
    { title: "Liquids count", body: "Sodas, juice, lattes and alcohol add invisible calories. Log them like a meal." },
    { title: "Celebrate non-scale wins", body: "Looser clothes, more energy, better sleep: the scale isn't the only judge of progress." },
    { title: "A sensible deficit wins", body: "A ~500 kcal/day deficit (~0.5 kg/week) is sustainable and spares muscle. Too aggressive = rebound." },
    { title: "Eat mindfully", body: "Put the fork down between bites, no screen. Your brain needs 20 min to feel full." },
    { title: "Prepare your environment", body: "What's visible gets eaten. Put fruit in front, stash the snacks. Willpower tires, your environment doesn't." },
  ],
  fr: [
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
  ],
  ar: [
    { title: "الانتظام يتفوق على الكمال", body: "التسجيل كل يوم، ولو تقريبيًا، أهم من يوم مثالي واحد. التطبيق يتعلّم من اتجاهك لا من وجبة واحدة." },
    { title: "البروتين = الشبع", body: "اجعل لكل وجبة مصدر بروتين: تبقى شبعانًا أطول وتحافظ على عضلاتك أثناء العجز." },
    { title: "الماء أولًا", body: "العطش كثيرًا ما يتنكّر في صورة جوع. كوب ماء كبير قبل التسالي يقتل الرغبات الكاذبة." },
    { title: "الوزن يتذبذب، الاتجاه هو المهم", body: "وزنك يتغير 1-2 كجم يوميًا (ماء، ملح، نوم). راقب منحنى الأسبوعين لا رقم الصباح." },
    { title: "الطبق = نصف خضار", body: "املأ نصف طبقك بالخضار: حجم وألياف بسعرات قليلة جدًا." },
    { title: "تحرّك بعد الأكل", body: "مشي 10 دقائق بعد الأكل يحسّن السكر في الدم والهضم. جهد بسيط بأثر كبير." },
    { title: "نَم لتخسر الوزن", body: "أقل من 6 ساعات نوم يرفع الجوع (الجريلين) والرغبة في السكر. النوم جزء من الخطة." },
    { title: "خطّط ولا تخمّن", body: "تحديد ما ستأكله من الليلة يقلّل الخيارات الاندفاعية. دقيقتان تخطيط توفّر مئات السعرات." },
    { title: "لا أطعمة محرّمة", body: "تحريم طعام يغذّي الهوس. مربع شوكولاتة مُسجّل أفضل من لوح كامل سرًّا." },
    { title: "السوائل تُحتسب", body: "المشروبات الغازية والعصائر واللاتيه والكحول تضيف سعرات خفية. سجّلها كوجبة." },
    { title: "احتفِ بالإنجازات خارج الميزان", body: "ملابس أوسع، طاقة أكثر، نوم أفضل: الميزان ليس الحكم الوحيد على تقدّمك." },
    { title: "العجز المعقول يفوز", body: "عجز ~500 سعرة/يوم (~0.5 كجم/أسبوع) قابل للاستمرار ويحافظ على العضل. المبالغة = ارتداد." },
    { title: "كُل بوعي", body: "ضع الشوكة بين القضمات بلا شاشة. دماغك يحتاج 20 دقيقة ليشعر بالشبع." },
    { title: "هيّئ بيئتك", body: "ما يُرى يؤكل. ضع الفاكهة في المقدمة وأخفِ التسالي. الإرادة تتعب، البيئة لا." },
  ],
};

const ds = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const ACH_DEFS: { id: string; icon: string; test: (s: any) => boolean }[] = [
  { id: 'first_log', icon: '🍽️', test: (s) => s.totalLogs >= 1 },
  { id: 'streak_3', icon: '🔥', test: (s) => s.streak >= 3 },
  { id: 'streak_7', icon: '🔥', test: (s) => s.streak >= 7 },
  { id: 'streak_14', icon: '⚡', test: (s) => s.streak >= 14 },
  { id: 'streak_30', icon: '🏆', test: (s) => s.streak >= 30 },
  { id: 'days_7', icon: '📅', test: (s) => s.daysTracked >= 7 },
  { id: 'days_30', icon: '📆', test: (s) => s.daysTracked >= 30 },
  { id: 'weigh_1', icon: '⚖️', test: (s) => s.weighIns >= 1 },
  { id: 'weigh_5', icon: '📉', test: (s) => s.weighIns >= 5 },
  { id: 'logs_50', icon: '💪', test: (s) => s.totalLogs >= 50 },
];

const ACH_LABELS: Record<string, Record<string, { title: string; desc: string }>> = {
  en: {
    first_log: { title: 'First step', desc: 'Log your first meal' },
    streak_3: { title: 'Getting started', desc: '3-day logging streak' },
    streak_7: { title: 'On a roll', desc: '7-day streak' },
    streak_14: { title: 'Committed', desc: '14-day streak' },
    streak_30: { title: 'Unstoppable', desc: '30-day streak' },
    days_7: { title: 'First week', desc: '7 days tracked' },
    days_30: { title: 'Habit formed', desc: '30 days tracked' },
    weigh_1: { title: 'Step on', desc: 'First weigh-in' },
    weigh_5: { title: 'Trend setter', desc: '5 weigh-ins' },
    logs_50: { title: 'Power logger', desc: '50 logs total' },
  },
  fr: {
    first_log: { title: 'Premier pas', desc: 'Logue ton premier repas' },
    streak_3: { title: 'C\'est parti', desc: 'Série de 3 jours' },
    streak_7: { title: 'Lancé', desc: 'Série de 7 jours' },
    streak_14: { title: 'Engagé', desc: 'Série de 14 jours' },
    streak_30: { title: 'Inarrêtable', desc: 'Série de 30 jours' },
    days_7: { title: 'Première semaine', desc: '7 jours suivis' },
    days_30: { title: 'Habitude prise', desc: '30 jours suivis' },
    weigh_1: { title: 'Sur la balance', desc: 'Première pesée' },
    weigh_5: { title: 'Tendance', desc: '5 pesées' },
    logs_50: { title: 'Logger pro', desc: '50 logs au total' },
  },
  ar: {
    first_log: { title: 'الخطوة الأولى', desc: 'سجّل أول وجبة' },
    streak_3: { title: 'انطلقت', desc: 'سلسلة 3 أيام' },
    streak_7: { title: 'في تصاعد', desc: 'سلسلة 7 أيام' },
    streak_14: { title: 'ملتزم', desc: 'سلسلة 14 يومًا' },
    streak_30: { title: 'لا يُوقَف', desc: 'سلسلة 30 يومًا' },
    days_7: { title: 'أول أسبوع', desc: '7 أيام مسجّلة' },
    days_30: { title: 'تكوّنت العادة', desc: '30 يومًا مسجّلة' },
    weigh_1: { title: 'على الميزان', desc: 'أول وزن' },
    weigh_5: { title: 'متتبّع الاتجاه', desc: '5 أوزان' },
    logs_50: { title: 'مُسجّل محترف', desc: '50 سجلًا' },
  },
};

function evalAchievements(s: { streak: number; daysTracked: number; weighIns: number; totalLogs: number }, lang: string): Achievement[] {
  const L = ACH_LABELS[lang] || ACH_LABELS.en;
  return ACH_DEFS.map((a) => ({ id: a.id, icon: a.icon, unlocked: a.test(s), title: L[a.id].title, desc: L[a.id].desc }));
}

export async function loadEngagement(email: string, lang: string = 'en'): Promise<EngagementData> {
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

  const achievements = evalAchievements({ streak, daysTracked, weighIns, totalLogs }, lang);
  const lessons = LESSONS_BY_LANG[lang] || LESSONS_BY_LANG.en;
  const lesson = lessons[Math.floor(Date.now() / 86400000) % lessons.length];

  return {
    adaptiveTDEE, recommendedTarget, staticTarget, avgIntake, weightTrendKgPerWeek,
    confidence, streak, daysTracked, weighIns, totalLogs, achievements, lesson, goal,
  };
}
