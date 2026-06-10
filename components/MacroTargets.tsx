// Macros par objectif — répartition Protéines / Glucides / Lipides : cible (selon
// le plan/objectif) vs consommé du jour, avec progression. Réutilise useNutritionData.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Target } from 'lucide-react-native';
import { useNutritionData } from '../hooks/useNutritionData';

const MACROS = [
  { key: 'protein', label: 'Protéines', color: '#2E8B57' },
  { key: 'carbs', label: 'Glucides', color: '#2563EB' },
  { key: 'fat', label: 'Lipides', color: '#D97706' },
] as const;

export default function MacroTargets() {
  const data: any = useNutritionData();
  const goals = data?.goals || { protein: 0, carbs: 0, fat: 0, calories: 0 };
  const consumed = data?.consumed || { protein: 0, carbs: 0, fat: 0 };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Target size={18} color="#2E8B57" />
        <Text style={styles.title}>Macros par objectif</Text>
        {goals.calories ? <Text style={styles.kcal}>{Math.round(goals.calories)} kcal/j</Text> : null}
      </View>
      {MACROS.map((m) => {
        const target = Math.round(Number(goals[m.key]) || 0);
        const cur = Math.round(Number(consumed[m.key]) || 0);
        const pct = target > 0 ? Math.min(100, (cur / target) * 100) : 0;
        return (
          <View key={m.key} style={styles.row}>
            <View style={styles.rowTop}>
              <Text style={styles.label}>{m.label}</Text>
              <Text style={styles.val}><Text style={{ color: m.color, fontWeight: '800' }}>{cur}</Text> / {target} g</Text>
            </View>
            <View style={styles.track}><View style={[styles.fill, { width: `${pct}%`, backgroundColor: m.color }]} /></View>
          </View>
        );
      })}
      <Text style={styles.footer}>Cibles dérivées de ton objectif &amp; plan nutritionnel.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 16, marginHorizontal: 16, marginVertical: 8,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  title: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginLeft: 8, flex: 1 },
  kcal: { fontSize: 12, color: '#94A3B8', fontWeight: '600' },
  row: { marginBottom: 12 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  label: { fontSize: 13, color: '#334155', fontWeight: '600' },
  val: { fontSize: 13, color: '#64748B' },
  track: { height: 8, borderRadius: 5, backgroundColor: '#F1F5F9', overflow: 'hidden' },
  fill: { height: 8, borderRadius: 5 },
  footer: { fontSize: 10, color: '#CBD5E1', marginTop: 2 },
});
