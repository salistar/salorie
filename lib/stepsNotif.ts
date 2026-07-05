// Steps notification helpers.
//
// The persistent "steps" notification is now owned by the native foreground
// service (StepCounterService.kt), which counts the device step sensor and
// updates the notification live — even when the app is closed. JS therefore no
// longer posts its own notification (that would duplicate it); it only ensures
// the POST_NOTIFICATIONS permission is granted (required for the foreground
// service notification on Android 13+) and remembers the user's email.
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PermissionsAndroid, Platform } from 'react-native';

const EMAIL_KEY = 'current_email';

export async function rememberEmail(email: string) {
  try { if (email) await AsyncStorage.setItem(EMAIL_KEY, email); } catch {}
}

/**
 * Demande ACTIVITY_RECOGNITION (Android 10+) — REQUISE pour lire le capteur de pas
 * et démarrer le foreground service "health" (Android 14+). Sans elle, le
 * StepCounterService ne démarre pas → 0 pas. Appelée au montage de StepsCard.
 */
export async function ensureStepsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    if (typeof Platform.Version === 'number' && Platform.Version < 29) return true;
    const perm = (PermissionsAndroid.PERMISSIONS as any).ACTIVITY_RECOGNITION;
    if (!perm) return true;
    if (await PermissionsAndroid.check(perm)) return true;
    const res = await PermissionsAndroid.request(perm);
    return res === PermissionsAndroid.RESULTS.GRANTED;
  } catch { return false; }
}

export async function ensureNotifPermission(): Promise<boolean> {
  // On profite de ce passage pour aussi demander ACTIVITY_RECOGNITION (capteur pas).
  ensureStepsPermission().catch(() => {});
  try {
    const s = await Notifications.getPermissionsAsync();
    if (s.granted) return true;
    const r = await Notifications.requestPermissionsAsync();
    return !!r.granted;
  } catch { return false; }
}

// Kept for API compatibility (run.tsx / challenge.tsx). The native service picks
// up new activity steps from activity_steps.json on its next sensor update, so
// there is nothing for JS to post here.
export async function refreshStepsNotification() { /* native service owns the notification */ }
export async function updateStepsNotification(_steps: number) { /* no-op */ }
export async function registerStepsBackground() { /* native foreground service replaces background-fetch */ }
