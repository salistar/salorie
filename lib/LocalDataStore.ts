/**
 * Local mirror of the user's Firestore data in AsyncStorage.
 * - Loaded entirely on first connection via `syncAllUserData(email)`.
 * - Updated on every write to Firestore to keep local + remote in sync.
 *
 * Key conventions:
 *   profile_{docId}          -> UserProfile JSON
 *   logs_{docId}             -> NutritionLog[] JSON
 *   weight_{docId}           -> WeightEntry[] JSON
 *   notifications_{docId}    -> Notification[] JSON
 *   insights_{docId}         -> Insight[] JSON
 *   synced_{docId}           -> ISO timestamp of last full sync
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { emailToDocId, fetchAllUserData, getNotificationsHistory, saveNotificationToHistory, seedTestNotifications } from './firebase';

const K = {
  profile: (d: string) => `profile_${d}`,
  logs: (d: string) => `logs_${d}`,
  weight: (d: string) => `weight_${d}`,
  notifications: (d: string) => `notifications_${d}`,
  insights: (d: string) => `insights_${d}`,
  synced: (d: string) => `synced_${d}`,
};

// ---------------------------------------------------------------------------
// COLOR LOG HELPERS
// ---------------------------------------------------------------------------
// Convention:
//   GREEN = API REQUEST (outbound to 3rd party)
//   BLUE  = API RESPONSE metadata (counters, ms, status)
//   RED   = Local storage (AsyncStorage)
//   CYAN  = Data content (raw items, payloads)
//   WHITE = narrative / diagnostic
// Le body (objet) est serialise dans la MEME chaine coloree pour que la
// couleur persiste sur tout le dump (sinon RN affiche l'objet a part, hors
// sequence ANSI).
const C = {
  GREEN:   '\x1b[32m',   // API REQUEST  (outbound → Firestore / Clerk / Gemini)
  BLUE:    '\x1b[34m',   // API RESPONSE metadata (counts, ms, status)
  RED:     '\x1b[31m',   // Local storage I/O (AsyncStorage read / write / remove)
  CYAN:    '\x1b[36m',   // Data CONTENT (payload dumps, raw items)
  YELLOW:  '\x1b[33m',   // Narrative / step-by-step explanation (what the app is doing)
  MAGENTA: '\x1b[35m',   // META : commentaire qui EXPLIQUE le log suivant
  GRAY:    '\x1b[90m',   // Debug secondaire (non critique)
  RESET:   '\x1b[0m',
};

/**
 * Imprime une legende ANSI expliquant chaque couleur utilisee dans les logs.
 * A appeler UNE FOIS au demarrage de l'app (_layout.tsx) pour que le
 * developpeur voit immediatement la signification de chaque couleur dans
 * Metro.
 */
export function printLogLegend(): void {
  const line = (c: string, label: string, meaning: string) =>
    console.log(`${c}  ■ ${label.padEnd(9)}${C.RESET} ${C.GRAY}→ ${meaning}${C.RESET}`);
  console.log(`${C.MAGENTA}╔══════════════════════════════════════════════════════════════════╗${C.RESET}`);
  console.log(`${C.MAGENTA}║                   SALORIE — LEGENDE DES LOGS                     ║${C.RESET}`);
  console.log(`${C.MAGENTA}╚══════════════════════════════════════════════════════════════════╝${C.RESET}`);
  line(C.GREEN,   'VERT',     'API REQUEST  — appel sortant (Firestore / Clerk / Gemini)');
  line(C.BLUE,    'BLEU',     'API RESPONSE — meta (counts, ms, status) retour serveur');
  line(C.RED,     'ROUGE',    'AsyncStorage — lecture / ecriture / suppression locale');
  line(C.CYAN,    'CYAN',     'CONTENU      — dump des donnees brutes (logs, insights…)');
  line(C.YELLOW,  'JAUNE',    'NARRATIF     — etape par etape de ce que fait l\'app');
  line(C.MAGENTA, 'MAGENTA',  'META         — commentaire qui EXPLIQUE le log juste apres');
  line(C.GRAY,    'GRIS',     'DEBUG        — info secondaire / contexte');
  console.log(`${C.MAGENTA}──────────────────────────────────────────────────────────────────${C.RESET}`);
}

