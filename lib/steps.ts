// Step counting helpers.
//
// Source of truth for "real" steps is Health Connect (lib/health.ts): Android
// accumulates steps continuously at the OS level — even while Salorie is closed —
// and we read the day's total on open. On top of that we keep a small local
// per-day counter of "activity steps" derived from runs / virtual challenges, so
// finishing a (real or simulated) run or challenge segment adds steps to Home.
//
// Two modes (persisted): 'real' (Health Connect + activity) and 'sim'
// (a simulated pedometer + activity) for testing without a physical device.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { emailToDocId } from './firebase';

// Files shared with the native foreground step service (same app filesDir):
//  - native_steps.json  : written by the native service (device sensor steps)
//  - activity_steps.json: written by JS (steps from runs/challenges) so the
//    native notification can include them in its total.
const NATIVE_FILE = (FileSystem.documentDirectory || '') + 'native_steps.json';
const ACTIVITY_FILE = (FileSystem.documentDirectory || '') + 'activity_steps.json';

// Today's device steps counted by the native foreground service (0 if none yet).
export async function getNativeDeviceSteps(date = stepsDay()): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(NATIVE_FILE);
    if (!info.exists) return 0;
    const raw = await FileSystem.readAsStringAsync(NATIVE_FILE);
    const o = JSON.parse(raw);
    return o?.date === date ? Number(o.steps) || 0 : 0;
  } catch { return 0; }
}

async function writeActivityFile(steps: number) {
  try {
    await FileSystem.writeAsStringAsync(ACTIVITY_FILE, JSON.stringify({ date: stepsDay(), steps }));
  } catch {}
}

// Mirror the stored activity steps to the file the native service reads, so the
// persistent notification total includes runs/challenges (called on app open).
export async function syncActivityFile(email: string): Promise<void> {
  if (!email) return;
  const steps = await getActivitySteps(email);
  await writeActivityFile(steps);
}

// Fichier des jours TERMINÉS archivés par le service natif (StepCounterService).
const HISTORY_FILE = (FileSystem.documentDirectory || '') + 'step_history.json';

/**
 * Au lancement : logge dans Firestore (+ historique Home) les jours de pas terminés
 * que le service natif a archivés (fin de journée). Idempotent (marque loggedToDb).
 */
export async function flushStepHistory(email: string): Promise<number> {
  if (!email) return 0;
  try {
    const info = await FileSystem.getInfoAsync(HISTORY_FILE);
    if (!info.exists) return 0;
    const arr = JSON.parse(await FileSystem.readAsStringAsync(HISTORY_FILE)) as
      { date: string; steps: number; loggedToDb?: boolean }[];
    if (!Array.isArray(arr) || !arr.length) return 0;
    const { addNutritionLog } = await import('./firebase');
    let logged = 0;
    for (const e of arr) {
      if (e.loggedToDb || !e.steps) continue;
      const kcal = Math.round(e.steps * 0.04); // ≈0.04 kcal/pas
      try {
        await addNutritionLog({
          userId: email, type: 'activity', name: `Pas du jour · ${e.steps}`,
          calories: kcal, protein: 0, carbs: 0, fat: 0, date: e.date,
        } as any);
        e.loggedToDb = true;
        logged++;
      } catch { /* sera retenté au prochain lancement */ }
    }
    if (logged) await FileSystem.writeAsStringAsync(HISTORY_FILE, JSON.stringify(arr));
    return logged;
  } catch { return 0; }
}

// ~0.762 m average stride → ≈1312 steps per km.
export const STEPS_PER_KM = 1312;
export function kmToSteps(km: number): number {
  return Math.max(0, Math.round((km || 0) * STEPS_PER_KM));
}

export function stepsDay(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const actKey = (email: string, date: string) => `actsteps_${emailToDocId(email)}_${date}`;
const simKey = (email: string, date: string) => `simsteps_${emailToDocId(email)}_${date}`;
const MODE_KEY = 'steps_mode';
// fix audit : verrou par cle pour serialiser les read-modify-write AsyncStorage
// (sinon deux increments concurrents se lisent la meme valeur -> un increment perdu).
const __locks: Record<string, Promise<any>> = {};
function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = __locks[key] || Promise.resolve();
  const next = prev.then(fn, fn);
  __locks[key] = next.catch(() => {});
  return next;
}

// ── Activity steps (from runs / challenges), added to Home regardless of mode ──
export async function addActivitySteps(email: string, km: number): Promise<number> {
  if (!email || !km || km <= 0) return 0;
  const key = actKey(email, stepsDay());
  return withLock(key, async () => {
    try {
      const prev = Number((await AsyncStorage.getItem(key)) || '0');
      const next = prev + kmToSteps(km);
      await AsyncStorage.setItem(key, String(next));
      writeActivityFile(next); // share with the native step service notification
      return next;
    } catch { return 0; }
  });
}
export async function getActivitySteps(email: string, date = stepsDay()): Promise<number> {
  try { return Number((await AsyncStorage.getItem(actKey(email, date))) || '0'); } catch { return 0; }
}

// ── Mode ──
export async function getStepsMode(): Promise<'real' | 'sim'> {
  try { const m = await AsyncStorage.getItem(MODE_KEY); return m === 'sim' ? 'sim' : 'real'; } catch { return 'real'; }
}
export async function setStepsMode(m: 'real' | 'sim'): Promise<void> {
  try { await AsyncStorage.setItem(MODE_KEY, m); } catch {}
}

// ── Simulated steps (sim mode) ──
export async function getSimSteps(email: string, date = stepsDay()): Promise<number> {
  try { return Number((await AsyncStorage.getItem(simKey(email, date))) || '0'); } catch { return 0; }
}
export async function addSimSteps(email: string, count: number): Promise<number> {
  if (!email || !count) return 0;
  const key = simKey(email, stepsDay());
  return withLock(key, async () => {
    try {
      const prev = Number((await AsyncStorage.getItem(key)) || '0');
      const next = Math.max(0, prev + Math.round(count));
      await AsyncStorage.setItem(key, String(next));
      return next;
    } catch { return 0; }
  });
}
export async function resetSimSteps(email: string): Promise<void> {
  try { await AsyncStorage.setItem(simKey(email, stepsDay()), '0'); } catch {}
}
