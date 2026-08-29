// @couleurs-identite
// ---------------------------------------------------------------------------
// L'ecran d'ouverture s'affiche AVANT que le theme ne soit connu — le
// fournisseur n'est pas encore monte. Il ne peut donc pas suivre une palette,
// et doit porter les couleurs de la marque.

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useTokens, type Tokens } from '../constants/tokens';
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
  const k = useTokens();
  const styles = useMemo(() => makeStyles(k), [k]);
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
      {/* Mixed sport + nutrition background: healthy food (left) + running
          (right), so the splash represents BOTH sides of the app. */}
      <View style={[StyleSheet.absoluteFillObject, { flexDirection: 'row' }]}>
        <Image source={require('../assets/images/illustrations/healthy_food.jpg')} style={{ flex: 1, height: '100%' }} resizeMode="cover" />
        <Image source={require('../assets/images/abstraits/hero-sante.jpg')} style={{ flex: 1, height: '100%' }} resizeMode="cover" />
      </View>
      {/* Green brand veil for contrast + cohesion across the two photos */}
      <LinearGradient
        colors={['rgba(15,58,34,0.50)', 'rgba(10,40,24,0.70)', 'rgba(7,33,20,0.90)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Centered branding */}
      <View style={styles.center}>
        <Image
          source={require('../assets/images/splash-icon.png')}
          style={styles.flame}
          resizeMode="contain"
        />
        <Text style={styles.brand}>Salorie</Text>
        <Text style={styles.tagline}>Eat well. Train hard. Track it all.</Text>
      </View>
    </Animated.View>
  );
}

// Fabrique thémée : ce StyleSheet lisait des jetons alors qu'il était
// évalué UNE FOIS à l'importation, avant que le thème n'existe. Les
// couleurs y étaient donc figées sur la palette par défaut, à vie.
const makeStyles = (k: Tokens) => StyleSheet.create({
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  flame: { width: 132, height: 132, marginBottom: 10 },
  brand: { fontSize: 52, fontWeight: '900', color: k.onAccent, letterSpacing: -1.5 },
  tagline: { fontSize: 16, fontWeight: '700', color: '#d8f3e1' },
});
