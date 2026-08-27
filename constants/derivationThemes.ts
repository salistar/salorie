// Dérive TOUTE la palette mobile depuis les six thèmes partagés.
// ---------------------------------------------------------------------------
// POURQUOI CE FICHIER
//
// `design/themes.json` définit douze jetons par thème. L'application mobile en
// consomme beaucoup plus : `surfaceRaised`, `surfaceSunken`, `textFaint`,
// `borderStrong`, les triplets sémantiques `…Soft` / `…Ink`, la nuancier de
// gris de `Colors.ts`… Les six palettes ne pouvaient donc pas être branchées
// telles quelles.
//
// Deux façons de combler l'écart :
//   1. écrire les valeurs manquantes à la main, six fois — c'est-à-dire
//      recréer exactement la divergence que la génération devait empêcher ;
//   2. les DÉRIVER par mélange à partir des douze jetons.
//
// C'est la seconde. Une palette reste donc définie par douze valeurs, et tout
// le reste se recalcule. Ajouter un septième thème ne demandera rien d'autre
// que douze couleurs.
//
// ⚠ CE QUE LA DÉRIVATION NE FAIT PAS
// Elle ne garantit pas le contraste. `scripts/verifier-contraste.js` le mesure
// sur les paires réelles, et c'est lui qui fait autorité — pas l'intuition
// qu'un mélange « devrait » suffire.

import { THEMES, CleTheme, JetonsTheme } from './themesGeneres';

/* ── Mélange de couleurs ────────────────────────────────────────────────── */

function versRvb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const plein = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [
    parseInt(plein.slice(0, 2), 16),
    parseInt(plein.slice(2, 4), 16),
    parseInt(plein.slice(4, 6), 16),
  ];
}

const deuxChiffres = (n: number) => Math.round(n).toString(16).padStart(2, '0');

/**
 * Mélange `a` et `b`, `part` étant la proportion de `b` (0 → `a`, 1 → `b`).
 *
 * C'est l'équivalent du `color-mix()` employé côté web. React Native ne sait pas
 * mélanger des couleurs à l'exécution : le calcul doit être fait ici, en amont.
 */
export function melange(a: string, b: string, part: number): string {
  const [ra, ga, ba] = versRvb(a);
  const [rb, gb, bb] = versRvb(b);
  const p = Math.max(0, Math.min(1, part));
  return (
    '#' +
    deuxChiffres(ra + (rb - ra) * p) +
    deuxChiffres(ga + (gb - ga) * p) +
    deuxChiffres(ba + (bb - ba) * p)
  );
}

/** La même couleur avec un canal alpha, au format `#rrggbbaa`. */
export function avecAlpha(hex: string, alpha: number): string {
  return hex + deuxChiffres(Math.max(0, Math.min(1, alpha)) * 255);
}

/* ── Contraste ──────────────────────────────────────────────────────────── */

