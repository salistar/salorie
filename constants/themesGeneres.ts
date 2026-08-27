// FICHIER GENERE — NE PAS MODIFIER A LA MAIN.
// Source : design/themes.json
// Regenerer : node scripts/generer-themes.js
// Toute modification directe sera ecrasee, et la CI la refusera.

export type CleTheme = 'obsidian' | 'ivory' | 'blush' | 'ocean' | 'platinum' | 'gold';

export interface JetonsTheme {
  nom: string;
  sombre: boolean;
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  accent2: string;
  accentSoft: string;
  success: string;
  warning: string;
  danger: string;
  borderSoft?: string;
  gradientHero: [string, string];
}

export const THEMES: Record<CleTheme, JetonsTheme> = {
  obsidian: {
    nom: "Noir",
    sombre: true,
    bg: '#0A0C10',
    surface: '#12151C',
    surface2: '#1A1E27',
    border: '#2E3646',
    text: '#F4F6F8',
    textMuted: '#9AA3B2',
    accent: '#34D98F',
    accent2: '#22B573',
    accentSoft: '#123125',
    success: '#34D98F',
    warning: '#E8B84B',
    danger: '#F26D6D',
    gradientHero: ['#34D98F', '#22B573'],
  },
  ivory: {
    nom: "Blanc",
    sombre: false,
    bg: '#FAFAF8',
    surface: '#FFFFFF',
    surface2: '#F1F2F4',
    border: '#D8DCE3',
    text: '#14181F',
    textMuted: '#5B6470',
    accent: '#16A06A',
    accent2: '#0E7C51',
    accentSoft: '#E3F5EC',
    success: '#16A06A',
    warning: '#B27A10',
    danger: '#C4392F',
    gradientHero: ['#16A06A', '#0E7C51'],
  },
  blush: {
    nom: "Rose",
    sombre: false,
    bg: '#FFF7F9',
    surface: '#FFFFFF',
    surface2: '#FFEDF2',
    border: '#EDC6D5',
    text: '#2B1B22',
    textMuted: '#6E5560',
    accent: '#E8467C',
    accent2: '#FF8FB1',
    accentSoft: '#FFE1EB',
    success: '#1F9E6E',
    warning: '#B27A10',
    danger: '#C4392F',
    gradientHero: ['#FF6B9D', '#FF9E7D'],
  },
  ocean: {
    nom: "Bleu",
    sombre: true,
    bg: '#0B1220',
    surface: '#111A2C',
    surface2: '#18243B',
    border: '#233248',
    text: '#EDF2FA',
    textMuted: '#94A4BE',
    accent: '#3E8BFF',
    accent2: '#4DD8E6',
    accentSoft: '#132743',
    success: '#3ECF8E',
    warning: '#E8B84B',
    danger: '#F26D6D',
    gradientHero: ['#2563EB', '#06B6D4'],
  },
  platinum: {
    nom: "Argenté",
    sombre: false,
    bg: '#F4F5F7',
    surface: '#FFFFFF',
    surface2: '#EBEDF0',
    border: '#C9CED6',
    text: '#1C2128',
    textMuted: '#5A6472',
    accent: '#6B7A90',
    accent2: '#4C5867',
    accentSoft: '#E4E8EE',
    success: '#16A06A',
    warning: '#B27A10',
    danger: '#C4392F',
    borderSoft: '#E8EAEE',
    gradientHero: ['#6B7A90', '#4C5867'],
  },
  gold: {
    nom: "Doré",
    sombre: true,
    bg: '#0F0D08',
    surface: '#17140D',
    surface2: '#211C12',
    border: '#3A3222',
    text: '#F7F3E8',
    textMuted: '#A99C82',
    accent: '#D4A94E',
    accent2: '#F0C868',
    accentSoft: '#2A2213',
    success: '#5FBF8C',
    warning: '#D4A94E',
    danger: '#E07A6B',
    gradientHero: ['#B8860B', '#F5D061'],
  },
};

/** Ordre du selecteur a six pastilles, identique sur toutes les surfaces. */
export const ORDRE_THEMES: CleTheme[] = ['obsidian', 'ivory', 'blush', 'ocean', 'platinum', 'gold'];
