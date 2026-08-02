// Tokens de design premium Salorie — échelle unique partagée (spacing 4/8, radius,
// 3 niveaux d'élévation, typo hiérarchisée). Valeurs NUMÉRIQUES indépendantes du thème
// (les couleurs restent dérivées de Colors.ts via useTheme()). Non destructif : les écrans
// migrent en opt-in. Voir components/ui/* pour les primitives qui consomment ces tokens.
import { TextStyle, ViewStyle } from 'react-native';

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

export const radius = { sm: 10, md: 14, lg: 18, xl: 24, pill: 999 } as const;

// 3 niveaux d'élévation SEULEMENT (fin des ombres ad hoc 0.04/0.05/0.15 dupliquées).
export const elevation: Record<'sm' | 'md' | 'lg', ViewStyle> = {
  sm: { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  md: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  lg: { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 12 },
};

// Échelle typographique unique (hiérarchie explicite). h1 = titre d'écran partout.
export const type: Record<string, TextStyle> = {
  hero: { fontSize: 40, fontWeight: '900', letterSpacing: -1.5 },      // valeurs héro (kcal) uniquement
  h1: { fontSize: 32, fontWeight: '900', letterSpacing: -1 },          // titre d'écran — UNE valeur partout
  h2: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },        // titre de section
  eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  cardTitle: { fontSize: 16, fontWeight: '800' },
  body: { fontSize: 14, fontWeight: '500' },
  sub: { fontSize: 13, fontWeight: '600' },
  micro: { fontSize: 12, fontWeight: '600' },
};

// Gradient de marque subtil, unique et réutilisé (Hero, bannières). Léger, jamais saturé.
export function brandGradient(isDark: boolean): [string, string] {
  return isDark
    ? ['rgba(74,222,128,0.18)', 'rgba(74,222,128,0.02)']
    : ['rgba(46,139,87,0.14)', 'rgba(46,139,87,0.02)'];
}

// Overlay sombre pour lisibilité du texte sur photo (Hero).
export const heroScrim: [string, string, string] = ['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.72)'];