function luminance(hex: string): number {
  const [r, g, b] = versRvb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Le rapport de contraste WCAG entre deux couleurs (1 → identiques, 21 → max). */
export function contraste(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Rapproche `encre` de `pole` jusqu'à atteindre `min` de contraste sur `fond`.
 *
 * ⚠ POURQUOI CETTE FONCTION EXISTE
 * Les premiers mélanges employaient un taux fixe. Il tenait sur les palettes
 * sombres et tombait sous le seuil sur les trois palettes claires : mention
 * discrète à 2,56:1, texte sur accent à 3,35:1 — onze paires en échec, que
 * seul le contrôle de contraste a révélées.
 *
 * Un taux fixe ne PEUT pas convenir : l'écart de luminosité entre l'accent et
 * le fond change d'un thème à l'autre. On vise donc le résultat, et non le
 * réglage. Un septième thème sera conforme sans qu'on ait à retoucher quoi que
 * ce soit ici.
 */
export function versContraste(encre: string, fond: string, pole: string, min: number): string {
  if (contraste(encre, fond) >= min) return encre;
  for (let i = 1; i <= 20; i++) {
    const essai = melange(encre, pole, i / 20);
    if (contraste(essai, fond) >= min) return essai;
  }
  // Le pôle lui-même ne suffit pas : c'est le fond qui est en cause, pas
  // l'encre. On rend le maximum atteignable plutôt qu'une couleur au hasard.
  return pole;
}

/* ── Palette complète d'un thème ────────────────────────────────────────── */

/**
 * Les jetons manquants, dérivés des douze.
 *
 * Le sens des mélanges suit la luminosité du thème : sur un fond sombre une
 * surface s'ÉCLAIRCIT quand elle monte, sur un fond clair elle s'assombrit.
 * Appliquer la même règle aux deux produisait des cartes plus foncées que le
 * fond en clair — l'inverse de ce qu'une élévation raconte.
 */
export function paletteComplete(t: JetonsTheme) {
  // Le pôle vers lequel « monter » : plus clair en sombre, plus foncé en clair.
  const haut = t.sombre ? '#FFFFFF' : '#000000';
  // Le pôle vers lequel POUSSER une encre trop pâle : toujours l'opposé du fond.
  const encrePole = t.sombre ? '#FFFFFF' : '#000000';

  // Une encre sémantique doit rester lisible sur SON fond doux, pas seulement
  // paraître assortie. On vise 4,5:1 et on laisse le mélange trouver le taux.
  const doux = (base: string) => melange(t.bg, base, t.sombre ? 0.16 : 0.12);
  const encre = (base: string) =>
    versContraste(melange(base, t.text, t.sombre ? 0.12 : 0.42), doux(base), encrePole, 4.5);

  return {
    bg: t.bg,
    surface: t.surface,
    surfaceRaised: t.surface2,
    // Un creux part TOUJOURS du fond, jamais de la surface : c'est ce qui le
    // distingue d'une carte, quel que soit le thème.
    surfaceSunken: melange(t.bg, haut, t.sombre ? 0.04 : 0.03),

    text: t.text,
    textMuted: t.textMuted,
    // Le tertiaire s'efface encore, sans jamais fondre dans le fond.
    // S'efface, mais reste lisible : 3:1 est le plancher d'un texte secondaire.
    textFaint: versContraste(melange(t.textMuted, t.bg, 0.38), t.bg, encrePole, 3),
    // ⚠ PAS de blanc systématique. Sur un accent clair — le vert d'Ivory, le
    // rose de Blush — du blanc tombe à 3,3:1. On retient celui des deux pôles
    // qui contraste le mieux avec l'accent de CE thème.
    onAccent:
      contraste('#FFFFFF', t.accent) >= contraste('#0B0B0B', t.accent) ? '#FFFFFF' : '#0B0B0B',

    border: t.border,
    borderStrong: melange(t.border, t.text, 0.28),

    accent: t.accent,
    // L'accent sert d'ENCRE sur son propre fond teinté (puce active, tuile
    // sélectionnée). En Ivory ce couple tombait à 2,96:1 : on assombrit le fond
    // doux plutôt que de dénaturer l'accent, qui est l'identité de la marque.
    accentSoft: versContraste(t.accentSoft, t.accent, t.sombre ? '#000000' : '#FFFFFF', 3),
    accentStrong: t.accent2,

    success: t.success,
    successSoft: doux(t.success),
    successInk: encre(t.success),

    warning: t.warning,
    warningSoft: doux(t.warning),
    warningInk: encre(t.warning),

    danger: t.danger,
    dangerSoft: doux(t.danger),
    dangerInk: encre(t.danger),

    // `info` n'existe pas dans les six palettes : on le tire de accent2, qui
    // joue déjà ce rôle de teinte secondaire dans chaque thème.
    info: t.accent2,
    infoSoft: doux(t.accent2),
    infoInk: encre(t.accent2),

    scrim: 'rgba(0,0,0,0.55)',
    glass: avecAlpha(t.bg, t.sombre ? 0.72 : 0.82),
    hairline: avecAlpha(t.text, 0.08),

    isDark: t.sombre,
  } as const;
}

/**
 * Le nuancier `gray` de `Colors.ts`, redérivé.
 *
 * ⚠ Il ne s'agit plus de gris : ce sont les neutres DU THÈME. En rose, ils
 * tirent vers le rose ; en doré, vers le brun chaud. Le nom `gray` est conservé
 * parce que 131 fichiers l'emploient — le renommer aurait été un chantier
 * séparé, sans rapport avec les thèmes.
 *
 * L'échelle garde son sens historique : en clair 50 est le plus pâle et 900 le
 * plus foncé ; en sombre l'ordre s'inverse, exactement comme le faisait
 * `Colors.dark`. Inverser cette convention aurait retourné le contraste de tous
 * les écrans qui s'en servent.
 */
export function nuancier(t: JetonsTheme) {
  const de = t.sombre ? t.bg : t.text;
  const vers = t.sombre ? t.text : t.bg;
  const pas = [0.06, 0.12, 0.22, 0.34, 0.5, 0.64, 0.76, 0.88, 0.96];
  const [n50, n100, n200, n300, n400, n500, n600, n700, n800] = pas.map((p) =>
    melange(vers, de, p)
  );
  return t.sombre
    ? { 50: n50, 100: n100, 200: n200, 300: n300, 400: n400, 500: n500, 600: n600, 700: n700, 800: n800, 900: t.text }
    : { 50: t.bg, 100: n800, 200: n700, 300: n600, 400: n500, 500: n400, 600: n300, 700: n200, 800: n100, 900: t.text };
}

/** La forme de `Colors.light` / `Colors.dark`, alimentée par un thème. */
export function couleursDepuisTheme(cle: CleTheme) {
  const t = THEMES[cle];
  return {
    text: t.text,
    background: t.bg,
    tint: t.accent,
    icon: t.textMuted,
    tabIconDefault: t.textMuted,
    tabIconSelected: t.accent,
    primary: t.accent,
    primaryLight: t.accentSoft,
    primaryDark: t.accent2,
    // `secondary` servait d'ambre d'accentuation : `warning` joue ce rôle dans
    // les six palettes.
    secondary: t.warning,
    gray: nuancier(t),
    error: t.danger,
    success: t.success,
    // ⚠ `white` n'a JAMAIS voulu dire « blanc » : les écrans s'en servent comme
    // couleur de carte sur fond d'écran. En sombre il valait déjà #0f1419.
    white: t.surface,
    card: t.surface,
  };
}