/**
 * Meta-log : une petite ligne magenta qui EXPLIQUE en francais ce que le
 * prochain log va montrer. Utile pour que n'importe qui ouvre la console
 * Metro comprenne pourquoi un log apparait.
 *
 * Exemple :
 *   explain('Firestore va renvoyer les 7 derniers jours de logs multilingues');
 *   colorLog('BLUE', '[API←Firestore] logs/list', { count: 23 });
 */
export function explain(message: string): void {
  console.log(`${C.MAGENTA}  ↳ [pourquoi] ${message}${C.RESET}`);
}

function short(obj: any, maxChars = 4000): string {
  try {
    const s = JSON.stringify(obj, (_k, v) => {
      if (typeof v === 'string' && v.length > 140) return v.slice(0, 140) + '…';
      return v;
    }, 2);
    return s.length > maxChars ? s.slice(0, maxChars) + '…(truncated)' : s;
  } catch {
    return String(obj);
  }
}

export function colorLog(color: keyof typeof C, label: string, body?: any) {
  const prefix = `${C[color]}${label}`;
  if (body === undefined) {
    console.log(`${prefix}${C.RESET}`);
  } else {
    console.log(`${prefix} ${short(body)}${C.RESET}`);
  }
}

// ---------------------------------------------------------------------------
// CLEAR CACHE
// ---------------------------------------------------------------------------
/**
 * Supprime TOUT le cache local (AsyncStorage) lie a l'utilisateur :
 * profile, logs, weight, notifications, insights, synced + les flags
 * d'onboarding + last_session_onboarded. Force la prochaine connexion a
 * tout re-downloader depuis Firestore.
 */
export async function clearAllLocalData(email: string): Promise<number> {
  const docId = emailToDocId(email);
  if (!docId) return 0;
  console.log(`${C.YELLOW}[ClearCache] DEMANDE DE PURGE du cache telephone pour ${email}${C.RESET}`);
  const keys = [
    K.profile(docId), K.logs(docId), K.weight(docId),
    K.notifications(docId), K.insights(docId), K.synced(docId),
    `onboarded_${email.toLowerCase()}`, 'last_session_onboarded',
    `profile_${docId}`,
  ];
  colorLog('RED', '[API→AsyncStorage] multiRemove REQUEST', { docId, keys });
  const t0 = Date.now();
  try {
    await AsyncStorage.multiRemove(keys);
    colorLog('RED', '[API←AsyncStorage] multiRemove OK', { docId, removed: keys.length, ms: Date.now() - t0 });
    console.log(`${C.YELLOW}[ClearCache] ${keys.length} cles supprimees. Prochaine connexion -> re-download complet depuis Firestore dans les 3 langues.${C.RESET}`);
    return keys.length;
  } catch (e) {
    console.warn('[ClearCache] echec:', e);
    return 0;
  }
}

/** Indique si le cache du telephone est vide (pas encore synchronise) */
export async function isCacheEmpty(email: string): Promise<boolean> {
  const docId = emailToDocId(email);
  if (!docId) return true;
  const v = await AsyncStorage.getItem(K.synced(docId));
  const empty = !v;
  console.log(`${C.YELLOW}[CacheCheck] cache ${empty ? 'VIDE' : 'present'} (lastSyncedAt=${v || 'null'})${C.RESET}`);
  return empty;
}

