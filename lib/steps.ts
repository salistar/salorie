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
import { emailToDocId } from './firebase';

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

// ── Activity steps (from runs / challenges), added to Home regardless of mode ──
export async function addActivitySteps(email: string, km: number): Promise<number> {
  if (!email || !km || km <= 0) return 0;
  const key = actKey(email, stepsDay());
  try {
    const prev = Number((await AsyncStorage.getItem(key)) || '0');
    const next = prev + kmToSteps(km);
    await AsyncStorage.setItem(key, String(next));
    return next;
  } catch { return 0; }
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
  try {
    const prev = Number((await AsyncStorage.getItem(key)) || '0');
    const next = Math.max(0, prev + Math.round(count));
    await AsyncStorage.setItem(key, String(next));
    return next;
  } catch { return 0; }
}
export async function resetSimSteps(email: string): Promise<void> {
  try { await AsyncStorage.setItem(simKey(email, stepsDay()), '0'); } catch {}
}
