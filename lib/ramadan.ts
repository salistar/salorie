// Mode Ramadan — logique pure + API (best-effort, try/catch partout).
//
// Ce module fournit tout le nécessaire pour un « Défi Ramadan » objectif-aware :
//  1) getFastTimes  : horaires jeûne via API Aladhan (gratuite, sans clé).
//  2) isRamadan     : détection du mois de Ramadan (hijri.month.number === 9).
//  3) splitBudget   : répartition Suhoor(~40%)/Iftar(~60%) du budget kcal/macros.
//  4) hydrationPlan : créneaux d'hydratation (~8 verres) entre Iftar et Suhoor.
//  5) Firestore     : prefs (city/enabled) + journal des jours jeûnés (+ streak).
//
// Convention de clé user : `uid` = email sanitizé (emailToDocId), comme partout
// dans l'app. Persistance sous users/<uid>/ramadan.
//
// Note API Aladhan : method=3 = Muslim World League. `timingsByCity` renvoie
//   data.timings.{Fajr,Maghrib} au format "HH:MM (TZ)" et
//   data.date.hijri.month.number (1..12). Le Fajr marque la fin du Suhoor et le
//   début du jeûne ; le Maghrib marque l'Iftar (rupture du jeûne).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, emailToDocId } from './firebase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Horaires clés d'un jour de jeûne (format "HH:MM"). */
export interface FastTimes {
  /** Fin du Suhoor / début du jeûne (= Fajr). "HH:MM" */
  fajr: string;
  /** Iftar / rupture du jeûne (= Maghrib). "HH:MM" */
  maghrib: string;
  /** Ville résolue (celle demandée). */
  city: string;
  /** Pays résolu. */
  country: string;
  /** Date "YYYY-MM-DD" à laquelle correspondent ces horaires. */
  date: string;
  /** Numéro du mois hijri (1..12) si disponible (9 = Ramadan). */
  hijriMonth?: number;
}

/** Un « portion » du budget nutritionnel (repas Suhoor ou Iftar). */
export interface MealBudget {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Nombre de verres d'eau recommandés à ce repas. */
  water: number;
}

/** Budget quotidien réparti entre Suhoor et Iftar. */
export interface SplitBudget {
  suhoor: MealBudget;
  iftar: MealBudget;
}

/** Macros du jour (celles de useNutritionData.goals ou du plan Firestore). */
export interface Macros {
  protein: number;
  carbs: number;
  fat: number;
}

/** Un créneau d'hydratation entre Iftar et Suhoor. */
export interface HydrationSlot {
  /** Heure du rappel "HH:MM". */
  time: string;
  /** Numéro du verre (1..n). */
  glass: number;
  /** Libellé court (repère : Iftar / soirée / Suhoor). */
  label: 'iftar' | 'evening' | 'suhoor';
}

