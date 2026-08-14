// Configuration PUBLIQUE du client web — celle que lit le NAVIGATEUR.
// ---------------------------------------------------------------------------
// Ces valeurs sont publiques par construction : elles voyagent deja dans l'APK
// Android, que n'importe qui peut decompresser. Ce qui protege les donnees n'est
// donc pas leur secret, mais les REGLES Firestore (`request.auth.uid == userId`)
// et le perimetre d'API pose sur la cle Firebase.
//
// Elles restent malgre tout hors du depot, qui est PUBLIC : les ecrire dans git
// serait une intention (« voici les identifiants du projet »), indexable et
// penible a reprendre. Elles arrivent donc en ARG de build Docker, alimentes par
// les secrets GitHub `EXPO_PUBLIC_*` DEJA en place pour l'app mobile. C'est le
// point clef de tout le chantier web : meme instance Clerk, meme projet Firebase
// des deux cotes, donc litteralement le meme compte — la synchronisation n'est
// pas un mecanisme a ecrire, c'est une consequence de cette configuration.
//
// /!\ Next.js ne substitue `process.env.NEXT_PUBLIC_X` qu'a la lecture LITTERALE,
// au moment du build. Un acces calcule (`process.env['NEXT_PUBLIC_' + nom]`) rend
// `undefined` dans le bundle : chaque variable doit etre epelee ci-dessous.

export const PUBLIC_CONFIG = {
  clerkPublishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '',
  firebase: {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
  },
  // Point de sortie du pont Clerk -> jeton personnalise Firebase. Le meme service
  // que le mobile appelle (uid = email en minuscules) ; il accepte deja les appels
  // navigateur (`app.use(cors())` cote pont), donc rien a ouvrir de ce cote.
  firebaseTokenUrl: process.env.NEXT_PUBLIC_FIREBASE_TOKEN_URL || '',
  apiUrl: process.env.NEXT_PUBLIC_API_URL || '',
};

/** Vrai si l'espace /me dispose du minimum pour fonctionner (sinon on l'explique a l'ecran). */
export function espaceMePret(): boolean {
  return Boolean(
    PUBLIC_CONFIG.clerkPublishableKey &&
      PUBLIC_CONFIG.firebase.apiKey &&
      PUBLIC_CONFIG.firebase.projectId &&
      PUBLIC_CONFIG.firebaseTokenUrl,
  );
}

/** Liste des variables manquantes — affichee telle quelle en cas de mauvaise config. */
export function variablesManquantes(): string[] {
  const manque: string[] = [];
  if (!PUBLIC_CONFIG.clerkPublishableKey) manque.push('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY');
  if (!PUBLIC_CONFIG.firebase.apiKey) manque.push('NEXT_PUBLIC_FIREBASE_API_KEY');
  if (!PUBLIC_CONFIG.firebase.projectId) manque.push('NEXT_PUBLIC_FIREBASE_PROJECT_ID');
  if (!PUBLIC_CONFIG.firebaseTokenUrl) manque.push('NEXT_PUBLIC_FIREBASE_TOKEN_URL');
  if (!PUBLIC_CONFIG.apiUrl) manque.push('NEXT_PUBLIC_API_URL');
  return manque;
}

/**
 * Identifiant du document Firestore d'un utilisateur.
 * DOIT rester identique a `emailToDocId` du mobile (lib/firebase.ts) : c'est aussi
 * l'uid que le pont inscrit dans le jeton, donc ce que les regles comparent.
 */
export const emailToDocId = (email: string): string => (email || '').trim().toLowerCase();
