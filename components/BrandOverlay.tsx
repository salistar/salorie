import React, { useMemo } from 'react';
import { View, Text, Image, StyleSheet, ImageStyle } from 'react-native';

import { useTokens, type Tokens } from '../constants/tokens';
/**
 * Floating brand mark for full-screen immersive screens (camera / map / GPS)
 * that have no standard header. Flame tile + "Salorie" (vert) comme sur Home.
 * `pointerEvents="none"` so it NEVER intercepts taps on the camera/map below.
 */
export default function BrandOverlay({ top = 50 }: { top?: number }) {
  const k = useTokens();
  const styles = useMemo(() => makeStyles(k), [k]);
  return (
    <View pointerEvents="none" style={[styles.wrap, { top }]}>
      <View style={styles.pill}>
        <View style={styles.tile}>
          <Image source={require('../assets/images/fire.png')} style={styles.logo as ImageStyle} resizeMode="contain" />
        </View>
        <Text style={styles.brand}>Salorie</Text>
      </View>
    </View>
  );
}

// Fabrique thémée : ce StyleSheet lisait des jetons alors qu'il était
// évalué UNE FOIS à l'importation, avant que le thème n'existe. Les
// couleurs y étaient donc figées sur la palette par défaut, à vie.
const makeStyles = (k: Tokens) => StyleSheet.create({
  wrap: { position: 'absolute', alignSelf: 'center', zIndex: 9999, elevation: 9999 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingRight: 12, paddingLeft: 4, paddingVertical: 4,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
  },
  tile: {
    width: 34, height: 34, borderRadius: 11,
    backgroundColor: k.accentSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  logo: { width: 22, height: 22 },
  brand: { fontSize: 17, fontWeight: '900', letterSpacing: -0.5, color: k.accent },
});
