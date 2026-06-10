// Nutri-Score — note nutritionnelle A→E d'un aliment (pour 100 g).
import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TextInput } from 'react-native';
import { Award } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { nutriScore, GRADE_COLOR, NutriGrade } from '../../lib/nutriScore';

const GREEN = '#2E8B57';
const FIELDS = [
  { k: 'energyKcal', l: 'Énergie', u: 'kcal' },
  { k: 'sugars', l: 'Sucres', u: 'g' },
  { k: 'satFat', l: 'Graisses sat.', u: 'g' },
  { k: 'sodiumMg', l: 'Sodium', u: 'mg' },
  { k: 'fiber', l: 'Fibres', u: 'g' },
  { k: 'protein', l: 'Protéines', u: 'g' },
];

export default function NutriScoreScreen() {
  const [v, setV] = useState<Record<string, string>>({});
  const num = (k: string) => parseFloat(v[k]) || 0;
  const { grade, score } = useMemo(() => nutriScore({
    energyKcal: num('energyKcal'), sugars: num('sugars'), satFat: num('satFat'),
    sodiumMg: num('sodiumMg'), fiber: num('fiber'), protein: num('protein'),
  }), [v]);
  const hasInput = Object.values(v).some((x) => x);

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.head}><Award size={24} color={GREEN} /><Text style={styles.title}>Nutri-Score</Text></View>
        <Text style={styles.sub}>Saisis les valeurs pour 100 g → note A→E en direct.</Text>

        <View style={styles.scaleRow}>
          {(['A', 'B', 'C', 'D', 'E'] as NutriGrade[]).map((g) => (
            <View key={g} style={[styles.scaleItem, { backgroundColor: GRADE_COLOR[g] }, hasInput && grade === g && styles.scaleActive]}>
              <Text style={styles.scaleTxt}>{g}</Text>
            </View>
          ))}
        </View>
        {hasInput && <Text style={styles.scoreNote}>Note <Text style={{ color: GRADE_COLOR[grade], fontWeight: '900' }}>{grade}</Text> · score {score}</Text>}

        {FIELDS.map((f) => (
          <View key={f.k} style={styles.row}>
            <Text style={styles.label}>{f.l}</Text>
            <View style={styles.inputWrap}>
              <TextInput style={styles.input} keyboardType="numeric" placeholder="0" value={v[f.k] || ''} onChangeText={(t) => setV((s) => ({ ...s, [f.k]: t }))} />
              <Text style={styles.unit}>{f.u}</Text>
            </View>
          </View>
        ))}
        <Text style={styles.tip}>💡 Trouve ces valeurs sur l'étiquette nutritionnelle (tableau « pour 100 g »).</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F7F9' },
  body: { padding: 20, paddingBottom: 100 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  title: { fontSize: 26, fontWeight: '900', color: '#0F172A', letterSpacing: -0.5 },
  sub: { fontSize: 14, color: '#64748B', marginBottom: 20 },
  scaleRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 8 },
  scaleItem: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', opacity: 0.4 },
  scaleActive: { opacity: 1, transform: [{ scale: 1.18 }], shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, elevation: 4 },
  scaleTxt: { color: '#fff', fontSize: 22, fontWeight: '900' },
  scoreNote: { textAlign: 'center', fontSize: 15, color: '#64748B', marginBottom: 18, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 4, marginBottom: 10 },
  label: { fontSize: 15, fontWeight: '600', color: '#0F172A' },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  input: { fontSize: 17, fontWeight: '800', color: '#0F172A', minWidth: 64, textAlign: 'right', paddingVertical: 12 },
  unit: { fontSize: 13, color: '#94A3B8', fontWeight: '700', width: 34 },
  tip: { fontSize: 13, color: '#94A3B8', marginTop: 14, lineHeight: 19 },
});
