// Suivi du sommeil — heures dormies + qualité, avec historique.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { Moon, Minus, Plus, Check } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { logEntry, getEntries } from '../../lib/tracking';
import { useTranslation } from '../../lib/i18n';
import { useTheme } from '../../lib/ThemeContext';

const GREEN = '#2E8B57';
const QUALITY = ['😫', '😴', '😐', '🙂', '🤩'];

const TXT: any = {
  en: { title: 'Sleep tracker', sub: 'How many hours did you sleep?', hours: 'hours', quality: 'Quality', save: 'Save my night', last7: 'Last 7 days', empty: 'No night logged yet.' },
  fr: { title: 'Suivi du sommeil', sub: "Combien d'heures as-tu dormi ?", hours: 'heures', quality: 'Qualité', save: 'Enregistrer ma nuit', last7: '7 derniers jours', empty: 'Aucune nuit enregistrée.' },
  ar: { title: 'تتبع النوم', sub: 'كم ساعة نمت؟', hours: 'ساعات', quality: 'الجودة', save: 'حفظ ليلتي', last7: 'آخر 7 أيام', empty: 'لم تُسجَّل أي ليلة بعد.' },
};

export default function SleepTrackerScreen() {
  const { user } = useUser();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  const bg = isDark ? '#0f172a' : '#F4F7F9';
  const card = isDark ? '#1e293b' : '#ffffff';
  const text = isDark ? '#f1f5f9' : '#0F172A';
  const sub = isDark ? '#94a3b8' : '#64748B';
  const align: any = { textAlign: isRTL ? 'right' : 'left' };

  const email = user?.primaryEmailAddress?.emailAddress || '';
  const [hours, setHours] = useState(7.5);
  const [quality, setQuality] = useState(3);
  const [hist, setHist] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => { setHist(await getEntries(email, 'sleep', 7)); setLoading(false); };
  useEffect(() => { load(); }, []);

  const save = async () => { setSaving(true); await logEntry(email, 'sleep', { hours, quality }); await load(); setSaving(false); };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.head}><Moon size={24} color={GREEN} /><Text style={[styles.title, { color: text }]}>{t.title}</Text></View>
        <Text style={[styles.sub, { color: sub }, align]}>{t.sub}</Text>

        <View style={styles.stepper}>
          <TouchableOpacity style={styles.stepBtn} onPress={() => setHours((h) => Math.max(0, h - 0.5))}><Minus size={22} color={GREEN} /></TouchableOpacity>
          <View style={styles.hWrap}><Text style={[styles.hVal, { color: text }]}>{hours}</Text><Text style={styles.hUnit}>{t.hours}</Text></View>
          <TouchableOpacity style={styles.stepBtn} onPress={() => setHours((h) => Math.min(14, h + 0.5))}><Plus size={22} color={GREEN} /></TouchableOpacity>
        </View>

        <Text style={[styles.label, { color: sub }, align]}>{t.quality}</Text>
        <View style={styles.qRow}>
          {QUALITY.map((e, i) => (
            <TouchableOpacity key={i} style={[styles.qBtn, { backgroundColor: card }, quality === i + 1 && styles.qBtnActive]} onPress={() => setQuality(i + 1)}>
              <Text style={styles.qEmoji}>{e}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <><Check size={20} color="#fff" /><Text style={styles.saveTxt}>{t.save}</Text></>}
        </TouchableOpacity>

        <Text style={[styles.label, { color: sub }, align]}>{t.last7}</Text>
        {loading ? <ActivityIndicator color={GREEN} /> : hist.length === 0 ? <Text style={[styles.empty, align]}>{t.empty}</Text> : hist.map((h) => (
          <View key={h.id} style={[styles.histRow, { backgroundColor: card }]}>
            <Text style={[styles.histDate, { color: sub }]}>{h.date}</Text>
            <Text style={[styles.histVal, { color: text }]}>{h.hours}h {QUALITY[(h.quality || 3) - 1]}</Text>
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
  title: { fontSize: 24, fontWeight: '900', color: '#0F172A', letterSpacing: -0.5 },
  sub: { fontSize: 14, color: '#64748B', marginBottom: 20 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 },
  stepBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#EAF4EE', alignItems: 'center', justifyContent: 'center' },
  hWrap: { alignItems: 'center' },
  hVal: { fontSize: 44, fontWeight: '900', color: '#0F172A', letterSpacing: -1 },
  hUnit: { fontSize: 13, color: '#94A3B8', fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 8 },
  qRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  qBtn: { width: 56, height: 56, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  qBtnActive: { borderColor: GREEN, backgroundColor: '#EAF4EE' },
  qEmoji: { fontSize: 26 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: GREEN, borderRadius: 16, paddingVertical: 15, marginBottom: 8 },
  saveTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  empty: { color: '#94A3B8', fontSize: 14 },
  histRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 8 },
  histDate: { fontSize: 13, color: '#64748B' },
  histVal: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
});
