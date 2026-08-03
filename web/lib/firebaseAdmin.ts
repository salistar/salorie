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

// Catégories UI (regroupement des flags). Champ `cat` optionnel : les consommateurs
// existants (page flags) n'utilisent que {key,label} → 100% rétro-compatible.
export type FlagCat =
  | 'Nutrition' | 'Scan IA' | 'Coach & Metabolisme' | 'Fitness'
  | 'Suivi' | 'Sante' | 'Social & Defis';

// Clés = routes des features (sans le slash) — doivent matcher l'app (Coach).
export const FLAG_KEYS: { key: string; label: string; cat: FlagCat }[] = [
  { key: 'meal-plan', label: 'Plan de repas', cat: 'Nutrition' },
  { key: 'nutrients', label: 'Nutriments du jour', cat: 'Nutrition' },
  { key: 'meal-builder', label: 'Composer un repas', cat: 'Nutrition' },
  { key: 'food-recognition', label: 'Reconnaissance d\'aliment (IA)', cat: 'Scan IA' },
  { key: 'voice-log', label: 'Logging vocal', cat: 'Scan IA' },
  { key: 'label-scan', label: 'Scanner étiquette (OCR)', cat: 'Scan IA' },
  { key: 'rep-counter', label: 'Compteur de reps', cat: 'Fitness' },
  { key: 'run', label: 'Course solo (GPS)', cat: 'Fitness' },
  { key: 'workout-plans', label: 'Plans d\'entraînement', cat: 'Fitness' },
  { key: 'fasting', label: 'Jeûne intermittent', cat: 'Fitness' },
  { key: 'ai-coach', label: 'Coach IA', cat: 'Coach & Metabolisme' },
  { key: 'social', label: 'Classement / social', cat: 'Social & Defis' },
  { key: 'races', label: 'Courses & défis', cat: 'Social & Defis' },
  { key: 'medals', label: 'Médailles', cat: 'Social & Defis' },
  { key: 'virtual-races', label: 'Courses virtuelles (Mongo)', cat: 'Social & Defis' },
  { key: 'health', label: 'Health Connect / wearables', cat: 'Sante' },
  // — Vague 1 (IA & projections) —
  { key: 'metabolic-twin', label: 'Jumeau métabolique', cat: 'Coach & Metabolisme' },
  { key: 'adaptive-tdee', label: 'TDEE adaptatif', cat: 'Coach & Metabolisme' },
  { key: 'calorie-budget', label: 'Budget calories', cat: 'Coach & Metabolisme' },
  { key: 'streaks', label: 'Séries multi-dim', cat: 'Suivi' },
  { key: 'fridge-recipes', label: 'Frigo → recettes', cat: 'Nutrition' },
  { key: 'substitutions', label: 'Substitutions IA', cat: 'Nutrition' },
  // — Vague 2 (Suivi) —
  { key: 'body-measurements', label: 'Mesures corporelles', cat: 'Suivi' },
  { key: 'sleep-tracker', label: 'Sommeil', cat: 'Suivi' },
  { key: 'mood-tracker', label: 'Humeur & énergie', cat: 'Suivi' },
  { key: 'smart-hydration', label: 'Hydratation intelligente', cat: 'Suivi' },
  { key: 'meal-templates', label: 'Repas types', cat: 'Nutrition' },
  { key: 'progress-photos', label: 'Photos de progression', cat: 'Suivi' },
  // — Vague 3 (Nutrition+) —
  { key: 'nutri-score', label: 'Nutri-Score', cat: 'Nutrition' },
  { key: 'import-recipe', label: 'Import recette URL', cat: 'Nutrition' },
  { key: 'shopping-list', label: 'Liste de courses', cat: 'Nutrition' },
  // — Outils avancés —
  { key: 'restaurant-mode', label: 'Mode resto', cat: 'Nutrition' },
  { key: 'receipt-ocr', label: 'OCR ticket de caisse', cat: 'Scan IA' },
  { key: 'ai-meal-plan', label: 'Plan repas IA', cat: 'Nutrition' },
  { key: 'battle', label: 'Battle 1v1', cat: 'Social & Defis' },
  { key: 'health-export', label: 'Export médecin', cat: 'Sante' },
  // — Santé + —
  { key: 'vitals', label: 'Glycémie & tension', cat: 'Sante' },
  { key: 'microbiome', label: 'Microbiote', cat: 'Sante' },
  { key: 'body-composition', label: 'Composition corporelle', cat: 'Sante' },
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

// Tokens FCM NATIFS (champ users/{id}.fcmToken) → push DIRECT via firebase-admin
// messaging (sans Expo/EAS). Renvoie {id, token}.
export async function getFcmTargets(userIds?: string[]): Promise<{ id: string; token: string }[]> {
  const out: { id: string; token: string }[] = [];
  if (userIds && userIds.length) {
    for (const id of userIds) {
      try {
        const d = await db().collection('users').doc(id).get();
        const tok = (d.data() as any)?.fcmToken;
        if (d.exists && tok) out.push({ id, token: tok });
      } catch { /* skip */ }
    }
  } else {
    const snap = await db().collection('users').limit(2000).get();
    snap.docs.forEach((d) => { const tok = (d.data() as any)?.fcmToken; if (tok) out.push({ id: d.id, token: tok }); });
  }
  return out;
}

// Vue "legacy" (rétro-compat) : renvoie un map key→boolean à partir du doc riche.
// Une valeur peut être un boolean OU un objet { enabled, premium, ... } → on
// projette sur `enabled` (défaut true si l'objet n'a pas de `enabled`).
export async function getFlags(): Promise<Record<string, boolean>> {
  try {
    const d = await db().collection('config').doc('features').get();
    const raw: Record<string, any> = (d.exists ? (d.data() as any) : {}) || {};
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(raw)) {
      out[k] = typeof v === 'object' && v !== null ? v.enabled !== false : !!v;
    }
    return out;
  } catch { return {}; }
}

