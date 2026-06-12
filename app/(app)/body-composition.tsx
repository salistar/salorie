// Composition corporelle — poids, masse grasse %, muscle (manuel). Balance connectée = à venir.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, ActivityIndicator } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { PersonStanding } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { FormCard, Stepper, SubmitBar } from '../../components/FormKit';
import { logEntry, getEntries } from '../../lib/tracking';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';

const GREEN = '#2E8B57';
const F = [
  { k: 'weight', u: 'kg', step: 0.5 },
  { k: 'fat', u: '%', step: 0.5 },
  { k: 'muscle', u: 'kg', step: 0.5 },
  { k: 'water', u: '%', step: 0.5 },
];

const TXT: any = {
  en: {
    title: 'Body composition',
    sub: 'Manual entry. Smart-scale sync (Withings…) coming soon.',
    weight: 'Weight', fat: 'Body fat', muscle: 'Muscle mass', water: 'Body water',
    save: 'Save',
    history: 'History',
    empty: 'No measurements.',
  },
  fr: {
    title: 'Composition corporelle',
    sub: 'Saisie manuelle. Sync balance connectée (Withings…) à venir.',
    weight: 'Poids', fat: 'Masse grasse', muscle: 'Masse musculaire', water: 'Eau corporelle',
    save: 'Enregistrer',
    history: 'Historique',
    empty: 'Aucune mesure.',
  },
  ar: {
    title: 'تكوين الجسم',
    sub: 'إدخال يدوي. مزامنة الميزان الذكي (Withings…) قريباً.',
    weight: 'الوزن', fat: 'نسبة الدهون', muscle: 'الكتلة العضلية', water: 'ماء الجسم',
    save: 'حفظ',
    history: 'السجل',
    empty: 'لا توجد قياسات.',
  },
};

export default function BodyCompositionScreen() {
  const { user } = useUser();
  const { resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';
  const bg = isDark ? '#0f172a' : '#F4F7F9';
  const card = isDark ? '#1e293b' : '#ffffff';
  const text = isDark ? '#f1f5f9' : '#0F172A';
  const sub = isDark ? '#94a3b8' : '#64748B';
  const align: any = { textAlign: isRTL ? 'right' : 'left' };

  const email = user?.primaryEmailAddress?.emailAddress || '';
  const [v, setV] = useState<Record<string, string>>({});
  const [hist, setHist] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => { setHist(await getEntries(email, 'body_composition', 8)); setLoading(false); };
  useEffect(() => { load(); }, []);
  const save = async () => {
    const data: Record<string, number> = {};
    for (const f of F) { const n = parseFloat(v[f.k]); if (!isNaN(n)) data[f.k] = n; }
    if (!Object.keys(data).length) return;
    setSaving(true); await logEntry(email, 'body_composition', data); setV({}); await load(); setSaving(false);
  };

  const last = hist[0];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.head}><PersonStanding size={24} color={GREEN} /><Text style={[styles.title, { color: text }]}>{t.title}</Text></View>
        <Text style={[styles.sub, { color: sub }, align]}>{t.sub}</Text>

        <FormCard>
          {F.map((f) => (
            <Stepper
              key={f.k}
              label={last?.[f.k] != null ? `${t[f.k]} · ${last[f.k]}${f.u}` : t[f.k]}
              unit={f.u}
              step={f.step}
              value={v[f.k] || ''}
              onChange={(t2: string) => setV((s) => ({ ...s, [f.k]: t2 }))}
            />
          ))}
        </FormCard>
        <View style={{ marginHorizontal: -20, marginTop: -8 }}>
          <SubmitBar label={t.save} onPress={save} loading={saving} />
        </View>

        <Text style={[styles.histLabel, { color: sub }, align]}>{t.history}</Text>
        {loading ? <ActivityIndicator color={GREEN} /> : hist.length === 0 ? <Text style={[styles.empty, align]}>{t.empty}</Text> : hist.map((h) => (
          <View key={h.id} style={[styles.histRow, { backgroundColor: card }]}>
            <Text style={[styles.histDate, { color: sub }]}>{h.date}</Text>
            <Text style={[styles.histVal, { color: text }]}>{F.filter((f) => h[f.k] != null).map((f) => `${h[f.k]}${f.u}`).join(' · ')}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F7F9' },
  body: { padding: 20, paddingBottom: 100 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  title: { fontSize: 23, fontWeight: '900', color: '#0F172A', letterSpacing: -0.5 },
  sub: { fontSize: 14, color: '#64748B', marginBottom: 20, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 4, marginBottom: 10 },
  label: { fontSize: 15, fontWeight: '600', color: '#0F172A' },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  input: { fontSize: 18, fontWeight: '800', color: '#0F172A', minWidth: 70, textAlign: 'right', paddingVertical: 12 },
  unit: { fontSize: 13, color: '#94A3B8', fontWeight: '700', width: 26 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: GREEN, borderRadius: 14, paddingVertical: 15, marginTop: 8 },
  saveTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  histLabel: { fontSize: 13, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 14, marginBottom: 10 },
  empty: { color: '#94A3B8', fontSize: 14 },
  histRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8 },
  histDate: { fontSize: 13, color: '#64748B' },
  histVal: { fontSize: 13, fontWeight: '700', color: '#0F172A', flex: 1, textAlign: 'right' },
});
