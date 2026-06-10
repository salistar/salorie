// Score santé QUOTIDIEN (0-100) — hook de rétention. Calculé client-side depuis
// les objectifs vs consommé du jour (calories, protéines, eau). Distinct du score
// hebdomadaire des insights. Réutilise le hook useNutritionData (mêmes données que Home).
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Heart } from 'lucide-react-native';
import { useNutritionData } from '../hooks/useNutritionData';

const GREEN = '#2E8B57';

function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }

export default function DailyHealthScore() {
  const data: any = useNutritionData();
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

  const label = score >= 80 ? 'Excellent' : score >= 55 ? 'Bien' : score >= 30 ? 'En cours' : 'À démarrer';
  const color = score >= 80 ? GREEN : score >= 55 ? '#16A34A' : score >= 30 ? '#D97706' : '#94A3B8';

  const Bar = ({ label, v }: { label: string; v: number }) => (
    <View style={styles.barRow}>
      <Text style={styles.barLabel}>{label}</Text>
      <View style={styles.barTrack}><View style={[styles.barFill, { width: `${Math.round(v * 100)}%`, backgroundColor: color }]} /></View>
    </View>
  );

  return (
    <View style={styles.card}>
      <View style={styles.left}>
        <Heart size={16} color={color} />
        <Text style={styles.scoreNum}>{score}</Text>
        <Text style={[styles.label, { color }]}>{label}</Text>
        <Text style={styles.caption}>Score santé du jour</Text>
      </View>
      <View style={styles.right}>
        <Bar label="Calories" v={calScore} />
        <Bar label="Protéines" v={protScore} />
        <Bar label="Hydratation" v={waterScore} />
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
