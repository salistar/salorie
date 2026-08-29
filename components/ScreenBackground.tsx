// @couleurs-identite
// ---------------------------------------------------------------------------
// Le noir de cet ecran n est PAS une couleur d interface : c est le fond
// DERRIERE un flux camera ou une vue en realite augmentee — ce qu on voit la
// ou rien n a ete dessine. Le teinter ferait apparaitre un cadre colore autour
// de l image. Le marqueur ci-dessus est lu par les outils de migration.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../lib/ThemeContext';
import { useTokens, Tokens } from '../constants/tokens';

/**
 * Global screen background — gradient that switches based on theme.
 */
export default function ScreenBackground() {
  const { resolved } = useTheme();
  const k = useTokens();

  if (resolved === 'dark') {
    // Solid black background, no gradient
    return (
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#000000' }]} pointerEvents="none" />
    );
  }

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <LinearGradient
        colors={[k.surface, '#e8f5ec', k.accentSoft]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      {/* subtle brand glow anchored top-centre for depth */}
      <LinearGradient
        colors={['rgba(41,143,80,0.10)', 'rgba(41,143,80,0)']}
        locations={[0, 1]}
        style={[StyleSheet.absoluteFillObject, { height: 220 }]}
      />
    </View>
  );
}
