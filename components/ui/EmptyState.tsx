// <EmptyState> — état vide engageant (icône + titre + sous-titre + CTA optionnel).
// Remplace les empty states fades (médailles, listes vides).
import React from 'react';
import { View, Text, TextStyle } from 'react-native';
import { useTheme } from '../../lib/ThemeContext';
import { spacing, radius, type } from '../../constants/theme';
import { PrimaryButton } from './Button';

interface Props {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  onCta?: () => void;
}

export default function EmptyState({ icon, title, subtitle, ctaLabel, onCta }: Props) {
  const { colors } = useTheme();
  return (
    <View style={{
      alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxxl, paddingHorizontal: spacing.xl,
      backgroundColor: colors.card, borderRadius: radius.lg, gap: spacing.sm,
    }}>
      {!!icon && (
        <View style={{
          width: 56, height: 56, borderRadius: radius.pill, backgroundColor: colors.primaryLight,
          alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs,
        }}>{icon}</View>
      )}
      <Text style={{ ...(type.cardTitle as TextStyle), color: colors.gray[900], textAlign: 'center' }}>{title}</Text>
      {!!subtitle && (
        <Text style={{ ...(type.sub as TextStyle), color: colors.gray[500], textAlign: 'center', lineHeight: 19 }}>{subtitle}</Text>
      )}
      {!!ctaLabel && !!onCta && (
        <View style={{ marginTop: spacing.md, alignSelf: 'stretch' }}>
          <PrimaryButton title={ctaLabel} onPress={onCta} />
        </View>
      )}
    </View>
  );
}
