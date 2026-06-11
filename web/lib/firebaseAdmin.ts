import admin from 'firebase-admin';

// Initialise the Firebase Admin SDK once, from the service-account JSON in
// FIREBASE_SERVICE_ACCOUNT (same key the mobile token service uses).
function init() {
  if (admin.apps.length) return admin.app();
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT env is missing');
  const cred = JSON.parse(raw);
  return admin.initializeApp({ credential: admin.credential.cert(cred) });
}

export function db() {
  init();
  return admin.firestore();
}

export interface AdminUser {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  goal?: string;
  weight?: number;
  createdAt?: any;
  [k: string]: any;
}

export async function listUsers(max = 200): Promise<AdminUser[]> {
  const snap = await db().collection('users').limit(max).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}

export async function countSub(userId: string, sub: string): Promise<number> {
  try {
    const s = await db().collection('users').doc(userId).collection(sub).count().get();
    return s.data().count;
  } catch { return 0; }
}

// ── Étape 1 : lecture complète des données d'un user (Firestore) pour l'admin ──

export async function getUser(id: string): Promise<AdminUser | null> {
  const d = await db().collection('users').doc(id).get();
  return d.exists ? ({ id: d.id, ...(d.data() as any) }) : null;
}

async function readSub(id: string, sub: string, orderField: string, max: number) {
  try {
    const s = await db().collection('users').doc(id).collection(sub).orderBy(orderField, 'desc').limit(max).get();
    return s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  } catch {
    // pas d'index / champ absent → fallback sans tri
    try {
      const s = await db().collection('users').doc(id).collection(sub).limit(max).get();
      return s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    } catch { return []; }
  }
}

export const getUserLogs = (id: string, max = 60) => readSub(id, 'logs', 'timestamp', max);
export const getUserWeights = (id: string, max = 60) => readSub(id, 'weight_history', 'timestamp', max);
export const getUserNotifs = (id: string, max = 40) => readSub(id, 'notifications_history', 'timestamp', max);

export interface Overview {
  total: number; withGoal: number; withWeight: number;
  goals: Record<string, number>; recent: AdminUser[];
}

// ── Étape 3 : Feature Flags (doc config/features) ──

// Clés = routes des features (sans le slash) — doivent matcher l'app (Coach).
export const FLAG_KEYS: { key: string; label: string }[] = [
  { key: 'meal-plan', label: 'Plan de repas' },
  { key: 'nutrients', label: 'Nutriments du jour' },
  { key: 'meal-builder', label: 'Composer un repas' },
  { key: 'food-recognition', label: 'Reconnaissance d\'aliment (IA)' },
  { key: 'label-scan', label: 'Scanner étiquette (OCR)' },
  { key: 'rep-counter', label: 'Compteur de reps' },
  { key: 'run', label: 'Course solo (GPS)' },
  { key: 'workout-plans', label: 'Plans d\'entraînement' },
  { key: 'fasting', label: 'Jeûne intermittent' },
  { key: 'ai-coach', label: 'Coach IA' },
  { key: 'social', label: 'Classement / social' },
  { key: 'races', label: 'Courses & défis' },
  { key: 'health', label: 'Health Connect / wearables' },
  // — Vague 1 (IA & projections) —
  { key: 'metabolic-twin', label: 'Jumeau métabolique' },
  { key: 'adaptive-tdee', label: 'TDEE adaptatif' },
  { key: 'calorie-budget', label: 'Budget calories' },
  { key: 'streaks', label: 'Séries multi-dim' },
  { key: 'fridge-recipes', label: 'Frigo → recettes' },
  { key: 'substitutions', label: 'Substitutions IA' },
  // — Vague 2 (Suivi) —
  { key: 'body-measurements', label: 'Mesures corporelles' },
  { key: 'sleep-tracker', label: 'Sommeil' },
  { key: 'mood-tracker', label: 'Humeur & énergie' },
  { key: 'smart-hydration', label: 'Hydratation intelligente' },
  { key: 'meal-templates', label: 'Repas types' },
  { key: 'progress-photos', label: 'Photos de progression' },
  // — Vague 3 (Nutrition+) —
  { key: 'nutri-score', label: 'Nutri-Score' },
  { key: 'import-recipe', label: 'Import recette URL' },
  { key: 'shopping-list', label: 'Liste de courses' },
  // — Outils avancés —
  { key: 'restaurant-mode', label: 'Mode resto' },
  { key: 'receipt-ocr', label: 'OCR ticket de caisse' },
  { key: 'ai-meal-plan', label: 'Plan repas IA' },
  { key: 'battle', label: 'Battle 1v1' },
  { key: 'doctor-export', label: 'Export médecin' },
  // — Santé + —
  { key: 'glucose-tracker', label: 'Glycémie' },
  { key: 'microbiome', label: 'Microbiote' },
  { key: 'body-composition', label: 'Composition corporelle' },
];

// ── Notifications push (admin → users) : récupère les tokens Expo ──
export async function getPushTargets(userIds?: string[]): Promise<{ id: string; token: string }[]> {
  const out: { id: string; token: string }[] = [];
  if (userIds && userIds.length) {
    for (const id of userIds) {
      try {
        const d = await db().collection('users').doc(id).get();
        const tok = (d.data() as any)?.pushToken;
        if (d.exists && tok) out.push({ id, token: tok });
      } catch { /* skip */ }
    }
  } else {
    const snap = await db().collection('users').limit(2000).get();
    snap.docs.forEach((d) => { const tok = (d.data() as any)?.pushToken; if (tok) out.push({ id: d.id, token: tok }); });
  }
  return out;
}

export async function getFlags(): Promise<Record<string, boolean>> {
  try {
    const d = await db().collection('config').doc('features').get();
    return (d.exists ? (d.data() as any) : {}) || {};
  } catch { return {}; }
}

export async function setFlag(key: string, value: boolean): Promise<void> {
  await db().collection('config').doc('features').set({ [key]: value }, { merge: true });
}

// ── Étape 2 : Event Bus — flux d'événements (collection `events`) ──

export async function getRecentEvents(max = 60): Promise<any[]> {
  try {
    const s = await db().collection('events').orderBy('timestamp', 'desc').limit(max).get();
    return s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  } catch { return []; }
}

export async function getUserEvents(id: string, max = 40): Promise<any[]> {
  try {
    const s = await db().collection('events').where('userId', '==', id).orderBy('timestamp', 'desc').limit(max).get();
    return s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  } catch {
    // pas d'index composite → fallback : filtrer le flux récent
    const all = await getRecentEvents(400);
    return all.filter((e) => e.userId === id).slice(0, max);
  }
}

export async function getOverview(): Promise<Overview> {
  const users = await listUsers(500);
  const goals: Record<string, number> = {};
  for (const u of users) { if (u.goal) goals[u.goal] = (goals[u.goal] || 0) + 1; }
  const recent = [...users].sort((a, b) => {
    const ta = a.createdAt?._seconds || 0; const tb = b.createdAt?._seconds || 0; return tb - ta;
  }).slice(0, 10);
  return {
    total: users.length,
    withGoal: users.filter((u) => u.goal).length,
    withWeight: users.filter((u) => u.weight).length,
    goals, recent,
  };
}