/** Préférences Ramadan persistées (Firestore users/<uid>/ramadan). */
export interface RamadanPrefs {
  city: string;
  country: string;
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

export const DEFAULT_CITY = 'Casablanca';
export const DEFAULT_COUNTRY = 'Morocco';

/** Part du budget allouée au Suhoor (le reste va à l'Iftar). */
export const SUHOOR_SHARE = 0.4;
/** Nombre de verres d'eau cible sur la fenêtre Iftar→Suhoor. */
export const HYDRATION_TARGET_GLASSES = 8;

const CACHE_PREFIX = 'ramadan_fasttimes_v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// ---------------------------------------------------------------------------
// Helpers date/heure (purs)
// ---------------------------------------------------------------------------

/** Date locale au format "YYYY-MM-DD". */
function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Format attendu par Aladhan pour `timingsByCity/{date}` : "DD-MM-YYYY". */
function toDMY(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${day}-${m}-${y}`;
}

/** Nettoie une valeur d'horaire Aladhan ("05:31 (WEST)" -> "05:31"). */
function cleanHM(raw: unknown): string {
  return String(raw ?? '').trim().split(' ')[0];
}

/** "HH:MM" -> minutes depuis minuit (NaN-safe -> 0). */
function hmToMinutes(hm: string): number {
  const [h, m] = String(hm || '').split(':').map((x) => parseInt(x, 10));
  const hh = Number.isFinite(h) ? h : 0;
  const mm = Number.isFinite(m) ? m : 0;
  return ((hh % 24) + 24) % 24 * 60 + ((mm % 60) + 60) % 60;
}

/** minutes depuis minuit -> "HH:MM" (wrap sur 24h). */
function minutesToHM(mins: number): number | string {
  const total = ((Math.round(mins) % 1440) + 1440) % 1440;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Arrondi à 1 décimale, NaN-safe (>= 0). */
function round1(v: number): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 10) / 10;
}

/** Entier NaN-safe (>= 0). */
function int0(v: number): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n);
}

// ---------------------------------------------------------------------------
// 1) Horaires de jeûne (API Aladhan) — best-effort + cache 24h
// ---------------------------------------------------------------------------

/**
 * Horaires de jeûne d'une ville pour une date donnée (aujourd'hui par défaut).
 * Fajr = fin du Suhoor / début du jeûne ; Maghrib = Iftar.
 * Cache AsyncStorage 24h par (ville, pays, date). Renvoie null en cas d'échec.
 */
export async function getFastTimes(
  city: string = DEFAULT_CITY,
  country: string = DEFAULT_COUNTRY,
  date?: Date,
): Promise<FastTimes | null> {
  const c = (city || '').trim() || DEFAULT_CITY;
  const co = (country || '').trim() || DEFAULT_COUNTRY;
  const d = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
  const ymd = toYMD(d);
  const cacheKey = `${CACHE_PREFIX}:${co.toLowerCase()}:${c.toLowerCase()}:${ymd}`;

  // Lecture cache (24h).
  try {
    const raw = await AsyncStorage.getItem(cacheKey);
    if (raw) {
      const parsed = JSON.parse(raw) as { at: number; value: FastTimes };
      if (parsed?.value && Date.now() - (parsed.at || 0) < CACHE_TTL_MS) {
        return parsed.value;
      }
    }
  } catch {
    /* cache indisponible — on interroge l'API */
  }

  try {
    const url =
      `https://api.aladhan.com/v1/timingsByCity/${toDMY(d)}` +
      `?city=${encodeURIComponent(c)}&country=${encodeURIComponent(co)}&method=3`;
    const res = await fetch(url);
    const json: any = await res.json();
    const timings = json?.data?.timings;
    const fajr = cleanHM(timings?.Fajr);
    const maghrib = cleanHM(timings?.Maghrib);
    if (!fajr || !maghrib) return null;

    const hijriMonthRaw = json?.data?.date?.hijri?.month?.number;
    const hijriMonth = Number.isFinite(Number(hijriMonthRaw))
      ? Number(hijriMonthRaw)
      : undefined;

    const value: FastTimes = { fajr, maghrib, city: c, country: co, date: ymd, hijriMonth };
    try {
      await AsyncStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), value }));
    } catch {
      /* écriture cache best-effort */
    }
    return value;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 2) Détection du Ramadan
// ---------------------------------------------------------------------------

/**
 * Indique si `date` (aujourd'hui par défaut) tombe pendant le Ramadan.
 * Source primaire : champ hijri d'Aladhan (hijri.month.number === 9).
 * Best-effort : en cas d'échec réseau, renvoie false (le mode reste désactivable
 * manuellement via les prefs).
 */
