// Health Connect (Android) — lit pas, calories actives et poids du jour.
// Sur Android 14+ Health Connect est integre au systeme ; sinon c'est une app
// separee (com.google.android.apps.healthdata).
import { Linking } from 'react-native';
import {
  initialize,
  requestPermission,
  getGrantedPermissions,
  openHealthConnectSettings,
  readRecords,
  getSdkStatus,
  SdkAvailabilityStatus,
} from 'react-native-health-connect';

export interface HealthToday {
  steps: number;
  activeKcal: number;
  weightKg: number | null;
}

/**
 * Borne une promesse dans le temps.
 *
 * ⚠ POURQUOI C'EST INDISPENSABLE ICI
 * Un `try/catch` ne rattrape PAS une promesse qui ne se regle jamais. Or
 * `getSdkStatus()` est un appel au pont natif : si le fournisseur Health Connect
 * ne repond pas, l'appel reste en suspens, sans erreur et sans resultat.
 *
 * Constate le 26/08/2026 sur un Galaxy A07 sous Android 16 : `isHealthAvailable()`
 * ne rendait jamais la main, `setAvailable()` n'etait donc jamais appele, et
 * l'ecran « Synchro sante » restait bloque sur son squelette de chargement —
 * sans bouton, sans message, sans erreur dans le journal. Aucun chemin
 * n'existait pour accorder l'acces, meme une fois le manifeste corrige.
 *
 * Un ecran doit toujours finir par dire quelque chose. Mieux vaut annoncer
 * « indisponible » a tort que ne rien annoncer du tout.
 */
function avecDelai<T>(promesse: Promise<T>, ms: number, repli: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let regle = false;
    const minuteur = setTimeout(() => {
      if (regle) return;
      regle = true;
      console.log('[health] appel natif sans reponse au bout de ' + ms + ' ms — repli');
      resolve(repli);
    }, ms);
    promesse.then(
      (v) => { if (!regle) { regle = true; clearTimeout(minuteur); resolve(v); } },
      () => { if (!regle) { regle = true; clearTimeout(minuteur); resolve(repli); } },
    );
  });
}

/** Six secondes : large pour un appel au pont natif, court pour qui attend. */
const DELAI_NATIF_MS = 6000;

/** Statut du SDK, borne dans le temps. `null` = le pont n'a pas repondu. */
async function statutSdk(): Promise<number | null> {
  return avecDelai<number | null>(
    Promise.resolve().then(() => getSdkStatus()),
    DELAI_NATIF_MS,
    null,
  );
}

export async function isHealthAvailable(): Promise<boolean> {
  const status = await statutSdk();
  return status === SdkAvailabilityStatus.SDK_AVAILABLE;
}

export type ConnectResult = 'ok' | 'denied' | 'unavailable' | 'update_required' | 'error';

// Robust connect: check the SDK status BEFORE touching any native API. Calling
// initialize()/requestPermission() when the Health Connect provider is missing
// or needs an update is what crashed the app — now we bail out gracefully and
// let the UI offer to install/update Health Connect instead.
export async function connectHealthStatus(): Promise<ConnectResult> {
  try {
    // Borne dans le temps, comme partout ailleurs ici : un pont natif muet ne
    // doit jamais laisser un bouton tourner indefiniment. `null` = pas de
    // reponse, ce qui vaut « indisponible » du point de vue de l'utilisateur.
    const status = await statutSdk();
    if (status === null) return 'unavailable';
    if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE) return 'unavailable';
    if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) return 'update_required';

    const ok = await avecDelai(
      Promise.resolve().then(() => initialize()),
      DELAI_NATIF_MS,
      false,
    );
    if (!ok) return 'error';
    const perms = [
      { accessType: 'read' as const, recordType: 'Steps' as const },
      { accessType: 'read' as const, recordType: 'ActiveCaloriesBurned' as const },
      { accessType: 'read' as const, recordType: 'Weight' as const },
      { accessType: 'read' as const, recordType: 'ExerciseSession' as const },
    ];
    let granted: any[] = [];
    try { granted = (await requestPermission(perms)) || []; } catch { granted = []; }
    // The result of requestPermission can be empty even when the user granted in
    // the system UI (delivery quirks) — re-check the actually-granted set.
    if (!granted.length) {
      try { granted = (await getGrantedPermissions()) || []; } catch {}
    }
    const hasSteps = granted.some((p: any) => p?.recordType === 'Steps');
    return hasSteps ? 'ok' : 'denied';
  } catch (e) {
    console.warn('[health] connect failed', e);
    return 'error';
  }
}

