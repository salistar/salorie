export const CONFIG = {
  clerkPublishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || '',
  geminiApiKey: process.env.EXPO_PUBLIC_GEMINI_API_KEY || '',
  firebaseConfig: {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || '',
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '',
    measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID || '',
  },
  revenueCatApiKeyAndroid: process.env.EXPO_PUBLIC_REVENUE_CAT_API_KEY_ANDROID || '',
  revenueCatApiKeyIos: process.env.EXPO_PUBLIC_REVENUE_CAT_API_KEY_IOS || '',
  // Backend endpoint that exchanges a Clerk session token for a Firebase
  // custom token (mints uid = sanitized email). When empty, the app keeps
  // working without Firebase Auth (open rules) — the bridge is a no-op.
  firebaseTokenUrl: process.env.EXPO_PUBLIC_FIREBASE_TOKEN_URL || '',
};