export async function isRamadan(date?: Date): Promise<boolean> {
  try {
    const t = await getFastTimes(DEFAULT_CITY, DEFAULT_COUNTRY, date);
    return t?.hijriMonth === 9;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// 3) Répartition du budget (pure) — objectif-aware
// ---------------------------------------------------------------------------

/**
 * Répartit le budget quotidien entre Suhoor (~40%) et Iftar (~60%).
 * Objectif-aware : `dailyKcalTarget` + `macros` proviennent de useNutritionData
 * (goals) ou du plan Firestore, déjà ajustés à l'objectif de l'utilisateur.
 *
 * Ajustements santé (indépendants du `goal`) :
 *  - Protéines : surpondérées au Suhoor (satiété + préservation musculaire
 *    pendant la journée de jeûne) — 50% Suhoor / 50% Iftar au lieu de 40/60.
 *  - Hydratation : priorité au Suhoor (charge le corps avant la journée) —
 *    ~55% des verres au Suhoor.
 *
 * @param goal réservé pour d'éventuels ajustements futurs ; le budget d'entrée
 *   est déjà objectif-aware, on n'écrase donc pas les cibles.
 */
export function splitBudget(
  dailyKcalTarget: number,
  macros: Macros,
  goal?: 'lose' | 'maintain' | 'gain',
): SplitBudget {
  void goal; // le budget d'entrée est déjà ajusté à l'objectif
  const kcal = round1(dailyKcalTarget);
  const protein = round1(macros?.protein ?? 0);
  const carbs = round1(macros?.carbs ?? 0);
  const fat = round1(macros?.fat ?? 0);

  const suhoorShare = SUHOOR_SHARE; // 0.4
  const iftarShare = 1 - suhoorShare; // 0.6

  // Protéines : réparties plus équitablement (satiété diurne).
  const proteinSuhoorShare = 0.5;

  // Verres d'eau : légère priorité au Suhoor.
  const suhoorGlasses = Math.round(HYDRATION_TARGET_GLASSES * 0.55);
  const iftarGlasses = HYDRATION_TARGET_GLASSES - suhoorGlasses;

  const suhoor: MealBudget = {
    kcal: round1(kcal * suhoorShare),
    protein: round1(protein * proteinSuhoorShare),
    carbs: round1(carbs * suhoorShare),
    fat: round1(fat * suhoorShare),
    water: suhoorGlasses,
  };
  const iftar: MealBudget = {
    kcal: round1(kcal * iftarShare),
    protein: round1(protein * (1 - proteinSuhoorShare)),
    carbs: round1(carbs * iftarShare),
    fat: round1(fat * iftarShare),
    water: iftarGlasses,
  };

  return { suhoor, iftar };
}

// ---------------------------------------------------------------------------
// 4) Plan d'hydratation (pur)
// ---------------------------------------------------------------------------

/**
 * Répartit ~8 verres d'eau en créneaux réguliers entre l'Iftar et le Suhoor
 * (fenêtre où boire est autorisé). Le Suhoor étant le lendemain matin, la
 * fenêtre traverse minuit : on gère le wrap sur 24h.
 *
 * @param iftarTime  heure de l'Iftar "HH:MM" (Maghrib).
 * @param suhoorTime heure de fin du Suhoor "HH:MM" (Fajr, le lendemain).
 * @param glasses    nombre de verres cible (défaut 8).
 * @returns liste de créneaux répartis uniformément, incluant l'Iftar (verre 1)
 *   et un dernier verre au Suhoor.
 */
export function hydrationPlan(
  iftarTime: string,
  suhoorTime: string,
  glasses: number = HYDRATION_TARGET_GLASSES,
): HydrationSlot[] {
  const n = int0(glasses);
  if (n <= 0) return [];

  const start = hmToMinutes(iftarTime); // Iftar
  let end = hmToMinutes(suhoorTime); // Suhoor (lendemain)
  // Fenêtre traversant minuit : ajoute 24h si le Suhoor est « avant » l'Iftar.
  if (end <= start) end += 1440;
  const span = end - start; // durée de la fenêtre en minutes

  const slots: HydrationSlot[] = [];
  // n verres -> n-1 intervalles réguliers (1er verre à l'Iftar, dernier au Suhoor).
  const step = n > 1 ? span / (n - 1) : 0;

  for (let i = 0; i < n; i++) {
    const mins = start + step * i;
    let label: HydrationSlot['label'] = 'evening';
    if (i === 0) label = 'iftar';
    else if (i === n - 1) label = 'suhoor';
    slots.push({
      time: minutesToHM(mins) as string,
      glass: i + 1,
      label,
    });
  }
  return slots;
}

// ---------------------------------------------------------------------------
// 5) Persistance Firestore (users/<uid>/ramadan)
// ---------------------------------------------------------------------------

/** Doc unique de prefs : users/<uid>/ramadan/prefs. */
function prefsPath(uid: string) {
  return { col: 'users', uid, sub: 'ramadan', id: 'prefs' };
}

/**
 * Enregistre les préférences Ramadan (best-effort).
 * @param uid email de l'utilisateur (sera sanitizé en doc id).
 */
export async function setRamadanPrefs(
  uid: string,
  prefs: Partial<RamadanPrefs>,
): Promise<boolean> {
  const id = emailToDocId(uid);
  if (!id) return false;
  try {
    const p = prefsPath(id);
    const ref = doc(db, p.col, p.uid, p.sub, p.id);
    const payload: any = { updatedAt: serverTimestamp() };
    if (typeof prefs.city === 'string') payload.city = prefs.city.trim() || DEFAULT_CITY;
    if (typeof prefs.country === 'string') payload.country = prefs.country.trim() || DEFAULT_COUNTRY;
    if (typeof prefs.enabled === 'boolean') payload.enabled = prefs.enabled;
    await setDoc(ref, payload, { merge: true });
    return true;
  } catch (e) {
    console.warn('[ramadan] setRamadanPrefs failed', e);
    return false;
  }
}

/**
 * Lit les préférences Ramadan. Renvoie des valeurs par défaut si absentes ou
 * en cas d'échec (best-effort — jamais de throw).
 */
export async function getRamadanPrefs(uid: string): Promise<RamadanPrefs> {
  const fallback: RamadanPrefs = {
    city: DEFAULT_CITY,
    country: DEFAULT_COUNTRY,
    enabled: false,
  };
  const id = emailToDocId(uid);
  if (!id) return fallback;
  try {
    const p = prefsPath(id);
    const snap = await getDoc(doc(db, p.col, p.uid, p.sub, p.id));
    if (!snap.exists()) return fallback;
    const d: any = snap.data() || {};
    return {
      city: typeof d.city === 'string' && d.city.trim() ? d.city.trim() : DEFAULT_CITY,
      country:
        typeof d.country === 'string' && d.country.trim() ? d.country.trim() : DEFAULT_COUNTRY,
      enabled: d.enabled === true,
    };
  } catch (e) {
    console.warn('[ramadan] getRamadanPrefs failed', e);
    return fallback;
  }
}

/** Doc du journal des jours jeûnés : users/<uid>/ramadan/log. */
function logPath(uid: string) {
  return { col: 'users', uid, sub: 'ramadan', id: 'log' };
}

/**
 * Enregistre un jour jeûné (défi « jours jeûnés »). Idempotent : un même jour
 * n'est compté qu'une fois. Best-effort. Renvoie le tableau des dates jeûnées
 * (YYYY-MM-DD) après mise à jour, ou null en cas d'échec.
 */
export async function logFastDay(uid: string, date?: Date): Promise<string[] | null> {
  const id = emailToDocId(uid);
  if (!id) return null;
  const d = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
  const ymd = toYMD(d);
  try {
    const p = logPath(id);
    const ref = doc(db, p.col, p.uid, p.sub, p.id);
    const snap = await getDoc(ref);
    const prev: string[] = snap.exists() && Array.isArray((snap.data() as any)?.days)
      ? (snap.data() as any).days
      : [];
    if (prev.includes(ymd)) return prev;
    const next = [...prev, ymd].sort();
    await setDoc(ref, { days: next, updatedAt: serverTimestamp() }, { merge: true });
    return next;
  } catch (e) {
    console.warn('[ramadan] logFastDay failed', e);
    return null;
  }
}

/**
 * Calcule la « streak » de jours jeûnés consécutifs se terminant aujourd'hui
 * (ou hier — on tolère un décalage d'un jour pour ne pas casser la série avant
 * l'Iftar du soir). Best-effort : renvoie 0 en cas d'échec.
 */
export async function getFastStreak(uid: string, today?: Date): Promise<number> {
  const id = emailToDocId(uid);
  if (!id) return 0;
  try {
    const p = logPath(id);
    const snap = await getDoc(doc(db, p.col, p.uid, p.sub, p.id));
    const days: string[] =
      snap.exists() && Array.isArray((snap.data() as any)?.days)
        ? (snap.data() as any).days
        : [];
    if (!days.length) return 0;
    const set = new Set(days);

    const base = today instanceof Date && !isNaN(today.getTime()) ? today : new Date();
    // Point de départ : aujourd'hui si présent, sinon hier (tolérance 1 jour).
    const cursor = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    if (!set.has(toYMD(cursor))) {
      cursor.setDate(cursor.getDate() - 1);
      if (!set.has(toYMD(cursor))) return 0;
    }

    let streak = 0;
    while (set.has(toYMD(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  } catch (e) {
    console.warn('[ramadan] getFastStreak failed', e);
    return 0;
  }
}
