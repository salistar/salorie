// <Card> — surface premium unique (theme-aware). Remplace shortcut/featCard/streakCard/
// bento* et le langage "border-only" de kitchen/diary. variant: raised (défaut) | flat | outline.
import React from 'react';
import { View, ViewProps, ViewStyle } from 'react-native';
import { useTheme } from '../../lib/ThemeContext';
import { radius, spacing, elevation } from '../../constants/theme';

type Variant = 'raised' | 'flat' | 'outline';
interface Props extends ViewProps {
  variant?: Variant;
  padded?: boolean;          // padding lg par défaut
  style?: ViewStyle | ViewStyle[];
}

export default function Card({ variant = 'raised', padded = true, style, children, ...rest }: Props) {
  const { colors, resolved } = useTheme();
  const base: ViewStyle = {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: padded ? spacing.lg : 0,
  };
  if (variant === 'raised') Object.assign(base, resolved === 'dark' ? { ...elevation.sm, shadowOpacity: 0.25 } : elevation.sm);
  if (variant === 'outline') Object.assign(base, { borderWidth: 1, borderColor: colors.gray[200] });
  return (
    <View style={[base, style as any]} {...rest}>
      {children}
    </View>
  );
}
