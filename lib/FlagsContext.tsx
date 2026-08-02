// FlagsContext (Lot 4 / Étape 3) — source unique des feature-flags + statut Premium
// pour toute l'app. Monté DANS <ClerkLoaded> (le Premium a besoin de Clerk) et
// autour de <InitialLayout /> (voir app/_layout.tsx).
//
// Principes NON-NÉGOCIABLES :
//  - NON-BLOQUANT : l'app rend IMMÉDIATEMENT ; on n'attend jamais `ready` pour
//    afficher un écran. Le gating par défaut est PERMISSIF (feature activée).
//  - OFFLINE-SAFE : on hydrate d'abord depuis le cache AsyncStorage
//    ('feature_flags_v1' + 'premium_v1'), puis on rafraîchit en arrière-plan.
//  - JAMAIS de throw : toutes les I/O sont gardées. Une erreur = on garde le
//    défaut (activé / non-premium selon le dernier cache).
//  - userKey STABLE (docId email-dérivé) pour un rollout déterministe.
import React, { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc } from 'firebase/firestore';
import { useUser } from '@clerk/clerk-expo';
import { db, emailToDocId } from './firebase';
import { PurchasesService } from './PurchasesService';
import {
  FlagMap,
  fetchFlags,
  isEnabled,
  flagRequiresPremium,
  flagConfig,
} from './featureFlags';

const FLAGS_CACHE = 'feature_flags_v1';
const PREMIUM_CACHE = 'premium_v1';

// Version de l'app pour le gating minVersion. On tente expo-application (valeur
// native réelle en build) puis app.json ; défaut '1.0.0'. Résolue UNE fois au
// chargement du module — jamais de crash si expo-application est absent.
function resolveAppVersion(): string {
  try {
    // Import paresseux : ne casse pas si le module natif n'est pas linké.
    const Application = require('expo-application');
    const v = Application?.nativeApplicationVersion;
    if (v && typeof v === 'string') return v;
  } catch {}
  try {
    const appJson = require('../app.json');
    const v = appJson?.expo?.version;
    if (v && typeof v === 'string') return v;
  } catch {}
  return '1.0.0';
}
const APP_VERSION = resolveAppVersion();

interface FlagsCtxValue {
  flags: FlagMap;
  isPremium: boolean;
  ready: boolean;
  userKey: string;
}

const FlagsContext = createContext<FlagsCtxValue>({
  flags: {},
  isPremium: false,
  ready: false,
  userKey: '',
});

export function FlagsProvider({ children }: { children: ReactNode }) {
  const { user } = useUser();

  // userKey stable = docId (email lowercased sanitizé). Sert au rollout déterministe.
  const email = user?.primaryEmailAddress?.emailAddress || '';
  const userKey = emailToDocId(email);

  const [flags, setFlags] = useState<FlagMap>({});
  const [isPremium, setIsPremium] = useState<boolean>(false);
  const [ready, setReady] = useState<boolean>(false);

  // Garde d'égalité (audit anti-boucle) : hydratation cache puis fetch renvoient souvent
  // le MÊME contenu — sans garde, chaque set créait un nouvel objet → value du contexte
  // changée → re-render de tous les consommateurs (dont RouteFlagGate à la racine).
  const setFlagsIfChanged = (next: FlagMap) => {
    setFlags((prev) => {
      try { if (JSON.stringify(prev) === JSON.stringify(next)) return prev; } catch {}
      return next;
    });
  };

  // 1) HYDRATATION offline immédiate depuis le cache (avant tout réseau).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rawFlags = await AsyncStorage.getItem(FLAGS_CACHE);
        if (rawFlags && alive) {
          const parsed = JSON.parse(rawFlags);
          if (parsed && typeof parsed === 'object') setFlagsIfChanged(parsed);
        }
      } catch {}
      try {
        const rawPrem = await AsyncStorage.getItem(PREMIUM_CACHE);
        if (rawPrem != null && alive) setIsPremium(rawPrem === 'true');
      } catch {}
    })();
    return () => { alive = false; };
  }, []);

  // 2) FLAGS frais depuis Firestore (fetchFlags gère lui-même cache + erreurs).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const fresh = await fetchFlags();
        if (alive && fresh && typeof fresh === 'object') setFlagsIfChanged(fresh);
      } catch { /* garde le cache : jamais de throw */ }
      finally {
        // 1re résolution atteinte : `ready` passe true (l'app n'attendait pas).
        if (alive) setReady(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  // 3) STATUT PREMIUM : RevenueCat OU override Firestore (users/{docId}.premiumOverride).
  //    Recalculé quand l'utilisateur change. Best-effort, non-bloquant, jamais throw.
  useEffect(() => {
    let alive = true;
    (async () => {
      let premium = false;

      // a) RevenueCat (renvoie false proprement en Expo Go / non configuré).
      try {
        premium = await PurchasesService.isPremium();
      } catch { premium = false; }

      // b) Override Firestore : users/{docId}.premiumOverride === true, OU essai à durée
      //    limitée encore valide (premiumTrialUntil > maintenant). Posé par l'admin web.
      if (!premium && userKey) {
        try {
          const snap = await getDoc(doc(db, 'users', userKey));
          if (snap.exists()) {
            const d = snap.data() as any;
            const trialOk = typeof d?.premiumTrialUntil === 'number' && d.premiumTrialUntil > Date.now();
            if (d?.premiumOverride === true || trialOk) premium = true;
          }
        } catch { /* offline / permission : on garde la valeur RevenueCat */ }
      }

      if (!alive) return;
      setIsPremium(premium);
      try { await AsyncStorage.setItem(PREMIUM_CACHE, premium ? 'true' : 'false'); } catch {}
    })();
    return () => { alive = false; };
  }, [userKey]);

  const value = useMemo<FlagsCtxValue>(
    () => ({ flags, isPremium, ready, userKey }),
    [flags, isPremium, ready, userKey]
  );

  return <FlagsContext.Provider value={value}>{children}</FlagsContext.Provider>;
}

export function useFlagsCtx(): FlagsCtxValue {
  return useContext(FlagsContext);
}

/**
 * useFeature(key) — état de gating d'une feature pour l'utilisateur courant.
 *   enabled : isEnabled(flags, key, { userKey, appVersion }) → défaut true.
 *   locked  : flagRequiresPremium(flags, key) && !isPremium.
 *   config  : payload arbitraire du flag (flagConfig).
 */
export function useFeature(key: string): { enabled: boolean; locked: boolean; config: Record<string, any> } {
  const { flags, isPremium, userKey } = useFlagsCtx();
  return useMemo(() => {
    const enabled = isEnabled(flags, key, { userKey, appVersion: APP_VERSION });
    const locked = flagRequiresPremium(flags, key) && !isPremium;
    const config = flagConfig(flags, key);
    return { enabled, locked, config };
  }, [flags, isPremium, userKey, key]);
}
