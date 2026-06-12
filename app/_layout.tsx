import * as SecureStore from 'expo-secure-store';
import * as Linking from 'expo-linking';
import { ClerkProvider, ClerkLoaded, ClerkLoading, useAuth, useUser, useSession } from '@clerk/clerk-expo';
import { Slot, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { useEffect, useState, Component } from 'react';
import { ActivityIndicator, View, Text, Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CONFIG } from '../constants/config';
import { Colors } from '../constants/Colors';
import {
  getUserFromFirestore,
  saveUserToFirestore,
  seedTestNotifications,
  updateUserLanguage,
  emailToDocId,
} from '../lib/firebase';
import { syncAllUserData, printLogLegend } from '../lib/LocalDataStore';
import { signInToFirebase } from '../lib/firebaseAuth';
import { initLogCapture } from '../lib/logBuffer';

// Capture les 50 dernières erreurs/warnings → "Envoyer les logs" (Profil → support web).
initLogCapture();

// Imprime la legende des couleurs UNE FOIS au demarrage du module (avant
// meme que React ne monte) — comme ca tout developpeur qui ouvre Metro voit
// immediatement la signification de chaque couleur (vert = request sortante,
// bleu = response, rouge = storage, cyan = contenu, jaune = narratif,
// magenta = meta-explication).
printLogLegend();
import { LoggingProvider } from '../lib/LoggingContext';
import { ThemeProvider, useTheme } from '../lib/ThemeContext';
import { I18nProvider, useTranslation } from '../lib/i18n';
import { NotificationService } from '../lib/NotificationService';
import { PurchasesService } from '../lib/PurchasesService';
import LogModal from '../components/LogModal';
import ScreenBackground from '../components/ScreenBackground';
import ActionMenu from '../components/ActionMenu';
import SplashIntro from '../components/SplashIntro';
import * as SplashScreen from 'expo-splash-screen';

const tokenCache = {
  async getToken(key: string) {
    try {
      const item = await SecureStore.getItemAsync(key);
      if (item) {
        console.log(`${key} was used 🔐 \n`);
      } else {
        console.log('No values stored under key: ' + key);
      }
      return item;
    } catch (error) {
      console.error('SecureStore get item error: ', error);
      await SecureStore.deleteItemAsync(key);
      return null;
    }
  },
  async saveToken(key: string, value: string) {
    try {
      return SecureStore.setItemAsync(key, value);
    } catch (err) {
      return;
    }
  },
};

const publishableKey = CONFIG.clerkPublishableKey;

if (!publishableKey) {
  throw new Error(
    'Missing Publishable Key. Please set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in your .env'
  );
}

function InitialLayout() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const { session } = useSession();

  // ---- Firebase Auth bridge ---------------------------------------------
  // As soon as Clerk confirms the session, exchange the Clerk token for a
  // Firebase custom token so Firestore reads/writes carry request.auth.
  // No-op until EXPO_PUBLIC_FIREBASE_TOKEN_URL is configured (safe to ship).
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    signInToFirebase(() => getToken()).catch(() => {});
  }, [isLoaded, isSignedIn, user?.id]);

  // ---- GLOBAL Linking diagnostic ----------------------------------------
  // Logue TOUTE URL entrante (deep link) — utile pour diagnostiquer le retour
  // d'OAuth depuis le browser. Si la URL OAuth arrive ici mais que Clerk ne
  // resout pas la session, on saura que c'est un probleme cote Clerk/WebBrowser.
  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      console.log('\x1b[33m[_layout] Linking.getInitialURL (cold start)\x1b[0m', { url });
    }).catch(() => {});
    const sub = Linking.addEventListener('url', (event) => {
      console.log('\x1b[36m[_layout] Linking event GLOBAL\x1b[0m', { url: event.url });
    });
    return () => sub.remove();
  }, []);

  // ---- Durée de session Clerk (max 7 jours) ------------------------------
  useEffect(() => {
    if (!isSignedIn || !session) return;
    try {
      const lastActive = session.lastActiveAt ? new Date(session.lastActiveAt as any) : null;
      const expireAt = session.expireAt ? new Date(session.expireAt as any) : null;
      const abandonAt = (session as any).abandonAt ? new Date((session as any).abandonAt) : null;
      const now = Date.now();
      const remainingMs = expireAt ? expireAt.getTime() - now : null;
      const remainingDays = remainingMs != null ? +(remainingMs / 86400000).toFixed(2) : null;
      const sessionAgeMs = lastActive ? now - lastActive.getTime() : null;
      const SEVEN_DAYS_MS = 7 * 86400000;
      const withinSevenDays = remainingMs != null ? remainingMs <= SEVEN_DAYS_MS && remainingMs > 0 : null;
      console.log('\x1b[34m[API←Clerk] session.duration\x1b[0m', {
        sessionId: session.id,
        status: session.status,
        lastActiveAt: lastActive?.toISOString() || null,
        expireAt: expireAt?.toISOString() || null,
        abandonAt: abandonAt?.toISOString() || null,
        remainingDays,
        sessionAgeHours: sessionAgeMs != null ? +(sessionAgeMs / 3600000).toFixed(2) : null,
        withinSevenDayMax: withinSevenDays,
      });
    } catch (e) {
      console.warn('[Clerk] session duration read failed', e);
    }
  }, [isSignedIn, session?.id]);

  const segments = useSegments();
  const router = useRouter();
  const rootNavState = useRootNavigationState();
  const { resolved } = useTheme();
  const { language, setLanguage, isRTL } = useTranslation();
  // Single source of truth for routing. `not-onboarded` is NEVER set without
  // an explicit confirmation from Firebase — this prevents the brief flash of
  // the gender picker that was caused by a stale `isOnboarded=false` being
  // observed by the redirect effect during the render where Clerk flips
  // `isSignedIn` to true.
  type AuthStatus = 'pending' | 'onboarded' | 'not-onboarded' | 'signed-out';
  const [status, setStatus] = useState<AuthStatus>('pending');
  const [checkedCache, setCheckedCache] = useState(false);
  // Optimistic flag from previous session. When it's `true` and Clerk then
  // confirms a valid token, we skip the splash entirely and go straight to
  // the dashboard. Firebase re-validates in the background.
  const [optimisticOnboarded, setOptimisticOnboarded] = useState<boolean | null>(null);

  // Initialize Services
  useEffect(() => {
    PurchasesService.initialize();
  }, []);

  // Read the "last session was onboarded" flag BEFORE deciding what to render.
  // If set, we don't show the splash while Clerk is loading — the user had a
  // valid persisted session and we assume they'll land on the dashboard.
  useEffect(() => {
    AsyncStorage.getItem('last_session_onboarded')
      .then((v) => {
        setOptimisticOnboarded(v === 'true');
        setCheckedCache(true);
      })
      .catch(() => {
        setOptimisticOnboarded(false);
        setCheckedCache(true);
      });
  }, []);

  // Reset isOnboarded when auth state changes.
  // CRITICAL: as soon as isSignedIn flips to true we must switch to `null`
  // (waiting for Firebase check) — NOT keep the stale `false` from the
  // pre-signin render. Clerk updates `isSignedIn` one tick before `user.id`
  // lands, and during that window `isOnboarded=false` would trigger a bogus
  // redirect to /(onboarding), producing the flash of the gender picker
  // before the dashboard.
  useEffect(() => {
    // Wait for Clerk to finish loading before deciding anything. Prevents
    // removing the optimistic flag during the brief window where isSignedIn
    // is still undefined at cold boot.
    if (!isLoaded) return;

    if (!isSignedIn) {
      // GRÂCE HORS-LIGNE : à froid sans réseau, Clerk ne peut PAS valider le token
      // → isSignedIn=false même pour un user valide. Si on est hors-ligne et que la
      // session précédente était onboardée, on laisse entrer en mode hors-ligne
      // (cache local) au lieu d'éjecter vers Welcome. Au retour réseau, Clerk
      // revalide normalement (et déconnecte vraiment si le token est invalide).
      (async () => {
        try {
          const Network = require('expo-network');
          const s = await Network.getNetworkStateAsync();
          const flag = await AsyncStorage.getItem('last_session_onboarded');
          if (s?.isConnected === false && flag === 'true') {
            console.log('[Auth] hors-ligne + session précédente onboardée → grâce offline (entrée Home)');
            setStatus('onboarded');
            return; // on NE retire PAS le flag : il sert de laissez-passer offline
          }
        } catch {}
        setStatus('signed-out');
        // Garde le flag optimiste — on laisse la cache email-keyed
        // `onboarded_{email}` intacte pour qu'une reconnexion du MEME user soit
        // instantanee (pas de splash).
        AsyncStorage.removeItem('last_session_onboarded').catch(() => {});
      })();
    } else {
      // Signed in. Resolution immediate via cache email-keyed avant tout
      // passage par 'pending' — evite totalement le splash a la reconnexion.
      const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase();
      if (email) {
        AsyncStorage.getItem(`onboarded_${email}`)
          .then((v) => {
            if (v === 'true') {
              // Cet utilisateur PRÉCIS a déjà été onboardé sur ce device → direct home.
              setStatus('onboarded');
            } else {
              // Pas de cache pour CET email (nouvel/autre utilisateur) → 'pending'
              // (loader) en attendant la confirmation Firebase. On n'applique PAS
              // le flag optimiste GLOBAL ici : il vient d'un AUTRE user onboardé et
              // provoquait un flash du Home avant l'onboarding du nouvel utilisateur.
              setStatus((prev) => (prev === 'onboarded' ? 'onboarded' : 'pending'));
            }
          })
          .catch(() => {
            setStatus((prev) => (prev === 'onboarded' ? 'onboarded' : 'pending'));
          });
      } else {
        setStatus((prev) => {
          if (prev === 'onboarded') return 'onboarded';
          // Pas de flag optimiste global ici non plus (évite le flash Home).
          return 'pending';
        });
      }
    }
  }, [isLoaded, isSignedIn, user?.id, optimisticOnboarded]);

  // Verify onboarding status in Firebase for the CURRENT user only.
  // CRITICAL: run saveUserToFirestore FIRST so that an email-based migration
  // happens before we read `onboarded`. Otherwise a new Clerk id would create
  // an empty doc and the fallback-by-email inside getUserFromFirestore would
  // never trigger, causing returning users to be sent through onboarding again.
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user?.id) return;

    const checkFirebase = async () => {
      try {
        const email = user.primaryEmailAddress?.emailAddress || '';
        if (!email) {
          console.warn('[Onboarding] No email for user, cannot check');
          setStatus('not-onboarded');
          return;
        }

        // Check email-keyed cache first (fast path). Keyed by email so it survives Clerk id changes.
        const cacheKey = `onboarded_${email.toLowerCase()}`;
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached === 'true') {
          console.log('[Onboarding] Cached for', email, '→ onboarded');
          setStatus('onboarded');
          await AsyncStorage.setItem('last_session_onboarded', 'true');
          // Even on the cached fast path, still seed demo notifications for the
          // test user and kick off a background sync so analytics + inbox stay
          // up-to-date on every reconnect.
          if (email.toLowerCase() === 'salistarcompany@gmail.com') {
            seedTestNotifications(email).catch(() => {});
          }
          // A chaque reconnexion on declenche syncAllUserData qui :
          //   1) lit le cache telephone  2) fetch Firestore  3) compare
          //   4) reecrit si diff  5) logue le resume 3 langues
          const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
          const syncedKey = `synced_${emailToDocId(email)}`;
          const syncedAt = await AsyncStorage.getItem(syncedKey);
          const ageMs = syncedAt ? Date.now() - new Date(syncedAt).getTime() : Infinity;
          console.log('[Sync] trigger on reconnect', {
            hasPreviousSync: !!syncedAt,
            ageDays: syncedAt ? +(ageMs / 86400000).toFixed(2) : null,
            reason: !syncedAt ? 'first-connection' : ageMs > SEVEN_DAYS_MS ? 'stale->7d' : 'refresh-check',
          });
          syncAllUserData(email).catch((e) => console.warn('[Sync] failed', e));
          return;
        }

        // Collecte TOUS les emails possibles du user Clerk pour ne pas rater un doc Firestore
        // existant cree avec un email different (ex: email/password sign-up avant Google OAuth).
        const allEmails: string[] = [];
        try {
          // Emails secondaires Clerk verifies
          (user.emailAddresses || []).forEach((e: any) => {
            if (e?.emailAddress && e.emailAddress !== email) allEmails.push(e.emailAddress);
          });
          // Emails des comptes externes (Google, Apple, etc.)
          (user.externalAccounts || []).forEach((acc: any) => {
            if (acc?.emailAddress && acc.emailAddress !== email && !allEmails.includes(acc.emailAddress)) {
              allEmails.push(acc.emailAddress);
            }
          });
        } catch {}
        console.log('\x1b[35m[Onboarding] Emails Clerk collectes\x1b[0m', {
          primary: email,
          extra: allEmails,
          clerkId: user.id,
        });

        // Read par TOUS les emails + Clerk id en fallback. Va trouver le doc existant
        // meme si signup precedent etait avec un autre email/provider.
        const data = await getUserFromFirestore(email, user.id, allEmails);

        // IMPORTANT : on ne crée/sync le doc QUE si l'utilisateur existe DÉJÀ
        // (migration par email + préservation de `onboarded`). Pour un NOUVEL
        // utilisateur (data null), on NE crée AUCUN doc ici — il ne sera écrit
        // qu'à la FIN de l'onboarding (completeOnboarding). Ainsi, un utilisateur
        // qui se connecte mais ABANDONNE l'onboarding ne laisse PAS de doc fantôme
        // en base.
        if (data) {
          await saveUserToFirestore({
            id: user.id,
            email,
            firstName: user.firstName || data?.firstName || '',
            lastName: user.lastName || data?.lastName || '',
            imageUrl: user.imageUrl || data?.imageUrl || '',
            ...(language ? { language } : {}),
            // Préserve `onboarded: true` s'il a été trouvé ailleurs (fast-path).
            ...(data?.onboarded ? { onboarded: true } : {}),
          } as any);
        }
        const onboarded = !!data?.onboarded;
        console.log('[Onboarding] Firebase for', email, '→', onboarded);
        setStatus(onboarded ? 'onboarded' : 'not-onboarded');

        // Cache full profile for notifications screen + offline card display
        if (data) {
          try {
            await AsyncStorage.setItem(
              `profile_${emailToDocId(email)}`,
              JSON.stringify(data)
            );
          } catch {}
        }

        // Restore language preference from profile (first connection on a new device)
        if (data?.language && data.language !== language) {
          try {
            await setLanguage(data.language as any);
          } catch {}
        } else if (!data?.language && language) {
          // No language yet in Firestore → persist the current one
          updateUserLanguage(email, language).catch(() => {});
        }

        // Seed demo notifications for the test user (only if inbox is empty)
        if (email.toLowerCase() === 'salistarcompany@gmail.com') {
          await seedTestNotifications(email).catch(() => {});
        }

        // A la premiere connexion (ou s'il n'y a pas encore de sync locale),
        // recupere TOUTES les donnees du user depuis Firestore et les stocke
        // dans AsyncStorage. Les actions suivantes mettront a jour a la fois
        // Firebase et la base locale pour garder tout synchronise.
        try {
          const syncedKey = `synced_${emailToDocId(email)}`;
          const already = await AsyncStorage.getItem(syncedKey);
          if (!already) {
            console.log('[Sync] First connection — pulling all data for', email);
          }
          syncAllUserData(email).catch((e) => console.warn('[Sync] failed', e));
        } catch {}

        if (onboarded) {
          await AsyncStorage.setItem(cacheKey, 'true');
          // Fast-path flag read on cold boot to skip the splash next time
          await AsyncStorage.setItem('last_session_onboarded', 'true');
        } else {
          await AsyncStorage.removeItem('last_session_onboarded');
        }
      } catch (err) {
        console.warn('Onboarding check failed:', err);
        // Firestore est injoignable (permission-denied, reseau, regles...). On ne
        // doit JAMAIS rester bloque sur un ecran transparent : un utilisateur
        // connecte entre dans l'app (les ecrans gerent les donnees manquantes via
        // le cache local). C'est le garde anti "ecran blanc".
        // MAIS: un NOUVEL utilisateur (sans session precedente onboardee) ne doit
        // PAS etre envoye au Home vide — il doit voir l'onboarding. On ne force
        // 'onboarded' que si une session precedente l'avait deja confirme.
        setStatus(optimisticOnboarded === true ? 'onboarded' : 'not-onboarded');
      }
    };

    // Only run if we haven't already resolved to a definitive state
    if (status === 'pending') {
      checkFirebase();
    }
  }, [isLoaded, isSignedIn, user?.id, status, optimisticOnboarded]);

  // ---- WATCHDOG anti "ecran blanc" --------------------------------------
  // Si pour une raison quelconque le statut reste 'pending' alors que Clerk
  // confirme une session (Firestore lent/injoignable, promesse perdue...),
  // on force l'entree dans l'app apres 8s. L'app ne doit JAMAIS rester figee
  // sur un ecran transparent.
  useEffect(() => {
    if (!isLoaded || !isSignedIn || status !== 'pending') return;
    const t = setTimeout(() => {
      setStatus((prev) => {
        if (prev === 'pending') {
          // Returning user (session precedente onboardee) -> Home ; sinon -> onboarding.
          const fallback = optimisticOnboarded === true ? 'onboarded' : 'not-onboarded';
          console.warn('[Watchdog] statut bloque sur pending 8s -> fallback', fallback);
          return fallback;
        }
        return prev;
      });
    }, 8000);
    return () => clearTimeout(t);
  }, [isLoaded, isSignedIn, status, optimisticOnboarded]);

  // ---- Sync forcee a CHAQUE sign-in, independamment de `status` ----------
  // Sans cela, quand le fast-path onboarded_{email}=true court-circuite la
  // verification Firebase, syncAllUserData n'est jamais declenche et on ne
  // voit ni les calories du jour, ni les insights multilang dans les logs.
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user?.id) return;
    const email = user.primaryEmailAddress?.emailAddress || '';
    if (!email) return;
    console.log('[Sync] trigger on sign-in (forced)', { email });
    syncAllUserData(email).catch((e) => console.warn('[Sync] forced failed', e));
  }, [isLoaded, isSignedIn, user?.id]);

  // ---- Reprise automatique d un scan interrompu par Android --------------
  // Si Android Expo Go a tue l app pendant que la camera etait ouverte,
  // ActionMenu a persiste {uri, at} dans AsyncStorage. On verifie ici des
  // que la nav root est prete et on redirige vers /scan-analysis pour
  // reprendre la ou l utilisateur s est arrete.
  useEffect(() => {
    if (!rootNavState?.key || !isSignedIn) return;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('pending_scan_v1');
        if (!raw) return;
        const { uri, at } = JSON.parse(raw);
        const ageMs = Date.now() - (at || 0);
        console.log('\x1b[33m[RootLayout] pending_scan_v1 detecte au demarrage\x1b[0m', { uri, ageMs });
        if (ageMs > 5 * 60 * 1000) {
          console.log('\x1b[31m[RootLayout] pending_scan trop vieux (>5min) — on supprime sans reprendre\x1b[0m');
          await AsyncStorage.removeItem('pending_scan_v1');
          return;
        }
        console.log('\x1b[35m  ↳ [pourquoi] Android a tue l app pendant que la camera etait ouverte. On avait persiste l URI — on reprend scan-analysis AUTOMATIQUEMENT pour ne pas perdre la photo.\x1b[0m');
        console.log('\x1b[33m[RootLayout] REPRISE : router.replace(/scan-analysis) avec\x1b[0m', uri);
        router.replace({ pathname: '/scan-analysis' as any, params: { imageUri: uri } });
      } catch (e: any) {
        console.warn('[RootLayout] pending_scan resume failed:', e?.message);
      }
    })();
  }, [rootNavState?.key, isSignedIn]);

  // Handle Redirection — single source of truth is `status`.
  useEffect(() => {
    if (!rootNavState?.key) return;

    // Fast-path: optimistic flag says onboarded and the status already reflects
    // that. Jump to /(tabs) even before Clerk finishes loading.
    const inTabs = segments[0] === '(tabs)';
    if (status === 'onboarded') {
      const inOauthCallback = segments[0] === 'oauth-callback';
      if (!inTabs && !inOauthCallback) {
        router.replace('/(tabs)' as any);
        PurchasesService.showPaywallIfNeeded();
      } else if (inOauthCallback) {
        router.replace('/(tabs)' as any);
      }
      return;
    }

    // Pending = we don't know yet. NEVER redirect to /(onboarding) from here.
    if (status === 'pending') return;

    console.log('[Redirect] status:', status, 'segments:', segments[0] || '/');

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboardingGroup = segments[0] === '(onboarding)';

    if (status === 'signed-out') {
      const inWelcome = segments[0] === 'welcome';
      const inOauthCallback = segments[0] === 'oauth-callback';
      if (inOauthCallback) return;
      if (!inAuthGroup && !inWelcome) {
        router.replace('/welcome' as any);
      }
      return;
    }

    // status === 'not-onboarded' — ONLY reached after Firebase explicitly said so
    if (status === 'not-onboarded' && !inOnboardingGroup) {
      router.replace('/(onboarding)' as any);
    }
  }, [status, rootNavState?.key]);

  // Initialize Notifications only (user sync is handled in the onboarding-check
  // effect above, to avoid a race that would create an empty Firestore doc
  // before the email-based migration can run).
  useEffect(() => {
    if (isSignedIn && user) {
      const email = user.primaryEmailAddress?.emailAddress || '';
      if (email) {
        NotificationService.registerForPushNotificationsAsync(email).catch(() => {});
      }
      NotificationService.scheduleReminders().catch(() => {});
    }
  }, [isSignedIn, user]);

  // Sync language preference to Firestore whenever it changes after sign-in
  useEffect(() => {
    if (!isSignedIn || !user) return;
    const email = user.primaryEmailAddress?.emailAddress || '';
    if (!email || !language) return;
    updateUserLanguage(email, language).catch(() => {});
  }, [language, isSignedIn, user?.id]);

  // Setup Notification Listeners
  useEffect(() => {
    let subscription: any;
    if (isSignedIn && user) {
      const email = user.primaryEmailAddress?.emailAddress || '';
      if (email) {
        subscription = NotificationService.setupListeners(email);
      }
    }
    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, [isSignedIn, user]);

  // If the previous session was onboarded, skip the splash entirely on cold
  // boot — Clerk will validate the token and Firebase will re-check silently
  // in the background. If the token has since been invalidated, the reset
  // effect above will clear the flag and `isSignedIn=false` will route the
  // user to /welcome as usual.
  // Splash rules:
  // - Always hidden when status === 'onboarded' (fast-path to dashboard)
  // - Always hidden when status === 'signed-out' (welcome screen handles itself)
  // - Shown while checking AsyncStorage or while status === 'pending' AND we
  //   don't have an optimistic hint
  // Splash completement supprime : plus AUCUN overlay branded.
  // Le guard d'authentification redirige directement vers welcome / tabs /
  // onboarding, et les ecrans sont transparents le temps de la resolution.
  const showLoading = false;

  const bgColor = resolved === 'dark' ? '#000000' : Colors.light.white;

  return (
    // `direction` drives RTL/LTR reactively — switching to/from Arabic flips the
    // whole layout instantly, with no app restart.
    <View style={{ flex: 1, backgroundColor: bgColor, direction: isRTL ? 'rtl' : 'ltr' }}>
      {resolved === 'light' && <ScreenBackground />}
      <Slot />
      <ActionMenu />
      <LogModal />
      <SplashIntro />
      {showLoading && (
        <View style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: Colors.light.primary,
          zIndex: 9999,
          gap: 20,
        }}>
          <View style={{
            width: 120,
            height: 120,
            borderRadius: 32,
            backgroundColor: 'rgba(255,255,255,0.15)',
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: 'rgba(255,255,255,0.3)',
          }}>
            <Image
              source={require('../assets/images/fire.png')}
              style={{ width: 80, height: 80 }}
              resizeMode="contain"
            />
          </View>
          <Text style={{ fontSize: 36, fontWeight: '900', color: '#fff', letterSpacing: -1 }}>
            Salorie
          </Text>
          <ActivityIndicator size="large" color="#ffffff" />
        </View>
      )}
    </View>
  );
}

