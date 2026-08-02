// <SectionHeader> — un seul style d'en-tête de section (fusionne coach.section 20/800
// et gridSection/secTitle 12/uppercase). title = h2, eyebrow = sur-titre optionnel.
import React from 'react';
import { View, Text, Pressable, TextStyle } from 'react-native';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { spacing, type } from '../../constants/theme';

interface Props {
  title: string;
  eyebrow?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}

export default function SectionHeader({ title, eyebrow, actionLabel, onAction, icon }: Props) {
  const { colors } = useTheme();
  const { isRTL } = useTranslation() as any;
  const dir = isRTL ? 'row-reverse' : 'row';
  return (
    <View style={{ marginTop: spacing.xxl, marginBottom: spacing.md, paddingHorizontal: spacing.xl }}>
      {!!eyebrow && (
        <Text style={{ ...(type.eyebrow as TextStyle), color: colors.primary, textAlign: isRTL ? 'right' : 'left', marginBottom: 2 }}>
          {eyebrow}
        </Text>
      )}
      <View style={{ flexDirection: dir, alignItems: 'center', gap: spacing.sm }}>
        {icon}
        <Text style={{ ...(type.h2 as TextStyle), color: colors.gray[900], flex: 1, textAlign: isRTL ? 'right' : 'left' }} numberOfLines={1}>
          {title}
        </Text>
        {!!actionLabel && !!onAction && (
          <Pressable onPress={onAction} hitSlop={10} style={{ minHeight: 32, justifyContent: 'center' }}>
            <Text style={{ ...(type.sub as TextStyle), color: colors.primary }}>{actionLabel}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
