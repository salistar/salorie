// Tampon de logs en mémoire (50 dernières erreurs/avertissements) — envoyé au
// support depuis le Profil ("Envoyer les logs"). Aucune donnée sensible : uniquement
// les messages console.error/warn générés par l'app.
import { Platform } from 'react-native';
import Constants from 'expo-constants';

const buf: string[] = [];
let installed = false;

function push(level: string, args: any[]) {
  try {
    const line = `${new Date().toISOString()} [${level}] ` + args.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
    buf.push(line.slice(0, 500));
    if (buf.length > 50) buf.shift();
  } catch {}
}

export function initLogCapture() {
  if (installed) return;
  installed = true;
  const err = console.error.bind(console);
  const warn = console.warn.bind(console);
  console.error = (...a: any[]) => { push('ERROR', a); err(...a); };
  console.warn = (...a: any[]) => { push('WARN', a); warn(...a); };
  installCrashHandler();
}

// ── Crash reporting maison (sans module natif) ───────────────────────────────
// Les erreurs JS FATALES sont persistées localement ; au prochain lancement,
// maybeReportCrash() les envoie au support (visibles dans le back-office web).
const CRASH_KEY = 'last_crash_v1';

function installCrashHandler() {
  try {
    const EU: any = (global as any).ErrorUtils;
    if (!EU?.setGlobalHandler) return;
    const prev = EU.getGlobalHandler?.();
    EU.setGlobalHandler((e: any, isFatal?: boolean) => {
      if (isFatal) {
        try {
          const AsyncStorage = require('@react-native-async-storage/async-storage').default;
          const report = `${new Date().toISOString()}\n${String(e?.message || e)}\n${String(e?.stack || '').slice(0, 1500)}`;
          AsyncStorage.setItem(CRASH_KEY, report).catch(() => {});
        } catch {}
      }
      prev && prev(e, isFatal);
    });
  } catch {}
}

/** À appeler quand un user connecté est dispo : envoie le dernier crash au support. */
export async function maybeReportCrash(email: string) {
  if (!email) return;
  try {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    const report = await AsyncStorage.getItem(CRASH_KEY);
    if (!report) return;
    const { db, emailToDocId } = require('./firebase');
    const { collection, addDoc, serverTimestamp } = require('firebase/firestore');
    await addDoc(collection(db, 'users', emailToDocId(email), 'contact_messages'), {
      email, subject: '[CRASH] Rapport automatique', message: `${report}\n--- Diagnostics ---\n${buildDiagnostics()}`, createdAt: serverTimestamp(),
    });
    await AsyncStorage.removeItem(CRASH_KEY);
  } catch {}
}

export function buildDiagnostics(): string {
  const v = Constants.expoConfig?.version || '?';
  const head = [
    `App: Salorie v${v}`,
    `OS: ${Platform.OS} ${Platform.Version}`,
    `Date: ${new Date().toISOString()}`,
    `--- Derniers logs (${buf.length}) ---`,
  ];
  return head.concat(buf.length ? buf : ['(aucune erreur capturée)']).join('\n');
}