export async function setFlag(key: string, value: boolean): Promise<void> {
  await db().collection('config').doc('features').set({ [key]: value }, { merge: true });
  // rétro-compat : le toggle simple écrit aussi une entrée d'audit.
  try { await writeFlagAudit('legacy-toggle', key, { enabled: value }); } catch { /* audit best-effort */ }
}

// ── Étape 3+ : Schéma RICHE des flags (enabled/premium/rollout/minVersion/config) ──
// Une valeur dans config/features peut être :
//   - boolean (legacy)  OU
//   - { enabled?:boolean; premium?:boolean; rollout?:number; minVersion?:string; config?:Record<string,any> }

export interface FlagRich {
  enabled?: boolean;
  premium?: boolean;
  rollout?: number;      // 0..100 (% de rollout)
  minVersion?: string;   // version minimale de l'app (ex '3.11.0')
  config?: Record<string, any>;
}

// Renvoie le doc brut config/features (valeurs boolean OU objets riches).
export async function getFlagsRich(): Promise<Record<string, any>> {
  try {
    const d = await db().collection('config').doc('features').get();
    return (d.exists ? (d.data() as any) : {}) || {};
  } catch { return {}; }
}

// Merge un patch riche sur un flag. Si la valeur existante est un boolean, on la
// convertit en { enabled:bool } avant de merger. Écrit aussi une entrée d'audit.
export async function setFlagRich(
  key: string,
  patch: FlagRich,
  actor: string,
): Promise<void> {
  const ref = db().collection('config').doc('features');
  const snap = await ref.get();
  const cur = (snap.exists ? (snap.data() as any) : {}) || {};
  const prevRaw = cur[key];
  const prev: FlagRich = typeof prevRaw === 'object' && prevRaw !== null
    ? { ...prevRaw }
    : (prevRaw === undefined ? {} : { enabled: !!prevRaw });
  // merge peu profond ; `config` fusionné champ-à-champ pour ne pas écraser.
  const next: FlagRich = { ...prev };
  if (patch.enabled !== undefined) next.enabled = patch.enabled;
  if (patch.premium !== undefined) next.premium = patch.premium;
  if (patch.rollout !== undefined) next.rollout = patch.rollout;
  if (patch.minVersion !== undefined) next.minVersion = patch.minVersion;
  if (patch.config !== undefined) next.config = { ...(prev.config || {}), ...(patch.config || {}) };
  await ref.set({ [key]: next }, { merge: true });
  await writeFlagAudit(actor, key, patch);
}

