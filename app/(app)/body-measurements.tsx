// Mesures corporelles — tour de taille/hanches/bras/poitrine + historique.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, ActivityIndicator } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { Ruler } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { FormCard, Stepper, SubmitBar } from '../../components/FormKit';
import { logEntry, getEntries } from '../../lib/tracking';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';

const GREEN = '#2E8B57';
const FIELDS = [
  { key: 'waist' },
  { key: 'hips' },
  { key: 'chest' },
  { key: 'arms' },
];

const TXT: any = {
  en: {
    title: 'Body measurements',
    sub: "Track your body's progress (cm).",
    waist: 'Waist', hips: 'Hips', chest: 'Chest', arms: 'Arms',
    save: 'Save',
    lastEntry: 'Last entry',
  },
  fr: {
    title: 'Mesures corporelles',
    sub: "Suis l'évolution de ton corps (cm).",
    waist: 'Tour de taille', hips: 'Hanches', chest: 'Poitrine', arms: 'Bras',
    save: 'Enregistrer',
    lastEntry: 'Dernière saisie',
  },
  ar: {
    title: 'قياسات الجسم',
    sub: 'تابع تطور جسمك (سم).',
    waist: 'محيط الخصر', hips: 'الوركان', chest: 'الصدر', arms: 'الذراعان',
    save: 'حفظ',
    lastEntry: 'آخر إدخال',
  },
};

export default function BodyMeasurementsScreen() {
  const { user } = useUser();
  const { resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';
  const bg = isDark ? '#0f172a' : '#F4F7F9';
  const text = isDark ? '#f1f5f9' : '#0F172A';
  const sub = isDark ? '#94a3b8' : '#64748B';
  const align: any = { textAlign: isRTL ? 'right' : 'left' };

  const email = user?.primaryEmailAddress?.emailAddress || '';
  const [vals, setVals] = useState<Record<string, string>>({});
  const [last, setLast] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const e = await getEntries(email, 'measurements', 1);
    setLast(e[0] || null); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    const data: Record<string, number> = {};
    for (const f of FIELDS) { const n = parseFloat(vals[f.key]); if (!isNaN(n)) data[f.key] = n; }
    if (!Object.keys(data).length) return;
    setSaving(true);
    await logEntry(email, 'measurements', data);
    setVals({}); await load(); setSaving(false);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.head}><Ruler size={24} color={GREEN} /><Text style={[styles.title, { color: text }]}>{t.title}</Text></View>
        <Text style={[styles.sub, { color: sub }, align]}>{t.sub}</Text>
        <FormCard>
          {FIELDS.map((f) => (
            <Stepper
              key={f.key}
              label={t[f.key]}
              value={vals[f.key] || ''}
              onChange={(v: string) => setVals((prev) => ({ ...prev, [f.key]: v }))}
              step={0.5}
              min={0}
              max={300}
              unit="cm"
            />
          ))}
        </FormCard>
        {loading ? <ActivityIndicator color={GREEN} style={{ marginTop: 20 }} /> : last && (
          <Text style={[styles.lastNote, { color: sub }, align]}>{t.lastEntry} ({last.date}) : {FIELDS.filter((f) => last[f.key] != null).map((f) => `${t[f.key]} ${last[f.key]}cm`).join(' · ') || '—'}</Text>
        )}
      </ScrollView>
      <SubmitBar label={t.save} onPress={save} loading={saving} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F7F9' },
  body: { padding: 20, paddingBottom: 100 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  title: { fontSize: 24, fontWeight: '900', color: '#0F172A', letterSpacing: -0.5 },
  sub: { fontSize: 14, color: '#64748B', marginBottom: 20 },
  lastNote: { fontSize: 13, color: '#64748B', marginTop: 16, lineHeight: 19 },
});
