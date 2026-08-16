import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Le meuble du bas : la barre d'onglets flottante et le bouton « + ».
 *
 * Ces deux éléments sont en `position: absolute` — ils ne poussent donc rien et
 * ne réservent aucune place. Chaque écran devait deviner combien laisser sous son
 * contenu, et chacun devinait autre chose : 120, 130, 140, 140. Tous trop peu, et
 * le bouton « + » recouvrait la fin des listes au repos.
 *
 * Pire, les décalages étaient des constantes : sur un téléphone à trois boutons,
 * la barre passait derrière celle d'Android (mesuré le 16 août 2026 sur
 * R83L20HWJTE, libellés à y 1473→1514 pour une barre système à y 1492).
 *
 * Tout part donc d'ici, et tout part du décalage réel du système.
 */

/** Hauteur de la barre d'onglets elle-même (`styles.tabBar`). */
export const HAUTEUR_BARRE = 78;

/** Écart entre le bas de la barre et le bas du bouton « + ». */
const BOUTON_AU_DESSUS_DE_LA_BARRE = 94;

/** Diamètre du bouton « + ». */
const DIAMETRE_BOUTON = 64;

/** Un peu d'air sous le dernier élément, pour qu'il ne colle pas au bouton. */
const RESPIRATION = 16;

/**
 * De combien la barre flottante est remontée du bas de l'écran.
 *
 * `max` et non une somme : sur un téléphone à navigation gestuelle le décalage
 * système est presque nul, et les 24 px d'origine restent le bon écart. Là où
 * c'était déjà juste, rien ne bouge.
 */
export function useBasBarre(): number {
  const insets = useSafeAreaInsets();
  return Math.max(24, insets.bottom + 10);
}

/** Position du bouton « + », calée sur la barre pour ne jamais s'y enfoncer. */
export function useBasBouton(): number {
  return useBasBarre() + BOUTON_AU_DESSUS_DE_LA_BARRE;
}

/**
 * Ce qu'un écran À ONGLETS doit réserver sous son contenu.
 * Dégage la barre ET le bouton : au bas du défilement, plus rien n'est caché.
 */
export function useEspaceBas(): number {
  return useBasBouton() + DIAMETRE_BOUTON + RESPIRATION;
}

/**
 * Ce qu'un écran POUSSÉ doit réserver : il porte la barre persistante mais pas
 * le bouton « + », donc il n'a pas besoin d'en dégager la hauteur.
 */
export function useEspaceBasSimple(): number {
  return useBasBarre() + HAUTEUR_BARRE + RESPIRATION;
}
