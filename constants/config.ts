export const CONFIG = {
  clerkPublishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || '',
  // `geminiApiKey` retiré le 6 août 2026 : jamais lu, et le laisser suggérait qu'il MANQUAIT
  // un secret. Le mobile n'embarque volontairement AUCUNE clé Gemini (elle serait extractible
  // de l'APK) — les appels IA passent par le backend, qui détient la vraie (cf. lib/aiProxy).
  firebaseConfig: {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || '',
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '',
    // `measurementId` retiré : jamais lu (pas d'Analytics web ici), et sa présence faisait
    // croire à un secret oublié dans l'inventaire des variables.
  },
  revenueCatApiKeyAndroid: process.env.EXPO_PUBLIC_REVENUE_CAT_API_KEY_ANDROID || '',
  revenueCatApiKeyIos: process.env.EXPO_PUBLIC_REVENUE_CAT_API_KEY_IOS || '',
  // Backend endpoint that exchanges a Clerk session token for a Firebase
  // custom token (mints uid = sanitized email). When empty, the app keeps
  // working without Firebase Auth (open rules) — the bridge is a no-op.
  firebaseTokenUrl: process.env.EXPO_PUBLIC_FIREBASE_TOKEN_URL || '',
};
