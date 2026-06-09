import React from 'react';
import { View, Image, StyleSheet, ImageStyle } from 'react-native';

/**
 * Floating brand mark for full-screen immersive screens (camera / map / GPS)
 * that have no standard header. A small semi-transparent flame tile, top-center.
 * `pointerEvents="none"` so it NEVER intercepts taps on the camera/map below.
 */
export default function BrandOverlay({ top = 50 }: { top?: number }) {
  return (
    <View pointerEvents="none" style={[styles.wrap, { top }]}>
      <View style={styles.tile}>
        <Image source={require('../assets/images/fire.png')} style={styles.logo as ImageStyle} resizeMode="contain" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 9999,
    elevation: 9999,
  },
  tile: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 26,
    height: 26,
  },
});
