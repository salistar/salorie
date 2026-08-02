// <Skeleton> / <SkeletonCard> — placeholders shimmer (reanimated) aux dimensions des
// cartes. Remplace TOUS les ActivityIndicator de chargement (home, analytics, défis, coach)
// pour une attente premium (pas d'écran vide + saut de contenu).
import React, { useEffect } from 'react';
import { View, ViewStyle, DimensionValue } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, cancelAnimation } from 'react-native-reanimated';
import { useTheme } from '../../lib/ThemeContext';
import { radius, spacing } from '../../constants/theme';

interface Props { width?: DimensionValue; height?: number; style?: ViewStyle; round?: number; }

export function Skeleton({ width = '100%', height = 16, style, round = radius.sm }: Props) {
  const { colors, resolved } = useTheme();
  const o = useSharedValue(0.5);
  useEffect(() => {
    o.value = withRepeat(withTiming(1, { duration: 850, easing: Easing.inOut(Easing.ease) }), -1, true);
    return () => cancelAnimation(o);
  }, []);
  const anim = useAnimatedStyle(() => ({ opacity: o.value }));
  const base = resolved === 'dark' ? colors.gray[100] : colors.gray[100];
  return <Animated.View style={[{ width, height, borderRadius: round, backgroundColor: base }, anim, style]} />;
}

// Carte skeleton générique (bloc + 2 lignes) — à répéter pour listes/grilles.
export function SkeletonCard({ height = 96 }: { height?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, marginBottom: spacing.md }}>
      <Skeleton width="60%" height={18} />
      <Skeleton width="90%" height={12} />
      <Skeleton width="40%" height={12} />
      <View style={{ height: height - 70 }} />
    </View>
  );
}
