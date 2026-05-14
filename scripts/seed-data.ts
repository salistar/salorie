/**
 * Seed script — populates the last 10 days with sample meals, activities and water.
 * Call seedDemoData(email) from any screen (e.g., profile). Uses email-keyed
 * Firestore path to stay consistent with the rest of the app.
 */
import { collection, addDoc, serverTimestamp, query, where, getDocs, deleteDoc, doc, setDoc } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, emailToDocId } from '../lib/firebase';
import { buildPeriodKey, InsightScope, StoredInsight } from '../lib/InsightsService';

function getDateStr(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  // Local-date formatting (not UTC) — avoids the off-by-one day shift in
  // timezones like UTC+1 near midnight.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const MEALS = [
  { name: 'Oatmeal with Berries', calories: 350, protein: 12, carbs: 55, fat: 8, serving: '1 bowl' },
  { name: 'Grilled Chicken Salad', calories: 420, protein: 38, carbs: 15, fat: 22, serving: '1 plate' },
  { name: 'Pasta Bolognese', calories: 580, protein: 25, carbs: 70, fat: 18, serving: '1 plate' },
  { name: 'Greek Yogurt', calories: 150, protein: 15, carbs: 12, fat: 5, serving: '1 cup' },
  { name: 'Banana Smoothie', calories: 280, protein: 8, carbs: 50, fat: 6, serving: '1 glass' },
  { name: 'Rice & Vegetables', calories: 450, protein: 10, carbs: 75, fat: 8, serving: '1 plate' },
  { name: 'Eggs & Toast', calories: 320, protein: 18, carbs: 30, fat: 14, serving: '2 eggs + toast' },
  { name: 'Salmon Fillet', calories: 500, protein: 42, carbs: 5, fat: 28, serving: '200g' },
  { name: 'Chicken Wrap', calories: 380, protein: 28, carbs: 35, fat: 12, serving: '1 wrap' },
  { name: 'Lentil Soup', calories: 250, protein: 16, carbs: 38, fat: 4, serving: '1 bowl' },
  { name: 'Apple', calories: 95, protein: 0.5, carbs: 25, fat: 0.3, serving: '1 medium' },
  { name: 'Almonds', calories: 160, protein: 6, carbs: 6, fat: 14, serving: '30g' },
];

const EXERCISES = [
  { name: 'Morning Run', calories: 350, intensity: 'medium', duration: 30 },
  { name: 'Weight Lifting', calories: 250, intensity: 'high', duration: 45 },
  { name: 'Walking', calories: 150, intensity: 'low', duration: 40 },
  { name: 'Cycling', calories: 400, intensity: 'medium', duration: 35 },
  { name: 'HIIT Workout', calories: 300, intensity: 'high', duration: 20 },
  { name: 'Yoga', calories: 120, intensity: 'low', duration: 50 },
];

