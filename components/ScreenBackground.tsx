import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTokens } from '../constants/tokens';

/**
 * Le fond de TOUS les écrans — le dégradé posé derrière le contenu.
 *
 * ⚠ IL RESTAIT VERT SUR LES SIX THÈMES, ET JE L'AVAIS MAL CLASSÉ.
 * En posant ici le marqueur d'identité, je l'avais rangé avec les fonds
 * de caméra — au motif qu'un noir posé derrière un flux vidéo n'est pas une
 * couleur d'interface. C'était faux : ce composant ne montre aucune caméra,
 * c'est le fond de l'application entière. Le marqueur l'a donc protégé de la
 * migration, et la capture sur téléphone l'a montré — l'accueil en thème Rose
 * gardait un fond vert pâle.
 *
 * Deux valeurs le figeaient : le vert pâle du milieu du dégradé et le halo
 * `rgba(41,143,80,…)`, tous deux verts.
 *
 * Le noir plein du mode sombre cède aussi : `bg` porte déjà le fond de chaque
 * palette, et un noir absolu écrasait la nuance d'Obsidienne comme d'Ocean.
 */
export default function ScreenBackground() {
  const k = useTokens();

  if (k.isDark) {
    return (
      <View
        style={[StyleSheet.absoluteFillObject, { backgroundColor: k.bg }]}
        pointerEvents="none"
      />
    );
  }

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {/* Surface -> fond -> accent très dilué : la même progression qu'avant,
          mais exprimée en jetons. Le milieu était un vert écrit à la main. */}
      <LinearGradient
        colors={[k.surface, k.bg, k.accentSoft]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      {/* Halo de marque en haut de l'écran, pour la profondeur.
          `color-mix` n'existe pas en React Native : on suffixe l'accent d'un
          canal alpha (1A ≈ 10 %), ce qui revient au même sans figer la teinte. */}
      <LinearGradient
        colors={[k.accent + '1A', k.accent + '00']}
        locations={[0, 1]}
        style={[StyleSheet.absoluteFillObject, { height: 220 }]}
      />
    </View>
  );
}