// Journal d'audit borné (500 dernières entrées) dans config/features_audit.
export async function writeFlagAudit(
  actor: string,
  key: string,
  patch: any,
): Promise<void> {
  const ref = db().collection('config').doc('features_audit');
  const entry = { at: new Date().toISOString(), actor: actor || 'admin', key, patch };
  try {
    const snap = await ref.get();
    const cur: any[] = (snap.exists ? ((snap.data() as any)?.entries || []) : []);
    const entries = [...cur, entry].slice(-500);
    await ref.set({ entries }, { merge: true });
  } catch {
    // 1er write / doc absent → crée le doc.
    await ref.set({ entries: [entry] }, { merge: true });
  }
}

// ── Étape 3+ : Override PREMIUM par utilisateur (users/{id}.premiumOverride) ──

export async function listPremiumUsers(
  max = 500,
): Promise<{ id: string; email: string; premiumOverride: boolean }[]> {
  const snap = await db().collection('users').limit(max).get();
  return snap.docs.map((d) => {
    const data = (d.data() as any) || {};
    return { id: d.id, email: data.email || '', premiumOverride: !!data.premiumOverride };
  });
}

export async function setPremiumOverride(
  userId: string,
  value: boolean,
  actor: string,
): Promise<void> {
  await db().collection('users').doc(userId).set({ premiumOverride: !!value }, { merge: true });
  await writePremiumAudit(actor, userId, { premiumOverride: !!value });
}

// Journal d'audit premium (même forme, borné 500) dans config/premium_audit.
export async function writePremiumAudit(
  actor: string,
  userId: string,
  patch: any,
): Promise<void> {
  const ref = db().collection('config').doc('premium_audit');
  const entry = { at: new Date().toISOString(), actor: actor || 'admin', key: userId, patch };
  try {
    const snap = await ref.get();
    const cur: any[] = (snap.exists ? ((snap.data() as any)?.entries || []) : []);
    const entries = [...cur, entry].slice(-500);
    await ref.set({ entries }, { merge: true });
  } catch {
    await ref.set({ entries: [entry] }, { merge: true });
  }
}

// ── Achievements (gérés depuis le web → Firestore config/achievements) ──
// Métriques dispo (calculées côté app) : streak · daysTracked · weighIns · totalLogs.
export interface AchievementDef {
  key: string; icon: string; metric: string; threshold: number;
  titleFr?: string; descFr?: string; titleEn?: string; descEn?: string; titleAr?: string; descAr?: string;
  enabled?: boolean;
}
// ── Feedback : demandes de features (app /feature-requests) + messages contact ──
export async function getFeatureRequests(max = 150): Promise<any[]> {
  const map = (s: any) => s.docs.map((d: any) => ({ id: d.id, ...(d.data() as any) }));
  try { return map(await db().collection('feature_requests').orderBy('createdAt', 'desc').limit(max).get()); }
  catch { try { return map(await db().collection('feature_requests').limit(max).get()); } catch { return []; } }
}
export async function getContactMessages(max = 150): Promise<any[]> {
  // Messages écrits en sous-collection owner users/{id}/contact_messages → collectionGroup.
  const map = (s: any) => s.docs.map((d: any) => ({ id: d.id, ...(d.data() as any) }));
  try { return map(await db().collectionGroup('contact_messages').orderBy('createdAt', 'desc').limit(max).get()); }
  catch { try { return map(await db().collectionGroup('contact_messages').limit(max).get()); } catch { return []; } }
}

