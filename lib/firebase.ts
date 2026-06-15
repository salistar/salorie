import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  orderBy,
  updateDoc,
  deleteDoc,
  limit as firestoreLimit
} from 'firebase/firestore';
import { CONFIG } from '../constants/config';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Initialize Firebase
export const app = initializeApp(CONFIG.firebaseConfig);
export const db = getFirestore(app);

/**
 * Canonical Firestore document ID for a user = sanitized email.
 * Same email → same document, regardless of Clerk id changes or auth provider.
 */
export const emailToDocId = (email: string): string => {
  if (!email) return '';
  return email.trim().toLowerCase();
};

export interface UserProfile {
  id: string;           // kept for backward compat, also written to doc — actual key is email
  email: string;
  firstName?: string;
  lastName?: string;
  imageUrl?: string;
  onboarded?: boolean;
  gender?: string;
  goal?: string;
  workoutFrequency?: string;
  birthdate?: string;
  height?: { feet: number; inches: number };
  weight?: number;
  nutritionalPlan?: any;
  language?: 'en' | 'fr' | 'ar';
  pushToken?: string;
  createdAt?: any;
}

/**
 * Saves or updates user basic info in Firestore, keyed by EMAIL.
 * Same email always resolves to the same document — no more duplicates when
 * Clerk rotates user.id or the user signs in from a different provider.
 * Also migrates legacy docs that were keyed by Clerk id.
 */
