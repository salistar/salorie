// Nutri-Score — note nutritionnelle A→E d'un aliment (pour 100 g).
import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TextInput } from 'react-native';
import { Award } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { nutriScore, GRADE_COLOR, NutriGrade } from '../../lib/nutriScore';
import { useTranslation } from '../../lib/i18n';
import { useTheme } from '../../lib/ThemeContext';

const GREEN = '#2E8B57';
const FIELDS = [
  { k: 'energyKcal', tk: 'f_energy', u: 'kcal' },
  { k: 'sugars', tk: 'f_sugars', u: 'g' },
  { k: 'satFat', tk: 'f_satfat', u: 'g' },
  { k: 'sodiumMg', tk: 'f_sodium', u: 'mg' },
  { k: 'fiber', tk: 'f_fiber', u: 'g' },
  { k: 'protein', tk: 'f_protein', u: 'g' },
];

const TXT: any = {
  en: {
    title: 'Nutri-Score', sub: 'Enter the values per 100 g → live A→E grade.',
    grade: 'Grade', score: 'score',
    f_energy: 'Energy', f_sugars: 'Sugars', f_satfat: 'Sat. fat', f_sodium: 'Sodium', f_fiber: 'Fiber', f_protein: 'Protein',
    tip: '💡 Find these values on the nutrition label ("per 100 g" table).',
  },
  fr: {
    title: 'Nutri-Score', sub: 'Saisis les valeurs pour 100 g → note A→E en direct.',
    grade: 'Note', score: 'score',
    f_energy: 'Énergie', f_sugars: 'Sucres', f_satfat: 'Graisses sat.', f_sodium: 'Sodium', f_fiber: 'Fibres', f_protein: 'Protéines',
    tip: '💡 Trouve ces valeurs sur l\'étiquette nutritionnelle (tableau « pour 100 g »).',
  },
  ar: {
    title: 'نوتري-سكور', sub: 'أدخل القيم لكل 100 غ ← تقييم A→E مباشر.',
    grade: 'التقييم', score: 'النقاط',
    f_energy: 'الطاقة', f_sugars: 'السكريات', f_satfat: 'دهون مشبعة', f_sodium: 'الصوديوم', f_fiber: 'الألياف', f_protein: 'البروتين',
    tip: '💡 ستجد هذه القيم على الملصق الغذائي (جدول «لكل 100 غ»).',
  },
};

export default function NutriScoreScreen() {
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  const bg = isDark ? '#0f172a' : '#F4F7F9';
  const card = isDark ? '#1e293b' : '#ffffff';
  const text = isDark ? '#f1f5f9' : '#0F172A';
  const sub = isDark ? '#94a3b8' : '#64748B';
  const align: any = { textAlign: isRTL ? 'right' : 'left' };

  const [v, setV] = useState<Record<string, string>>({});
  const num = (k: string) => parseFloat(v[k]) || 0;
  const { grade, score } = useMemo(() => nutriScore({
    energyKcal: num('energyKcal'), sugars: num('sugars'), satFat: num('satFat'),
    sodiumMg: num('sodiumMg'), fiber: num('fiber'), protein: num('protein'),
  }), [v]);
  const hasInput = Object.values(v).some((x) => x);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.head}><Award size={24} color={GREEN} /><Text style={[styles.title, { color: text }]}>{t.title}</Text></View>
        <Text style={[styles.sub, { color: sub }, align]}>{t.sub}</Text>

        <View style={styles.scaleRow}>
          {(['A', 'B', 'C', 'D', 'E'] as NutriGrade[]).map((g) => (
            <View key={g} style={[styles.scaleItem, { backgroundColor: GRADE_COLOR[g] }, hasInput && grade === g && styles.scaleActive]}>
              <Text style={styles.scaleTxt}>{g}</Text>
            </View>
          ))}
        </View>
        {hasInput && <Text style={[styles.scoreNote, { color: sub }]}>{t.grade} <Text style={{ color: GRADE_COLOR[grade], fontWeight: '900' }}>{grade}</Text> · {t.score} {score}</Text>}

        {FIELDS.map((f) => (
          <View key={f.k} style={[styles.row, { backgroundColor: card }]}>
            <Text style={[styles.label, { color: text }]}>{t[f.tk]}</Text>
            <View style={styles.inputWrap}>
              <TextInput style={[styles.input, { color: text }]} keyboardType="numeric" placeholder="0" placeholderTextColor={isDark ? '#64748b' : '#94A3B8'} value={v[f.k] || ''} onChangeText={(t2) => setV((s) => ({ ...s, [f.k]: t2 }))} />
              <Text style={[styles.unit, { color: sub }]}>{f.u}</Text>
            </View>
          </View>
        ))}
        <Text style={[styles.tip, { color: sub }, align]}>{t.tip}</Text>
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
