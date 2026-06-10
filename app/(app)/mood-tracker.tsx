// Suivi de l'humeur & énergie — emoji quotidien + historique.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { Smile, Check, Zap } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { logEntry, getEntries } from '../../lib/tracking';

const GREEN = '#2E8B57';
const MOODS = ['😞', '😕', '😐', '🙂', '😄'];

export default function MoodTrackerScreen() {
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress || '';
  const [mood, setMood] = useState(4);
  const [energy, setEnergy] = useState(3);
  const [hist, setHist] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => { setHist(await getEntries(email, 'mood', 7)); setLoading(false); };
  useEffect(() => { load(); }, []);
  const save = async () => { setSaving(true); await logEntry(email, 'mood', { mood, energy }); await load(); setSaving(false); };

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.head}><Smile size={24} color={GREEN} /><Text style={styles.title}>Humeur & énergie</Text></View>
        <Text style={styles.sub}>Comment te sens-tu aujourd'hui ?</Text>

        <Text style={styles.label}>Humeur</Text>
        <View style={styles.row}>
          {MOODS.map((e, i) => (
            <TouchableOpacity key={i} style={[styles.btn, mood === i + 1 && styles.btnActive]} onPress={() => setMood(i + 1)}><Text style={styles.emoji}>{e}</Text></TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}><Zap size={13} color="#64748B" /> Énergie</Text>
        <View style={styles.row}>
          {[1, 2, 3, 4, 5].map((n) => (
            <TouchableOpacity key={n} style={[styles.lvl, energy >= n && styles.lvlActive]} onPress={() => setEnergy(n)}><Text style={[styles.lvlTxt, energy >= n && { color: '#fff' }]}>{n}</Text></TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <><Check size={20} color="#fff" /><Text style={styles.saveTxt}>Enregistrer</Text></>}
        </TouchableOpacity>

        <Text style={styles.label}>7 derniers jours</Text>
        {loading ? <ActivityIndicator color={GREEN} /> : hist.length === 0 ? <Text style={styles.empty}>Rien encore.</Text> : hist.map((h) => (
          <View key={h.id} style={styles.histRow}>
            <Text style={styles.histDate}>{h.date}</Text>
            <Text style={styles.histVal}>{MOODS[(h.mood || 3) - 1]}  ⚡{h.energy || '—'}/5</Text>
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
  label: { fontSize: 13, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
  btn: { width: 56, height: 56, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  btnActive: { borderColor: GREEN, backgroundColor: '#EAF4EE' },
  emoji: { fontSize: 26 },
  lvl: { width: 56, height: 48, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  lvlActive: { backgroundColor: GREEN },
  lvlTxt: { fontSize: 16, fontWeight: '800', color: '#94A3B8' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: GREEN, borderRadius: 16, paddingVertical: 15, marginBottom: 8 },
  saveTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  empty: { color: '#94A3B8', fontSize: 14 },
  histRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 8 },
  histDate: { fontSize: 13, color: '#64748B' },
  histVal: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
});
