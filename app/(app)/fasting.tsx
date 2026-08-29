// Jeûne intermittent — minuteur on-device. Protocoles 16:8 / 18:6 / 20:4 / OMAD.
// Persiste l'heure de début (AsyncStorage) → survit au redémarrage de l'app.
import React, { useEffect, useRef, useState } from 'react';
import { useTokens } from '../../constants/tokens';
import {
  Image,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Play, Square, Timer, Utensils, Users, Moon, Sunrise, Droplets } from 'lucide-react-native';
import { useUser } from '@clerk/clerk-expo';
import ScreenTopBar from '../../components/ScreenTopBar';
import { logEvent } from '../../lib/firebase';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { rowDir, txtAlign } from '../../lib/rtl';
import { connectFasting, joinFasting, updateFasting, leaveFasting, disconnectFasting, getFastingSocket, FastParticipant } from '../../lib/fastingSocket';
import { getTodayPrayerTimes, PrayerTimes } from '../../lib/prayerTimes';
import { Card, SectionHeader } from '../../components/ui';
import { type } from '../../constants/theme';
import { useScreenGate } from '../../components/FeatureGate';

const LOCALES: any = { en: 'en-US', fr: 'fr-FR', ar: 'ar' };
const KEY = 'fasting_state_v1';
const PROTOCOLS = [
  { id: '16:8', fast: 16, label: '16:8' },
  { id: '18:6', fast: 18, label: '18:6' },
  { id: '20:4', fast: 20, label: '20:4' },
  { id: 'OMAD', fast: 23, label: 'OMAD' },
  { id: 'ramadan', fast: 0, label: 'Ramadan' }, // fenêtre dynamique Fajr→Maghrib (horaires de prière)
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
    ram: { mode: 'Ramadan', suhoor: 'Suhoor', iftar: 'Iftar', fasting: 'Fasting (until Iftar)', untilSuhoor: 'Suhoor ends in', fastStartsAt: 'Suhoor — fast starts at', eatNow: 'Iftar 🌙 — you can eat', suhoorEndsAt: 'Next Suhoor ends at', hydrate: 'Hydrate well between Iftar and Suhoor.', unavailable: 'Prayer times unavailable — check your connection.', loading: 'Loading prayer times…' },
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
    ram: { mode: 'Ramadan', suhoor: 'Suhoor', iftar: 'Iftar', fasting: "Jeûne (jusqu'à l'Iftar)", untilSuhoor: 'Le Suhoor se termine dans', fastStartsAt: 'Suhoor — le jeûne commence à', eatNow: 'Iftar 🌙 — tu peux manger', suhoorEndsAt: 'Prochain Suhoor jusqu\'à', hydrate: "Hydrate-toi bien entre l'Iftar et le Suhoor.", unavailable: 'Horaires de prière indisponibles — vérifie ta connexion.', loading: 'Chargement des horaires…' },
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
    ram: { mode: 'رمضان', suhoor: 'السحور', iftar: 'الإفطار', fasting: 'صيام (حتى الإفطار)', untilSuhoor: 'ينتهي السحور خلال', fastStartsAt: 'السحور — يبدأ الصيام عند', eatNow: 'الإفطار 🌙 — يمكنك الأكل', suhoorEndsAt: 'السحور القادم حتى', hydrate: 'اشرب جيداً بين الإفطار والسحور.', unavailable: 'مواقيت الصلاة غير متوفرة — تحقق من اتصالك.', loading: 'تحميل المواقيت…' },
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
  const k = useTokens();
  const __gate = useScreenGate('fasting');
  const { user } = useUser();
  const { colors, resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';
  const GREEN = colors.primary;
  const tok = useTokens();
  const bg = tok.bg;
  const card = tok.surface;
  const text = tok.text;
  const sub = tok.textMuted;
  const border = isDark ? '#283241' : 'transparent';

  const [proto, setProto] = useState(PROTOCOLS[0]);
  const [startTs, setStartTs] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const timer = useRef<any>(null);
  const isRamadan = proto.id === 'ramadan';
  const [prayer, setPrayer] = useState<PrayerTimes | null>(null);
  const [loadingPrayer, setLoadingPrayer] = useState(false);
  const tr = t.ram; // libellés Ramadan

  // Mode Ramadan : on récupère les horaires de prière du jour (Fajr/Maghrib) une fois.
  useEffect(() => {
    if (proto.id !== 'ramadan' || prayer) return;
    setLoadingPrayer(true);
    getTodayPrayerTimes().then(setPrayer).catch(() => {}).finally(() => setLoadingPrayer(false));
  }, [proto.id]);

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
    if (startTs || joined || isRamadan) { timer.current = setInterval(() => setNow(Date.now()), 1000); }
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [startTs, joined, isRamadan]);

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
  const eatTime = eatTs ? new Date(eatTs).toLocaleTimeString(LOCALES[language] || 'en-US', { hour: '2-digit', minute: '2-digit' }) : '--';

  // ── Mode Ramadan : phase courante selon l'heure vs Fajr/Maghrib ──
  const fmtClock = (ts: number) => new Date(ts).toLocaleTimeString(LOCALES[language] || 'en-US', { hour: '2-digit', minute: '2-digit' });
  const ramPhase = isRamadan && prayer
    ? (now < prayer.fajr ? 'suhoor' : now < prayer.maghrib ? 'fast' : 'iftar')
    : null;
  const ramTarget = !prayer ? 0 : ramPhase === 'suhoor' ? prayer.fajr : ramPhase === 'fast' ? prayer.maghrib : prayer.nextFajr;
  const ramPct = ramPhase === 'fast' && prayer ? Math.min(100, ((now - prayer.fajr) / (prayer.maghrib - prayer.fajr)) * 100) : ramPhase === 'iftar' ? 100 : 0;

  if (!__gate.ok) return __gate.node;

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showBrand showNotif={false} />
      <ScrollView contentContainerStyle={styles.body}>
        <Image source={require('../../assets/images/illustrations/plan.jpg')} style={{ width: '100%', height: 110, borderRadius: 18, marginBottom: 14 }} resizeMode="cover" />
        <View style={[styles.head, { flexDirection: rowDir(isRTL) }]}><Timer size={26} color={GREEN} /><Text style={[styles.title, { color: text, textAlign: txtAlign(isRTL) }]}>{t.title}</Text></View>

        <View style={styles.section}>
          <SectionHeader title={t.goalCap} />
        </View>
        <Card variant="flat" style={styles.protoCard}>
          <View style={[styles.protoRow, { flexDirection: rowDir(isRTL) }]}>
            {PROTOCOLS.map((p) => (
              <TouchableOpacity key={p.id} disabled={!!startTs}
                onPress={() => setProto(p)}
                style={[styles.proto, { backgroundColor: k.surfaceSunken }, proto.id === p.id && { backgroundColor: GREEN }, !!startTs && { opacity: 0.5 }]}>
                <Text style={[styles.protoTxt, { color: k.text }, proto.id === p.id && styles.protoTxtActive]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {isRamadan ? (
          <View style={[styles.timerCard, { backgroundColor: card, borderWidth: 1, borderColor: border }, !isDark && styles.cardShadow]}>
            {loadingPrayer && !prayer ? (
              <ActivityIndicator color={GREEN} style={{ marginVertical: 24 }} />
            ) : !prayer ? (
              <Text style={[styles.sub, { color: sub, textAlign: 'center' }]}>{tr.unavailable}</Text>
            ) : (
              <>
                <View style={[styles.eatRow, { flexDirection: rowDir(isRTL), marginTop: 0, marginBottom: 8, gap: 8, flexWrap: 'wrap', justifyContent: 'center' }]}>
                  <Sunrise size={15} color={sub} /><Text style={[styles.eatTxt, { color: sub }]}>{tr.suhoor} {prayer.fajrStr}</Text>
                  <Moon size={15} color={GREEN} /><Text style={[styles.eatTxt, { color: sub }]}>{tr.iftar} {prayer.maghribStr}</Text>
                </View>
                <Text style={[styles.timerLabel, type.body, { color: sub }]}>{ramPhase === 'suhoor' ? tr.suhoor : ramPhase === 'fast' ? tr.fasting : tr.iftar}</Text>
                <Text style={[styles.timer, type.hero, { color: ramPhase === 'iftar' ? GREEN : text }]}>{fmt(ramTarget - now)}</Text>
                <View style={[styles.track, { backgroundColor: k.surface }]}><View style={[styles.fill, { width: `${ramPct}%`, backgroundColor: GREEN }]} /></View>
                <Text style={[styles.sub, { color: sub, textAlign: 'center' }]}>
                  {ramPhase === 'suhoor'
                    ? `${tr.fastStartsAt} ${prayer.fajrStr}`
                    : ramPhase === 'fast'
                    ? `${tr.iftar} ${prayer.maghribStr}`
                    : `${tr.eatNow} · ${tr.suhoorEndsAt} ${fmtClock(prayer.nextFajr)}`}
                </Text>
                <View style={[styles.eatRow, { flexDirection: rowDir(isRTL), marginTop: 12, gap: 6 }]}>
                  <Droplets size={15} color={GREEN} /><Text style={[styles.eatTxt, { color: sub, flex: 1, textAlign: txtAlign(isRTL) }]}>{tr.hydrate}</Text>
                </View>
              </>
            )}
          </View>
        ) : (
          <>
            <View style={[styles.timerCard, { backgroundColor: card, borderWidth: 1, borderColor: border }, !isDark && styles.cardShadow]}>
              <Text style={[styles.timerLabel, type.body, { color: sub }]}>{startTs ? (done ? t.done : t.fastingTime) : t.ready}</Text>
              <Text style={[styles.timer, type.hero, { color: text }, done ? { color: GREEN } : null]}>{startTs ? fmt(elapsed) : '00:00:00'}</Text>
              <View style={[styles.track, { backgroundColor: k.surface }]}><View style={[styles.fill, { width: `${pct}%`, backgroundColor: GREEN }]} /></View>
              <Text style={[styles.sub, { color: sub }]}>
                {startTs ? (done ? t.canEat : `${t.remaining} ${fmt(remaining)} · ${t.goal} ${proto.fast}h`) : `${t.goalCap} ${proto.fast}h`}
              </Text>
            </View>

            {startTs && !done && (
              <View style={[styles.eatRow, { flexDirection: rowDir(isRTL) }]}><Utensils size={15} color={sub} /><Text style={[styles.eatTxt, { color: sub }]}>  {t.eatWindow}{eatTime}</Text></View>
            )}

            {startTs ? (
              <TouchableOpacity style={[styles.btn, styles.stop, { flexDirection: rowDir(isRTL) }]} onPress={stop}>
                <Square size={18} color="#fff" /><Text style={styles.btnTxt}>{t.stop}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[styles.btn, { backgroundColor: GREEN, flexDirection: rowDir(isRTL) }]} onPress={start}>
                <Play size={18} color="#fff" /><Text style={styles.btnTxt}>{t.start} ({proto.label})</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {/* ── Défi de jeûne TEMPS RÉEL (socket.io) ── */}
        <View style={styles.section}>
          <SectionHeader title={t.challengeTitle} icon={<Users size={18} color={GREEN} />} />
        </View>
        <View style={[styles.challengeCard, { backgroundColor: card, borderWidth: 1, borderColor: border }]}>
          {!joined ? (
            <View style={[styles.cJoinRow, { flexDirection: rowDir(isRTL) }]}>
              <TextInput
                style={[styles.codeInput, { color: text, backgroundColor: k.surface, borderColor: k.border, textAlign: txtAlign(isRTL) }]}
                placeholder={t.codePh} placeholderTextColor={sub} value={code} onChangeText={setCode} autoCapitalize="none"
              />
              <TouchableOpacity style={[styles.joinBtn, { backgroundColor: GREEN }, (!code.trim() || connecting) && { opacity: 0.6 }]} onPress={joinChallenge} disabled={connecting || !code.trim()}>
                {connecting ? <ActivityIndicator color="#fff" /> : <Text style={styles.joinTxt}>{t.joinBtn}</Text>}
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={[styles.cJoinRow, { flexDirection: rowDir(isRTL) }]}>
                <Text style={[styles.codeBadge, { color: GREEN, textAlign: txtAlign(isRTL) }]}>#{cidOf()}</Text>
                <TouchableOpacity style={styles.leaveBtn} onPress={leaveChallenge}><Text style={styles.leaveTxt}>{t.leaveBtn}</Text></TouchableOpacity>
              </View>
              <Text style={[styles.liveLabel, { color: sub, textAlign: txtAlign(isRTL) }]}>{t.live} ({participants.length})</Text>
              {participants.length === 0 ? (
                <Text style={[styles.sub, { color: sub, textAlign: txtAlign(isRTL) }]}>{t.noOne}</Text>
              ) : participants.map((p, i) => {
                const el = p.startTs ? (now - p.startTs) : 0;
                const pc = p.startTs ? Math.min(100, Math.round((el / (p.targetHours * 3600000)) * 100)) : 0;
                return (
                  <View key={i} style={[styles.pRow, { flexDirection: rowDir(isRTL) }]}>
                    <Text style={[styles.pName, { color: text, textAlign: txtAlign(isRTL) }]} numberOfLines={1}>{p.name}</Text>
                    <View style={[styles.pTrack, { backgroundColor: k.surface }]}>
                      <View style={[styles.pFill, { width: `${pc}%`, backgroundColor: p.status === 'fasting' ? GREEN : '#94A3B8' }]} />
                    </View>
                    <Text style={[styles.pPct, { color: sub }]}>{p.status === 'fasting' ? `${pc}%` : '—'}</Text>
                  </View>
                );
              })}
            </>
          )}
        </View>

        <Text style={[styles.note, { color: k.textFaint }]}>{t.note}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  body: { padding: 20, alignItems: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'flex-start' },
  title: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  section: { width: '100%' },
  protoCard: { width: '100%' },
  protoRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center' },
  proto: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 12, backgroundColor: '#E2E8F0' },
  protoTxt: { fontWeight: '700', color: '#475569' },
  protoTxtActive: { color: '#fff' },
  cardShadow: { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  timerCard: { width: '100%', backgroundColor: '#fff', borderRadius: 20, padding: 24, marginTop: 28, alignItems: 'center' },
  timerLabel: { fontSize: 13, color: '#64748B' },
  timer: { fontSize: 52, fontWeight: '900', color: '#0F172A', marginVertical: 8, fontVariant: ['tabular-nums'] },
  track: { width: '100%', height: 10, borderRadius: 6, backgroundColor: '#F1F5F9', overflow: 'hidden', marginTop: 8 },
  fill: { height: 10, borderRadius: 6 },
  sub: { fontSize: 13, color: '#64748B', marginTop: 10 },
  eatRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  eatTxt: { fontSize: 13, color: '#64748B' },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, borderRadius: 16, marginTop: 28, width: '100%' },
  stop: { backgroundColor: '#E11D48' },
  btnTxt: { color: '#fff', fontWeight: '700', fontSize: 16 },
  note: { fontSize: 11, color: '#94A3B8', textAlign: 'center', marginTop: 20 },
  challengeCard: { width: '100%', borderRadius: 20, padding: 18, marginTop: 24, gap: 12 },
  cHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cTitle: { fontSize: 16, fontWeight: '800' },
  cJoinRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  codeInput: { flex: 1, borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  joinBtn: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
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