export async function seedDemoData(email: string) {
  const docId = emailToDocId(email);
  console.log('[seedDemoData] start — email:', email, 'docId:', docId);
  if (!docId) {
    console.warn('[seedDemoData] invalid email, aborting');
    return 0;
  }
  const logsRef = collection(db, 'users', docId, 'logs');
  let count = 0;

  // Clean any previous seed for today so we don't double-count.
  try {
    const todayStr = getDateStr(0);
    const snap = await getDocs(query(logsRef, where('date', '==', todayStr)));
    let deleted = 0;
    for (const d of snap.docs) {
      await deleteDoc(d.ref);
      deleted++;
    }
    console.log('[seedDemoData] cleared', deleted, 'leftover TODAY logs');
  } catch (e) {
    console.warn('[seedDemoData] cleanup today failed', e);
  }

  // Seed today + 10 past days. Index 0 = today, 1..10 = past. Varying meal
  // volumes so the week shows all three remaining-calorie cases:
  //   - light (2 meals) / goal-matching (3-4) / heavy (5)
  const dailyMealCount = [3, 2, 3, 5, 2, 4, 5, 3, 2, 4, 5]; // day 0..10
  for (let day = 0; day <= 10; day++) {
    const date = getDateStr(day);
    const numMeals = dailyMealCount[day] ?? 3;
    console.log('[seedDemoData] seeding day', date, 'with', numMeals, 'meals');

    for (let m = 0; m < numMeals; m++) {
      const meal = MEALS[Math.floor(Math.random() * MEALS.length)];
      await addDoc(logsRef, {
        email,
        type: 'meal',
        name: meal.name,
        calories: meal.calories,
        protein: meal.protein,
        carbs: meal.carbs,
        fat: meal.fat,
        serving: meal.serving,
        date,
        timestamp: serverTimestamp(),
      });
      count++;
    }

    // Guarantee 1-2 exercises per day so the "calories burned" pillar is
    // visibly populated across the week.
    const numExercises = 1 + Math.floor(Math.random() * 2);
    for (let e = 0; e < numExercises; e++) {
      const exercise = EXERCISES[Math.floor(Math.random() * EXERCISES.length)];
      await addDoc(logsRef, {
        email,
        type: 'activity',
        name: exercise.name,
        calories: exercise.calories,
        intensity: exercise.intensity,
        duration: exercise.duration,
        date,
        timestamp: serverTimestamp(),
      });
      count++;
    }

    // Add water intake per day (500-2500ml)
    const waterMl = 500 + Math.floor(Math.random() * 2000);
    await addDoc(logsRef, {
      email,
      type: 'water',
      name: 'Water',
      calories: waterMl,
      date,
      timestamp: serverTimestamp(),
    });
    count++;
  }

  // Seed insight docs for the 3 scopes so the analytics cards are populated
  // immediately — especially the exercise analysis which Gemini otherwise
  // produces thin content for when weeklyLogs is sparse (e.g. start-of-week).
  // These docs are tagged `source: 'ai'` so `isEmpty` accepts them; they'll
  // be replaced by real Gemini output on the next analytics focus (which
  // runs with the full 226 logs now available).
  const seedInsight = async (scope: InsightScope) => {
    const periodKey = buildPeriodKey(scope);
    const payload: StoredInsight = {
      scope, periodKey,
      healthScore: scope === 'week' ? 78 : scope === 'month' ? 74 : 72,
      en: {
        summary: scope === 'week'
          ? 'Balanced week: consistent meals, 8 workouts logged, hydration on target.'
          : scope === 'month'
            ? 'Great month — steady logging, balanced macros, activity 4x/week.'
            : 'Consistent tracker since onboarding. Strong habit formation.',
        topFood: scope === 'week' ? 'Grilled Chicken Salad' : scope === 'month' ? 'Oatmeal with Berries' : 'Chicken-based meals',
        hydrationStatus: scope === 'week' ? 'Good' : scope === 'month' ? 'Good' : 'Excellent',
        recommendation: scope === 'week'
          ? 'Add 300 ml of water tomorrow and keep strength 2x/week.'
          : scope === 'month'
            ? 'Aim for 3 strength + 2 cardio sessions weekly.'
            : 'Keep your 5-day logging streak to lock in the habit.',
        exerciseAnalysis: scope === 'week'
          ? '8 sessions this week — 3 runs, 2 strength, 1 HIIT, 2 walks. ~2050 kcal burned, mostly medium intensity.'
          : scope === 'month'
            ? 'Consistent cardio + strength mix; average 4 sessions/week, ~7800 kcal burned this month.'
            : 'Dominant activities: running (32%), weight lifting (24%), cycling (18%). Strong cardio base.',
      },
      fr: {
        summary: scope === 'week'
          ? 'Semaine équilibrée : repas réguliers, 8 séances, hydratation atteinte.'
          : scope === 'month'
            ? 'Bon mois — suivi régulier, macros équilibrées, 4 séances/semaine.'
            : 'Suivi constant depuis le début. Habitude bien installée.',
        topFood: scope === 'week' ? 'Salade de poulet grillé' : scope === 'month' ? 'Flocons d\'avoine aux fruits' : 'Repas à base de poulet',
        hydrationStatus: scope === 'week' ? 'Bon' : scope === 'month' ? 'Bon' : 'Excellent',
        recommendation: scope === 'week'
          ? 'Ajoute 300 ml d\'eau demain et maintiens 2 séances de force par semaine.'
          : scope === 'month'
            ? 'Vise 3 séances de force + 2 de cardio par semaine.'
            : 'Garde ta série de 5 jours pour ancrer l\'habitude.',
        exerciseAnalysis: scope === 'week'
          ? '8 séances cette semaine — 3 courses, 2 force, 1 HIIT, 2 marches. ~2050 kcal brûlées, intensité surtout modérée.'
          : scope === 'month'
            ? 'Mélange cardio + force constant ; 4 séances/semaine en moyenne, ~7800 kcal brûlées ce mois-ci.'
            : 'Activités dominantes : course (32 %), musculation (24 %), vélo (18 %). Bonne base cardio.',
      },
      ar: {
        summary: scope === 'week'
          ? 'أسبوع متوازن: وجبات منتظمة، 8 تمارين، الترطيب في الهدف.'
          : scope === 'month'
            ? 'شهر جيد — تسجيل منتظم، وماكروز متوازنة، 4 جلسات أسبوعياً.'
            : 'تتبع منتظم منذ البداية. عادة قوية وراسخة.',
        topFood: scope === 'week' ? 'سلطة الدجاج المشوي' : scope === 'month' ? 'الشوفان مع التوت' : 'وجبات تعتمد على الدجاج',
        hydrationStatus: scope === 'week' ? 'جيد' : scope === 'month' ? 'جيد' : 'ممتاز',
        recommendation: scope === 'week'
          ? 'أضف 300 مل من الماء غدًا وحافظ على جلستَي قوة أسبوعياً.'
          : scope === 'month'
            ? 'استهدف 3 جلسات قوة و 2 كارديو أسبوعياً.'
            : 'حافظ على سلسلة 5 أيام لتثبيت العادة.',
        exerciseAnalysis: scope === 'week'
          ? '8 جلسات هذا الأسبوع — 3 جري، 2 قوة، 1 هيت، 2 مشي. ~2050 سعرة محروقة، بكثافة متوسطة غالباً.'
          : scope === 'month'
            ? 'مزيج ثابت من الكارديو والقوة؛ 4 جلسات أسبوعياً في المتوسط، ~7800 سعرة محروقة هذا الشهر.'
            : 'الأنشطة السائدة: الجري (32%)، رفع الأثقال (24%)، الدراجة (18%). قاعدة كارديو قوية.',
      },
      updatedAt: Date.now(),
      generatedAt: Date.now(),
      stale: false,
      source: 'ai',
    };
    await setDoc(doc(db, 'users', docId, 'ai_insights', buildPeriodKey(scope)), payload, { merge: true });
    // Invalidate the AsyncStorage cache so the next analytics open reads the
    // freshly-seeded server doc instead of returning a stale cached insight
    // (which is the exact bug that was hiding exerciseAnalysis in the UI).
    try {
      await AsyncStorage.removeItem(`insights_${docId}_${periodKey}`);
      console.log('[seedDemoData] cleared local insight cache for', periodKey);
    } catch (e) {
      console.warn('[seedDemoData] failed to clear local cache for', periodKey, e);
    }
    console.log('[seedDemoData] seeded insight', periodKey, '— exerciseAnalysis:', payload.en.exerciseAnalysis.slice(0, 60) + '...');
  };
  try {
    await seedInsight('week');
    await seedInsight('month');
    await seedInsight('all');
    // Also bust the 7-day sync token so the analytics screen considers the
    // cache expired and definitely re-reads from the server.
    try {
      await AsyncStorage.removeItem(`insights_synced_${docId}`);
      console.log('[seedDemoData] cleared insights sync token — analytics will refetch from server');
    } catch {}
  } catch (e) {
    console.warn('[seedDemoData] insight seeding failed', e);
  }

  console.log(`[seedDemoData] done — seeded ${count} logs over today + 10 past days`);
  return count;
}