export async function getAchievements(): Promise<AchievementDef[]> {
  try {
    const d = await db().collection('config').doc('achievements').get();
    const data: any = d.exists ? d.data() : null;
    return (data?.list as AchievementDef[]) || [];
  } catch { return []; }
}
export async function setAchievements(list: AchievementDef[]): Promise<void> {
  await db().collection('config').doc('achievements').set({ list }, { merge: true });
}

// ── Sports de groupe : terrains proposés + matchs récents ──
// Les users proposent des terrains (collection `sport_fields`, approved=false par
// défaut) et organisent des matchs (`sport_matches`). L'admin approuve/rejette.

export async function getPendingSportFields(max = 200): Promise<any[]> {
  const map = (s: any) => s.docs.map((d: any) => ({ id: d.id, ...(d.data() as any) }));
  try {
    return map(await db().collection('sport_fields').where('approved', '==', false).orderBy('createdAt', 'desc').limit(max).get());
  } catch {
    // pas d'index composite (where + orderBy) → fallback sans tri
    try { return map(await db().collection('sport_fields').where('approved', '==', false).limit(max).get()); }
    catch { return []; }
  }
}

export async function getRecentSportMatches(max = 80): Promise<any[]> {
  const map = (s: any) => s.docs.map((d: any) => ({ id: d.id, ...(d.data() as any) }));
  try { return map(await db().collection('sport_matches').orderBy('createdAt', 'desc').limit(max).get()); }
  catch { try { return map(await db().collection('sport_matches').limit(max).get()); } catch { return []; } }
}

export async function approveSportField(id: string): Promise<void> {
  await db().collection('sport_fields').doc(id).set(
    { approved: true, approvedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true },
  );
}

export async function rejectSportField(id: string): Promise<void> {
  await db().collection('sport_fields').doc(id).delete();
}

// ── Marketplace (petites annonces UGC) : modération ──
// Collection `marketplace_listings` (cf. lib/marketplace.ts côté app + firestore.rules).
// Champs : ownerUid, approved (bool), status ('active'|'sold'|'removed'), title,
// category, price, photo/photoUrl/imageUrl, createdAt.
// L'admin approuve (approved:true) ou rejette (status:'removed') ; les writes
// passent par l'admin SDK qui bypass les règles.

export async function getPendingListings(max = 200): Promise<any[]> {
  const map = (s: any) => s.docs.map((d: any) => ({ id: d.id, ...(d.data() as any) }));
  try {
    return map(await db().collection('marketplace_listings').where('approved', '==', false).orderBy('createdAt', 'desc').limit(max).get());
  } catch {
    // pas d'index composite (where + orderBy) → fallback sans tri
    try { return map(await db().collection('marketplace_listings').where('approved', '==', false).limit(max).get()); }
    catch { return []; }
  }
}

export async function approveListing(id: string): Promise<void> {
  await db().collection('marketplace_listings').doc(id).set(
    { approved: true, status: 'active', approvedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true },
  );
}

