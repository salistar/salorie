// Persistent "steps" notification + periodic background refresh.
//
// - A sticky (ongoing) Salorie notification stays in the tray showing today's
//   step count. It updates live while the app is open and is refreshed by a
//   background-fetch task (~15 min, OS-throttled) even when the app is closed.
// - The actual step COUNT keeps accumulating while the app is closed because the
//   real source is Health Connect (Android counts at the OS level); the activity
//   steps (runs / challenges) are stored locally. The background task just reads
//   those and rewrites the notification.
import * as Notifications from 'expo-notifications';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getActivitySteps, getSimSteps, getStepsMode } from './steps';
import { isHealthAvailable, readToday } from './health';

export const STEPS_TASK = 'salorie-steps-bg';
const NOTIF_ID = 'salorie-steps';
const CHANNEL = 'steps';
const GOAL = 10000;
const EMAIL_KEY = 'current_email';

export async function rememberEmail(email: string) {
  try { if (email) await AsyncStorage.setItem(EMAIL_KEY, email); } catch {}
}

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Pas',
      importance: Notifications.AndroidImportance.LOW, // silent, no heads-up
      showBadge: false,
      vibrationPattern: [0],
    });
  } catch {}
}

export async function ensureNotifPermission(): Promise<boolean> {
  try {
    const s = await Notifications.getPermissionsAsync();
    if (s.granted) return true;
    const r = await Notifications.requestPermissionsAsync();
    return !!r.granted;
  } catch { return false; }
}

export async function updateStepsNotification(steps: number) {
  try {
    await ensureChannel();
    const pct = Math.min(100, Math.round((steps / GOAL) * 100));
    await Notifications.scheduleNotificationAsync({
      identifier: NOTIF_ID,
      content: {
        title: `👟 ${steps.toLocaleString()} pas aujourd'hui`,
        body: `${pct}% de ton objectif · ${GOAL.toLocaleString()} pas`,
        sticky: true,
        autoDismiss: false,
        color: '#298f50',
      },
      trigger: Platform.OS === 'android' ? ({ channelId: CHANNEL } as any) : null,
    });
  } catch {}
}

// Mode-aware current step total (Health Connect or simulated) + activity steps.
async function computeSteps(): Promise<number> {
  let email = '';
  try { email = (await AsyncStorage.getItem(EMAIL_KEY)) || ''; } catch {}
  const activity = email ? await getActivitySteps(email) : 0;
  let base = 0;
  try {
    const mode = await getStepsMode();
    if (mode === 'sim') {
      base = email ? await getSimSteps(email) : 0;
    } else {
      if (await isHealthAvailable()) base = (await readToday()).steps || 0;
    }
  } catch {}
  return base + activity;
}

export async function refreshStepsNotification() {
  await updateStepsNotification(await computeSteps());
}

// Background task — refreshes the notification periodically while app is closed.
TaskManager.defineTask(STEPS_TASK, async () => {
  try {
    await refreshStepsNotification();
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerStepsBackground() {
  try {
    const registered = await TaskManager.isTaskRegisteredAsync(STEPS_TASK);
    if (!registered) {
      await BackgroundFetch.registerTaskAsync(STEPS_TASK, {
        minimumInterval: 900, // 15 min (Android floor)
        stopOnTerminate: false,
        startOnBoot: true,
      });
    }
  } catch {}
}
