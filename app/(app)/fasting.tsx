// Jeûne intermittent — minuteur on-device. Protocoles 16:8 / 18:6 / 20:4 / OMAD.
// Persiste l'heure de début (AsyncStorage) → survit au redémarrage de l'app.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Play, Square, Timer, Utensils } from 'lucide-react-native';
import { useUser } from '@clerk/clerk-expo';
import ScreenTopBar from '../../components/ScreenTopBar';
import { logEvent } from '../../lib/firebase';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';

const GREEN = '#2E8B57';
const KEY = 'fasting_state_v1';
const PROTOCOLS = [
  { id: '16:8', fast: 16, label: '16:8' },
  { id: '18:6', fast: 18, label: '18:6' },
  { id: '20:4', fast: 20, label: '20:4' },
  { id: 'OMAD', fast: 23, label: 'OMAD' },
];

const TXT: any = {
  en: {
    title: 'Intermittent fasting',
    done: 'Fast completed 🎉',
    fastingTime: 'Fasting time',
    ready: 'Ready to fast',
    canEat: 'You can eat!',
    remaining: 'Remaining',
    goal: 'goal',
    goalCap: 'Goal',
    eatWindow: 'Eating window at ~',
    stop: 'Stop the fast',
    start: 'Start',
    note: 'The timer keeps running even with the app closed (start time saved locally).',
  },
  fr: {
    title: 'Jeûne intermittent',
    done: 'Jeûne complété 🎉',
    fastingTime: 'Temps de jeûne',
    ready: 'Prêt à jeûner',
    canEat: 'Tu peux manger !',
    remaining: 'Restant',
    goal: 'objectif',
    goalCap: 'Objectif',
    eatWindow: 'Fenêtre repas à ~',
    stop: 'Arrêter le jeûne',
    start: 'Démarrer',
    note: 'Le minuteur continue même app fermée (heure de début sauvegardée localement).',
  },
  ar: {
    title: 'الصيام المتقطع',
    done: 'اكتمل الصيام 🎉',
    fastingTime: 'مدة الصيام',
    ready: 'جاهز للصيام',
    canEat: 'يمكنك الأكل!',
    remaining: 'المتبقي',
    goal: 'الهدف',
    goalCap: 'الهدف',
    eatWindow: 'نافذة الأكل عند ~',
    stop: 'إيقاف الصيام',
    start: 'ابدأ',
    note: 'يستمر المؤقت حتى مع إغلاق التطبيق (وقت البدء محفوظ محلياً).',
  },
};

function fmt(ms: number) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export default function FastingScreen() {
  const { user } = useUser();
  const { resolved } = useTheme();
  const { language } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';
  const bg = isDark ? '#0f172a' : '#F8FAFC';
  const card = isDark ? '#1e293b' : '#ffffff';
  const text = isDark ? '#f1f5f9' : '#0F172A';
  const sub = isDark ? '#94a3b8' : '#64748B';

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
    // Event Bus : émet fast_completed UNIQUEMENT si le jeûne a atteint son objectif.
    const elapsedMs = startTs ? Date.now() - startTs : 0;
    if (startTs && elapsedMs >= proto.fast * 3600 * 1000) {
      const email = user?.primaryEmailAddress?.emailAddress;
      if (email) logEvent(email, 'fast_completed', { protocol: proto.id, hours: Math.round(elapsedMs / 3600000) });
    }
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
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showBrand showNotif={false} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.head}><Timer size={26} color={GREEN} /><Text style={[styles.title, { color: text }]}>{t.title}</Text></View>

        <View style={styles.protoRow}>
          {PROTOCOLS.map((p) => (
            <TouchableOpacity key={p.id} disabled={!!startTs}
              onPress={() => setProto(p)}
              style={[styles.proto, { backgroundColor: isDark ? '#334155' : '#E2E8F0' }, proto.id === p.id && styles.protoActive, !!startTs && { opacity: 0.5 }]}>
              <Text style={[styles.protoTxt, { color: isDark ? '#cbd5e1' : '#475569' }, proto.id === p.id && styles.protoTxtActive]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={[styles.timerCard, { backgroundColor: card }]}>
          <Text style={[styles.timerLabel, { color: sub }]}>{startTs ? (done ? t.done : t.fastingTime) : t.ready}</Text>
          <Text style={[styles.timer, { color: text }, done ? { color: GREEN } : null]}>{startTs ? fmt(elapsed) : '00:00:00'}</Text>
          <View style={[styles.track, { backgroundColor: isDark ? '#334155' : '#F1F5F9' }]}><View style={[styles.fill, { width: `${pct}%` }]} /></View>
          <Text style={[styles.sub, { color: sub }]}>
            {startTs ? (done ? t.canEat : `${t.remaining} ${fmt(remaining)} · ${t.goal} ${proto.fast}h`) : `${t.goalCap} ${proto.fast}h`}
          </Text>
        </View>

        {startTs && !done && (
          <View style={styles.eatRow}><Utensils size={15} color={sub} /><Text style={[styles.eatTxt, { color: sub }]}>  {t.eatWindow}{eatTime}</Text></View>
        )}

        {startTs ? (
          <TouchableOpacity style={[styles.btn, styles.stop]} onPress={stop}>
            <Square size={18} color="#fff" /><Text style={styles.btnTxt}>{t.stop}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.btn, styles.startBtn]} onPress={start}>
            <Play size={18} color="#fff" /><Text style={styles.btnTxt}>{t.start} ({proto.label})</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.note}>{t.note}</Text>
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
