// <HeroImage> — POINT UNIQUE des héros/bannières photo (mutualise BrandBanner/coach/
// analytics/défis ; ne PAS créer de 5e conteneur d'image). Image + scrim dégradé pour
// lisibilité (light+dark) + texte optionnel (eyebrow / titre / valeur héro).
import React from 'react';
import { ImageBackground, View, Text, ImageSourcePropType, TextStyle, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from '../../lib/i18n';
import { radius, spacing, type, heroScrim } from '../../constants/theme';

interface Props {
  source: ImageSourcePropType;
  height?: number;
  eyebrow?: string;
  title?: string;
  value?: string;            // grosse valeur héro (ex: kcal)
  valueUnit?: string;
  rounded?: boolean;
  children?: React.ReactNode;
}

export default function HeroImage({ source, height = 150, eyebrow, title, value, valueUnit, rounded = true, children }: Props) {
  const { isRTL } = useTranslation() as any;
  const align: TextStyle = { textAlign: isRTL ? 'right' : 'left' };
  return (
    <View style={{ borderRadius: rounded ? radius.xl : 0, overflow: 'hidden', height }}>
      <ImageBackground source={source} resizeMode="cover" style={StyleSheet.absoluteFillObject as any}>
        <LinearGradient colors={heroScrim} style={StyleSheet.absoluteFillObject as any} />
        <View style={{ flex: 1, justifyContent: 'flex-end', padding: spacing.xl }}>
          {!!eyebrow && <Text style={{ ...(type.eyebrow as TextStyle), color: 'rgba(255,255,255,0.9)', ...align }}>{eyebrow}</Text>}
          {!!value && (
            <Text style={{ ...(type.hero as TextStyle), color: '#fff', ...align }}>
              {value}{!!valueUnit && <Text style={{ ...(type.h2 as TextStyle), color: 'rgba(255,255,255,0.9)' }}> {valueUnit}</Text>}
            </Text>
          )}
          {!!title && <Text style={{ ...(type.h1 as TextStyle), color: '#fff', ...align }} numberOfLines={2}>{title}</Text>}
          {children}
        </View>
      </ImageBackground>
    </View>
  );
}
