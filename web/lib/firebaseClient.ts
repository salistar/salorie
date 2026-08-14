'use client';
// SDK Firebase JS cote NAVIGATEUR pour l'espace /me.
// ---------------------------------------------------------------------------
// Volontairement distinct de `lib/firebaseAdmin.ts`, qui est le SDK Admin utilise
// par les routes serveur de l'admin : celui-ci contourne toutes les regles de
// securite. Ici, au contraire, on veut PASSER par les regles — le navigateur de
// l'utilisateur n'a que les droits de l'utilisateur, exactement comme le mobile.
//
// Consequence directe : aucune donnee de /me ne transite par le serveur Next. Le
// navigateur parle a Firestore, ce qui donne `onSnapshot` (temps reel) gratuitement
// et met le web et le mobile a stricte egalite de droits.
//
// /!\ Ne jamais poser de restriction « Applications Android » sur la cle consommee
// ici : c'est le SDK JS (du fetch), il n'envoie aucune identite Android. Cette
// restriction, posee le 13 aout 2026, a bloque l'app mobile entiere pendant 24 h.
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { PUBLIC_CONFIG } from './publicConfig';

// Nom d'application dedie : si un jour une autre partie du web initialise Firebase,
// les deux instances cohabitent au lieu de se marcher dessus.
const NOM_APP = 'salorie-me';

let appMemo: FirebaseApp | null = null;

export function firebaseApp(): FirebaseApp {
  if (appMemo) return appMemo;
  const existante = getApps().find((a) => a.name === NOM_APP);
  appMemo = existante ? getApp(NOM_APP) : initializeApp(PUBLIC_CONFIG.firebase, NOM_APP);
  return appMemo;
}

/**
 * Auth Firebase du navigateur. La persistance par defaut du SDK web est
 * `indexedDBLocal` : la session survit au rechargement et a la fermeture de
 * l'onglet, donc l'utilisateur ne rejoue pas le pont a chaque visite.
 */
export function firebaseAuth(): Auth {
  return getAuth(firebaseApp());
}

export function firestore(): Firestore {
  return getFirestore(firebaseApp());
}
