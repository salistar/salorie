// Admin-SDK seeder for the demo/test account. Works UNDER the secured rules
// (the service account bypasses Firestore rules). Run from this folder:
//   node seed-admin.mjs
// Mirrors scripts/seed-firestore.mjs (14 days logs + weight trend + targets + 4 friends).
import fs from 'fs';
import admin from 'firebase-admin';

const envRaw = fs.readFileSync(new URL('./.env', import.meta.url), 'utf8');
const env = {};
for (const l of envRaw.split(/\r?\n/)) { const i = l.indexOf('='); if (i > 0) env[l.slice(0, i)] = l.slice(i + 1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();

const email = 'salistarcompany@gmail.com';
const docId = email;
const ds = (d) => { const x = new Date(); x.setDate(x.getDate() - d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };

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
  const ref = db.collection('users').doc(docId).collection(sub);
  for (let i = 0; i < dates.length; i += 10) {
    const snap = await ref.where('date', 'in', dates.slice(i, i + 10)).get();
    for (const d of snap.docs) await d.ref.delete();
  }
}

async function main() {
  const DAYS = 14;
  console.log('Seeding (admin) for', email);
  await clearRange('logs', DAYS);
  await clearRange('weight_history', DAYS);
  const logs = db.collection('users').doc(docId).collection('logs');
  let n = 0;
  for (let i = 0; i < DAYS; i++) {
    const date = ds(i);
    for (const m of [BREAKFASTS[i % 3], LUNCHES[i % 3], DINNERS[i % 3], SNACKS[i % 3]]) {
      await logs.add({ ...m, type: 'meal', serving: '1 serving', date, userId: docId, timestamp: Date.now() }); n++;
    }
    await logs.add({ name: 'Water', calories: 2000 + (i % 4) * 200, type: 'water', date, userId: docId, timestamp: Date.now() }); n++;
    if (i % 7 !== 3 && i % 7 !== 6) { await logs.add({ ...EXERCISES[i % EXERCISES.length], type: 'activity', date, userId: docId, timestamp: Date.now() }); n++; }
  }
  const weight = db.collection('users').doc(docId).collection('weight_history');
  for (let i = DAYS - 1; i >= 0; i -= 2) {
    const w = +(78.0 - ((DAYS - 1 - i) / (DAYS - 1)) * 1.7).toFixed(1);
    await weight.add({ weight: w, date: ds(i), timestamp: Date.now() });
  }
  const FRIENDS = [
    { email: 'alex.demo@salorie.app', name: 'Alex Martin', streak: 23, daysTracked: 41 },
    { email: 'sara.demo@salorie.app', name: 'Sara Bennani', streak: 12, daysTracked: 19 },
    { email: 'youssef.demo@salorie.app', name: 'Youssef K.', streak: 7, daysTracked: 9 },
    { email: 'lina.demo@salorie.app', name: 'Lina R.', streak: 4, daysTracked: 6 },
  ];
  for (const f of FRIENDS) {
    await db.collection('users').doc(f.email).set({
      email: f.email, firstName: f.name.split(' ')[0], lastName: f.name.split(' ').slice(1).join(' '),
      onboarded: true, imageUrl: `https://i.pravatar.cc/150?u=${encodeURIComponent(f.email)}`,
      publicStats: { name: f.name, imageUrl: `https://i.pravatar.cc/150?u=${encodeURIComponent(f.email)}`, streak: f.streak, daysTracked: f.daysTracked, email: f.email, updatedAt: Date.now() },
    }, { merge: true });
  }
  await db.collection('users').doc(docId).set({
    firstName: 'Salistar', lastName: 'Company', onboarded: true, goal: 'lose', weight: 76.3, targetWeight: 72,
    nutritionalPlan: { calories: 2200, protein: 160, carbs: 230, fat: 70 },
    friends: FRIENDS.map((f) => f.email),
    publicStats: { name: 'Salistar Company', imageUrl: '', streak: 14, daysTracked: 14, email: docId, updatedAt: Date.now() },
  }, { merge: true });
  console.log(`Done. ${n} logs + weight + targets + ${FRIENDS.length} friends.`);
  process.exit(0);
}
main().catch((e) => { console.error('SEED FAILED:', e?.message || e); process.exit(1); });