/** Helper: keep only entries whose `date` (YYYY-MM-DD) is within the last N days (inclusive of today). */
function filterLastNDays<T extends { date?: string; timestamp?: any }>(arr: T[], days: number): T[] {
  if (!Array.isArray(arr) || arr.length === 0) return [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today); cutoff.setDate(today.getDate() - (days - 1));
  const cutoffMs = cutoff.getTime();
  return arr.filter((x) => {
    if (x.date) {
      const d = new Date(x.date + 'T00:00:00');
      return d.getTime() >= cutoffMs;
    }
    const t = x.timestamp?.seconds ? x.timestamp.seconds * 1000 : 0;
    return t >= cutoffMs;
  });
}

/**
 * Cache-first sync :
 * 1) Lit le cache local AsyncStorage (telephone) et logue ce qu'il contient.
 * 2) Appelle Firestore pour recuperer les donnees distantes.
 * 3) Compare remote vs local et logue la diff.
 * 4) Si premiere connexion OU diff detectee -> reecrit le cache.
 * 5) Affiche un resume aujourd'hui + 7 derniers jours avec les 3 langues
 *    (insights EN / FR / AR) si disponibles.
 */
// In-flight lock: coalesce concurrent syncs for the same email into one
// promise so we don't run 3 parallel 10-second Firestore round-trips just
// because _layout + HomeScreen + reconnect-check all trigger at once.
const _syncInFlight = new Map<string, Promise<any>>();

export async function syncAllUserData(email: string) {
  const docId = emailToDocId(email);
  if (!docId) return null;

  const existing = _syncInFlight.get(email);
  if (existing) {
    console.log(`${C.MAGENTA}  ↳ [pourquoi] un sync est deja en cours pour ${email} — on attache a la promesse existante au lieu de relancer (evite le reload quand on revient du scan)${C.RESET}`);
    return existing;
  }

  const p = (async () => _syncAllUserDataInner(email, docId))();
  _syncInFlight.set(email, p);
  try {
    return await p;
  } finally {
    _syncInFlight.delete(email);
  }
}

