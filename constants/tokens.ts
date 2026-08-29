// Couche SÉMANTIQUE du design Salorie — la pièce qui manquait.
// ---------------------------------------------------------------------------
// L'app avait déjà deux étages :
//   · `constants/theme.ts`  — tokens NUMÉRIQUES (espacements, rayons, ombres, typo) ;
//   · `constants/Colors.ts` — la PALETTE brute (nuances de gris, teintes).
// Il manquait celui du milieu : des couleurs nommées par leur RÔLE. C'est son
// absence qui a produit 2 454 hex écrits à la main dans les écrans — faute de
// pouvoir dire « la surface d'une carte », chacun réécrivait `isDark ? '#1f2833'
// : '#fff'`, avec à chaque fois une variante légèrement différente.
//
// Nommer par le rôle, et non par la teinte, a deux conséquences immédiates :
//   1. le mode sombre devient une propriété du système, plus une décision d'écran ;
//   2. changer la marque se fait ici, pas dans 108 fichiers.
//
// Les valeurs sombres reprennent celles qui étaient déjà employées le plus souvent
// dans l'app (#0f1419 pour le fond, #1a1f2a pour une carte, #1f2833 pour une carte
// surélevée) : la migration ne change donc RIEN à l'écran, elle ne fait que nommer
// ce qui existait. C'est délibéré — une refonte visuelle et une migration technique
// menées ensemble ne se relisent plus.
//
// Contraste : chaque couple texte/fond ci-dessous tient au moins 4,5:1 (WCAG AA),
// y compris les paires sémantiques `…Ink` sur `…Soft`, qui étaient justement le
// point faible des badges écrits à la main.
import { useMemo } from 'react';
import { useTheme } from '../lib/ThemeContext';
import { THEMES, CleTheme } from './themesGeneres';
import { paletteComplete } from './derivationThemes';

export type Tokens = ReturnType<typeof paletteComplete>;

export function makeTokens(theme: CleTheme | boolean): Tokens {
  // ⚠ SIGNATURE ELARGIE, PAS REMPLACEE.
  // Cette fonction recevait un booleen `isDark`. Elle accepte desormais l'une
  // des six cles de theme — mais continue d'accepter le booleen, car du code
  // ancien le passe encore. `true` devient Obsidian, `false` devient Ivory :
  // les deux themes par defaut de design/themes.json, et non deux palettes
  // improvisees pour l'occasion.
  const cle: CleTheme =
    typeof theme === 'boolean' ? (theme ? 'obsidian' : 'ivory') : theme;
  // ⚠ UNE CLE INCONNUE NE DOIT PAS FAIRE PLANTER L'ECRAN.
  // `THEMES[cle]` rendait `undefined`, et la derivation levait aussitot
  // « Cannot read properties of undefined ». Trois cas mènent la : une valeur
  // ancienne restee dans AsyncStorage, une preference venue d'une version plus
  // recente installee sur un autre appareil, ou un contexte simule dans un
  // test. Aucun ne justifie un ecran blanc — on retombe sur le theme clair par
  // defaut, exactement comme le web le fait avec ses alias.
  return paletteComplete(THEMES[cle] ?? THEMES.ivory);
}

/**
 * Tokens du thème courant.
 *
 * À préférer à `useTheme()` + ternaires dans tout écran migré : l'écran cesse de
 * décider ce qu'est « une carte en sombre », il se contente de le demander.
 */
export function useTokens(): Tokens {
  // `theme` porte l'une des six cles ; `resolved` reste expose pour le code qui
  // ne raisonne qu'en clair/sombre.
  const { theme } = useTheme();
  // Mémorisé : l'objet sert de dépendance à des `useMemo(makeStyles)` dans les
  // écrans. Le recréer à chaque rendu reconstruirait toutes leurs feuilles de style.
  return useMemo(() => makeTokens(theme), [theme]);
}

/**
 * Couleurs de CATÉGORIE — l'identité d'une fonctionnalité, pas un rôle d'interface.
 *
 * Elles ne suivent volontairement pas le thème : la pastille « Médailles » est ambre
 * en clair comme en sombre, exactement comme l'icône d'une app reste elle-même. Les
 * nommer ici leur retire seulement leur statut de valeur écrite au hasard — elles
 * étaient jusqu'ici recopiées à la main dans chaque écran qui les affichait.
 *
 * Toujours les employer sur une pastille (`+'15'` en clair, `+'26'` en sombre pour le
 * fond), jamais en couleur de TEXTE sur le fond de l'écran : plusieurs d'entre elles
 * ne tiendraient pas le contraste AA.
 */
export const CATEGORIES = {
  medailles: '#f59e0b',
  succes: '#8b5cf6',
  series: '#ef4444',
  famille: '#0ea5e9',
  parrainage: '#14b8a6',
  nutriments: '#10b981',
  constantes: '#f43f5e',
  medical: '#0891b2',
  reglages: '#6366f1',
  abonnement: '#ec4899',
  idees: '#10b981',
  contact: '#3b82f6',
  journaux: '#64748b',

  // Ajoutees le 29/08/2026 : elles etaient recopiees a la main dans
  // ActivityList et ActionMenu, avec leur fond pale en prime. Les nommer ici
  // supprime la recopie sans les rendre thematiques — une seance de course
  // garde son indigo en Rose comme en Dore.
  exercice: '#0ea5e9',
  course: '#6366f1',
  musculation: '#8b5cf6',
  activite: '#f43f5e',
  aliments: '#f59e0b',
} as const;

/**
 * La pastille d'une categorie : sa couleur, et son fond teinte.
 *
 * Le fond n'est PAS une seconde valeur a choisir — c'est la meme couleur, plus
 * transparente. La convention etait deja ecrite plus haut — suffixe 15 en
 * clair, 26 en sombre — mais chaque ecran la reappliquait a la main, souvent avec
 * un pale different. Une fonction l'applique pour tous.
 */
export function pastilleCategorie(cle: keyof typeof CATEGORIES, sombre: boolean) {
  const c = CATEGORIES[cle];
  return { color: c, bg: c + (sombre ? '26' : '15') };
}
