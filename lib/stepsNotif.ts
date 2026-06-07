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

const EMAIL_KEY = 'current_email';

export async function rememberEmail(email: string) {
  try { if (email) await AsyncStorage.setItem(EMAIL_KEY, email); } catch {}
}

export async function ensureNotifPermission(): Promise<boolean> {
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
