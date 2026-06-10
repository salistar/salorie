// Composition corporelle — poids, masse grasse %, muscle (manuel). Balance connectée = à venir.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { PersonStanding, Check } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { logEntry, getEntries } from '../../lib/tracking';

const GREEN = '#2E8B57';
const F = [
  { k: 'weight', l: 'Poids', u: 'kg' },
  { k: 'fat', l: 'Masse grasse', u: '%' },
  { k: 'muscle', l: 'Masse musculaire', u: 'kg' },
  { k: 'water', l: 'Eau corporelle', u: '%' },
];

export default function BodyCompositionScreen() {
  const { user } = useUser();
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
    <SafeAreaView style={styles.safe}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.head}><PersonStanding size={24} color={GREEN} /><Text style={styles.title}>Composition corporelle</Text></View>
        <Text style={styles.sub}>Saisie manuelle. Sync balance connectée (Withings…) à venir.</Text>

        {F.map((f) => (
          <View key={f.k} style={styles.row}>
            <Text style={styles.label}>{f.l}</Text>
            <View style={styles.inputWrap}>
              <TextInput style={styles.input} keyboardType="numeric" placeholder={last?.[f.k] != null ? String(last[f.k]) : '—'} value={v[f.k] || ''} onChangeText={(t) => setV((s) => ({ ...s, [f.k]: t }))} />
              <Text style={styles.unit}>{f.u}</Text>
            </View>
          </View>
        ))}
        <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <><Check size={20} color="#fff" /><Text style={styles.saveTxt}>Enregistrer</Text></>}
        </TouchableOpacity>

        <Text style={styles.histLabel}>Historique</Text>
        {loading ? <ActivityIndicator color={GREEN} /> : hist.length === 0 ? <Text style={styles.empty}>Aucune mesure.</Text> : hist.map((h) => (
          <View key={h.id} style={styles.histRow}>
            <Text style={styles.histDate}>{h.date}</Text>
            <Text style={styles.histVal}>{F.filter((f) => h[f.k] != null).map((f) => `${h[f.k]}${f.u}`).join(' · ')}</Text>
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
