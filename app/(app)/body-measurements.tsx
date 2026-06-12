// Mesures corporelles — tour de taille/hanches/bras/poitrine + historique.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { Ruler, Check } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
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
  const card = isDark ? '#1e293b' : '#ffffff';
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
        {FIELDS.map((f) => (
          <View key={f.key} style={[styles.row, { backgroundColor: card }]}>
            <Text style={[styles.label, { color: text }]}>{t[f.key]}</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={[styles.input, { color: text }]}
                keyboardType="numeric"
                placeholder={last?.[f.key] ? String(last[f.key]) : '—'}
                placeholderTextColor={sub}
                value={vals[f.key] || ''}
                onChangeText={(t2) => setVals((v) => ({ ...v, [f.key]: t2 }))}
              />
              <Text style={styles.unit}>cm</Text>
            </View>
          </View>
        ))}
        <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <><Check size={20} color="#fff" /><Text style={styles.saveTxt}>{t.save}</Text></>}
        </TouchableOpacity>
        {loading ? <ActivityIndicator color={GREEN} style={{ marginTop: 20 }} /> : last && (
          <Text style={[styles.lastNote, { color: sub }, align]}>{t.lastEntry} ({last.date}) : {FIELDS.filter((f) => last[f.key] != null).map((f) => `${t[f.key]} ${last[f.key]}cm`).join(' · ') || '—'}</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F7F9' },
  body: { padding: 20, paddingBottom: 100 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  title: { fontSize: 24, fontWeight: '900', color: '#0F172A', letterSpacing: -0.5 },
  sub: { fontSize: 14, color: '#64748B', marginBottom: 20 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 6, marginBottom: 12 },
  label: { fontSize: 15, fontWeight: '600', color: '#0F172A' },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  input: { fontSize: 18, fontWeight: '800', color: '#0F172A', minWidth: 70, textAlign: 'right', paddingVertical: 12 },
  unit: { fontSize: 13, color: '#94A3B8', fontWeight: '700' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: GREEN, borderRadius: 16, paddingVertical: 15, marginTop: 8 },
  saveTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  lastNote: { fontSize: 13, color: '#64748B', marginTop: 16, lineHeight: 19 },
});
