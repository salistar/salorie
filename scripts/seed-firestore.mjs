// Standalone Firestore seeder for the demo/test account.
// Run from the app root:  node scripts/seed-firestore.mjs
// Uses the public web config from .env + the (currently open) Firestore rules.
// Seeds 14 days of meals/activities/water + a declining weight trend + targets,
// so every screen (dashboard, analytics, coach adaptive TDEE, nutrients) is full.
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, doc, setDoc, getDocs, query, where, deleteDoc } from 'firebase/firestore';
import fs from 'fs';

const env = {};
fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/).forEach((l) => {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
});
const config = {
  apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.EXPO_PUBLIC_FIREBASE_APP_ID,
};
const app = initializeApp(config);
const db = getFirestore(app);
const email = 'salistarcompany@gmail.com';
const docId = email;

const ds = (daysAgo) => {
  const d = new Date(); d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const BREAKFASTS = [
  { name: 'Oatmeal with Berries', calories: 350, protein: 12, carbs: 55, fat: 8 },
  { name: 'Eggs & Avocado Toast', calories: 420, protein: 22, carbs: 30, fat: 24 },
  { name: 'Greek Yogurt & Granola', calories: 300, protein: 18, carbs: 38, fat: 8 },
];
const LUNCHES = [
  { name: 'Grilled Chicken Salad', calories: 470, protein: 42, carbs: 18, fat: 24 },
  { name: 'Salmon & Quinoa Bowl', calories: 540, protein: 38, carbs: 45, fat: 22 },
  { name: 'Turkey & Hummus Wrap', calories: 480, protein: 32, carbs: 48, fat: 16 },
];
const DINNERS = [
  { name: 'Beef Stir-fry & Rice', calories: 620, protein: 36, carbs: 65, fat: 22 },
  { name: 'Lentil Soup & Bread', calories: 430, protein: 22, carbs: 60, fat: 10 },
  { name: 'Grilled Fish & Veggies', calories: 480, protein: 40, carbs: 25, fat: 20 },
];
const SNACKS = [
  { name: 'Apple & Almonds', calories: 220, protein: 6, carbs: 28, fat: 12 },
  { name: 'Protein Shake', calories: 180, protein: 25, carbs: 10, fat: 3 },
  { name: 'Banana', calories: 105, protein: 1, carbs: 27, fat: 0 },
];
const EXERCISES = [
  { name: 'Morning Run', calories: 350, intensity: 'medium' },
  { name: 'Weight Lifting', calories: 260, intensity: 'high' },
  { name: 'Cycling', calories: 400, intensity: 'medium' },
  { name: 'HIIT Workout', calories: 300, intensity: 'high' },
  { name: 'Walking', calories: 160, intensity: 'low' },
];

async function clearRange(sub, days) {
  const dates = Array.from({ length: days }, (_, i) => ds(i));
  const ref = collection(db, 'users', docId, sub);
  // delete docs whose date is in our window (chunked by 'in' max 10)
  for (let i = 0; i < dates.length; i += 10) {
    const chunk = dates.slice(i, i + 10);
    const snap = await getDocs(query(ref, where('date', 'in', chunk)));
    for (const d of snap.docs) await deleteDoc(d.ref);
  }
}

async function main() {
  console.log('Seeding Firestore for', email, '(project', config.projectId + ')');
  const DAYS = 14;
  await clearRange('logs', DAYS);
  await clearRange('weight_history', DAYS);

  const logsRef = collection(db, 'users', docId, 'logs');
  let n = 0;
  for (let i = 0; i < DAYS; i++) {
    const date = ds(i);
    const meals = [BREAKFASTS[i % 3], LUNCHES[i % 3], DINNERS[i % 3], SNACKS[i % 3]];
    for (const m of meals) {
      await addDoc(logsRef, { ...m, type: 'meal', serving: '1 serving', date, userId: docId, timestamp: Date.now() });
      n++;
    }
    // water 2000-2600 ml
    await addDoc(logsRef, { name: 'Water', calories: 2000 + (i % 4) * 200, type: 'water', date, userId: docId, timestamp: Date.now() });
    n++;
    // activity ~5 days out of 7
    if (i % 7 !== 3 && i % 7 !== 6) {
      const ex = EXERCISES[i % EXERCISES.length];
      await addDoc(logsRef, { ...ex, type: 'activity', date, userId: docId, timestamp: Date.now() });
      n++;
    }
  }

  // declining weight trend (lose goal): 78.0 -> 76.3 over 14 days
  const weightRef = collection(db, 'users', docId, 'weight_history');
  const start = 78.0;
  for (let i = DAYS - 1; i >= 0; i -= 2) {
    const w = +(start - ((DAYS - 1 - i) / (DAYS - 1)) * 1.7).toFixed(1);
    await addDoc(weightRef, { weight: w, date: ds(i), timestamp: Date.now() });
  }

  // ---- Demo friends + leaderboard (so Social is populated) ----
  const FRIENDS = [
    { email: 'alex.demo@salorie.app', name: 'Alex Martin', streak: 23, daysTracked: 41 },
    { email: 'sara.demo@salorie.app', name: 'Sara Bennani', streak: 12, daysTracked: 19 },
    { email: 'youssef.demo@salorie.app', name: 'Youssef K.', streak: 7, daysTracked: 9 },
    { email: 'lina.demo@salorie.app', name: 'Lina R.', streak: 4, daysTracked: 6 },
  ];
  for (const f of FRIENDS) {
    await setDoc(doc(db, 'users', f.email), {
      email: f.email,
      firstName: f.name.split(' ')[0],
      lastName: f.name.split(' ').slice(1).join(' '),
      onboarded: true,
      imageUrl: `https://i.pravatar.cc/150?u=${encodeURIComponent(f.email)}`,
      publicStats: {
        name: f.name,
        imageUrl: `https://i.pravatar.cc/150?u=${encodeURIComponent(f.email)}`,
        streak: f.streak,
        daysTracked: f.daysTracked,
        email: f.email,
        updatedAt: Date.now(),
      },
    }, { merge: true });
  }

  // profile: targets + goal + name + current weight + friends + my publicStats
  await setDoc(doc(db, 'users', docId), {
    firstName: 'Salistar', lastName: 'Company', onboarded: true, goal: 'lose',
    weight: 76.3, targetWeight: 72,
    nutritionalPlan: { calories: 2200, protein: 160, carbs: 230, fat: 70 },
    friends: FRIENDS.map((f) => f.email),
    publicStats: { name: 'Salistar Company', imageUrl: '', streak: 14, daysTracked: 14, email: docId, updatedAt: Date.now() },
  }, { merge: true });

  console.log(`Done. ${n} logs + weight trend + profile targets + ${FRIENDS.length} friends seeded.`);
  process.exit(0);
}
main().catch((e) => { console.error('SEED FAILED:', e?.message || e); process.exit(1); });
