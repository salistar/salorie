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

/**
 * Miroir horizontal AUTOMATIQUE, sans passer par un crochet.
 *
 * `flipForRTL` exige qu'on lui donne `isRTL`, donc que l'ecran appelle
 * `useTranslation`. Beaucoup de fleches vivent dans des composants qui n'ont aucun
 * autre besoin du contexte ; les y brancher pour retourner une icone serait un cout
 * sans contrepartie. La langue vient du miroir hors React de lib/i18n.
 *
 * A n'employer QUE sur les icones qui suivent le SENS DE LECTURE — retour,
 * precedent/suivant, « aller plus loin ». JAMAIS sur une icone qui designe une
 * direction du monde reel : la fleche d'une boussole ou d'un guidage AR doit
 * continuer de pointer vers l'est meme quand on lit de droite a gauche.
 */
export function flipAuto() {
  try {
    // Import paresseux : lib/i18n importe des composants React, et une dependance
    // en tete de ce module purement utilitaire creerait un cycle.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { langueActuelle } = require('./i18n');
    return langueActuelle() === 'ar' ? ({ transform: [{ scaleX: -1 }] } as const) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Sens de lecture, sans passer par un crochet — pour le contenu des MODALES.
 *
 * Une `Modal` React Native s'affiche dans une hierarchie native SEPAREE : elle
 * n'herite donc PAS du `direction: rtl` pose sur la racine de l'app. Sans cela,
 * une feuille ouverte en arabe garde une mise en page de gauche a droite pendant
 * que tout l'ecran derriere elle est retourne. Constate le 14 aout 2026 sur le
 * menu de langue, qui restait obstinement a l'endroit.
 *
 * A poser sur le conteneur RACINE du contenu d'une modale.
 */
export function directionAuto() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { langueActuelle } = require('./i18n');
    return { direction: langueActuelle() === 'ar' ? 'rtl' : 'ltr' } as const;
  } catch {
    return undefined;
  }
}
