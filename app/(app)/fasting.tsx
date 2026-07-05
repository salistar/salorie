// Jeûne intermittent — minuteur on-device. Protocoles 16:8 / 18:6 / 20:4 / OMAD.
// Persiste l'heure de début (AsyncStorage) → survit au redémarrage de l'app.
import React, { useEffect, useRef, useState } from 'react';
import { Image, View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Play, Square, Timer, Utensils, Users } from 'lucide-react-native';
import { useUser } from '@clerk/clerk-expo';
import ScreenTopBar from '../../components/ScreenTopBar';
import { logEvent } from '../../lib/firebase';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { connectFasting, joinFasting, updateFasting, leaveFasting, disconnectFasting, getFastingSocket, FastParticipant } from '../../lib/fastingSocket';

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
    challengeTitle: 'Fasting challenge (live)', codePh: 'Challenge code (share it)', joinBtn: 'Join challenge', leaveBtn: 'Leave', live: 'Live participants', noOne: 'No one yet — share the code with friends.', you: 'You',
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
    challengeTitle: 'Défi de jeûne (live)', codePh: 'Code du défi (partage-le)', joinBtn: 'Rejoindre le défi', leaveBtn: 'Quitter', live: 'Participants en direct', noOne: 'Personne encore — partage le code à tes amis.', you: 'Toi',
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
    challengeTitle: 'تحدي الصيام (مباشر)', codePh: 'رمز التحدي (شاركه)', joinBtn: 'انضم للتحدي', leaveBtn: 'مغادرة', live: 'المشاركون مباشرة', noOne: 'لا أحد بعد — شارك الرمز مع أصدقائك.', you: 'أنت',
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

  // ── Défi temps-réel (socket.io) ──────────────────────────────
  const [code, setCode] = useState('');
  const [joined, setJoined] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [participants, setParticipants] = useState<FastParticipant[]>([]);
  const myName = (user as any)?.firstName || user?.primaryEmailAddress?.emailAddress?.split('@')[0] || 'User';
  const cidOf = () => code.trim().toLowerCase();

  const joinChallenge = async () => {
    const cid = cidOf();
    if (!cid) return;
    setConnecting(true);
    const s = await connectFasting();
    setConnecting(false);
    if (!s) return;
    s.off('fasting:participants');
    s.on('fasting:participants', (p: any) => { if (p?.challengeId === cid) setParticipants(p.participants || []); });
    joinFasting(cid, myName, proto.fast);
    if (startTs) updateFasting(cid, startTs, 'fasting', proto.fast);
    setJoined(true);
  };
  const leaveChallenge = () => { const cid = cidOf(); if (cid) leaveFasting(cid); setJoined(false); setParticipants([]); };
  useEffect(() => () => { disconnectFasting(); }, []); // déconnexion à la sortie de l'écran

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
    if (startTs || joined) { timer.current = setInterval(() => setNow(Date.now()), 1000); }
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [startTs, joined]);

  const start = async () => {
    const ts = Date.now();
    setStartTs(ts); setNow(ts);
    try { await AsyncStorage.setItem(KEY, JSON.stringify({ startTs: ts, protoId: proto.id })); } catch {}
    if (joined) updateFasting(cidOf(), ts, 'fasting', proto.fast); // diffuse aux autres participants
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
    if (joined) updateFasting(cidOf(), null, 'idle', proto.fast); // diffuse l'arrêt
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
        <Image source={require('../../assets/images/illustrations/plan.jpg')} style={{ width: '100%', height: 110, borderRadius: 18, marginBottom: 14 }} resizeMode="cover" />
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

        {/* ── Défi de jeûne TEMPS RÉEL (socket.io) ── */}
        <View style={[styles.challengeCard, { backgroundColor: card }]}>
          <View style={styles.cHead}><Users size={18} color={GREEN} /><Text style={[styles.cTitle, { color: text }]}>{t.challengeTitle}</Text></View>
          {!joined ? (
            <View style={styles.cJoinRow}>
              <TextInput
                style={[styles.codeInput, { color: text, backgroundColor: isDark ? '#0f172a' : '#F1F5F9', borderColor: isDark ? '#334155' : '#E2E8F0' }]}
                placeholder={t.codePh} placeholderTextColor={sub} value={code} onChangeText={setCode} autoCapitalize="none"
              />
              <TouchableOpacity style={[styles.joinBtn, (!code.trim() || connecting) && { opacity: 0.6 }]} onPress={joinChallenge} disabled={connecting || !code.trim()}>
                {connecting ? <ActivityIndicator color="#fff" /> : <Text style={styles.joinTxt}>{t.joinBtn}</Text>}
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.cJoinRow}>
                <Text style={[styles.codeBadge, { color: GREEN }]}>#{cidOf()}</Text>
                <TouchableOpacity style={styles.leaveBtn} onPress={leaveChallenge}><Text style={styles.leaveTxt}>{t.leaveBtn}</Text></TouchableOpacity>
              </View>
              <Text style={[styles.liveLabel, { color: sub }]}>{t.live} ({participants.length})</Text>
              {participants.length === 0 ? (
                <Text style={[styles.sub, { color: sub }]}>{t.noOne}</Text>
              ) : participants.map((p, i) => {
                const el = p.startTs ? (now - p.startTs) : 0;
                const pc = p.startTs ? Math.min(100, Math.round((el / (p.targetHours * 3600000)) * 100)) : 0;
                return (
                  <View key={i} style={styles.pRow}>
                    <Text style={[styles.pName, { color: text }]} numberOfLines={1}>{p.name}</Text>
                    <View style={[styles.pTrack, { backgroundColor: isDark ? '#334155' : '#F1F5F9' }]}>
                      <View style={[styles.pFill, { width: `${pc}%`, backgroundColor: p.status === 'fasting' ? GREEN : '#94A3B8' }]} />
                    </View>
                    <Text style={[styles.pPct, { color: sub }]}>{p.status === 'fasting' ? `${pc}%` : '—'}</Text>
                  </View>
                );
              })}
            </>
          )}
        </View>

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
  challengeCard: { width: '100%', borderRadius: 20, padding: 18, marginTop: 24, gap: 12 },
  cHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cTitle: { fontSize: 16, fontWeight: '800' },
  cJoinRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  codeInput: { flex: 1, borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  joinBtn: { backgroundColor: GREEN, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  joinTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  codeBadge: { flex: 1, fontSize: 16, fontWeight: '900' },
  leaveBtn: { backgroundColor: '#FEE2E2', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9 },
  leaveTxt: { color: '#E11D48', fontWeight: '800', fontSize: 13 },
  liveLabel: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  pRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pName: { width: 90, fontSize: 13, fontWeight: '700' },
  pTrack: { flex: 1, height: 8, borderRadius: 5, overflow: 'hidden' },
  pFill: { height: 8, borderRadius: 5 },
  pPct: { width: 42, fontSize: 12, fontWeight: '700', textAlign: 'right' },
});

