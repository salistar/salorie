'use client';
// Pont Clerk -> Firebase Auth, version navigateur.
// ---------------------------------------------------------------------------
// Transposition fidele de `lib/firebaseAuth.ts` du mobile : on echange le jeton de
// session Clerk contre un jeton personnalise Firebase dont l'uid est l'email en
// minuscules, puis on ouvre la session Firebase avec.
//
// C'est ce qui rend web et mobile interchangeables : le meme compte Google produit
// le meme uid des deux cotes, donc le meme document `users/{email}` et les memes
// droits sous les regles existantes. Aucune regle Firestore n'a ete touchee pour
// l'espace web — c'etait le critere de reussite de W1.
import { signInWithCustomToken, signOut } from 'firebase/auth';
import { firebaseAuth } from './firebaseClient';
import { PUBLIC_CONFIG } from './publicConfig';

// Plusieurs composants montent en meme temps au premier rendu et demandent tous la
// session : on fusionne les appels concurrents pour ne battre le pont qu'une fois.
let enCours: Promise<boolean> | null = null;

export async function connecterFirebase(
  recupererJetonClerk: () => Promise<string | null>,
): Promise<boolean> {
  if (!PUBLIC_CONFIG.firebaseTokenUrl) return false;
  const auth = firebaseAuth();
  if (auth.currentUser) return true;
  if (enCours) return enCours;

  enCours = (async () => {
    try {
      const jetonClerk = await recupererJetonClerk();
      if (!jetonClerk) return false;

      const rep = await fetch(PUBLIC_CONFIG.firebaseTokenUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jetonClerk}`, 'Content-Type': 'application/json' },
      });
      if (!rep.ok) {
        console.warn('[pont] le service de jetons a repondu', rep.status);
        return false;
      }
      const data = (await rep.json()) as { token?: string };
      if (!data?.token) return false;

      await signInWithCustomToken(auth, data.token);
      return true;
    } catch (e) {
      console.warn('[pont] echec de la connexion Firebase', e);
      return false;
    } finally {
      enCours = null;
    }
  })();

  return enCours;
}

/** Ferme la session Firebase (a appeler avec la deconnexion Clerk). */
export async function deconnecterFirebase(): Promise<void> {
  try {
    const auth = firebaseAuth();
    if (auth.currentUser) await signOut(auth);
  } catch {
    /* sans consequence : la session expirera d'elle-meme */
  }
}

/**
 * Jeton d'identite Firebase courant, pour appeler l'API Salorie depuis le
 * navigateur (`Authorization: Bearer …`). Le backend le verifie avec
 * FirebaseAuthGuard, exactement comme les appels du mobile.
 */
export async function jetonApi(): Promise<string | null> {
  const u = firebaseAuth().currentUser;
  return u ? u.getIdToken() : null;
}