async function _syncAllUserDataInner(email: string, docId: string) {
  const todayKey = new Date().toISOString().slice(0, 10);

  console.log(`${C.YELLOW}[syncAllUserData] ===== DEBUT SYNC pour ${email} =====${C.RESET}`);
  console.log(`${C.YELLOW}[syncAllUserData] etape 1/5 : lecture du cache telephone (AsyncStorage)${C.RESET}`);

  // -----------------------------------------------------------------------
  // 1) CACHE READ (phone)
  // -----------------------------------------------------------------------
  explain('on lit les 6 cles AsyncStorage (profile, logs, weight, notifications, insights, synced) pour savoir si le telephone a deja des donnees');
  colorLog('RED', '[API→AsyncStorage] cache/read REQUEST', { docId });
  const tCache = Date.now();
  let cachedProfile: any = null;
  let cachedLogs: any[] = [];
  let cachedWeight: any[] = [];
  let cachedNotifs: any[] = [];
  let cachedInsights: any[] = [];
  let lastSyncedAt: string | null = null;
  try {
    const [[, rawProfile], [, rawLogs], [, rawWeight], [, rawNotifs], [, rawInsights], [, rawSynced]] =
      await AsyncStorage.multiGet([
        K.profile(docId), K.logs(docId), K.weight(docId),
        K.notifications(docId), K.insights(docId), K.synced(docId),
      ]);
    cachedProfile = rawProfile ? JSON.parse(rawProfile) : null;
    cachedLogs = rawLogs ? JSON.parse(rawLogs) : [];
    cachedWeight = rawWeight ? JSON.parse(rawWeight) : [];
    cachedNotifs = rawNotifs ? JSON.parse(rawNotifs) : [];
    cachedInsights = rawInsights ? JSON.parse(rawInsights) : [];
    lastSyncedAt = rawSynced;
  } catch (e) {
    console.warn('[Cache] read failed', e);
  }
  const firstConnection = !lastSyncedAt;
  colorLog('RED', '[API←AsyncStorage] cache/read RESPONSE', {
    docId,
    ms: Date.now() - tCache,
    firstConnection,
    lastSyncedAt,
    cached: {
      profile: !!cachedProfile,
      logs: cachedLogs.length,
      weight: cachedWeight.length,
      notifications: cachedNotifs.length,
      insights: cachedInsights.length,
    },
  });

  if (firstConnection) {
    console.log(`${C.YELLOW}[syncAllUserData] PREMIERE CONNEXION detectee (aucun synced_${docId} en cache). On va tout recuperer depuis Firestore en 3 langues (EN/FR/AR).${C.RESET}`);
  } else {
    console.log(`${C.YELLOW}[syncAllUserData] cache present (dernier sync: ${lastSyncedAt}). On va le comparer avec Firestore et mettre a jour si necessaire.${C.RESET}`);
  }

  // -----------------------------------------------------------------------
  // 2) FIRESTORE FETCH
  // -----------------------------------------------------------------------
  console.log(`${C.YELLOW}[syncAllUserData] etape 2/5 : appel Firestore pour recuperer profile + logs + weight + notifications + insights${C.RESET}`);
  explain('on appelle Firestore pour recuperer la source de verite : profile + logs + weight + notifications + insights (les 3 langues sont dans le meme doc insight)');
  colorLog('GREEN', '[API→Firestore] fetchAllUserData REQUEST', { email, docId });
  const tRemote = Date.now();
  const data = await fetchAllUserData(email);
  if (!data) {
    colorLog('BLUE', '[API←Firestore] fetchAllUserData EMPTY', { docId, ms: Date.now() - tRemote });
    return null;
  }
  explain('reponse Firestore recue — on affiche les compteurs (combien de logs, insights, etc.) et la latence en ms');
  colorLog('BLUE', '[API←Firestore] fetchAllUserData RESPONSE', {
    docId,
    ms: Date.now() - tRemote,
    remote: {
      profile: !!data.profile,
      logs: (data.logs || []).length,
      weight: (data.weightHistory || []).length,
      notifications: (data.notifications || []).length,
      insights: (data.insights || []).length,
    },
  });

  // --- CONTENU DETAILLE (cyan) : dump du contenu reel recupere ----------
  const trunc = (v: any) => typeof v === 'string'
    ? v.slice(0, 80) + (v.length > 80 ? '…' : '')
    : v;
  explain('dump du CONTENU reel des logs recus (10 premiers) : date, nom du repas, kcal, proteines, glucides, lipides');
  colorLog('CYAN', `[CONTENT] logs (top 10 / ${(data.logs || []).length})`,
    (data.logs || []).slice(0, 10).map((l: any) => ({
      date: l.date, name: trunc(l.name), kcal: l.calories,
      P: l.protein, C: l.carbs, F: l.fat, type: l.type,
    })));

  colorLog('CYAN', `[CONTENT] weight (top 10 / ${(data.weightHistory || []).length})`,
    (data.weightHistory || []).slice(0, 10).map((w: any) => ({
      date: w.date || (w.timestamp?.seconds ? new Date(w.timestamp.seconds * 1000).toISOString().slice(0, 10) : null),
      weight: w.weight,
    })));

  colorLog('CYAN', `[CONTENT] notifications (top 10 / ${(data.notifications || []).length})`,
    (data.notifications || []).slice(0, 10).map((n: any) => ({
      title: trunc(n.title), body: trunc(n.body),
      receivedAt: n.receivedAt || (n.timestamp?.seconds && new Date(n.timestamp.seconds * 1000).toISOString()),
    })));

  explain('dump des insights Gemini — on liste les sous-arbres de langue presents (en/fr/ar) et les champs texte tronques');
  colorLog('CYAN', `[CONTENT] insights (top 5 / ${(data.insights || []).length})`,
    (data.insights || []).slice(0, 5).map((i: any) => {
      const out: any = { id: i.id, periodKey: i.periodKey, source: i.source, healthScore: i.healthScore };
      if (i.en) out.en = Object.keys(i.en);
      if (i.fr) out.fr = Object.keys(i.fr);
      if (i.ar) out.ar = Object.keys(i.ar);
      for (const k of ['mealBalance', 'hydration', 'exerciseAnalysis', 'trends', 'recommendation', 'summary']) {
        if (typeof i[k] === 'string') out[k] = trunc(i[k]);
      }
      return out;
    }));

  if (data.profile) {
    const p: any = data.profile;
    colorLog('CYAN', '[CONTENT] profile', {
      email: p.email, firstName: p.firstName, lastName: p.lastName,
      language: p.language, gender: p.gender, age: p.age,
      height: p.height, weight: p.weight, targetWeight: p.targetWeight,
      activityLevel: p.activityLevel, goal: p.goal,
      onboarded: p.onboarded,
      dailyCalories: p.dailyCalories, macros: p.macros,
    });
  }

  // -----------------------------------------------------------------------
  // 3) DIFF cache vs remote
  // -----------------------------------------------------------------------
  const diff = {
    logs: (data.logs || []).length - cachedLogs.length,
    weight: (data.weightHistory || []).length - cachedWeight.length,
    notifications: (data.notifications || []).length - cachedNotifs.length,
    insights: (data.insights || []).length - cachedInsights.length,
  };
  const hasDiff =
    firstConnection ||
    diff.logs !== 0 || diff.weight !== 0 || diff.notifications !== 0 || diff.insights !== 0 ||
    JSON.stringify(cachedProfile || {}) !== JSON.stringify(data.profile || {});
  console.log('[Cache<->Firestore] DIFF', {
    firstConnection,
    hasDiff,
    diffCounts: diff,
    profileChanged: JSON.stringify(cachedProfile || {}) !== JSON.stringify(data.profile || {}),
  });

  // -----------------------------------------------------------------------
  // 4) WRITE CACHE si premiere connexion ou diff
  // -----------------------------------------------------------------------
  if (hasDiff) {
    try {
      console.log('\x1b[31m[API→AsyncStorage] cache/write REQUEST\x1b[0m', {
        docId, reason: firstConnection ? 'first-connection' : 'diff-detected',
      });
      const tW = Date.now();
      await AsyncStorage.multiSet([
        [K.profile(docId), JSON.stringify(data.profile || null)],
        [K.logs(docId), JSON.stringify(data.logs || [])],
        [K.weight(docId), JSON.stringify(data.weightHistory || [])],
        [K.notifications(docId), JSON.stringify(data.notifications || [])],
        [K.insights(docId), JSON.stringify(data.insights || [])],
        [K.synced(docId), new Date().toISOString()],
      ]);
      console.log('\x1b[31m[API←AsyncStorage] cache/write OK\x1b[0m', { docId, ms: Date.now() - tW });
    } catch (e) {
      console.warn('[Cache] write failed', e);
    }
  } else {
    console.log('[Cache] up-to-date, no write needed');
  }

  // -----------------------------------------------------------------------
  // 5) RESUME aujourd'hui + 7 derniers jours + insights 3 langues
  // -----------------------------------------------------------------------
  const todayLogs = (data.logs || []).filter((l: any) => l.date === todayKey);
  const weekLogs = filterLastNDays(data.logs || [], 7);
  const weekWeight = filterLastNDays(data.weightHistory || [], 7);

  const totalsToday = todayLogs.reduce(
    (acc: any, l: any) => ({
      calories: acc.calories + (l.calories || 0),
      protein: acc.protein + (l.protein || 0),
      carbs: acc.carbs + (l.carbs || 0),
      fat: acc.fat + (l.fat || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );

  console.log('[Dashboard] TODAY', {
    date: todayKey,
    entries: todayLogs.length,
    totals: totalsToday,
    items: todayLogs.map((l: any) => ({ name: l.name, kcal: l.calories, type: l.type })),
  });
  // Aggrege kcal + macros par jour sur les 7 derniers jours
  const byDay: Record<string, { kcal: number; entries: number; protein: number; carbs: number; fat: number }> = {};
  for (const l of weekLogs as any[]) {
    const d = l.date || (l.timestamp?.seconds
      ? new Date(l.timestamp.seconds * 1000).toISOString().slice(0, 10)
      : 'unknown');
    if (!byDay[d]) byDay[d] = { kcal: 0, entries: 0, protein: 0, carbs: 0, fat: 0 };
    byDay[d].entries += 1;
    byDay[d].kcal += l.calories || 0;
    byDay[d].protein += l.protein || 0;
    byDay[d].carbs += l.carbs || 0;
    byDay[d].fat += l.fat || 0;
  }
  // Assure qu'on a une ligne pour CHAQUE jour des 7 derniers, meme vide
  const today0 = new Date(); today0.setHours(0, 0, 0, 0);
  for (let i = 0; i < 7; i++) {
    const d = new Date(today0); d.setDate(today0.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    if (!byDay[key]) byDay[key] = { kcal: 0, entries: 0, protein: 0, carbs: 0, fat: 0 };
  }
  // Tri chronologique decroissant (aujourd'hui d'abord)
  const orderedByDay: Record<string, any> = {};
  Object.keys(byDay).sort().reverse().forEach((k) => { orderedByDay[k] = byDay[k]; });

  const firstOf = new Date(today0); firstOf.setDate(today0.getDate() - 6);
  console.log('[Dashboard] LAST_7_DAYS', {
    from: firstOf.toISOString().slice(0, 10),
    to: todayKey,
    logsCount: weekLogs.length,
    weightCount: weekWeight.length,
    byDay: orderedByDay,
  });

  // Insights : afficher la forme REELLE des docs + les 3 langues si dispo
  const insightsArr = (data.insights || []) as any[];
  const latestInsight = insightsArr[0];
  if (latestInsight) {
    // Log diagnostic : toutes les cles du doc pour comprendre sa forme
    console.log('[Dashboard] INSIGHTS_RAW_SHAPE', {
      totalDocs: insightsArr.length,
      firstDocKeys: Object.keys(latestInsight),
      firstDocId: latestInsight.id,
      periodKey: latestInsight.periodKey || null,
      source: latestInsight.source || null,
      hasEN: !!latestInsight.en,
      hasFR: !!latestInsight.fr,
      hasAR: !!latestInsight.ar,
    });

    const truncate = (v: any) => typeof v === 'string'
      ? v.slice(0, 120) + (v.length > 120 ? '…' : '')
      : v;
    const preview = (obj: any) => {
      if (!obj || typeof obj !== 'object') return null;
      const out: any = {};
      for (const k of ['healthScore', 'mealBalance', 'hydration', 'exerciseAnalysis', 'trends', 'recommendation', 'summary', 'advice']) {
        if (obj[k] !== undefined) out[k] = truncate(obj[k]);
      }
      return Object.keys(out).length ? out : null;
    };

    // Cas 1 : schema multilang avec sous-arbres en/fr/ar
    if (latestInsight.en || latestInsight.fr || latestInsight.ar) {
      console.log('[Dashboard] INSIGHTS_MULTILANG', {
        periodKey: latestInsight.periodKey,
        source: latestInsight.source,
        EN: preview(latestInsight.en),
        FR: preview(latestInsight.fr),
        AR: preview(latestInsight.ar),
      });
    } else {
      // Cas 2 : schema plat (pas de multilang) -> on dump les champs texte trouves
      const flat: any = {};
      for (const k of Object.keys(latestInsight)) {
        const v = latestInsight[k];
        if (typeof v === 'string' || typeof v === 'number') flat[k] = truncate(v);
      }
      console.log('[Dashboard] INSIGHTS_FLAT (pas de sous-arbre en/fr/ar)', flat);
    }

    // Affiche un echantillon des 5 premiers docs (ID + periode + lang)
    console.log('[Dashboard] INSIGHTS_SAMPLE', insightsArr.slice(0, 5).map((x: any) => ({
      id: x.id, periodKey: x.periodKey, source: x.source,
      updatedAt: x.updatedAt, healthScore: x.healthScore,
      langs: [x.en && 'en', x.fr && 'fr', x.ar && 'ar'].filter(Boolean),
    })));
  } else {
    console.log('[Dashboard] INSIGHTS_MULTILANG empty (aucun ai_insights en cache / Firestore)');
  }

  return data;
}

export async function getLocal<T>(email: string, kind: keyof typeof K): Promise<T | null> {
  try {
    const docId = emailToDocId(email);
    if (!docId) return null;
    const raw = await AsyncStorage.getItem((K as any)[kind](docId));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch { return null; }
}

/** Append / replace an item in a local collection after a remote write. */
export async function updateLocalCollection<T extends { id?: string }>(
  email: string,
  kind: 'logs' | 'weight' | 'notifications' | 'insights',
  item: T,
  mode: 'prepend' | 'append' | 'upsert' = 'prepend',
) {
  try {
    const docId = emailToDocId(email);
    if (!docId) return;
    const key = (K as any)[kind](docId);
    const raw = await AsyncStorage.getItem(key);
    let arr: T[] = raw ? JSON.parse(raw) : [];
    if (mode === 'upsert' && item.id) {
      arr = arr.filter((x) => x.id !== item.id);
      arr.unshift(item);
    } else if (mode === 'append') {
      arr.push(item);
    } else {
      arr.unshift(item);
    }
    await AsyncStorage.setItem(key, JSON.stringify(arr));
  } catch (e) { console.warn('[LocalDataStore] updateLocalCollection', e); }
}

export async function updateLocalProfile(email: string, patch: Record<string, any>) {
  try {
    const docId = emailToDocId(email);
    if (!docId) return;
    const key = K.profile(docId);
    const raw = await AsyncStorage.getItem(key);
    const curr = raw ? JSON.parse(raw) : {};
    await AsyncStorage.setItem(key, JSON.stringify({ ...curr, ...patch }));
  } catch (e) { console.warn('[LocalDataStore] updateLocalProfile', e); }
}

/**
 * Fires each seeded Firestore notification as a LOCAL push notification.
 * Spaced 2 seconds apart so the user sees each banner. Called from the
 * profile screen via a dedicated button.
 */
export async function triggerSeededNotifications(email: string) {
  let items: any[] = await getNotificationsHistory(email);
  // If no notifications exist yet, seed 10 samples now so the button always works.
  if (!items || items.length === 0) {
    console.log('[triggerSeeded] no existing notifications — seeding now');
    await seedTestNotifications(email);
    items = await getNotificationsHistory(email);
  }
  if (!items || items.length === 0) return 0;

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    if (req.status !== 'granted') return 0;
  }

  let delay = 1;
  for (const n of items) {
    const content = {
      title: n.title || 'Salorie',
      body: n.body || '',
      data: n.data || {},
    };
    try {
      await Notifications.scheduleNotificationAsync({
        content,
        trigger: { seconds: delay } as any,
      });
      // Mirror-write a fresh entry to Firestore so the user sees new records
      // in firebase each time the button is pressed.
      await saveNotificationToHistory(email, { request: { content } } as any);
      // Update the local mirror too
      await updateLocalCollection(email, 'notifications', {
        ...content,
        receivedAt: new Date().toISOString(),
      } as any);
      console.log('[triggerSeeded] scheduled + mirrored:', content.title);
      delay += 2;
    } catch (e) { console.warn('[triggerSeeded] schedule failed', e); }
  }
  return items.length;
}