// Affiche l'erreur a l'ecran au lieu d'un blanc (revele les crashes de rendu en release).
class ErrorBoundary extends Component<{ children: any }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { try { console.log('[ErrorBoundary]', error?.message, error?.stack); } catch {} }
  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, backgroundColor: '#0f3a22', padding: 24, justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 12 }}>Salorie — erreur de démarrage</Text>
          <Text style={{ color: '#ffe08a', fontSize: 13 }} selectable>{String(this.state.error?.message || this.state.error)}</Text>
          <Text style={{ color: '#9fe0b8', fontSize: 10, marginTop: 12 }} selectable>{String(this.state.error?.stack || '').slice(0, 1000)}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function RootLayout() {
  // Cache le splash natif TOT (avant que Clerk ne charge). Sinon le splash natif
  // (blanc) reste au-dessus de tout tant que <ClerkLoaded> n'a pas fire -> ecran
  // blanc. Avec ce hideAsync, on voit le fallback <ClerkLoading> (vert) pendant
  // l'init Clerk au lieu d'un blanc.
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);
  return (
    <ErrorBoundary>
    <ThemeProvider>
      <I18nProvider>
        <ClerkProvider tokenCache={tokenCache} publishableKey={publishableKey}>
          {/* Fallback brandé pendant l'init de Clerk (evite l'ecran BLANC :
              la 1ere init de l'instance prod peut prendre quelques secondes en 4G). */}
          <ClerkLoading>
            <View style={{ flex: 1, backgroundColor: Colors.light.primary, justifyContent: 'center', alignItems: 'center', gap: 20 }}>
              <View style={{ width: 120, height: 120, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' }}>
                <Image source={require('../assets/images/fire.png')} style={{ width: 80, height: 80 }} resizeMode="contain" />
              </View>
              <Text style={{ fontSize: 36, fontWeight: '900', color: '#fff', letterSpacing: -1 }}>Salorie</Text>
              <ActivityIndicator size="large" color="#ffffff" />
            </View>
          </ClerkLoading>
          <ClerkLoaded>
            <LoggingProvider>
              <InitialLayout />
            </LoggingProvider>
          </ClerkLoaded>
        </ClerkProvider>
      </I18nProvider>
    </ThemeProvider>
    </ErrorBoundary>
  );
}
