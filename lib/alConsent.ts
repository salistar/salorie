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

// ── Demander au bon moment ──────────────────────────────────────────────────
// ⚠ POURQUOI CE BLOC EXISTE : LE PIPELINE ETAIT VIDE.
// Au 09/09/2026, la collecte compte 7 enregistrements et ZERO correction, alors
// que le code fonctionne et que l'invitation a corriger s'affiche. La cause
// n'est pas technique : l'option vit dans Reglages > Preferences, desactivee par
// defaut, et personne ne va l'y chercher. Un consentement que l'on n'a jamais
// l'occasion de donner equivaut a un refus.
//
// On demande donc AU MOMENT OU L'UTILISATEUR VIENT DE CORRIGER un scan — le seul
// instant ou sa contribution a une valeur evidente, et ou la question se
// comprend sans explication. Cela reste un opt-in explicite : rien n'est envoye
// avant qu'il ait dit oui, et on ne redemande jamais s'il a dit non.
const KEY_DEMANDE = 'al_consent_demande_v1';

export async function consentementDejaDemande(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY_DEMANDE)) === 'true';
  } catch {
    return true; // en cas de doute on NE demande PAS : mieux vaut rater une
    // occasion que harceler quelqu'un a chaque repas.
  }
}

export async function marquerConsentementDemande(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_DEMANDE, 'true');
  } catch {
    /* best-effort */
  }
}

const TEXTES: Record<string, { titre: string; corps: string; oui: string; non: string }> = {
  fr: {
    titre: 'Merci pour la correction',
    corps: "Voulez-vous que vos photos de repas corrigées servent à améliorer la "
      + "reconnaissance ? Elles sont envoyées sans votre identité, et vous pouvez "
      + "changer d'avis à tout moment dans Réglages.",
    oui: 'Oui, participer',
    non: 'Non merci',
  },
  ar: {
    titre: 'شكرا على التصحيح',
    corps: 'هل توافق على استخدام صور وجباتك المصححة لتحسين التعرّف؟ ترسل دون هويتك، '
      + 'ويمكنك التراجع في أي وقت من الإعدادات.',
    oui: 'نعم، أشارك',
    non: 'لا، شكرا',
  },
  en: {
    titre: 'Thanks for the correction',
    corps: 'Would you like your corrected meal photos to help improve recognition? '
      + 'They are sent without your identity, and you can change your mind any '
      + 'time in Settings.',
    oui: 'Yes, take part',
    non: 'No thanks',
  },
};

/**
 * Propose la collecte apres une correction. Ne fait rien si l'utilisateur a
 * deja consenti, ou si on lui a deja pose la question une fois.
 */
export async function proposerConsentementApresCorrection(language?: string): Promise<void> {
  if (await getMLConsent()) return;
  if (await consentementDejaDemande()) return;
  await marquerConsentementDemande();
  const t = TEXTES[(language || 'fr').slice(0, 2)] || TEXTES.fr;
  const { Alert } = require('react-native');
  Alert.alert(t.titre, t.corps, [
    { text: t.non, style: 'cancel' },
    { text: t.oui, onPress: () => { setMLConsent(true); } },
  ]);
}
