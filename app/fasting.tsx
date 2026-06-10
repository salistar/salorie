// Jeûne intermittent — minuteur on-device. Protocoles 16:8 / 18:6 / 20:4 / OMAD.
// Persiste l'heure de début (AsyncStorage) → survit au redémarrage de l'app.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Play, Square, Timer, Utensils } from 'lucide-react-native';
import ScreenTopBar from '../components/ScreenTopBar';

const GREEN = '#2E8B57';
const KEY = 'fasting_state_v1';
const PROTOCOLS = [
  { id: '16:8', fast: 16, label: '16:8' },
  { id: '18:6', fast: 18, label: '18:6' },
  { id: '20:4', fast: 20, label: '20:4' },
  { id: 'OMAD', fast: 23, label: 'OMAD' },
];

function fmt(ms: number) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export default function FastingScreen() {
  const [proto, setProto] = useState(PROTOCOLS[0]);
  const [startTs, setStartTs] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const timer = useRef<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) {
          const s = JSON.parse(raw);
          const p = PROTOCOLS.find((x) => x.id === s.protoId) || PROTOCOLS[0];
          setProto(p);
          if (s.startTs) setStartTs(s.startTs);
        }
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (startTs) { timer.current = setInterval(() => setNow(Date.now()), 1000); }
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [startTs]);

  const start = async () => {
    const ts = Date.now();
    setStartTs(ts); setNow(ts);
    try { await AsyncStorage.setItem(KEY, JSON.stringify({ startTs: ts, protoId: proto.id })); } catch {}
  };
  const stop = async () => {
    setStartTs(null);
    if (timer.current) clearInterval(timer.current);
    try { await AsyncStorage.removeItem(KEY); } catch {}
  };

  const targetMs = proto.fast * 3600 * 1000;
  const elapsed = startTs ? now - startTs : 0;
  const remaining = targetMs - elapsed;
  const pct = startTs ? Math.min(100, (elapsed / targetMs) * 100) : 0;
  const done = startTs && remaining <= 0;
  const eatTs = startTs ? startTs + targetMs : null;
  const eatTime = eatTs ? new Date(eatTs).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '--';

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenTopBar showBack showBrand showNotif={false} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.head}><Timer size={26} color={GREEN} /><Text style={styles.title}>Jeûne intermittent</Text></View>

        <View style={styles.protoRow}>
          {PROTOCOLS.map((p) => (
            <TouchableOpacity key={p.id} disabled={!!startTs}
              onPress={() => setProto(p)}
              style={[styles.proto, proto.id === p.id && styles.protoActive, !!startTs && { opacity: 0.5 }]}>
              <Text style={[styles.protoTxt, proto.id === p.id && styles.protoTxtActive]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.timerCard}>
          <Text style={styles.timerLabel}>{startTs ? (done ? 'Jeûne complété 🎉' : 'Temps de jeûne') : 'Prêt à jeûner'}</Text>
          <Text style={[styles.timer, done && { color: GREEN }]}>{startTs ? fmt(elapsed) : '00:00:00'}</Text>
          <View style={styles.track}><View style={[styles.fill, { width: `${pct}%` }]} /></View>
          <Text style={styles.sub}>
            {startTs ? (done ? 'Tu peux manger !' : `Restant ${fmt(remaining)} · objectif ${proto.fast}h`) : `Objectif ${proto.fast}h`}
          </Text>
        </View>

        {startTs && !done && (
          <View style={styles.eatRow}><Utensils size={15} color="#64748B" /><Text style={styles.eatTxt}>  Fenêtre repas à ~{eatTime}</Text></View>
        )}

        {startTs ? (
          <TouchableOpacity style={[styles.btn, styles.stop]} onPress={stop}>
            <Square size={18} color="#fff" /><Text style={styles.btnTxt}>Arrêter le jeûne</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.btn, styles.startBtn]} onPress={start}>
            <Play size={18} color="#fff" /><Text style={styles.btnTxt}>Démarrer ({proto.label})</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.note}>Le minuteur continue même app fermée (heure de début sauvegardée localement).</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  body: { padding: 20, alignItems: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'flex-start' },
  title: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  protoRow: { flexDirection: 'row', gap: 10, marginTop: 22 },
  proto: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 12, backgroundColor: '#E2E8F0' },
  protoActive: { backgroundColor: GREEN },
  protoTxt: { fontWeight: '700', color: '#475569' },
  protoTxtActive: { color: '#fff' },
  timerCard: { width: '100%', backgroundColor: '#fff', borderRadius: 20, padding: 24, marginTop: 28, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  timerLabel: { fontSize: 13, color: '#64748B' },
  timer: { fontSize: 52, fontWeight: '900', color: '#0F172A', marginVertical: 8, fontVariant: ['tabular-nums'] },
  track: { width: '100%', height: 10, borderRadius: 6, backgroundColor: '#F1F5F9', overflow: 'hidden', marginTop: 8 },
  fill: { height: 10, borderRadius: 6, backgroundColor: GREEN },
  sub: { fontSize: 13, color: '#64748B', marginTop: 10 },
  eatRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  eatTxt: { fontSize: 13, color: '#64748B' },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, borderRadius: 16, marginTop: 28, width: '100%' },
  startBtn: { backgroundColor: GREEN },
  stop: { backgroundColor: '#E11D48' },
  btnTxt: { color: '#fff', fontWeight: '700', fontSize: 16 },
  note: { fontSize: 11, color: '#94A3B8', textAlign: 'center', marginTop: 20 },
});
