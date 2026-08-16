// Score santé QUOTIDIEN (0-100) — hook de rétention. Calculé client-side depuis
// les objectifs vs consommé du jour (calories, protéines, eau). Distinct du score
// hebdomadaire des insights. Réutilise le hook useNutritionData (mêmes données que Home).
import React from 'react';
import { useTokens } from '../constants/tokens';
import { View, Text, StyleSheet } from 'react-native';
import { Heart } from 'lucide-react-native';
import { useNutritionData } from '../hooks/useNutritionData';
import { useTranslation } from '../lib/i18n';
import { useTheme } from '../lib/ThemeContext';

const GREEN = '#2E8B57';

const TXT: any = {
  en: { caption: 'Daily health score', calories: 'Calories', protein: 'Protein', hydration: 'Hydration', excellent: 'Excellent', good: 'Good', ongoing: 'Ongoing', start: 'Get started' },
  fr: { caption: 'Score santé du jour', calories: 'Calories', protein: 'Protéines', hydration: 'Hydratation', excellent: 'Excellent', good: 'Bien', ongoing: 'En cours', start: 'À démarrer' },
  ar: { caption: 'نقاط صحة اليوم', calories: 'سعرات', protein: 'بروتين', hydration: 'ترطيب', excellent: 'ممتاز', good: 'جيد', ongoing: 'جارٍ', start: 'ابدأ' },
};

function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }

export default function DailyHealthScore() {
  const { language, isRTL } = useTranslation() as any;
  const { resolved } = useTheme();
  const tx = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';
  // Accent thémé : GREEN est le vert CLAIR ; en sombre on utilise le token
  // dark officiel (contraste correct sur fond sombre).
  const accent = isDark ? '#4ade80' : GREEN;
  const tok = useTokens();
  const cardBg = tok.surface;
  const txtColor = tok.text;
  const subColor = tok.textMuted;
  const trackBg = tok.border;
  const data: any = useNutritionData(new Date().toISOString().split('T')[0]);
  const goals = data?.goals || { calories: 2000, protein: 150, water: 2000 };
  const consumed = data?.consumed || { calories: 0, protein: 0, water: 0 };

  // Calories : optimal à l'objectif, pénalité si on dépasse fortement
  const calRatio = consumed.calories / Math.max(goals.calories, 1);
  const calScore = consumed.calories <= goals.calories
    ? clamp01(calRatio)
    : clamp01(1 - (consumed.calories - goals.calories) / Math.max(goals.calories, 1));
  const protScore = clamp01(consumed.protein / Math.max(goals.protein, 1));
  const waterScore = clamp01(consumed.water / Math.max(goals.water, 1));
  const score = Math.round((calScore * 0.4 + protScore * 0.3 + waterScore * 0.3) * 100);

  const label = score >= 80 ? tx.excellent : score >= 55 ? tx.good : score >= 30 ? tx.ongoing : tx.start;
  const color = score >= 80 ? accent : score >= 55 ? '#16A34A' : score >= 30 ? '#D97706' : '#94A3B8';

  const Bar = ({ label, v }: { label: string; v: number }) => (
    <View style={[styles.barRow, isRTL && { flexDirection: 'row-reverse' }]}>
      <Text style={[styles.barLabel, { color: subColor }]}>{label}</Text>
      <View style={[styles.barTrack, { backgroundColor: trackBg }]}><View style={[styles.barFill, { width: `${Math.round(v * 100)}%`, backgroundColor: color }]} /></View>
    </View>
  );

  return (
    <View style={[styles.card, { backgroundColor: cardBg }, isRTL && { flexDirection: 'row-reverse' }]}>
      <View style={[
        styles.left,
        { borderRightColor: trackBg },
        isRTL && { borderRightWidth: 0, borderLeftWidth: 1, borderLeftColor: trackBg },
      ]}>
        <Heart size={16} color={color} />
        <Text style={[styles.scoreNum, { color: txtColor }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{score}</Text>
        <Text style={[styles.label, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{label}</Text>
        <Text style={[styles.caption, { color: subColor }]} numberOfLines={2}>{tx.caption}</Text>
      </View>
      <View style={styles.right}>
        <Bar label={tx.calories} v={calScore} />
        <Bar label={tx.protein} v={protScore} />
        <Bar label={tx.hydration} v={waterScore} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 18, padding: 16, marginHorizontal: 16, marginVertical: 8,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  left: { width: 110, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: '#F1F5F9' },
  scoreNum: { fontSize: 40, fontWeight: '900', color: '#0F172A', lineHeight: 44 },
  label: { fontSize: 13, fontWeight: '700' },
  caption: { fontSize: 10, color: '#94A3B8', marginTop: 2, textAlign: 'center' },
  right: { flex: 1, justifyContent: 'center', paddingLeft: 16, gap: 8 },
  barRow: { },
  barLabel: { fontSize: 11, color: '#64748B', marginBottom: 3 },
  barTrack: { height: 7, borderRadius: 4, backgroundColor: '#F1F5F9', overflow: 'hidden' },
  barFill: { height: 7, borderRadius: 4 },
});
