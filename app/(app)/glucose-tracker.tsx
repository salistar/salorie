// Glycémie — suivi manuel (mesures + contexte + tendance). Sync CGM = à venir.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { Droplet, Check } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { FormCard, Stepper, ChipGroup } from '../../components/FormKit';
import { logEntry, getEntries } from '../../lib/tracking';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';

const GREEN = '#2E8B57';
const CONTEXTS = ['À jeun', 'Avant repas', 'Après repas', 'Coucher'];

const TXT: any = {
  en: { title: 'Blood glucose', sub: 'Log your readings (mg/dL). CGM sensor sync (Dexcom/Libre) coming soon.', placeholder: 'e.g. 95', save: 'Save', history: 'History', empty: 'No readings yet.', status: { 'Basse': 'Low', 'Normale': 'Normal', 'Élevée': 'High', 'Très élevée': 'Very high' }, ctx: { 'À jeun': 'Fasting', 'Avant repas': 'Before meal', 'Après repas': 'After meal', 'Coucher': 'Bedtime' } },
  fr: { title: 'Glycémie', sub: 'Note tes mesures (mg/dL). Sync capteur CGM (Dexcom/Libre) à venir.', placeholder: 'ex. 95', save: 'Enregistrer', history: 'Historique', empty: 'Aucune mesure.', status: { 'Basse': 'Basse', 'Normale': 'Normale', 'Élevée': 'Élevée', 'Très élevée': 'Très élevée' }, ctx: { 'À jeun': 'À jeun', 'Avant repas': 'Avant repas', 'Après repas': 'Après repas', 'Coucher': 'Coucher' } },
  ar: { title: 'سكر الدم', sub: 'سجّل قياساتك (ملغ/دل). مزامنة مستشعر CGM (Dexcom/Libre) قريباً.', placeholder: 'مثال 95', save: 'حفظ', history: 'السجل', empty: 'لا قياسات بعد.', status: { 'Basse': 'منخفض', 'Normale': 'طبيعي', 'Élevée': 'مرتفع', 'Très élevée': 'مرتفع جداً' }, ctx: { 'À jeun': 'صائم', 'Avant repas': 'قبل الوجبة', 'Après repas': 'بعد الوجبة', 'Coucher': 'قبل النوم' } },
};

function status(v: number, ctx: string) {
  const fasting = ctx === 'À jeun' || ctx === 'Avant repas';
  if (fasting) return v < 70 ? { t: 'Basse', c: '#E11D48' } : v <= 100 ? { t: 'Normale', c: GREEN } : v <= 125 ? { t: 'Élevée', c: '#F59E0B' } : { t: 'Très élevée', c: '#E11D48' };
  return v < 70 ? { t: 'Basse', c: '#E11D48' } : v <= 140 ? { t: 'Normale', c: GREEN } : v <= 199 ? { t: 'Élevée', c: '#F59E0B' } : { t: 'Très élevée', c: '#E11D48' };
}

export default function GlucoseTrackerScreen() {
  const { resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';
  const bg = isDark ? '#0f172a' : '#F4F7F9';
  const card = isDark ? '#1e293b' : '#ffffff';
  const text = isDark ? '#f1f5f9' : '#0F172A';
  const sub = isDark ? '#94a3b8' : '#64748B';
  const align: any = { textAlign: isRTL ? 'right' : 'left' };

  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress || '';
  const [val, setVal] = useState('');
  const [ctx, setCtx] = useState(CONTEXTS[0]);
  const [hist, setHist] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => { setHist(await getEntries(email, 'glucose', 12)); setLoading(false); };
  useEffect(() => { load(); }, []);
  const save = async () => { const v = parseFloat(val); if (isNaN(v)) return; setSaving(true); await logEntry(email, 'glucose', { value: v, context: ctx }); setVal(''); await load(); setSaving(false); };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.head}><Droplet size={24} color="#E11D48" /><Text style={[styles.title, { color: text }]}>{t.title}</Text></View>
        <Text style={[styles.sub, { color: sub }, align]}>{t.sub}</Text>

        <FormCard>
          <Stepper
            value={val}
            onChange={setVal}
            step={1}
            min={0}
            max={600}
            unit="mg/dL"
          />
          <ChipGroup
            value={ctx}
            onChange={setCtx}
            options={CONTEXTS.map((c) => ({ value: c, label: t.ctx[c] || c }))}
          />
        </FormCard>
        <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <><Check size={20} color="#fff" /><Text style={styles.saveTxt}>{t.save}</Text></>}
        </TouchableOpacity>

        <Text style={[styles.label, { color: sub }]}>{t.history}</Text>
        {loading ? <ActivityIndicator color={GREEN} /> : hist.length === 0 ? <Text style={[styles.empty, { color: sub }]}>{t.empty}</Text> : hist.map((h) => {
          const s = status(h.value, h.context);
          return (
            <View key={h.id} style={[styles.row, { backgroundColor: card }]}>
              <View style={{ flex: 1 }}><Text style={[styles.rowV, { color: text }]}>{h.value} mg/dL</Text><Text style={[styles.rowSub, { color: sub }]}>{t.ctx[h.context] || h.context} · {h.date}</Text></View>
              <View style={[styles.badge, { backgroundColor: s.c + '18' }]}><Text style={[styles.badgeTxt, { color: s.c }]}>{t.status[s.t] || s.t}</Text></View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F7F9' },
  body: { padding: 20, paddingBottom: 100 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  title: { fontSize: 26, fontWeight: '900', color: '#0F172A', letterSpacing: -0.5 },
  sub: { fontSize: 14, color: '#64748B', marginBottom: 20, lineHeight: 20 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: GREEN, borderRadius: 14, paddingVertical: 15, marginBottom: 8 },
  saveTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  label: { fontSize: 13, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8, marginBottom: 10 },
  empty: { color: '#94A3B8', fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8 },
  rowV: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  rowSub: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  badge: { borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10 },
  badgeTxt: { fontSize: 12, fontWeight: '800' },
});
