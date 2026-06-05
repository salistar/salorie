import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';

/**
 * Full-bleed in-app intro splash.
 *
 * The native (expo-splash-screen) splash on Android 12+ can only render a
 * centered icon on a solid colour — it cannot show a full-screen background
 * image. So we show the branded food background here, full-bleed, with the
 * flame logo + wordmark centered on top, for a brief moment on cold start,
 * then fade it out into the app.
 *
 * Branding (flame + "Salorie") is overlaid as real RN elements (not baked into
 * the photo) so it stays perfectly centered regardless of how the background
 * photo is cropped to "cover" the screen.
 *
 * Purely cosmetic + `pointerEvents="none"`, so it never traps input and is
 * independent of auth/loading state (no flash-on-reconnect coupling).
 */
export default function SplashIntro({ duration = 1700 }: { duration?: number }) {
  const opacity = useRef(new Animated.Value(1)).current;
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }).start(() => setGone(true));
    }, duration);
    return () => clearTimeout(t);
  }, [duration, opacity]);

  if (gone) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFillObject, { opacity, zIndex: 10000, backgroundColor: '#0f3a22' }]}
    >
      {/* Food photo background, full-bleed */}
      <Image
        source={require('../assets/images/illustrations/splash_bg.jpg')}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
      />
      {/* Green brand veil for contrast */}
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(15,58,34,0.74)' }]} />

      {/* Centered branding */}
      <View style={styles.center}>
        <Image
          source={require('../assets/images/splash-icon.png')}
          style={styles.flame}
          resizeMode="contain"
        />
        <Text style={styles.brand}>Salorie</Text>
        <Text style={styles.tagline}>Track calories. Burn smarter.</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  flame: { width: 132, height: 132, marginBottom: 10 },
  brand: { fontSize: 52, fontWeight: '900', color: '#ffffff', letterSpacing: -1.5 },
  tagline: { fontSize: 16, fontWeight: '700', color: '#d8f3e1' },
});
