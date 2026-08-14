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

export type Tokens = ReturnType<typeof makeTokens>;

export function makeTokens(isDark: boolean) {
  return {
    // ── Surfaces, de la plus basse à la plus haute ────────────────────────────
    /** Fond de l'écran. */
    bg: isDark ? '#0f1419' : '#f8fafc',
    /** Carte, feuille, panneau posé sur le fond. */
    surface: isDark ? '#1a1f2a' : '#ffffff',
    /** Carte posée SUR une carte (modale, tuile active). */
    surfaceRaised: isDark ? '#1f2833' : '#ffffff',
    /** Creux : champ de saisie, zone inactive, piste de barre de progression. */
    surfaceSunken: isDark ? '#161c23' : '#f1f5f9',

    // ── Texte ─────────────────────────────────────────────────────────────────
    /** Texte principal. */
    text: isDark ? '#ecedee' : '#0f172a',
    /** Texte secondaire : légendes, unités, aides. */
    textMuted: isDark ? '#94a3b8' : '#64748b',
    /** Texte tertiaire : horodatages, mentions discrètes. */
    textFaint: isDark ? '#64748b' : '#94a3b8',
    /** Texte posé sur une couleur d'accent ou sémantique pleine. */
    onAccent: '#ffffff',

    // ── Traits ────────────────────────────────────────────────────────────────
    border: isDark ? '#2d3543' : '#e2e8f0',
    borderStrong: isDark ? '#404a5a' : '#cbd5e1',

    // ── Marque ────────────────────────────────────────────────────────────────
    accent: isDark ? '#4ade80' : '#2e8b57',
    /** Fond teinté de marque : puce active, tuile sélectionnée. */
    accentSoft: isDark ? '#14331f' : '#eaf4ee',
    /** Marque appuyée : état pressé, contraste renforcé. */
    accentStrong: isDark ? '#86efac' : '#1d6440',

    // ── Sémantique : base pleine, fond doux, encre lisible SUR le fond doux ───
    success: isDark ? '#34d399' : '#10b981',
    successSoft: isDark ? '#0f2e21' : '#ecfdf3',
    successInk: isDark ? '#6ee7b7' : '#065f46',

    warning: isDark ? '#f59e0b' : '#d97706',
    warningSoft: isDark ? '#372c17' : '#fef3c7',
    warningInk: isDark ? '#fcd34d' : '#92400e',

    danger: isDark ? '#f87171' : '#dc2626',
    dangerSoft: isDark ? '#3a221d' : '#fef2f2',
    dangerInk: isDark ? '#fca5a5' : '#991b1b',

    info: isDark ? '#7dd3fc' : '#0284c7',
    infoSoft: isDark ? '#0c2b3a' : '#e0f2fe',
    infoInk: isDark ? '#bae6fd' : '#075985',

    // ── Voiles et superpositions ──────────────────────────────────────────────
    /** Voile derrière une modale. */
    scrim: 'rgba(0,0,0,0.55)',
    /** Surface translucide posée sur une photo ou la caméra. */
    glass: isDark ? 'rgba(15,20,25,0.72)' : 'rgba(255,255,255,0.82)',
    /** Séparateur très léger sur fond translucide. */
    hairline: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.07)',

    /** Vrai en mode sombre — pour les rares cas qui ne sont pas une couleur
     *  (choix d'une image, d'un `barStyle`, d'un `keyboardAppearance`). */
    isDark,
  } as const;
}

/**
 * Tokens du thème courant.
 *
 * À préférer à `useTheme()` + ternaires dans tout écran migré : l'écran cesse de
 * décider ce qu'est « une carte en sombre », il se contente de le demander.
 */
export function useTokens(): Tokens {
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  // Mémorisé : l'objet sert de dépendance à des `useMemo(makeStyles)` dans les
  // écrans. Le recréer à chaque rendu reconstruirait toutes leurs feuilles de style.
  return useMemo(() => makeTokens(isDark), [isDark]);
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
} as const;
