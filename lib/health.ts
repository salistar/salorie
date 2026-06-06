// Health Connect (Android) — lit pas, calories actives et poids du jour.
// Sur Android 14+ Health Connect est integre au systeme ; sinon c'est une app
// separee (com.google.android.apps.healthdata).
import { Linking } from 'react-native';
import {
  initialize,
  requestPermission,
  readRecords,
  getSdkStatus,
  SdkAvailabilityStatus,
} from 'react-native-health-connect';

export interface HealthToday {
  steps: number;
  activeKcal: number;
  weightKg: number | null;
}

export async function isHealthAvailable(): Promise<boolean> {
  try {
    const status = await getSdkStatus();
    return status === SdkAvailabilityStatus.SDK_AVAILABLE;
  } catch {
    return false;
  }
}

export type ConnectResult = 'ok' | 'denied' | 'unavailable' | 'update_required' | 'error';

// Robust connect: check the SDK status BEFORE touching any native API. Calling
// initialize()/requestPermission() when the Health Connect provider is missing
// or needs an update is what crashed the app — now we bail out gracefully and
// let the UI offer to install/update Health Connect instead.
export async function connectHealthStatus(): Promise<ConnectResult> {
  try {
    let status: number | undefined;
    try { status = await getSdkStatus(); } catch { return 'unavailable'; }
    if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE) return 'unavailable';
    if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) return 'update_required';

    const ok = await initialize();
    if (!ok) return 'error';
    const granted = await requestPermission([
      { accessType: 'read', recordType: 'Steps' },
      { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
      { accessType: 'read', recordType: 'Weight' },
    ]);
    return Array.isArray(granted) && granted.length > 0 ? 'ok' : 'denied';
  } catch (e) {
    console.warn('[health] connect failed', e);
    return 'error';
  }
}

// Back-compat boolean wrapper.
export async function connectHealth(): Promise<boolean> {
  return (await connectHealthStatus()) === 'ok';
}

// Open the Play Store page for Health Connect (install / update).
export async function openHealthConnectInstall(): Promise<void> {
  const id = 'com.google.android.apps.healthdata';
  try { await Linking.openURL(`market://details?id=${id}`); }
  catch { try { await Linking.openURL(`https://play.google.com/store/apps/details?id=${id}`); } catch {} }
}

export async function readToday(): Promise<HealthToday> {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const filter = {
    timeRangeFilter: {
      operator: 'between' as const,
      startTime: start.toISOString(),
      endTime: now.toISOString(),
    },
  };

  let steps = 0;
  let activeKcal = 0;
  let weightKg: number | null = null;

  try {
    const res: any = await readRecords('Steps', filter as any);
    steps = (res.records || []).reduce((a: number, r: any) => a + (r.count || 0), 0);
  } catch (e) { console.warn('[health] steps read failed', e); }

  try {
    const res: any = await readRecords('ActiveCaloriesBurned', filter as any);
    activeKcal = Math.round((res.records || []).reduce((a: number, r: any) => a + (r.energy?.inKilocalories || 0), 0));
  } catch (e) { console.warn('[health] active calories read failed', e); }

  try {
    const res: any = await readRecords('Weight', filter as any);
    const last = (res.records || []).slice(-1)[0];
    if (last?.weight?.inKilograms) weightKg = Math.round(last.weight.inKilograms * 10) / 10;
  } catch (e) { console.warn('[health] weight read failed', e); }

  return { steps, activeKcal, weightKg };
}
