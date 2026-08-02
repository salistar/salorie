// Helpers RTL partagés. L'app NE force PAS I18nManager.forceRTL (pas de restart) :
// chaque écran applique le RTL manuellement via isRTL (renvoyé par useTranslation()).
// Recette : flexDirection={rowDir(isRTL)} sur les rangées, textAlign={txtAlign(isRTL)} sur les textes.
import type { FlexStyle, TextStyle } from 'react-native';

export function rowDir(isRTL: boolean): FlexStyle['flexDirection'] {
  return isRTL ? 'row-reverse' : 'row';
}

export function txtAlign(isRTL: boolean): TextStyle['textAlign'] {
  return isRTL ? 'right' : 'left';
}

export function writingDir(isRTL: boolean): TextStyle['writingDirection'] {
  return isRTL ? 'rtl' : 'ltr';
}

// Pour les chevrons / flèches "retour" : à inverser horizontalement en RTL.
export function flipForRTL(isRTL: boolean) {
  return isRTL ? ({ transform: [{ scaleX: -1 }] } as const) : undefined;
}
