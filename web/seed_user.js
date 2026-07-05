// Seed de données FICTIVES pour démo TDEE adaptatif / budget calories / jumeau
// métabolique / coach IA. Écrit dans Firestore via firebase-admin (service account
// de .env.local) : 30 jours de repas + 10 pesées (tendance perte) + profil de base.
// Usage : cd web && node seed_user.js
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

// --- charge FIREBASE_SERVICE_ACCOUNT depuis .env.local ---
const envTxt = fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8');
const line = envTxt.split(/\r?\n/).find((l) => l.startsWith('FIREBASE_SERVICE_ACCOUNT='));
if (!line) { console.error('FIREBASE_SERVICE_ACCOUNT absent de .env.local'); process.exit(1); }
let raw = line.slice('FIREBASE_SERVICE_ACCOUNT='.length).trim();
if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) raw = raw.slice(1, -1);
const sa = JSON.parse(raw);
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const TARGET_HINT = 'idriss'; // on retrouve le doc user contenant cet email

const BREAKFASTS = [['Flocons + lait', 380, 18, 55, 9], ['Œufs + pain', 420, 24, 30, 20], ['Yaourt grec + fruits', 300, 20, 35, 6]];
const LUNCHES = [['Poulet riz légumes', 650, 45, 70, 14], ['Couscous poulet', 700, 40, 80, 16], ['Saumon quinoa', 620, 38, 55, 22]];
const DINNERS = [['Tajine légumes + pain', 560, 25, 65, 18], ['Pâtes thon', 600, 35, 75, 12], ['Soupe + omelette', 480, 28, 30, 22]];
const SNACKS = [['Amandes', 180, 6, 6, 15], ['Pomme + fromage blanc', 160, 12, 20, 1], ['Banane', 110, 1, 27, 0]];
const pick = (a, i) => a[i % a.length];
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

(async () => {
  // 1) trouver le doc user
  const snap = await db.collection('users').get();
  let docId = null;
  snap.forEach((doc) => {
    const e = (doc.data().email || doc.id || '').toLowerCase();
    if (!docId && e.includes(TARGET_HINT)) docId = doc.id;
  });
  if (!docId) { console.error('Aucun user contenant', TARGET_HINT); process.exit(1); }
  console.log('User doc:', docId);

  const logsRef = db.collection('users').doc(docId).collection('logs');
  const wRef = db.collection('users').doc(docId).collection('weight_history');

  let added = 0;
  for (let back = 29; back >= 0; back--) {
    const d = new Date(); d.setDate(d.getDate() - back); d.setHours(12, 0, 0, 0);
    const date = ymd(d);
    const ts = admin.firestore.Timestamp.fromDate(d);
    const meals = [pick(BREAKFASTS, back), pick(LUNCHES, back + 1), pick(DINNERS, back + 2)];
    if (back % 2 === 0) meals.push(pick(SNACKS, back));
    for (const [name, kcal, p, c, f] of meals) {
      const jitter = 1 + ((back % 5) - 2) * 0.04; // ±8%
      await logsRef.add({
        userId: docId, type: 'meal', name,
        calories: Math.round(kcal * jitter), protein: Math.round(p * jitter),
        carbs: Math.round(c * jitter), fat: Math.round(f * jitter),
        date, serving: '1 portion', timestamp: ts, _seed: true,
      });
      added++;
    }
  }

  // 2) 10 pesées sur 30 jours, tendance perte 71.0 → 69.5 kg
  let w = 0;
  for (let i = 0; i < 10; i++) {
    const back = 27 - i * 3;
    const d = new Date(); d.setDate(d.getDate() - back); d.setHours(8, 0, 0, 0);
    const weight = Math.round((71.0 - i * 0.16 + ((i % 2) ? 0.1 : -0.1)) * 10) / 10;
    await wRef.add({ weight, date: ymd(d), timestamp: admin.firestore.Timestamp.fromDate(d), _seed: true });
    w++;
  }

  // 3) profil de base (pour TDEE / jumeau) — merge, n'écrase pas le reste
  await db.collection('users').doc(docId).set({
    goal: 'lose', weight: 69.5, height: 178, age: 30, gender: 'male', activityLevel: 'moderate',
  }, { merge: true });

  console.log(`OK — ${added} repas + ${w} pesées + profil. (champ _seed:true pour suppression facile)`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
