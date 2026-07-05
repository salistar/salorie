// Feature Flags (Lot 4 / Étape 3). L'admin écrit des booléens dans Firestore
// `config/features` ; l'app les lit au démarrage + masque les features désactivées.
// DÉFAUT = activé : on ne masque QUE si explicitement `false` → aucune casse si le
// doc est absent / hors-ligne / en erreur. Cache AsyncStorage pour l'offline.
import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

export type Flags = Record<string, boolean>;
const CACHE = 'feature_flags_v1';
let memo: Flags | null = null;

export async function fetchFlags(): Promise<Flags> {
  try {
    const snap = await getDoc(doc(db, 'config', 'features'));
    const flags = (snap.exists() ? snap.data() : {}) as Flags;
    memo = flags;
    try { await AsyncStorage.setItem(CACHE, JSON.stringify(flags)); } catch {}
    return flags;
  } catch {
    try { const raw = await AsyncStorage.getItem(CACHE); if (raw) { memo = JSON.parse(raw); return memo!; } } catch {}
    return memo || {};
  }
}

/** Activé sauf si explicitement false (clé = route sans le slash, ex. 'fasting'). */
export function isEnabled(flags: Flags | null | undefined, key: string): boolean {
  return !flags || flags[key] !== false;
}

export function useFeatureFlags(): Flags {
  const [flags, setFlags] = useState<Flags>(memo || {});
  useEffect(() => {
    let alive = true;
    (async () => {
      try { const raw = await AsyncStorage.getItem(CACHE); if (raw && alive) setFlags(JSON.parse(raw)); } catch {}
      const fresh = await fetchFlags();
      if (alive) setFlags(fresh);
    })();
    return () => { alive = false; };
  }, []);
  return flags;
}
