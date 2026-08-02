// <ScreenTitle> — applique type.h1 uniformément (fin des titres 24/30/36/40 divergents).
import React from 'react';
import { Text, TextStyle, View } from 'react-native';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { spacing, type } from '../../constants/theme';

interface Props { title: string; icon?: React.ReactNode; subtitle?: string; }

export default function ScreenTitle({ title, icon, subtitle }: Props) {
  const { colors } = useTheme();
  const { isRTL } = useTranslation() as any;
  return (
    <View style={{ paddingHorizontal: spacing.xl, marginBottom: spacing.md }}>
      <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: spacing.sm }}>
        {icon}
        <Text style={{ ...(type.h1 as TextStyle), color: colors.gray[900], textAlign: isRTL ? 'right' : 'left' }}>{title}</Text>
      </View>
      {!!subtitle && (
        <Text style={{ ...(type.sub as TextStyle), color: colors.gray[500], marginTop: 4, textAlign: isRTL ? 'right' : 'left' }}>{subtitle}</Text>
      )}
    </View>
  );
}
