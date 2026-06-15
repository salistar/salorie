// Galerie horizontale réutilisable (4–6 photos thématiques par écran).
// Utilise les illustrations DÉJÀ embarquées (aucun nouvel asset → pas d'APK plus
// lourd, pas de lien cassé). Scroll horizontal → jamais de débordement vertical.
// Theme-aware. Usage : <PhotoStrip category="food" />
import React from 'react';
import { View, Text, ScrollView, Image, StyleSheet } from 'react-native';
import { useTheme } from '../lib/ThemeContext';
import { useTranslation } from '../lib/i18n';

const I = {
  healthy_food: require('../assets/images/illustrations/healthy_food.jpg'),
  plan: require('../assets/images/illustrations/plan.jpg'),
  generating: require('../assets/images/illustrations/generating.jpg'),
  dashboard_cover: require('../assets/images/illustrations/dashboard_cover.jpg'),
  dashboard_bg: require('../assets/images/illustrations/dashboard_bg.jpg'),
  analytics_cover: require('../assets/images/illustrations/analytics_cover.jpg'),
  measure: require('../assets/images/illustrations/measure.jpg'),
  scale: require('../assets/images/illustrations/scale.jpg'),
  workout: require('../assets/images/illustrations/workout.jpg'),
  running: require('../assets/images/illustrations/running.jpg'),
  weightlifting: require('../assets/images/illustrations/weightlifting.jpg'),
  gain_weight: require('../assets/images/illustrations/gain_weight.jpg'),
  lose_weight: require('../assets/images/illustrations/lose_weight.jpg'),
  welcome: require('../assets/images/illustrations/welcome.jpg'),
  profile_cover: require('../assets/images/illustrations/profile_cover.jpg'),
  birthdate: require('../assets/images/illustrations/birthdate.jpg'),
};

const SETS: Record<string, (keyof typeof I)[]> = {
  food: ['healthy_food', 'plan', 'dashboard_cover', 'generating', 'measure', 'analytics_cover'],
  sport: ['workout', 'running', 'weightlifting', 'gain_weight', 'lose_weight', 'scale'],
  health: ['scale', 'measure', 'healthy_food', 'birthdate', 'dashboard_bg', 'profile_cover'],
  progress: ['analytics_cover', 'dashboard_cover', 'scale', 'measure', 'gain_weight', 'lose_weight'],
  welcome: ['welcome', 'dashboard_cover', 'healthy_food', 'workout', 'running', 'plan'],
};

const TITLES: Record<string, Record<string, string>> = {
  en: { food: 'Inspiration', sport: 'Move', health: 'Your health', progress: 'Progress', welcome: 'Discover' },
  fr: { food: 'Inspiration', sport: 'Bouger', health: 'Ta santé', progress: 'Progression', welcome: 'Découvrir' },
  ar: { food: 'إلهام', sport: 'تحرّك', health: 'صحتك', progress: 'التقدم', welcome: 'اكتشف' },
};

export default function PhotoStrip({ category = 'food', showTitle = true }: { category?: keyof typeof SETS; showTitle?: boolean }) {
  const { resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const isDark = resolved === 'dark';
  const imgs = SETS[category] || SETS.food;
  const titleColor = isDark ? '#f1f5f9' : '#0f172a';
  const title = (TITLES[language] || TITLES.en)[category] || '';

  return (
    <View style={styles.wrap}>
      {showTitle && !!title && (
        <Text style={[styles.title, { color: titleColor, textAlign: isRTL ? 'right' : 'left' }]}>{title}</Text>
      )}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        // En RTL on inverse l'ordre de défilement.
        style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
      >
        {imgs.map((k, i) => (
          <View key={i} style={[styles.cell, isRTL && { transform: [{ scaleX: -1 }] }]}>
            <Image source={I[k]} style={styles.img} resizeMode="cover" />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginVertical: 10 },
  title: { fontSize: 15, fontWeight: '800', marginBottom: 8, paddingHorizontal: 20, letterSpacing: -0.2 },
  row: { paddingHorizontal: 16, gap: 10 },
  cell: { width: 130, height: 96, borderRadius: 16, overflow: 'hidden', backgroundColor: 'rgba(127,127,127,0.12)' },
  img: { width: '100%', height: '100%' },
});
