import React from 'react';
import { View, Text, Image, StyleSheet, ImageStyle, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTokens } from '../constants/tokens';

/**
 * Bandeau de marque — le dégradé d'accent, pas une photo générique.
 *
 * ⚠ IL EMPLOYAIT `Colors.light.primary`, l'objet STATIQUE.
 * C'est le motif qui rendait les six thèmes invisibles sur l'accueil : lire
 * `Colors.light.…` court-circuite le thème, puisque cet objet ne sait rien de
 * ce que l'utilisateur a choisi. Le fond de l'écran passait au doré, ce bandeau
 * restait vert. Il lit maintenant `useTokens()`, qui suit la palette active.
 *
 * Le texte reste posé sur l'accent : sa couleur vient donc de `onAccent`, que la
 * dérivation choisit entre clair et foncé selon ce qui contraste le mieux avec
 * l'accent DE CE THÈME — du blanc sur le vert d'Ivory ne tenait que 3,3:1.
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
  const k = useTokens();

  return (
    <LinearGradient
      colors={[k.accent, k.accentStrong]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.banner, { height }, style]}
    >
      {/* Le voile du logo se teinte comme le texte : un blanc translucide posé
          sur un accent clair disparaissait presque. */}
      <View style={[styles.logoWrap, { backgroundColor: k.onAccent + '2E' }]}>
        <Image source={require('../assets/images/fire.png')} style={styles.logo as ImageStyle} />
      </View>
      <View style={styles.textWrap}>
        <Text style={[styles.title, { color: k.onAccent }]} numberOfLines={1}>{title}</Text>
        {!!subtitle && (
          <Text style={[styles.subtitle, { color: k.onAccent + 'E0' }]} numberOfLines={2}>
            {subtitle}
          </Text>
        )}
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
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 3,
    lineHeight: 18,
  },
});
