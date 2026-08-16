// Galerie horizontale réutilisable (4–6 photos thématiques par écran).
// Utilise les illustrations DÉJÀ embarquées (aucun nouvel asset → pas d'APK plus
// lourd, pas de lien cassé). Scroll horizontal → jamais de débordement vertical.
// Theme-aware. Usage : <PhotoStrip category="food" />
import React from 'react';
import { useTokens } from '../constants/tokens';
import { View, Text, ScrollView, Image, StyleSheet } from 'react-native';
import { useTheme } from '../lib/ThemeContext';
import { useTranslation } from '../lib/i18n';

// Vraies photos premium (royalty-free bundlées) — remplacent les illustrations génériques
// pour un rendu haut de gamme et varié, cohérent avec les héros (constants/heroImages).
const I = {
  food: require('../assets/images/photos/food_0.jpg'),
  food2: require('../assets/images/photos/food_2.jpg'),
  salad: require('../assets/images/photos/salad_0.jpg'),
  salad2: require('../assets/images/photos/salad_2.jpg'),
  mealprep: require('../assets/images/photos/mealprep_0.jpg'),
  mealprep2: require('../assets/images/photos/mealprep_2.jpg'),
  veggies: require('../assets/images/photos/veggies_0.jpg'),
  fruits: require('../assets/images/photos/fruits_0.jpg'),
  fruits2: require('../assets/images/photos/fruits_2.jpg'),
  moroccan: require('../assets/images/photos/moroccan_0.jpg'),
  moroccan2: require('../assets/images/photos/moroccan_2.jpg'),
  tajine: require('../assets/images/photos/tajine_0.jpg'),
  medfood: require('../assets/images/photos/medfood_0.jpg'),
  breakfast: require('../assets/images/photos/breakfast_0.jpg'),
  smoothie: require('../assets/images/photos/smoothie_0.jpg'),
  fish: require('../assets/images/photos/fish_0.jpg'),
  running: require('../assets/images/photos/running_0.jpg'),
  running2: require('../assets/images/photos/running_2.jpg'),
  gym: require('../assets/images/photos/gym_0.jpg'),
  gym2: require('../assets/images/photos/gym_2.jpg'),
  yoga: require('../assets/images/photos/yoga_0.jpg'),
  water: require('../assets/images/photos/water_0.jpg'),
  wellness: require('../assets/images/photos/wellness_0.jpg'),
  wellness2: require('../assets/images/photos/wellness_2.jpg'),
};

const SETS: Record<string, (keyof typeof I)[]> = {
  food: ['food', 'salad', 'mealprep', 'moroccan', 'veggies', 'medfood'],
  sport: ['running', 'gym', 'yoga', 'running2', 'gym2', 'wellness'],
  health: ['wellness', 'water', 'fruits', 'smoothie', 'salad2', 'wellness2'],
  progress: ['gym', 'running', 'mealprep2', 'veggies', 'fruits2', 'yoga'],
  welcome: ['food2', 'moroccan2', 'salad', 'running', 'breakfast', 'fish'],
};

const TITLES: Record<string, Record<string, string>> = {
  en: { food: 'Inspiration', sport: 'Move', health: 'Your health', progress: 'Progress', welcome: 'Discover' },
  fr: { food: 'Inspiration', sport: 'Bouger', health: 'Ta santé', progress: 'Progression', welcome: 'Découvrir' },
  ar: { food: 'إلهام', sport: 'تحرّك', health: 'صحتك', progress: 'التقدم', welcome: 'اكتشف' },
};

function PhotoStrip({ category = 'food', showTitle = true }: { category?: keyof typeof SETS; showTitle?: boolean }) {
  const { resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const isDark = resolved === 'dark';
  const imgs = SETS[category] || SETS.food;
  const tok = useTokens();
  const titleColor = tok.text;
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

// Presentational / props-driven (category, showTitle) → memo évite les re-rendus
// inutiles quand un parent se re-render sans changer ces props. Rendu/props inchangés.
PhotoStrip.displayName = 'PhotoStrip';
export default React.memo(PhotoStrip);

const styles = StyleSheet.create({
  wrap: { marginVertical: 10 },
  title: { fontSize: 15, fontWeight: '800', marginBottom: 8, paddingHorizontal: 20, letterSpacing: -0.2 },
  row: { paddingHorizontal: 16, gap: 10 },
  cell: { width: 130, height: 96, borderRadius: 16, overflow: 'hidden', backgroundColor: 'rgba(127,127,127,0.12)' },
  img: { width: '100%', height: '100%' },
});
