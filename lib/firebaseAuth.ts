// Firebase Auth bridge for Clerk.
// ---------------------------------------------------------------------------
// Clerk removed its native Firebase integration, so we mint a Firebase custom
// token on our own backend (see /server/firebase-token) and sign into Firebase
// Auth with it. The custom token's uid is the sanitized email — exactly the
// Firestore document key used everywhere in the app (users/{emailToDocId}) — so
// the security rules become trivial: `request.auth.uid == userId`.
//
// FEATURE-FLAGGED: when EXPO_PUBLIC_FIREBASE_TOKEN_URL is not configured (or the
// backend is unreachable), every function here is a safe no-op and the app keeps
// working exactly as before. Nothing about the existing flow breaks.
import {
  initializeAuth,
  getAuth,
  signInWithCustomToken,
  // @ts-ignore - getReactNativePersistence is only typed in the RN build of @firebase/auth
  getReactNativePersistence,
  type Auth,
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { app } from './firebase';
import { CONFIG } from '../constants/config';

// Initialize Auth once, with AsyncStorage persistence so the Firebase session
// survives app restarts (independent of Clerk's own SecureStore session).
let auth: Auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  // Already initialized (fast refresh / double import) → reuse the instance.
  auth = getAuth(app);
}
export { auth };

let inFlight: Promise<boolean> | null = null;

/**
 * Ensures the user is signed into Firebase Auth, exchanging the current Clerk
 * session token for a Firebase custom token via the backend endpoint.
 *
 * @param getClerkToken  Usually `() => getToken()` from Clerk's useAuth().
 * @returns true if Firebase has an authenticated user afterwards.
 */
export async function signInToFirebase(
  getClerkToken: () => Promise<string | null>
): Promise<boolean> {
  // Not configured → no-op (app stays on its current open-rules behavior).
  if (!CONFIG.firebaseTokenUrl) return false;
  // Already signed in.
  if (auth.currentUser) return true;
  // Coalesce concurrent callers (multiple effects fire on sign-in).
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const clerkToken = await getClerkToken();
      if (!clerkToken) return false;

      const res = await fetch(CONFIG.firebaseTokenUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${clerkToken}`,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) {
        console.warn('[firebaseAuth] token endpoint returned', res.status);
        return false;
      }
      const data = (await res.json()) as { token?: string };
      if (!data?.token) return false;

      await signInWithCustomToken(auth, data.token);
      console.log('[firebaseAuth] signed in as', auth.currentUser?.uid);
      return true;
    } catch (e) {
      console.warn('[firebaseAuth] sign-in failed', e);
      return false;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Sign out of Firebase Auth (call alongside Clerk sign-out). */
export async function signOutFirebase(): Promise<void> {
  try {
    if (auth.currentUser) await auth.signOut();
  } catch {
    /* ignore */
  }
}
