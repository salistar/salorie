// <PrimaryButton> / <SecondaryButton> — CTA normés (min 48px, haptique, theme-aware).
// Règle : UN SEUL primaire par écran ; le reste en secondaire (outline). Remplace
// seeAllBtn (lien 20px), soloCta et les boutons ad hoc.
import React from 'react';
import { Text, Pressable, ViewStyle, TextStyle, ActivityIndicator } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../lib/ThemeContext';
import { radius, spacing, type } from '../../constants/theme';

type Size = 'sm' | 'md';
interface Props {
  title: string;
  onPress?: () => void;
  icon?: React.ReactNode;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  full?: boolean;            // largeur pleine
  style?: ViewStyle | ViewStyle[];
}

const H = { sm: 44, md: 52 };
const PAD = { sm: spacing.md, md: spacing.lg };

function haptic() {
  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
}

export function PrimaryButton({ title, onPress, icon, size = 'md', disabled, loading, full = true, style }: Props) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={disabled || loading ? undefined : () => { haptic(); onPress?.(); }}
      style={({ pressed }) => [{
        minHeight: H[size], borderRadius: radius.lg, backgroundColor: colors.primary,
        paddingHorizontal: PAD[size] + 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: spacing.sm, alignSelf: full ? 'stretch' : 'flex-start',
        opacity: disabled ? 0.5 : pressed ? 0.88 : 1,
      }, style as any]}
    >
      {loading ? <ActivityIndicator color="#fff" size="small" /> : icon}
      <Text style={{ ...(type.cardTitle as TextStyle), color: '#fff', fontSize: size === 'sm' ? 14 : 15.5 }} numberOfLines={1} adjustsFontSizeToFit>
        {title}
      </Text>
    </Pressable>
  );
}

export function SecondaryButton({ title, onPress, icon, size = 'md', disabled, full = true, style }: Props) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={disabled ? undefined : () => { haptic(); onPress?.(); }}
      style={({ pressed }) => [{
        minHeight: H[size], borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.primary,
        backgroundColor: pressed ? colors.primaryLight : 'transparent',
        paddingHorizontal: PAD[size] + 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: spacing.sm, alignSelf: full ? 'stretch' : 'flex-start', opacity: disabled ? 0.5 : 1,
      }, style as any]}
    >
      {icon}
      <Text style={{ ...(type.cardTitle as TextStyle), color: colors.primary, fontSize: size === 'sm' ? 14 : 15.5 }} numberOfLines={1} adjustsFontSizeToFit>
        {title}
      </Text>
    </Pressable>
  );
}