export const saveUserToFirestore = async (user: Partial<UserProfile> & { id?: string; email: string }) => {
  try {
    if (!user.email) {
      console.warn('[Firestore] saveUserToFirestore called without email, aborting');
      return;
    }
    const docId = emailToDocId(user.email);
    const userRef = doc(db, 'users', docId);
    console.log('\x1b[32m[API→Firestore] users/get REQUEST\x1b[0m', { docId, email: user.email });
    const t0 = Date.now();
    const existingSnap = await getDoc(userRef);
    console.log('\x1b[34m[API←Firestore] users/get RESPONSE\x1b[0m', {
      docId, exists: existingSnap.exists(), ms: Date.now() - t0,
    });

    // Case 1: canonical doc (keyed by email) already exists → merge
    if (existingSnap.exists()) {
      const existing = existingSnap.data() as UserProfile;
      // ANTI-OVERWRITE: si le doc existant a onboarded=true, on l'enleve du payload pour
      // qu'aucun champ onboarded=false ne puisse l'ecraser. setDoc/merge ne supprime
      // pas les champs absents, donc on conserve la valeur existante.
      const safeUser: any = { ...user };
      if (existing.onboarded === true) {
        delete safeUser.onboarded;
      }
      console.log('\x1b[32m[API→Firestore] users/merge REQUEST\x1b[0m', {
        docId,
        existingOnboarded: existing.onboarded,
        willTouchOnboarded: 'onboarded' in safeUser,
      });
      const t1 = Date.now();
      await setDoc(userRef, {
        ...safeUser,
        email: user.email,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      console.log('\x1b[34m[API←Firestore] users/merge OK\x1b[0m', { docId, ms: Date.now() - t1 });
      return;
    }

    // Case 2: no canonical doc yet. Look for legacy doc keyed by Clerk id and migrate it.
    if (user.id && user.id !== docId) {
      const legacyRef = doc(db, 'users', user.id);
      const legacySnap = await getDoc(legacyRef);
      if (legacySnap.exists()) {
        const legacyData = legacySnap.data() as UserProfile;
        console.log('[Firestore] Migrating legacy doc', user.id, '→', docId);
        await setDoc(userRef, {
          ...legacyData,
          ...user,
          email: user.email,
          updatedAt: serverTimestamp(),
          createdAt: legacyData.createdAt || serverTimestamp(),
        }, { merge: true });
        return;
      }
    }

    // Case 3: also look for any legacy doc that happened to match this email field
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('email', '==', user.email));
    const querySnap = await getDocs(q);
    if (!querySnap.empty) {
      const legacyDoc = querySnap.docs.find(d => d.id !== docId);
      if (legacyDoc) {
        const legacyData = legacyDoc.data() as UserProfile;
        console.log('[Firestore] Migrating legacy email-match doc', legacyDoc.id, '→', docId);
        await setDoc(userRef, {
          ...legacyData,
          ...user,
          email: user.email,
          updatedAt: serverTimestamp(),
          createdAt: legacyData.createdAt || serverTimestamp(),
        }, { merge: true });
        return;
      }
    }

    // Case 4: truly new user → create fresh doc keyed by email
    console.log('\x1b[32m[API→Firestore] users/create REQUEST\x1b[0m', { docId, email: user.email });
    const tNew = Date.now();
    await setDoc(userRef, {
      ...user,
      email: user.email,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    }, { merge: true });
    console.log('\x1b[34m[API←Firestore] users/create OK (new user)\x1b[0m', { docId, ms: Date.now() - tNew });
  } catch (error) {
    console.error('Error saving user to Firestore:', error);
    throw error;
  }
};

/**
 * Fetches user data from Firestore — recherche exhaustive.
 *
 * Strategie de lookup, dans l'ordre :
 *   1. Direct doc lookup par email principal (cle canonique = email sanitize)
 *   2. Direct doc lookup pour CHAQUE email alternatif (secondaires Clerk + Google externalAccount)
 *   3. Direct doc lookup par Clerk user.id (ancienne convention)
 *   4. Query scan : where email == primaryEmail
 *   5. Query scan : where email IN [tous les emails connus]
 *   6. Query scan : where id == clerkId (au cas ou un doc stocke l'id Clerk dans le champ)
 *
 * Renvoie le PREMIER doc trouve qui a `onboarded: true` (priorise un user deja onboarde
 * sur un doc vide cree pendant le sign-up flow). Si aucun avec onboarded=true, renvoie le
 * premier doc trouve.
 *
 * @param email        L'email principal (sera essaye en premier)
 * @param legacyClerkId  Le Clerk user.id pour lookup legacy
 * @param extraEmails  Emails secondaires (Clerk emailAddresses, externalAccounts) a essayer
 */
// Cache de résolution (durée de vie = session app) : une fois le docId du user
// trouvé, les appels suivants font UNE lecture (le doc, données fraîches) au lieu
// de re-dérouler les ~6-9 lookups de compatibilité legacy à chaque écran.
const resolvedUserDocId = new Map<string, string>();

export const getUserFromFirestore = async (
  email: string,
  legacyClerkId?: string,
  extraEmails?: string[]
): Promise<UserProfile | null> => {
  try {
    if (!email && !legacyClerkId && (!extraEmails || extraEmails.length === 0)) return null;

    const cacheKey = emailToDocId(email) || legacyClerkId || '';
    const cachedId = cacheKey ? resolvedUserDocId.get(cacheKey) : undefined;
    if (cachedId) {
      const snap = await getDoc(doc(db, 'users', cachedId));
      if (snap.exists()) {
        const data = snap.data() as UserProfile;
        return { ...data, id: (data as any).id || cachedId };
      }
      resolvedUserDocId.delete(cacheKey); // doc disparu → re-résolution complète
    }

    // Liste d'emails a essayer, dedupliquee, sanitizee
    const emailsToTry: string[] = [];
    const seen = new Set<string>();
    const addEmail = (e?: string) => {
      if (!e) return;
      const norm = emailToDocId(e);
      if (norm && !seen.has(norm)) { seen.add(norm); emailsToTry.push(norm); }
    };
    addEmail(email);
    (extraEmails || []).forEach(addEmail);

    console.log('\x1b[35m[Firestore] Lookup user — emails a essayer\x1b[0m', {
      primary: email,
      total: emailsToTry.length,
      list: emailsToTry,
      clerkId: legacyClerkId,
    });

    // Helper : retourne le premier doc trouve qui a onboarded=true, sinon le premier doc trouve
    let firstFound: { data: UserProfile; id: string } | null = null;
    const checkAndMaybeReturn = (data: UserProfile, docId: string, source: string) => {
      console.log('\x1b[34m[Firestore] HIT\x1b[0m', {
        source, docId,
        onboarded: data.onboarded,
        hasPlan: !!(data as any).dailyCalories,
      });
      if (!firstFound) firstFound = { data, id: docId };
      if (data.onboarded) {
        // Priorise un user deja onboarde (vrai compte) + memorise le docId
        // pour que les prochains appels fassent 1 seule lecture.
        if (cacheKey) resolvedUserDocId.set(cacheKey, docId);
        return { ...data, id: data.id || docId };
      }
      return null;
    };

    // 1+2. Direct doc lookup pour chaque email connu
    for (const docId of emailsToTry) {
      console.log('\x1b[32m[API→Firestore] users/get\x1b[0m', { docId });
      const t0 = Date.now();
      const snap = await getDoc(doc(db, 'users', docId));
      console.log('\x1b[34m[API←Firestore] users/get\x1b[0m', {
        docId, exists: snap.exists(), ms: Date.now() - t0,
      });
      if (snap.exists()) {
        const found = checkAndMaybeReturn(snap.data() as UserProfile, docId, `direct-email(${docId})`);
        if (found) return found;
      }
    }

    // 3. Legacy lookup par Clerk id (ancienne convention de cles)
    if (legacyClerkId) {
      console.log('\x1b[32m[API→Firestore] users/get (legacy clerk id)\x1b[0m', { clerkId: legacyClerkId });
      const legacySnap = await getDoc(doc(db, 'users', legacyClerkId));
      if (legacySnap.exists()) {
        const found = checkAndMaybeReturn(legacySnap.data() as UserProfile, legacyClerkId, 'legacy-clerk-id');
        if (found) return found;
      }
    }

    // 4+5. Query scan par champ email (au cas ou la cle du doc serait diff de l'email)
    if (emailsToTry.length > 0) {
      const usersRef = collection(db, 'users');
      // Firestore supporte IN avec max 10 elements
      const chunk = emailsToTry.slice(0, 10);
      console.log('\x1b[32m[API→Firestore] users where email IN\x1b[0m', { chunk });
      const q = query(usersRef, where('email', 'in', chunk));
      const querySnap = await getDocs(q);
      console.log('\x1b[34m[API←Firestore] users where email IN result\x1b[0m', { count: querySnap.size });
      for (const docSnap of querySnap.docs) {
        const found = checkAndMaybeReturn(docSnap.data() as UserProfile, docSnap.id, `scan-email(${docSnap.id})`);
        if (found) return found;
      }
    }

    // 6. Query scan par champ id == clerkId (au cas ou le doc stocke l'id Clerk dans un champ)
    if (legacyClerkId) {
      const usersRef = collection(db, 'users');
      console.log('\x1b[32m[API→Firestore] users where id ==\x1b[0m', { clerkId: legacyClerkId });
      const q = query(usersRef, where('id', '==', legacyClerkId));
      const querySnap = await getDocs(q);
      console.log('\x1b[34m[API←Firestore] users where id == result\x1b[0m', { count: querySnap.size });
      for (const docSnap of querySnap.docs) {
        const found = checkAndMaybeReturn(docSnap.data() as UserProfile, docSnap.id, `scan-id(${docSnap.id})`);
        if (found) return found;
      }
    }

    // Aucun doc avec onboarded=true → on retourne le premier doc trouve (qui aura onboarded=false)
    if (firstFound) {
      console.log('\x1b[33m[Firestore] Aucun doc onboarded=true trouve, fallback sur le 1er doc trouve\x1b[0m', {
        id: (firstFound as any).id,
        onboarded: (firstFound as any).data.onboarded,
      });
      return { ...(firstFound as any).data, id: (firstFound as any).data.id || (firstFound as any).id };
    }

    console.log('\x1b[31m[Firestore] User introuvable (nouveau user)\x1b[0m');
    return null;
  } catch (error) {
    console.warn('[Firestore] Error fetching user:', error);
    return null;
  }
};

export interface NutritionLog {
  id?: string;
  userId: string;       // now the email (same value used as doc key)
  type: 'meal' | 'activity' | 'water';
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  date: string; // YYYY-MM-DD
  timestamp: any;
  intensity?: string;
  duration?: number;
  serving?: string;
  // Slot du Diary (breakfast|lunch|snack|dinner) — optionnel ; sinon déduit de l'heure.
  slot?: string;
  // Description du repas (ingrédients + qualités/risques) — persistée au scan/log.
  description?: string;
  // Note santé (calculée on-device au scan) — persistée pour l'afficher dans diary/activité.
  note?: { grade: string; score: number; verdict: string; color?: string };
}

/** Supprime un log (Firestore + cache local) — utilisé par le Diary. */
export const deleteNutritionLog = async (email: string, logId: string): Promise<boolean> => {
  try {
    const docId = emailToDocId(email);
    if (!docId || !logId) return false;
    await deleteDoc(doc(db, 'users', docId, 'logs', logId));
    try {
      const key = `logs_${docId}`;
      const raw = await AsyncStorage.getItem(key);
      if (raw) {
        const arr = JSON.parse(raw).filter((l: any) => l.id !== logId);
        await AsyncStorage.setItem(key, JSON.stringify(arr));
      }
    } catch {}
    return true;
  } catch { return false; }
};

/**
 * Fetches nutrition logs for a specific user (by email) and date
 */
export const getNutritionLogs = async (email: string, date: string): Promise<NutritionLog[]> => {
  try {
    const docId = emailToDocId(email);
    if (!docId) return [];
    const logsRef = collection(db, 'users', docId, 'logs');
    // Query without orderBy to avoid requiring a composite index
    const q = query(logsRef, where('date', '==', date));
    console.log('\x1b[32m[API→Firestore] logs/query REQUEST\x1b[0m', { docId, date });
    const t0 = Date.now();
    const querySnapshot = await getDocs(q);
    const logs: NutritionLog[] = [];
    querySnapshot.forEach((doc) => {
      logs.push({ id: doc.id, ...doc.data() } as NutritionLog);
    });
    console.log('\x1b[34m[API←Firestore] logs/query RESPONSE\x1b[0m', {
      docId, date, ms: Date.now() - t0, count: logs.length,
    });
    // Sort client-side instead
    logs.sort((a, b) => {
      const tA = a.timestamp?.seconds || 0;
      const tB = b.timestamp?.seconds || 0;
      return tB - tA;
    });
    return logs;
  } catch (error) {
    console.warn('Error fetching nutrition logs:', error);
    return [];
  }
};

/**
 * Adds a new nutrition log. `log.userId` must be the user's email.
 */
export const addNutritionLog = async (log: Omit<NutritionLog, 'id' | 'timestamp'>) => {
  const docId = emailToDocId(log.userId);
  if (!docId) throw new Error('addNutritionLog requires an email as userId');

  // 1) OFFLINE-FIRST : on met TOUJOURS le repas dans le cache local d'abord, pour
  //    qu'il s'affiche immédiatement (dashboards) même sans réseau.
  try {
    const key = `logs_${docId}`;
    const raw = await AsyncStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    arr.push({ ...log, userId: docId });
    await AsyncStorage.setItem(key, JSON.stringify(arr));
  } catch {}

  // 2) On détecte l'état réseau AVANT d'écrire. Hors-ligne, on NE lance PAS addDoc
  //    (Firestore RN ne rejette pas hors-ligne → l'await bloquerait l'UI) : on met
  //    directement en FILE D'ATTENTE. En ligne, addDoc normal (file si échec réel).
  //    → jamais de blocage UI, jamais de doublon.
  const enqueue = async () => {
    try {
      const qkey = `pending_logs_${docId}`;
      const raw = await AsyncStorage.getItem(qkey);
      const q = raw ? JSON.parse(raw) : [];
      q.push({ ...log, userId: docId, queuedAt: Date.now() });
      await AsyncStorage.setItem(qkey, JSON.stringify(q));
    } catch {}
  };
  let online = true;
  try {
    const Network = await import('expo-network');
    const s = await Network.getNetworkStateAsync();
    online = s?.isConnected !== false;
  } catch { online = true; }

  if (online) {
    try {
      const logsRef = collection(db, 'users', docId, 'logs');
      const t0 = Date.now();
      await addDoc(logsRef, { ...log, userId: docId, timestamp: serverTimestamp() });
      console.log('\x1b[34m[API←Firestore] logs/add OK\x1b[0m', { docId, ms: Date.now() - t0 });
    } catch (error: any) {
      console.warn('[offline] addNutritionLog échec en ligne → file de sync:', error?.message || error);
      await enqueue();
    }
  } else {
    console.warn('[offline] addNutritionLog hors-ligne → mis en file de sync');
    await enqueue();
  }

  // 3) Best-effort : marquer les insights périmés (lazy import pour éviter un cycle).
  try {
    const { markInsightsStale } = await import('./InsightsService');
    markInsightsStale(log.userId).catch(() => {});
  } catch {}

  // 4) Event Bus (Étape 2) — émet un événement typé (fire-and-forget, network-safe).
  logEvent(log.userId, log.type === 'activity' ? 'activity_logged' : 'meal_logged', {
    name: (log as any).name, calories: (log as any).calories, mealType: log.type,
  });
};

/** Nombre de logs en attente de synchronisation (hors-ligne). */
export const pendingLogsCount = async (email: string): Promise<number> => {
  const docId = emailToDocId(email);
  if (!docId) return 0;
  try {
    const raw = await AsyncStorage.getItem(`pending_logs_${docId}`);
    return raw ? (JSON.parse(raw) as any[]).length : 0;
  } catch { return 0; }
};

/** Rejoue les logs en file d'attente (appelé au retour réseau). Renvoie le nb synchronisé. */
export const flushPendingLogs = async (email: string): Promise<number> => {
  const docId = emailToDocId(email);
  if (!docId) return 0;
  const qkey = `pending_logs_${docId}`;
  let q: any[] = [];
  try { const raw = await AsyncStorage.getItem(qkey); q = raw ? JSON.parse(raw) : []; } catch { return 0; }
  if (!q.length) return 0;
  const remaining: any[] = [];
  for (const log of q) {
    try {
      await addDoc(collection(db, 'users', docId, 'logs'), {
        ...log, userId: docId, timestamp: serverTimestamp(),
      });
    } catch { remaining.push(log); }
  }
  try { await AsyncStorage.setItem(qkey, JSON.stringify(remaining)); } catch {}
  return q.length - remaining.length;
};

/**
 * Adds a weight log entry for trend tracking (user keyed by email)
 */
export const addWeightLog = async (email: string, weight: number) => {
  try {
    const docId = emailToDocId(email);
    if (!docId) return;
    const weightRef = collection(db, 'users', docId, 'weight_history');
    console.log('\x1b[32m[API→Firestore] weight_history/add REQUEST\x1b[0m', { docId, weight });
    const t0 = Date.now();
    await addDoc(weightRef, {
      weight,
      date: (() => {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      })(),
      timestamp: serverTimestamp(),
    });
    console.log('\x1b[34m[API←Firestore] weight_history/add OK\x1b[0m', { docId, ms: Date.now() - t0 });
    logEvent(email, 'weight_logged', { weight }); // Event Bus (fire-and-forget)
  } catch (error) {
    console.error('Error logging weight:', error);
    throw error;
  }
};

/**
 * Event Bus (Lot 4 / Étape 2) — émet un événement typé dans la collection `events`.
 * Best-effort + network-safe (ne lance addDoc QUE en ligne → pas de hang offline) +
 * fire-and-forget (les appelants ne l'attendent pas). Consommé par l'admin web.
 */
export const logEvent = async (email: string, type: string, data: Record<string, any> = {}) => {
  try {
    const docId = emailToDocId(email);
    if (!docId) return;
    let online = true;
    try {
      const Network = await import('expo-network');
      const s = await Network.getNetworkStateAsync();
      online = s?.isConnected !== false;
    } catch { online = true; }
    if (!online) return; // événements best-effort : on saute hors-ligne (pas de blocage)
    // Sous-collection users/{docId}/events (autorisée par les règles Firestore ;
    // la collection top-level `events` est refusée). Le CDC lit via collectionGroup.
    await addDoc(collection(db, 'users', docId, 'events'), { userId: docId, type, data, timestamp: serverTimestamp() });
  } catch { /* best-effort */ }
};

/**
 * Updates user's push notification token (user keyed by email).
 * Uses setDoc with merge so it never fails when the user doc hasn't been
 * created yet (avoids "No document to update" race with the onboarding sync).
 */
export const updatePushToken = async (email: string, token: string) => {
  try {
    const docId = emailToDocId(email);
    if (!docId) return;
    const userRef = doc(db, 'users', docId);
    await setDoc(userRef, { pushToken: token, updatedAt: serverTimestamp() }, { merge: true });
  } catch (error) {
    console.error('Error updating push token:', error);
  }
};

/**
 * Persist the user's preferred language (en/fr/ar) so other devices/sessions
 * load in the same language chosen at first connection.
 */
export const updateUserLanguage = async (email: string, language: string) => {
  try {
    const docId = emailToDocId(email);
    if (!docId) return;
    const userRef = doc(db, 'users', docId);
    await setDoc(userRef, { language, updatedAt: serverTimestamp() }, { merge: true });
  } catch (error) {
    console.error('Error updating user language:', error);
  }
};

/**
 * Met à jour la cible calorique quotidienne (TDEE adaptatif → "Appliquer").
 * merge:true → ne touche QUE dailyCalories dans nutritionalPlan (deep merge),
 * les autres champs du plan sont préservés.
 */
export const updateDailyCalories = async (email: string, dailyCalories: number) => {
  try {
    const docId = emailToDocId(email);
    if (!docId || !(dailyCalories > 0)) return;
    const userRef = doc(db, 'users', docId);
    await setDoc(userRef, { nutritionalPlan: { dailyCalories }, updatedAt: serverTimestamp() }, { merge: true });
  } catch (error) {
    console.error('Error updating dailyCalories:', error);
  }
};

/**
 * Fetches all notification history entries for a user (keyed by email)
 */
export const getNotificationsHistory = async (email: string) => {
  try {
    const docId = emailToDocId(email);
    if (!docId) return [];
    const ref = collection(db, 'users', docId, 'notifications_history');
    const q = query(ref, orderBy('timestamp', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.warn('Error fetching notifications history:', error);
    return [];
  }
};

/**
 * Seeds a few demo notifications for a user if they don't have any yet.
 * Each notification carries a `kind` field that the UI uses to navigate to
 * the proper card when the user taps on it from the bell screen.
 */
export const seedTestNotifications = async (email: string) => {
  try {
    const docId = emailToDocId(email);
    if (!docId) return;
    const ref = collection(db, 'users', docId, 'notifications_history');
    // Re-seed si on a moins de 10 notifications (upgrade depuis version precedente
    // qui n'en semait que 4). Utilisateur test : on veut exactement 10.
    const existing = await getDocs(query(ref, firestoreLimit(10)));
    if (existing.size >= 10) return;

    const nowIso = new Date().toISOString();
    const samples = [
      { title: '🎉 Welcome to Salorie', body: 'Your personalized nutrition journey starts now. Tap to see your profile.', data: { kind: 'profile' } },
      { title: '🔥 Daily calorie goal', body: 'Your daily calorie target is ready. Tap to see the breakdown.', data: { kind: 'calories' } },
      { title: '💧 Hydration reminder', body: "Don't forget to drink water today. Tap to see your water card.", data: { kind: 'water' } },
      { title: '📈 Weekly insights', body: 'Fresh AI insights are available. Tap to open analytics.', data: { kind: 'analytics' } },
      { title: '🏃 Move a little', body: 'A short 10-minute walk can boost your daily burn. Log it after!', data: { kind: 'analytics' } },
      { title: '🥗 Lunch idea', body: 'Grilled chicken + quinoa + greens hits your macro targets perfectly.', data: { kind: 'calories' } },
      { title: '⚖️ Weigh-in reminder', body: "It's been a few days — log your weight to keep trends accurate.", data: { kind: 'profile' } },
      { title: '🧠 Streak alert', body: "You're on a 5-day logging streak. Keep it alive today!", data: { kind: 'analytics' } },
      { title: '🍎 Snack smart', body: 'An apple + a handful of almonds = balanced energy for the afternoon.', data: { kind: 'calories' } },
      { title: '🌙 Good night', body: 'Quality sleep fuels fat loss. Wind down 60 min before bed.', data: { kind: 'profile' } },
    ];

    for (const s of samples) {
      await addDoc(ref, {
        title: s.title,
        body: s.body,
        data: s.data,
        receivedAt: nowIso,
        timestamp: serverTimestamp(),
        read: false,
      });
    }
    console.log('[Firestore] Seeded', samples.length, 'demo notifications for', docId);
  } catch (error) {
    console.warn('Error seeding test notifications:', error);
  }
};

/**
 * Synchronise TOUTES les donnees d'un utilisateur depuis Firestore
 * vers le stockage local du telephone (AsyncStorage).
 * Appele a la premiere connexion et a chaque reconnexion pour garder
 * le cache a jour. Retourne l'objet agrege.
 */
export const fetchAllUserData = async (email: string) => {
  const docId = emailToDocId(email);
  if (!docId) return null;

  const out: any = { email, docId, profile: null, logs: [], weightHistory: [], notifications: [], insights: [] };

  try {
    const profile = await getUserFromFirestore(email);
    out.profile = profile;
  } catch (e) { console.warn('[sync] profile', e); }

  try {
    // Logs des 30 derniers jours
    const logsRef = collection(db, 'users', docId, 'logs');
    console.log('\x1b[32m[API→Firestore] logs/list REQUEST\x1b[0m', { docId, limit: 500 });
    const tL = Date.now();
    const snap = await getDocs(query(logsRef, orderBy('timestamp', 'desc'), firestoreLimit(500)));
    out.logs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const todayKey = new Date().toISOString().slice(0, 10);
    const todayItems = (out.logs as any[]).filter((l: any) => l.date === todayKey);
    const totalKcalToday = todayItems.reduce((s: number, l: any) => s + (l.calories || 0), 0);
    console.log('\x1b[34m[API←Firestore] logs/list RESPONSE\x1b[0m', {
      docId, ms: Date.now() - tL,
      total: out.logs.length,
      todayEntries: todayItems.length,
      todayTotalKcal: totalKcalToday,
      todayPreview: todayItems.slice(0, 5).map((l: any) => ({
        name: l.name, kcal: l.calories, type: l.type,
      })),
    });
  } catch (e) { console.warn('[sync] logs', e); }

  try {
    const wRef = collection(db, 'users', docId, 'weight_history');
    console.log('\x1b[32m[API→Firestore] weight_history/list REQUEST\x1b[0m', { docId, limit: 200 });
    const tW = Date.now();
    const snap = await getDocs(query(wRef, orderBy('timestamp', 'desc'), firestoreLimit(200)));
    out.weightHistory = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    console.log('\x1b[34m[API←Firestore] weight_history/list RESPONSE\x1b[0m', {
      docId, ms: Date.now() - tW, count: out.weightHistory.length,
      latest: (out.weightHistory as any[])[0]?.weight ?? null,
    });
  } catch (e) { console.warn('[sync] weight', e); }

  try {
    out.notifications = await getNotificationsHistory(email);
  } catch (e) { console.warn('[sync] notifs', e); }

  try {
    const iRef = collection(db, 'users', docId, 'ai_insights');
    // Les docs ai_insights ont `updatedAt` (number), pas `timestamp`.
    // On liste sans orderBy puis on trie cote client pour tolérer les anciens docs.
    console.log('\x1b[32m[API→Firestore] ai_insights/list REQUEST\x1b[0m', { docId });
    const tI = Date.now();
    const snap = await getDocs(query(iRef, firestoreLimit(20)));
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
    items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    out.insights = items;
    console.log('\x1b[34m[API←Firestore] ai_insights/list RESPONSE\x1b[0m', {
      docId, ms: Date.now() - tI, count: items.length,
      periodKeys: items.slice(0, 5).map((x: any) => x.periodKey || x.id),
    });
  } catch (e) { console.warn('[sync] insights', e); }

  return out;
};

/**
 * Fetches admin notification configuration
 */
export const getAdminNotificationConfig = async () => {
  try {
    const configRef = doc(db, 'admin', 'notifications_config');
    const snapshot = await getDoc(configRef);
    if (snapshot.exists()) return snapshot.data();
    return {
      breakfast: "Time for a healthy start! Log your breakfast. 🍎",
      lunch: "Mid-day energy check! What's for lunch? 🥗",
      dinner: "Wind down and log your final meal of the day. 🍲",
      encouragement: "Keep the momentum going! Log an activity to stay on track. ⚡"
    };
  } catch (error) {
    console.error('Error fetching notification config:', error);
    return {
      breakfast: "Time for a healthy start! Log your breakfast. 🍎",
      lunch: "Mid-day energy check! What's for lunch? 🥗",
      dinner: "Wind down and log your final meal of the day. 🍲",
      encouragement: "Keep the momentum going! Log an activity to stay on track. ⚡"
    };
  }
};

/**
 * Saves a received notification to the user's history (user keyed by email)
 */
export const saveNotificationToHistory = async (email: string, notification: any) => {
  try {
    const docId = emailToDocId(email);
    if (!docId) return;
    const historyRef = collection(db, 'users', docId, 'notifications_history');
    await addDoc(historyRef, {
      title: notification.request.content.title,
      body: notification.request.content.body,
      data: notification.request.content.data || {},
      receivedAt: new Date().toISOString(),
      timestamp: serverTimestamp()
    });
    console.log('Notification saved to history');
  } catch (error) {
    console.error('Error saving notification history:', error);
  }
};

/**
 * Saves AI-generated bento insights to Firestore (user keyed by email)
 */
export const saveAiInsights = async (email: string, insights: any) => {
  try {
    const docId = emailToDocId(email);
    if (!docId) return;
    const insightsRef = collection(db, 'users', docId, 'ai_insights');
    await addDoc(insightsRef, {
      ...insights,
      generatedAt: new Date().toISOString(),
      timestamp: serverTimestamp()
    });
  } catch (error) {
    console.error('Error saving AI insights:', error);
  }
};

/**
 * Gets the latest AI insights (returns null if older than 6 hours)
 */
export const getLatestAiInsights = async (email: string) => {
  try {
    const docId = emailToDocId(email);
    if (!docId) return null;
    const insightsRef = collection(db, 'users', docId, 'ai_insights');
    const q = query(insightsRef, orderBy('timestamp', 'desc'), firestoreLimit(1));
    const snapshot = await getDocs(q);

    if (snapshot.empty) return null;

    const data = snapshot.docs[0].data();
    const generatedAt = new Date(data.generatedAt);
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);

    if (generatedAt < sixHoursAgo) return null;

    return data;
  } catch (error) {
    console.error('Error getting AI insights:', error);
    return null;
  }
};
