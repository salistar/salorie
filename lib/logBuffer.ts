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
