// Retour haptique — la vibration légère qui confirme un geste.
// ---------------------------------------------------------------------------
// Centralisé pour trois raisons :
//   · le vocabulaire reste petit et cohérent (une app qui vibre de six façons
//     différentes ne dit plus rien) ;
//   · l'échec est TOUJOURS avalé — sur un appareil sans moteur haptique, ou avec
//     le retour désactivé, `expo-haptics` rejette ; laisser remonter cette erreur
//     ferait échouer une validation de repas pour une vibration ;
//   · le module est chargé paresseusement, pour ne pas peser au démarrage.
//
// Règle d'emploi : le haptique CONFIRME, il n'annonce pas. On vibre quand une
// action de l'utilisateur aboutit — jamais pour attirer l'attention, jamais en
// rafale, jamais sur un défilement.
import { Platform } from 'react-native';

type Style = 'leger' | 'moyen' | 'succes' | 'alerte' | 'erreur';

async function jouer(style: Style): Promise<void> {
  // Web et appareils sans moteur : rien à faire, et surtout rien à signaler.
  if (Platform.OS === 'web') return;
  try {
    const H = await import('expo-haptics');
    switch (style) {
      case 'leger':
        return H.impactAsync(H.ImpactFeedbackStyle.Light);
      case 'moyen':
        return H.impactAsync(H.ImpactFeedbackStyle.Medium);
      case 'succes':
        return H.notificationAsync(H.NotificationFeedbackType.Success);
      case 'alerte':
        return H.notificationAsync(H.NotificationFeedbackType.Warning);
      case 'erreur':
        return H.notificationAsync(H.NotificationFeedbackType.Error);
    }
  } catch {
    /* pas de moteur haptique, ou retour désactivé : sans conséquence */
  }
}

export const haptique = {
  /** Appui sur une carte, un onglet, une pastille. */
  appui: () => jouer('leger'),
  /** Choix engageant : bascule d'un réglage, sélection d'une option. */
  choix: () => jouer('moyen'),
  /** Un scan a abouti, un repas est enregistré, un objectif est atteint. */
  succes: () => jouer('succes'),
  /** Attention utile : allergène détecté, quota proche. */
  alerte: () => jouer('alerte'),
  /** L'action a échoué. */
  erreur: () => jouer('erreur'),
};