export async function rejectListing(id: string): Promise<void> {
  // On ne supprime pas : on marque l'annonce 'removed' (traçabilité).
  await db().collection('marketplace_listings').doc(id).set(
    { status: 'removed', removedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true },
  );
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

// ── Clés IA (providers LLM) ── stockées dans secrets/llm_keys (verrouillé aux clients par
// firestore.rules ; seul le service-account backend/admin y accède). L'admin colle les clés
// ici ; le backend les lit à l'exécution pour le cascade multi-providers du Coach.
export const LLM_PROVIDERS: { key: string; label: string; hint: string }[] = [
  { key: 'ANTHROPIC_API_KEY', label: 'Anthropic — Claude', hint: 'sk-ant-…' },
  { key: 'DEEPSEEK_API_KEY', label: 'DeepSeek', hint: 'sk-…' },
  { key: 'DASHSCOPE_API_KEY', label: 'Qwen — Alibaba DashScope', hint: 'sk-…' },
  { key: 'OPENAI_API_KEY', label: 'OpenAI — GPT', hint: 'sk-…' },
  { key: 'MOONSHOT_API_KEY', label: 'Moonshot — Kimi', hint: 'sk-…' },
  { key: 'XAI_API_KEY', label: 'xAI — Grok', hint: 'xai-…' },
  { key: 'ZHIPU_API_KEY', label: 'ZhipuAI — GLM', hint: 'xxx.xxx' },
  { key: 'MINIMAX_API_KEY', label: 'MiniMax', hint: 'sk-…' },
  { key: 'GEMINI_API_KEY', label: 'Google Gemini', hint: 'AIza… (format ancien SDK)' },
];

/** Statut des clés — JAMAIS la valeur en clair : seulement présence + 4 derniers car. */
export async function getLLMKeysStatus(): Promise<Record<string, { set: boolean; masked?: string }>> {
  const out: Record<string, { set: boolean; masked?: string }> = {};
  try {
    const d = await db().collection('secrets').doc('llm_keys').get();
    const data = (d.exists ? d.data() : {}) || {};
    for (const p of LLM_PROVIDERS) {
      const v = String((data as any)[p.key] || '');
      out[p.key] = v ? { set: true, masked: '••••' + v.slice(-4) } : { set: false };
    }
  } catch { for (const p of LLM_PROVIDERS) out[p.key] = { set: false }; }
  return out;
}

/** Enregistre/MAJ les clés (merge). Valeur vide = clé retirée. */
export async function setLLMKeys(patch: Record<string, string>, actor: string): Promise<void> {
  const clean: Record<string, any> = {};
  const changed: string[] = [];
  for (const p of LLM_PROVIDERS) {
    if (Object.prototype.hasOwnProperty.call(patch, p.key)) {
      clean[p.key] = String((patch as any)[p.key] ?? '').trim(); // '' = non configuré
      changed.push(p.key);
    }
  }
  clean.updatedAt = Date.now();
  clean.lastActor = actor;
  await db().collection('secrets').doc('llm_keys').set(clean, { merge: true });
}

// ── Signalements UGC (moderation) ────────────────────────────────────────────
//
// Ces deux fonctions existaient sur srv3 mais n'ont jamais ete versionnees. Le
// deploiement du 3 aout 2026 a remplace ce fichier par la version du depot, qui ne les
// contenait pas : la compilation de l'admin echouait sur
//   Type error: Module '"../../../lib/firebaseAdmin"' has no exported member 'getReports'
// alors que app/api/reports/route.ts, app/reports/page.tsx et leurs 800 lignes voisines
// etaient toujours la. Reconstruites d'apres leur unique point d'appel plutot que
// supprimees avec la fonctionnalite.
//
// Les regles Firestore interdisent toute lecture cliente de `reports` : cette collection
// n'est lisible que par le SDK Admin, donc ici.

export interface AdminReport {
  id: string;
  status?: 'pending' | 'resolved' | 'dismissed';
  reporterId?: string;
  [k: string]: any;
}

/** Signalements, du plus recent au plus ancien. `pending` = non traites. */
export async function getReports(status: 'pending' | 'all' = 'pending'): Promise<AdminReport[]> {
  try {
    let q: FirebaseFirestore.Query = db().collection('reports');
    if (status === 'pending') q = q.where('status', '==', 'pending');
    // Tri en memoire : un orderBy combine au where exigerait un index composite, dont
    // l'absence ferait echouer la requete en production plutot que la ralentir.
    const snap = await q.limit(300).get();
    const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as AdminReport[];
    return rows.sort((a, b) => {
      const ta = a.createdAt?.seconds ?? a.createdAt?._seconds ?? 0;
      const tb = b.createdAt?.seconds ?? b.createdAt?._seconds ?? 0;
      return tb - ta;
    });
  } catch {
    return [];
  }
}

/** Cloture un signalement. Trace QUI a decide : une moderation doit etre imputable. */
export async function setReportStatus(
  id: string,
  status: 'resolved' | 'dismissed',
  adminEmail?: string,
): Promise<void> {
  await db().collection('reports').doc(id).set(
    {
      status,
      resolvedAt: new Date().toISOString(),
      resolvedBy: adminEmail || 'admin',
    },
    { merge: true },
  );
}
