// « Live Twin » — jumeau de course en direct + push-to-talk audio.
// Client du gateway twin (lib/twinSocket.ts). Appairage par CODE court à 6
// caractères (room 2 personnes). Affiche le roster + l'état live du jumeau
// (allure m:ss/km, km). Push-to-talk : on maintient le bouton, on enregistre,
// on relâche → l'audio est envoyé à la room et joué chez le jumeau.
// Trilingue (en/fr/ar), dark-aware, RTL, ScreenTopBar.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTokens } from '../../constants/tokens';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  Share,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { useUser } from '@clerk/clerk-expo';
import { Radio, Mic, Share2, LogOut, Wifi, WifiOff, User as UserIcon, Footprints } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { PrimaryButton, SecondaryButton } from '../../components/ui';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { rowDir, txtAlign } from '../../lib/rtl';
import { type } from '../../constants/theme';
import {
  connectTwin, joinTwin, createTwin, onCreated, getMyUid, sendState, sendAudio,
  onRoster, onState, onAudio, onFull, leaveTwin, disconnect,
  TwinMember, TwinState,
} from '../../lib/twinSocket';

// NOUVELLES chaînes = objet LOCAL {en,fr,ar}.
const TXT: any = {
  en: {
    title: 'Live Twin',
    intro: 'Run side-by-side with a friend in real time, and talk hands-free.',
    create: 'Create a session', join: 'Join', codePh: 'Enter a code', share: 'Share', copyHint: 'Share this code with your twin',
    invalid: 'Invalid code — 8 characters.', connecting: 'Connecting…', connected: 'Connected', offline: 'Offline',
    full: 'That session is full (2 max).', notConfigured: 'Live server not configured.', failed: 'Could not connect — try again.',
    roster: 'In this session', you: 'You', twin: 'Your twin', waiting: 'Waiting for your twin to join…',
    live: 'Live pace', noRun: 'No active run', leave: 'Leave',
    hold: 'Hold to talk', recording: 'Recording… release to send', talking: 'is talking…',
    micDenied: 'Microphone permission denied.', shareMsg: (c: string) => `Join my Live Twin run on Salorie! Code: ${c}`,
    disclaimer: 'Audio is shared only within your session and is not stored on our servers.',
  },
  fr: {
    title: 'Jumeau live',
    intro: 'Cours côte à côte avec un ami en temps réel, et parle sans les mains.',
    create: 'Créer une session', join: 'Rejoindre', codePh: 'Entrer un code', share: 'Partager', copyHint: 'Partage ce code avec ton jumeau',
    invalid: 'Code invalide — 8 caractères.', connecting: 'Connexion…', connected: 'Connecté', offline: 'Hors ligne',
    full: 'Cette session est pleine (2 max).', notConfigured: 'Serveur live non configuré.', failed: 'Connexion impossible — réessaie.',
    roster: 'Dans cette session', you: 'Toi', twin: 'Ton jumeau', waiting: 'En attente de ton jumeau…',
    live: 'Allure live', noRun: 'Aucune course active', leave: 'Quitter',
    hold: 'Maintiens pour parler', recording: 'Enregistrement… relâche pour envoyer', talking: 'parle…',
    micDenied: 'Permission micro refusée.', shareMsg: (c: string) => `Rejoins ma course Jumeau live sur Salorie ! Code : ${c}`,
    disclaimer: 'L’audio est partagé uniquement au sein de ta session et n’est pas conservé sur nos serveurs.',
  },
  ar: {
    title: 'التوأم المباشر',
    intro: 'اجرِ جنبًا إلى جنب مع صديق في الوقت الفعلي، وتحدث دون استخدام اليدين.',
    create: 'إنشاء جلسة', join: 'انضمام', codePh: 'أدخل رمزًا', share: 'مشاركة', copyHint: 'شارك هذا الرمز مع توأمك',
    invalid: 'رمز غير صالح — 8 أحرف.', connecting: 'جارٍ الاتصال…', connected: 'متصل', offline: 'غير متصل',
    full: 'هذه الجلسة ممتلئة (2 كحد أقصى).', notConfigured: 'خادم البث غير مهيأ.', failed: 'تعذّر الاتصال — حاول مجددًا.',
    roster: 'في هذه الجلسة', you: 'أنت', twin: 'توأمك', waiting: 'في انتظار انضمام توأمك…',
    live: 'الإيقاع المباشر', noRun: 'لا جري نشط', leave: 'مغادرة',
    hold: 'اضغط مطولاً للتحدث', recording: 'جارٍ التسجيل… حرّر للإرسال', talking: 'يتحدث…',
    micDenied: 'تم رفض إذن الميكروفون.', shareMsg: (c: string) => `انضم إلى جري التوأم المباشر على Salorie! الرمز: ${c}`,
    disclaimer: 'تتم مشاركة الصوت داخل جلستك فقط ولا يُخزَّن على خوادمنا.',
  },
};

