// Consentement explicite (opt-in, par défaut DÉSACTIVÉ) pour la collecte de photos de repas
// destinée à améliorer la reconnaissance (active learning). RGPD : aucune image ne quitte
// l'appareil tant que l'utilisateur n'a pas activé l'option dans Réglages > Préférences.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'al_consent_v1';

export async function getMLConsent(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) === 'true';
  } catch {
    return false; // par défaut : pas de collecte
  }
}

export async function setMLConsent(v: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, v ? 'true' : 'false');
  } catch {
    /* best-effort */
  }
}
