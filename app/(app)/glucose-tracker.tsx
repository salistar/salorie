// Glycémie — suivi manuel (mesures + contexte + tendance). Sync CGM = à venir.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { Droplet, Check } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { logEntry, getEntries } from '../../lib/tracking';

const GREEN = '#2E8B57';
const CONTEXTS = ['À jeun', 'Avant repas', 'Après repas', 'Coucher'];

function status(v: number, ctx: string) {
  const fasting = ctx === 'À jeun' || ctx === 'Avant repas';
  if (fasting) return v < 70 ? { t: 'Basse', c: '#E11D48' } : v <= 100 ? { t: 'Normale', c: GREEN } : v <= 125 ? { t: 'Élevée', c: '#F59E0B' } : { t: 'Très élevée', c: '#E11D48' };
  return v < 70 ? { t: 'Basse', c: '#E11D48' } : v <= 140 ? { t: 'Normale', c: GREEN } : v <= 199 ? { t: 'Élevée', c: '#F59E0B' } : { t: 'Très élevée', c: '#E11D48' };
}

export default function GlucoseTrackerScreen() {
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
    <SafeAreaView style={styles.safe}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.head}><Droplet size={24} color="#E11D48" /><Text style={styles.title}>Glycémie</Text></View>
        <Text style={styles.sub}>Note tes mesures (mg/dL). Sync capteur CGM (Dexcom/Libre) à venir.</Text>

        <View style={styles.inputRow}>
          <TextInput style={styles.input} keyboardType="numeric" placeholder="ex. 95" value={val} onChangeText={setVal} />
          <Text style={styles.unit}>mg/dL</Text>
        </View>
        <View style={styles.ctxRow}>
          {CONTEXTS.map((c) => (
            <TouchableOpacity key={c} style={[styles.ctx, ctx === c && styles.ctxActive]} onPress={() => setCtx(c)}><Text style={[styles.ctxTxt, ctx === c && { color: '#fff' }]}>{c}</Text></TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <><Check size={20} color="#fff" /><Text style={styles.saveTxt}>Enregistrer</Text></>}
        </TouchableOpacity>

        <Text style={styles.label}>Historique</Text>
        {loading ? <ActivityIndicator color={GREEN} /> : hist.length === 0 ? <Text style={styles.empty}>Aucune mesure.</Text> : hist.map((h) => {
          const s = status(h.value, h.context);
          return (
            <View key={h.id} style={styles.row}>
              <View style={{ flex: 1 }}><Text style={styles.rowV}>{h.value} mg/dL</Text><Text style={styles.rowSub}>{h.context} · {h.date}</Text></View>
              <View style={[styles.badge, { backgroundColor: s.c + '18' }]}><Text style={[styles.badgeTxt, { color: s.c }]}>{s.t}</Text></View>
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
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 16, marginBottom: 14 },
  input: { flex: 1, fontSize: 22, fontWeight: '800', color: '#0F172A', paddingVertical: 14 },
  unit: { fontSize: 14, color: '#94A3B8', fontWeight: '700' },
  ctxRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  ctx: { backgroundColor: '#fff', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14 },
  ctxActive: { backgroundColor: GREEN },
  ctxTxt: { fontSize: 13, fontWeight: '700', color: '#64748B' },
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