// Has the user already granted Steps access? (used to auto-connect on open)
export async function hasStepsPermission(): Promise<boolean> {
  try {
    const status = await statutSdk();
    if (status !== SdkAvailabilityStatus.SDK_AVAILABLE) return false;
    // `initialize()` et `getGrantedPermissions()` passent par le meme pont natif
    // et peuvent rester en suspens pour la meme raison : on les borne aussi.
    // Sans cela, l'ecran repasserait de « disponible » a fige des la ligne
    // suivante — on aurait deplace le blocage sans le supprimer.
    const pret = await avecDelai(
      Promise.resolve().then(() => initialize()).then(() => true),
      DELAI_NATIF_MS,
      false,
    );
    if (!pret) return false;
    const granted = await avecDelai<any[]>(
      Promise.resolve().then(() => getGrantedPermissions()).then((g) => g || []),
      DELAI_NATIF_MS,
      [],
    );
    return granted.some((p: any) => p?.recordType === 'Steps');
  } catch { return false; }
}

// Open the Health Connect screen where the user can toggle Salorie's access.
export async function openHealthSettings(): Promise<void> {
  try { await openHealthConnectSettings(); } catch (e) { console.warn('[health] open settings failed', e); }
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

// Type d'exercice Health Connect (int) → libellé lisible (principaux).
const EXERCISE_LABELS: Record<number, string> = {
  56: 'Course à pied', 79: 'Marche', 8: 'Vélo', 82: 'Natation', 0: 'Séance',
  13: 'Boot camp', 16: 'Musculation', 70: 'Yoga', 71: 'HIIT', 48: 'Randonnée',
  37: 'Football', 64: 'Tennis', 2: 'Badminton', 9: 'Vélo (salle)', 57: 'Course (tapis)',
};

export interface ImportedSession { name: string; calories: number; durationMin: number; startISO: string; }

// Lit les SÉANCES (ExerciseSession) d'aujourd'hui + leurs calories (best-effort),
// pour les importer comme activités. Dédoublonnage géré par l'appelant (clé = startISO).
export async function readTodaySessions(): Promise<ImportedSession[]> {
  const now = new Date();
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const filter = { timeRangeFilter: { operator: 'between' as const, startTime: start.toISOString(), endTime: now.toISOString() } };
  let sessions: any[] = [];
  try { sessions = ((await readRecords('ExerciseSession', filter as any)) as any).records || []; }
  catch (e) { console.warn('[health] sessions read failed', e); return []; }

  // Calories totales sur la fenêtre (réparties au prorata de la durée si plusieurs séances).
  let totalKcal = 0;
  try {
    const c: any = await readRecords('ActiveCaloriesBurned', filter as any);
    totalKcal = (c.records || []).reduce((a: number, r: any) => a + (r.energy?.inKilocalories || 0), 0);
  } catch {}
  const durations = sessions.map((s) => Math.max(1, (new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / 60000));
  const totalDur = durations.reduce((a, b) => a + b, 0) || 1;

  return sessions.map((s, i) => ({
    name: EXERCISE_LABELS[s.exerciseType] || 'Séance',
    durationMin: Math.round(durations[i]),
    calories: Math.round((durations[i] / totalDur) * totalKcal),
    startISO: String(s.startTime),
  }));
}
