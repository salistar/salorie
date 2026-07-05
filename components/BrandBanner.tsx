import React from 'react';
import { View, Text, Image, StyleSheet, ImageStyle, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../constants/Colors';

/**
 * Branded green banner — replaces the generic stock photos (D2).
 * On-brand (flame + green gradient), reinforces identity instead of diluting it,
 * and carries a short contextual line per screen. Purely presentational.
 */
export default function BrandBanner({
  title,
  subtitle,
  height = 120,
  style,
}: {
  title: string;
  subtitle?: string;
  height?: number;
  style?: ViewStyle;
}) {
  return (
    <LinearGradient
      colors={[Colors.light.primary, Colors.light.primaryDark]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.banner, { height }, style]}
    >
      <View style={styles.logoWrap}>
        <Image source={require('../assets/images/fire.png')} style={styles.logo as ImageStyle} />
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {!!subtitle && <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text>}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: 20,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    overflow: 'hidden',
  },
  logoWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 30,
    height: 30,
    resizeMode: 'contain',
  },
  textWrap: {
    flex: 1,
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 3,
    lineHeight: 18,
  },
});
