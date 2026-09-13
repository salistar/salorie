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
    // ⚠ `await` ET NON `return` SEC, ET C'EST TOUTE LA DIFFÉRENCE.
    // Un `return promesse` à l'intérieur d'un `try` rend la promesse SANS
    // l'attendre : son rejet ne passe donc jamais par le `catch` en dessous.
    // C'était le cas jusqu'au 13/09/2026 — le module annonçait en en-tête que
    // « l'échec est TOUJOURS avalé » et ne l'avalait pas. Sur un appareil sans
    // moteur haptique, ou avec le retour désactivé dans les réglages système,
    // `expo-haptics` rejette.
    //
    // Ce que ça coûtait EXACTEMENT, mesuré plutôt que supposé : les dix points
    // d'appel écrivent `haptique.succes()` sans `await`, donc le rejet ne
    // faisait échouer aucune action — il partait en rejet de promesse non
    // gérée. Le vrai danger était devant nous, pas derrière : le premier
    // appelant qui aurait écrit `await haptique.succes()`, en se fiant à la
    // promesse d'en-tête, aurait vu son action mourir sur une vibration.
    // Trouvé en écrivant `__tests__/haptique.test.ts`, qui le verrouille.
    switch (style) {
      case 'leger':
        await H.impactAsync(H.ImpactFeedbackStyle.Light);
        return;
      case 'moyen':
        await H.impactAsync(H.ImpactFeedbackStyle.Medium);
        return;
      case 'succes':
        await H.notificationAsync(H.NotificationFeedbackType.Success);
        return;
      case 'alerte':
        await H.notificationAsync(H.NotificationFeedbackType.Warning);
        return;
      case 'erreur':
        await H.notificationAsync(H.NotificationFeedbackType.Error);
        return;
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