// Le code de session (8 car.) est généré côté SERVEUR avec un CSPRNG, jamais côté client.
// Le code de session est généré côté SERVEUR (CSPRNG, via twin:create) — pas côté client.

// Allure paceSec (secondes/km) → "m:ss/km". 0 ⇒ tiret.
function fmtPace(paceSec: number): string {
  if (!paceSec || paceSec <= 0) return "--'--";
  const m = Math.floor(paceSec / 60);
  const s = Math.round(paceSec % 60);
  return `${m}'${String(s).padStart(2, '0')}"`;
}

const MAX_REC_MS = 20000; // auto-stop à ~20 s

export default function LiveTwinScreen() {
  const k = useTokens();
  const { user } = useUser();
  const { colors, resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';

  const GREEN = colors.primary;
  const tok = useTokens();
  const bg = tok.bg;
  const card = isDark ? colors.card : '#fff';
  const text = isDark ? '#fff' : Colors.gray900;
  const sub = isDark ? '#9BA1A6' : Colors.gray500;
  const border = isDark ? colors.gray[200] : '#e2e8f0';

  const myName = user?.firstName || user?.primaryEmailAddress?.emailAddress?.split('@')[0] || (t.you as string);

  // ── État d'appairage / connexion ──
  const [codeInput, setCodeInput] = useState('');
  const [room, setRoom] = useState<string | null>(null);
  const [conn, setConn] = useState<'idle' | 'connecting' | 'connected' | 'offline'>('idle');
  const [members, setMembers] = useState<TwinMember[]>([]);
  const [twinState, setTwinState] = useState<TwinState>({ km: 0, paceSec: 0 });
  const [speakingName, setSpeakingName] = useState<string | null>(null);

  // ── État push-to-talk ──
  const [recording, setRecording] = useState(false);
  const recRef = useRef<Audio.Recording | null>(null);
  const recStartRef = useRef(0);
  const autoStopRef = useRef<any>(null);
  const speakTimer = useRef<any>(null);
  const soundsRef = useRef<Audio.Sound[]>([]); // pour unload au démontage (pas de fuite)
  const unsubsRef = useRef<Array<() => void>>([]);

  // Halo animé pendant l'enregistrement.
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (recording) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.in(Easing.ease), useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
  }, [recording]);

  // ── Réception audio : écrit le base64 dans le cache puis joue (file si plusieurs) ──
  const playIncoming = useCallback(async (name: string, audioB64: string, mime: string) => {
    try {
      const ext = mime.includes('m4a') || mime.includes('mp4') ? 'm4a' : 'caf';
      const uri = `${FileSystem.cacheDirectory}twin_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      await FileSystem.writeAsStringAsync(uri, audioB64, { encoding: FileSystem.EncodingType.Base64 });
      const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
      soundsRef.current.push(sound);
      // Indicateur « {nom} parle… » le temps de la lecture.
      setSpeakingName(name);
      if (speakTimer.current) clearTimeout(speakTimer.current);
      sound.setOnPlaybackStatusUpdate((st: any) => {
        if (st?.didJustFinish) {
          setSpeakingName(null);
          sound.unloadAsync().catch(() => {});
          soundsRef.current = soundsRef.current.filter((s) => s !== sound);
        }
      });
      // Garde-fou si l'événement de fin ne remonte pas.
      speakTimer.current = setTimeout(() => setSpeakingName(null), MAX_REC_MS + 4000);
    } catch (e) { console.warn('[twin] play failed', e); }
  }, []);

  // ── Connexion + abonnements aux événements ──
  const enterRoom = useCallback(async (code: string) => {
    setConn('connecting');
    const s = await connectTwin();
    if (!s) { setConn('offline'); Alert.alert(t.title, t.notConfigured); return; }

    // Nettoie d'anciens abonnements avant d'en (re)poser.
    unsubsRef.current.forEach((u) => u()); unsubsRef.current = [];
    unsubsRef.current.push(
      onRoster((m) => setMembers(m)),
      onState((uid, st) => { if (uid !== getMyUid()) setTwinState(st); }),
      onAudio((msg) => playIncoming(msg.name, msg.audioB64, msg.mime)),
      onFull(() => { Alert.alert(t.title, t.full); leaveCurrent(); }),
    );
    s.on('connect', () => setConn('connected'));
    s.on('disconnect', () => setConn('offline'));
    setConn(s.connected ? 'connected' : 'connecting');

    joinTwin(code, myName);
    setRoom(code);
    // Pas de course câblée ici → on annonce un état 0 (le câblage course réelle viendra).
    sendState(code, { km: 0, paceSec: 0 });
  }, [myName, playIncoming, t]);

  // « Créer une session » : le serveur génère un code CSPRNG (twin:create) et nous y fait
  // rejoindre ; on capte le code via 'twin:created'.
  const createRoom = useCallback(async () => {
    setConn('connecting');
    const s = await connectTwin();
    if (!s) { setConn('offline'); Alert.alert(t.title, t.notConfigured); return; }
    unsubsRef.current.forEach((u) => u()); unsubsRef.current = [];
    unsubsRef.current.push(
      onRoster((m) => setMembers(m)),
      onState((uid, st) => { if (uid !== getMyUid()) setTwinState(st); }),
      onAudio((msg) => playIncoming(msg.name, msg.audioB64, msg.mime)),
      onFull(() => { Alert.alert(t.title, t.full); leaveCurrent(); }),
      onCreated((code) => { setRoom(code); sendState(code, { km: 0, paceSec: 0 }); }),
    );
    s.on('connect', () => setConn('connected'));
    s.on('disconnect', () => setConn('offline'));
    setConn(s.connected ? 'connected' : 'connecting');
    createTwin(myName);
  }, [myName, playIncoming, t]);

  const onCreate = () => createRoom();
  const onJoin = () => {
    const code = codeInput.trim().toUpperCase();
    if (code.length !== 8) { Alert.alert(t.title, t.invalid); return; }
    enterRoom(code);
  };

  const onShare = async () => {
    if (!room) return;
    try { await Share.share({ message: t.shareMsg(room) }); } catch {}
  };

  // ── Quitter la room (sans démonter l'écran) ──
  const leaveCurrent = useCallback(() => {
    if (room) leaveTwin(room);
    unsubsRef.current.forEach((u) => u()); unsubsRef.current = [];
    setRoom(null); setMembers([]); setTwinState({ km: 0, paceSec: 0 }); setSpeakingName(null); setConn('idle');
  }, [room]);

  // ── Push-to-talk : démarrer l'enregistrement ──
  const startRec = async () => {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) { Alert.alert(t.title, t.micDenied); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.LOW_QUALITY);
      recRef.current = recording;
      recStartRef.current = Date.now();
      setRecording(true);
      // Auto-stop à ~20 s.
      autoStopRef.current = setTimeout(() => { stopRec(); }, MAX_REC_MS);
    } catch (e) { console.warn('[twin] record start failed', e); setRecording(false); }
  };

  // ── Push-to-talk : arrêter, lire l'URI en base64, envoyer ──
  const stopRec = async () => {
    if (autoStopRef.current) { clearTimeout(autoStopRef.current); autoStopRef.current = null; }
    const rec = recRef.current;
    if (!rec) { setRecording(false); return; }
    recRef.current = null;
    setRecording(false);
    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      const durMs = Date.now() - recStartRef.current;
      if (uri && room && durMs > 300) {
        const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
        sendAudio(room, b64, 'audio/m4a', durMs);
      }
    } catch (e) { console.warn('[twin] record stop failed', e); }
  };

  // ── Cleanup au démontage : leave + disconnect + unload sons (pas de fuite) ──
  useEffect(() => {
    return () => {
      try { if (room) leaveTwin(room); } catch {}
      unsubsRef.current.forEach((u) => u());
      if (autoStopRef.current) clearTimeout(autoStopRef.current);
      if (speakTimer.current) clearTimeout(speakTimer.current);
      recRef.current?.stopAndUnloadAsync().catch(() => {});
      soundsRef.current.forEach((s) => s.unloadAsync().catch(() => {}));
      soundsRef.current = [];
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Partage le roster : moi vs jumeau. Identité = uid Firebase (= email sanitisé,
  // ce que le serveur estampille), PAS l'id Clerk (format différent).
  const myUid = getMyUid();
  const me = members.find((m) => m.uid === myUid) || null;
  const twin = members.find((m) => m.uid !== myUid) || null;

  // ── Rendu : APPAIRAGE (pas de room) ──
  const renderPairing = () => (
    <View style={{ gap: 18 }}>
      <View style={[styles.heroCard, { backgroundColor: card, borderColor: border }]}>
        <Radio size={30} color={GREEN} />
        <Text style={[styles.intro, { color: sub, textAlign: txtAlign(isRTL) }]}>{t.intro}</Text>
      </View>

      <PrimaryButton title={t.create} onPress={onCreate} icon={<Radio size={20} color="#fff" />} />

      <View style={[styles.joinRow, { flexDirection: rowDir(isRTL) }]}>
        <TextInput
          value={codeInput}
          onChangeText={(v) => setCodeInput(v.toUpperCase())}
          placeholder={t.codePh}
          placeholderTextColor={sub}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={8}
          style={[styles.codeInput, { backgroundColor: card, borderColor: border, color: text, textAlign: isRTL ? 'right' : 'left' }]}
        />
        <SecondaryButton title={t.join} onPress={onJoin} full={false} />
      </View>
    </View>
  );

  // ── Rendu : CONNECTÉ (room active) ──
  const renderConnected = () => {
    const online = conn === 'connected';
    return (
      <View style={{ gap: 16 }}>
        {/* Code + partage + indicateur de connexion */}
        <View style={[styles.codeCard, { backgroundColor: card, borderColor: border }]}>
          <View style={{ flexDirection: rowDir(isRTL), alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={[styles.connPill, { backgroundColor: online ? 'rgba(46,139,87,0.12)' : 'rgba(148,163,184,0.15)', flexDirection: rowDir(isRTL) }]}>
              {online ? <Wifi size={14} color={GREEN} /> : <WifiOff size={14} color={sub} />}
              <Text style={[styles.connTxt, { color: online ? GREEN : sub }]}>
                {conn === 'connecting' ? t.connecting : online ? t.connected : t.offline}
              </Text>
            </View>
            <TouchableOpacity style={[styles.leaveBtn, { flexDirection: rowDir(isRTL) }]} onPress={leaveCurrent}>
              <View style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}><LogOut size={15} color={Colors.red} /></View>
              <Text style={styles.leaveTxt}>{t.leave}</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.bigCode, { color: text }]}>{room}</Text>
          <Text style={[styles.copyHint, { color: sub, textAlign: 'center' }]}>{t.copyHint}</Text>
          <TouchableOpacity style={[styles.shareBtn, { borderColor: GREEN, flexDirection: rowDir(isRTL) }]} onPress={onShare}>
            <Share2 size={16} color={GREEN} />
            <Text style={[styles.shareTxt, { color: GREEN }]}>{t.share}</Text>
          </TouchableOpacity>
        </View>

        {/* Roster + état live du jumeau */}
        <Text style={[styles.section, { color: text, textAlign: txtAlign(isRTL) }]}>{t.roster}</Text>
        <RosterRow icon={<UserIcon size={18} color={GREEN} />} name={`${myName} · ${t.you}`} card={card} border={border} text={text} sub={sub} isRTL={isRTL}
          right={<Footprints size={16} color={sub} />} rightTxt={t.noRun} />
        {twin ? (
          <RosterRow icon={<UserIcon size={18} color={GREEN} />} name={`${twin.name} · ${t.twin}`} card={card} border={border} text={text} sub={sub} isRTL={isRTL}
            right={null}
            rightTxt={`${fmtPace(twinState.paceSec)}/km · ${twinState.km.toFixed(2)} km`} />
        ) : (
          <Text style={[styles.waiting, { color: sub, textAlign: txtAlign(isRTL) }]}>{t.waiting}</Text>
        )}

        {/* Indicateur « {nom} parle… » */}
        {speakingName && (
          <View style={[styles.speaking, { backgroundColor: 'rgba(46,139,87,0.12)', flexDirection: rowDir(isRTL) }]}>
            <Text style={[styles.speakingTxt, { color: GREEN }]}>🔊 {speakingName} {t.talking}</Text>
          </View>
        )}

        {/* PUSH-TO-TALK */}
        <View style={styles.pttWrap}>
          {recording && (
            <Animated.View
              style={[styles.halo, {
                backgroundColor: GREEN,
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }),
                transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) }],
              }]}
            />
          )}
          <TouchableOpacity
            activeOpacity={0.85}
            onPressIn={startRec}
            onPressOut={stopRec}
            disabled={!online}
            style={[styles.pttBtn, { backgroundColor: recording ? Colors.red : GREEN, opacity: online ? 1 : 0.5 }]}
          >
            <Mic size={30} color="#fff" />
            <Text style={styles.pttTxt}>{recording ? t.recording : t.hold}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack title={t.title} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {room ? renderConnected() : renderPairing()}
        {/* Disclaimer discret (type.micro, gris) — additif, trilingue via TXT. */}
        <Text style={[type.micro, styles.disclaimer, { color: sub, textAlign: txtAlign(isRTL) }]}>
          {t.disclaimer}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// Une ligne de roster (membre + son état à droite).
function RosterRow({ icon, name, right, rightTxt, card, border, text, sub, isRTL }: any) {
  return (
    <View style={[styles.rosterRow, { backgroundColor: card, borderColor: border, flexDirection: rowDir(isRTL) }]}>
      <View style={[styles.rosterLeft, { flexDirection: rowDir(isRTL) }]}>
        <View style={styles.rosterIcon}>{icon}</View>
        <Text style={[styles.rosterName, { color: text }]} numberOfLines={1}>{name}</Text>
      </View>
      <View style={[styles.rosterRight, { flexDirection: rowDir(isRTL) }]}>
        {right}
        <Text style={[styles.rosterState, { color: sub }]}>{rightTxt}</Text>
      </View>
    </View>
  );
}

// Couleurs dérivées (les palettes vivent dans constants/Colors via useTheme).
const Colors = { gray900: '#0F172A', gray500: '#64748B', red: '#EF4444' };

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 48 },
  heroCard: { borderRadius: 18, borderWidth: 1, padding: 18, alignItems: 'center', gap: 12 },
  intro: { fontSize: 14, fontWeight: '500', lineHeight: 20 },
  joinRow: { gap: 10, alignItems: 'center' },
  codeInput: { flex: 1, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 18, fontWeight: '800', letterSpacing: 3 },
  codeCard: { borderRadius: 18, borderWidth: 1, padding: 18, gap: 10 },
  connPill: { alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  connTxt: { fontSize: 12, fontWeight: '800' },
  leaveBtn: { alignItems: 'center', gap: 5, paddingHorizontal: 6, paddingVertical: 5 },
  leaveTxt: { color: '#EF4444', fontSize: 13, fontWeight: '800' },
  bigCode: { fontSize: 40, fontWeight: '900', letterSpacing: 8, textAlign: 'center', marginTop: 4 },
  copyHint: { fontSize: 12, fontWeight: '500' },
  shareBtn: { alignSelf: 'center', alignItems: 'center', gap: 8, borderWidth: 1.5, paddingHorizontal: 22, paddingVertical: 11, borderRadius: 14, marginTop: 4 },
  shareTxt: { fontSize: 14, fontWeight: '800' },
  section: { fontSize: 16, fontWeight: '900', marginTop: 4 },
  rosterRow: { alignItems: 'center', justifyContent: 'space-between', borderRadius: 14, borderWidth: 1, padding: 14 },
  rosterLeft: { alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  rosterIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(46,139,87,0.12)', alignItems: 'center', justifyContent: 'center' },
  rosterName: { fontSize: 15, fontWeight: '800', flexShrink: 1 },
  rosterRight: { alignItems: 'center', gap: 6, flexShrink: 0 },
  rosterState: { fontSize: 13, fontWeight: '700' },
  waiting: { fontSize: 13, fontWeight: '500', paddingHorizontal: 4, paddingVertical: 8 },
  speaking: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  speakingTxt: { fontSize: 14, fontWeight: '800' },
  pttWrap: { alignItems: 'center', justifyContent: 'center', marginTop: 18, height: 180 },
  halo: { position: 'absolute', width: 150, height: 150, borderRadius: 75 },
  pttBtn: { width: 150, height: 150, borderRadius: 75, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  pttTxt: { color: '#fff', fontSize: 13, fontWeight: '800', textAlign: 'center' },
  disclaimer: { marginTop: 22, lineHeight: 17, opacity: 0.9 },
});
