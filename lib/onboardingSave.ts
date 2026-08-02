// Fin d'onboarding — UN SEUL endroit qui écrit le flag `onboarded`.
//
// Pourquoi ce fichier existe : le paywall s'intercale entre l'écran de résultats et
// l'app. Or le garde de `app/_layout.tsx` renvoie vers `/(tabs)` dès que le statut
// passe à `onboarded` — si on écrivait le flag AVANT le paywall, l'utilisateur serait
// éjecté de l'écran de vente en une frame. On repousse donc l'écriture tout à la fin :
// pendant tout le parcours on reste `not-onboarded` dans le groupe `(onboarding)`, où
// le garde ne touche à rien.
//
// L'écran de résultats dépose son payload ici, le paywall le consomme.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveUserToFirestore } from './firebase';

const PENDING_KEY = 'onboarding_pending_save';

export type PendingOnboarding = { profile: any; plan: any };

/** Dépose le profil + plan calculés, sans rien marquer comme terminé. */
export async function stashPendingOnboarding(p: PendingOnboarding): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(p));
  } catch (e) {
    console.warn('[Onboarding] stash failed', e);
  }
}

/**
 * Valide réellement l'onboarding : Firestore + flags locaux, puis purge le dépôt.
 * Best-effort — un échec réseau ne doit pas piéger l'utilisateur dans l'onboarding,
 * donc on écrit quand même les flags locaux et on laisse la sync se rattraper.
 */
export async function commitOnboarding(user: { id: string; email: string } | null): Promise<void> {
  let pending: PendingOnboarding | null = null;
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    pending = raw ? JSON.parse(raw) : null;
  } catch { /* payload illisible → on continue, les flags priment */ }

  try {
    if (user?.email && pending) {
      await saveUserToFirestore({
        id: user.id,
        email: user.email,
        ...pending.profile,
        nutritionalPlan: pending.plan,
        onboarded: true,
      });
    }
  } catch (e) {
    console.warn('[Onboarding] commit Firestore failed', e);
  }

  try {
    if (user?.email) {
      await AsyncStorage.setItem(`onboarded_${user.email.toLowerCase()}`, 'true');
      await AsyncStorage.setItem('last_session_onboarded', 'true');
    }
    await AsyncStorage.removeItem(PENDING_KEY);
  } catch (e) {
    console.warn('[Onboarding] commit flags failed', e);
  }
}
