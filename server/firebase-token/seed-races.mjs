// Admin seeder for the Races + Challenges features (works under secured rules).
// Run from server/firebase-token:  node seed-races.mjs
import fs from 'fs';
import admin from 'firebase-admin';

const envRaw = fs.readFileSync(new URL('./.env', import.meta.url), 'utf8');
const env = {};
for (const l of envRaw.split(/\r?\n/)) { const i = l.indexOf('='); if (i > 0) env[l.slice(0, i)] = l.slice(i + 1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();
const now = Date.now();

const FRIENDS = [
  { email: 'alex.demo@salorie.app', name: 'Alex Martin' },
  { email: 'sara.demo@salorie.app', name: 'Sara Bennani' },
  { email: 'youssef.demo@salorie.app', name: 'Youssef K.' },
  { email: 'lina.demo@salorie.app', name: 'Lina R.' },
];
const img = (e) => `https://i.pravatar.cc/150?u=${encodeURIComponent(e)}`;
const docId = (e) => e.trim().toLowerCase();

// Casablanca base for live race positions.
const BASE = { lat: 33.5899, lng: -7.6680 };

async function main() {
  // ── Group races (live) ──
  const RACES = [
    { id: 'demo-sunday-5k', name: 'Course du dimanche · 5K', createdBy: FRIENDS[0].email, createdByName: FRIENDS[0].name, status: 'live', goalKm: 5 },
    { id: 'demo-corniche-10k', name: 'Corniche Challenge · 10K', createdBy: FRIENDS[1].email, createdByName: FRIENDS[1].name, status: 'open', goalKm: 10 },
  ];
  for (const r of RACES) {
    await db.collection('races').doc(r.id).set({
      name: r.name, createdBy: r.createdBy, createdByName: r.createdByName,
      status: r.status, goalKm: r.goalKm, createdAt: now, startedAt: now,
    }, { merge: true });
    const dists = [3200, 2600, 4100, 1500];
    for (let i = 0; i < FRIENDS.length; i++) {
      const f = FRIENDS[i];
      await db.collection('races').doc(r.id).collection('participants').doc(docId(f.email)).set({
        email: f.email, name: f.name, imageUrl: img(f.email),
        distanceM: dists[i], lat: BASE.lat + i * 0.004, lng: BASE.lng + i * 0.003,
        finished: false, updatedAt: now,
      }, { merge: true });
    }
  }

  // ── Virtual challenges (Conqueror) — leaderboards ──
  const CH = {
    'casa-loop': { total: 10, km: [7.2, 4.5, 9.1, 2.3] },
    'paris-marathon': { total: 42, km: [18.4, 11.0, 25.6, 6.2] },
    'great-wall': { total: 21, km: [12.8, 5.0, 8.4, 3.1] },
    'route66': { total: 30, km: [22.0, 9.5, 14.2, 4.0] },
  };
  for (const [cid, data] of Object.entries(CH)) {
    for (let i = 0; i < FRIENDS.length; i++) {
      const f = FRIENDS[i];
      await db.collection('challenges').doc(cid).collection('participants').doc(docId(f.email)).set({
        email: f.email, name: f.name, imageUrl: img(f.email),
        cumulativeKm: data.km[i], updatedAt: now,
      }, { merge: true });
    }
  }

  console.log(`Seeded ${RACES.length} races + ${Object.keys(CH).length} challenge leaderboards (${FRIENDS.length} demo runners each).`);
  process.exit(0);
}
main().catch((e) => { console.error('SEED FAILED:', e?.message || e); process.exit(1); });
