// Coach IA CONTEXTUEL — utilise le proxy /ai (Gemini serveur) en lui passant le
// contexte réel de l'utilisateur (objectif, calories/macros du jour, tendance poids).
// Conseils auto au chargement + question libre. 100% via backend (clé Gemini serveur).
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { a11y } from '../../lib/a11y';
import { useTokens, type Tokens } from '../../constants/tokens';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Sparkles, Send, RefreshCw, Volume2, VolumeX, Mic, Square, Flag } from 'lucide-react-native';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import ScreenTopBar from '../../components/ScreenTopBar';
import ModerationSheet from '../../components/ModerationSheet';
import { useScreenGate } from '../../components/FeatureGate';
import { aiGenerate, aiTranscribe } from '../../lib/aiProxy';
import { useNutritionData } from '../../hooks/useNutritionData';
import { auth } from '../../lib/firebaseAuth';
import { getUserFromFirestore, fetchAllUserData } from '../../lib/firebase';
import { mlWeightForecast } from '../../lib/mlApi';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { rowDir } from '../../lib/rtl';

const TXT: any = {
  en: {
    greeting: "Hi 👋 I'm your AI coach. Ask me a question, or check your personalized tips for today right below.",
    title: 'AI Coach',
    placeholder: 'Ask your coach a question…',
    unavailable: 'Coach unavailable',
    error: 'error',
    replyLang: 'Réponds en anglais',
  },
  fr: {
    greeting: 'Salut 👋 Je suis ton coach IA. Pose-moi une question, ou regarde tes conseils personnalisés du jour juste en dessous.',
    title: 'Coach IA',
    placeholder: 'Pose une question à ton coach…',
    unavailable: 'Coach indisponible',
    error: 'erreur',
    replyLang: 'Réponds en français',
  },
  ar: {
    greeting: 'مرحباً 👋 أنا مدربك الذكي. اطرح عليّ سؤالاً، أو اطّلع على نصائحك المخصصة لليوم في الأسفل.',
    title: 'المدرب الذكي',
    placeholder: 'اطرح سؤالاً على مدربك…',
    unavailable: 'المدرب غير متاح',
    error: 'خطأ',
    replyLang: 'Réponds en arabe',
  },
};

// Personas du coach : ton/caractère injecté dans le prompt. En arabe, le coach répond
// en DARIJA marocaine (pas arabe standard) avec une persona culturelle.
const PERSONAS = [
  {
    id: 'motiv',
    label: { en: 'Motivating', fr: 'Motivant', ar: 'محفّز' },
    p: {
      en: 'an energetic, motivating coach who hypes the user up',
      fr: "un coach énergique et motivant qui booste l'utilisateur",
      ar: 'مدرب نشيط ومحفّز كيشجّع المستعمل بزّاف بالدارجة المغربية',
    },
  },
  {
    id: 'zen',
    label: { en: 'Gentle', fr: 'Bienveillant', ar: 'لطيف' },
    p: {
      en: 'a gentle, caring and reassuring coach',
      fr: 'un coach doux, bienveillant et rassurant',
      ar: 'مدرب لطيف وحنين كيطمّن المستعمل بالدارجة المغربية',
    },
  },
  {
    id: 'pro',
    label: { en: 'Technical', fr: 'Technique', ar: 'تقني' },
    p: {
      en: 'a precise, science-based performance coach',
      fr: 'un coach technique, précis et basé sur la science',
      ar: 'مدرب تقني ودقيق مبني على العلم بالدارجة المغربية',
    },
  },
];

type Msg = { role: 'coach' | 'user'; text: string };

const T_A11Y: Record<string, { lire: string; signaler: string }> = {
  fr: { lire: 'Lire la reponse a voix haute', signaler: 'Signaler cette reponse' },
  en: { lire: 'Read the answer aloud', signaler: 'Report this answer' },
  ar: { lire: 'قراءة الإجابة بصوت عالٍ', signaler: 'الإبلاغ عن هذه الإجابة' },
};

// Contexte COMPLET : le coach lit TOUTES les données du user (profil, objectif,
// historique de poids, historique des repas/macros, tendance) — pas seulement le jour.
async function buildContext(goals: any, consumed: any): Promise<string> {
  let goal = 'maintien', forecast = '', history = '';
  try {
    const email = auth.currentUser?.email || (auth.currentUser as any)?.uid || '';
    const all: any = email ? await fetchAllUserData(email).catch(() => null) : null;
    const p: any = all?.profile || (email ? await getUserFromFirestore(email).catch(() => null) : null);
    if (p?.goal) goal = p.goal;
    if (p?.weight) history += `Poids actuel: ${p.weight} kg. `;
    if (p?.height) history += `Taille: ${p.height} cm. `;

    const wh: any[] = Array.isArray(all?.weightHistory) ? all.weightHistory : [];
    const ws = wh.map((w) => Number(w?.weight)).filter((n) => isFinite(n) && n > 0);
    if (ws.length) history += `Pesées: ${ws.length} (de ${ws[ws.length - 1]} à ${ws[0]} kg). `;

    const logs: any[] = Array.isArray(all?.logs) ? all.logs : [];
    const meals = logs.filter((l) => l?.type === 'meal');
    if (meals.length) {
      const days = new Set(meals.map((m) => String(m.date || '').slice(0, 10))).size || 1;
      const totalKcal = meals.reduce((s, m) => s + (Number(m.calories) || 0), 0);
      const totalProt = meals.reduce((s, m) => s + (Number(m.protein) || 0), 0);
      history += `Historique repas: ${meals.length} repas sur ~${days} j (moy. ${Math.round(totalKcal / days)} kcal/j, ${Math.round(totalProt / days)} g prot/j). `;
      const names = meals.slice(0, 8).map((m) => m.name).filter(Boolean);
      if (names.length) history += `Repas récents: ${names.join(', ')}. `;
    }
    const acts = logs.filter((l) => l?.type === 'activity');
    if (acts.length) history += `${acts.length} séances loggées. `;

    const wf = await mlWeightForecast().catch(() => null);
    if (wf?.ok) forecast = `Tendance: ${wf.trendKgPerWeek} kg/sem${wf.plateau ? ' (plateau)' : ''}.`;
  } catch {}
  return [
    `Objectif: ${goal}.`,
    `Aujourd'hui: ${Math.round(consumed.calories)}/${goals.calories} kcal, ${Math.round(consumed.protein)}/${goals.protein} g protéines, ${Math.round((consumed.water || 0) / 1000 * 10) / 10}/${(goals.water / 1000)} L eau.`,
    history, forecast,
  ].filter(Boolean).join(' ');
}

export default function AiCoachScreen() {
  const k = useTokens();
  const styles = useMemo(() => makeStyles(k), [k]);
  const __gate = useScreenGate('ai-coach');
  const data: any = useNutritionData(new Date().toISOString().split('T')[0]);
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
  const align: any = { textAlign: isRTL ? 'right' : 'left' };

  const [msgs, setMsgs] = useState<Msg[]>([
    { role: 'coach', text: t.greeting },
  ]);
  // Signalement d'une reponse du coach (politique Play sur le contenu genere par IA).
  // On memorise le TEXTE et non l'index : le fil peut defiler ou se reinitialiser
  // pendant que la feuille est ouverte, et l'index ne designerait plus rien.
  const [signale, setSignale] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [personaId, setPersonaId] = useState('motiv');
  const personaRef = useRef('motiv'); // lu dans ask() pour éviter la stale-closure
  const changePersona = (id: string) => { setPersonaId(id); personaRef.current = id; ask('', true); };
  const scroll = useRef<ScrollView>(null);
  const [voice, setVoice] = useState(false);
  const voiceRef = useRef(false);
  const toggleVoice = () => { const n = !voice; setVoice(n); voiceRef.current = n; if (!n) Speech.stop(); };
  const [recording, setRecording] = useState(false);
  const recRef = useRef<Audio.Recording | null>(null);

  // (C) Écouter un message précis à la demande (TTS, langue de l'app).
  const speakMsg = (txt: string) => {
    Speech.stop();
    Speech.speak(txt, { language: language === 'ar' ? 'ar' : language === 'en' ? 'en-US' : 'fr-FR' });
  };

  const ask = async (question: string, isAuto = false) => {
    if (loading) return;
    setLoading(true);
    if (!isAuto) setMsgs((m) => [...m, { role: 'user', text: question }]);
    try {
      const ctx = await buildContext(data?.goals || {}, data?.consumed || {});
      const persona = PERSONAS.find((p) => p.id === personaRef.current) || PERSONAS[0];
      const tone = (persona.p as any)[language] || persona.p.en;
      const langInstr = language === 'ar'
        ? 'Réponds en DARIJA MAROCAINE (arabe dialectal du Maroc, en lettres arabes) — surtout PAS en arabe standard. Tiens compte du contexte marocain (plats locaux, halal, Ramadan le cas échéant).'
        : language === 'fr' ? 'Réponds en français.' : 'Reply in English.';
      const prompt = isAuto
        ? `Tu es ${tone}, coach nutrition & sport. Contexte de l'utilisateur: ${ctx} Donne 3 conseils personnalisés, courts et actionnables pour aujourd'hui. ${langInstr} Format liste à puces.`
        : `Tu es ${tone}, coach nutrition & sport. Contexte: ${ctx} Question de l'utilisateur: "${question}". ${langInstr} Court et actionnable.`;
      const text = await aiGenerate(prompt);
      setMsgs((m) => [...m, { role: 'coach', text: text.trim() }]);
      if (voiceRef.current) Speech.speak(text.trim(), { language: language === 'ar' ? 'ar-SA' : language === 'en' ? 'en-US' : 'fr-FR' }); // coach vocal
    } catch (e: any) {
      setMsgs((m) => [...m, { role: 'coach', text: `${t.unavailable} (${e?.message || t.error}).` }]);
    } finally {
      setLoading(false);
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  useEffect(() => { ask('', true); }, []); // conseils contextuels auto

  const send = () => { const t2 = q.trim(); if (!t2) return; setQ(''); ask(t2); };

  // (D) Bouton micro : enregistre, transcrit (FR/EN/AR/darija, auto-détection
  // côté whisper/backend) puis envoie le texte comme question au coach.
  const startRec = async () => {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) return;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: rec } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recRef.current = rec;
      setRecording(true);
    } catch {}
  };
  const stopRec = async () => {
    const rec = recRef.current;
    if (!rec) { setRecording(false); return; }
    setRecording(false);
    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      recRef.current = null;
      if (!uri) return;
      setLoading(true);
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' as any });
      const transcript = (await aiTranscribe(base64, 'audio/mp4')).trim();
      setLoading(false);
      if (transcript) ask(transcript);
    } catch { setLoading(false); }
  };
  const micPress = () => (recording ? stopRec() : startRec());

  if (!__gate.ok) return __gate.node;

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showBrand showNotif={false} />
      <View style={[styles.head, { flexDirection: rowDir(isRTL) }]}>
        <Sparkles size={22} color={GREEN} />
        <Text style={[styles.title, { color: text }, align]}>{t.title}</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('lire')} onPress={toggleVoice} style={isRTL ? { marginRight: 'auto' } : { marginLeft: 'auto' }} hitSlop={10}>
          {voice ? <Volume2 size={20} color={GREEN} /> : <VolumeX size={20} color={sub} />}
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('rafraichir')} onPress={() => ask('', true)} style={isRTL ? { marginRight: 14 } : { marginLeft: 14 }} hitSlop={10}><RefreshCw size={18} color={sub} /></TouchableOpacity>
      </View>
      <View style={[styles.personaRow, { flexDirection: rowDir(isRTL) }]}>
        {PERSONAS.map((p) => {
          const on = personaId === p.id;
          return (
            <TouchableOpacity key={p.id} onPress={() => changePersona(p.id)} disabled={loading}
              style={[styles.personaChip, { backgroundColor: on ? GREEN : (isDark ? '#1e293b' : k.surfaceSunken) }, loading && { opacity: 0.6 }]}>
              <Text style={[styles.personaTxt, { color: on ? k.onAccent : (isDark ? k.textFaint : k.textMuted) }]}>{(p.label as any)[language] || p.label.en}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <ScrollView ref={scroll} contentContainerStyle={styles.body}>
        {msgs.map((m, i) => (
          <View key={i} style={[styles.bubble, m.role === 'user' ? [styles.user, { backgroundColor: GREEN }] : [styles.coach, { backgroundColor: card, borderColor: k.border }]]}>
            <Text style={[styles.bubbleTxt, { color: text }, align, m.role === 'user' && { color: k.onAccent }]}>{m.text}</Text>
            {m.role === 'coach' && (
              <View style={[styles.msgActions, { flexDirection: rowDir(isRTL), alignSelf: isRTL ? 'flex-end' : 'flex-start' }]}>
                <TouchableOpacity onPress={() => speakMsg(m.text)} style={styles.speakBtn} hitSlop={8}
                  accessibilityRole="button" accessibilityLabel={T_A11Y[String(language)]?.lire || T_A11Y.fr.lire}>
                  <Volume2 size={15} color={GREEN} />
                </TouchableOpacity>
                {/* Politique Google Play sur le contenu genere par IA : une reponse
                    de modele doit pouvoir etre signalee. Discret — c'est un recours,
                    pas une invitation. */}
                <TouchableOpacity onPress={() => setSignale(m.text)} style={styles.speakBtn} hitSlop={8}
                  accessibilityRole="button" accessibilityLabel={T_A11Y[String(language)]?.signaler || T_A11Y.fr.signaler}>
                  <Flag size={14} color={sub} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))}
        {loading && <View style={[styles.bubble, styles.coach, { backgroundColor: card, borderColor: k.border }]}><ActivityIndicator color={GREEN} /></View>}
      </ScrollView>
      <View style={[styles.inputRow, { flexDirection: rowDir(isRTL), backgroundColor: card, borderTopColor: k.border }]}>
        <TextInput
          style={[styles.input, { backgroundColor: k.surface, color: text, borderWidth: 1.5, borderColor: k.border }, align]}
          placeholder={t.placeholder}
          placeholderTextColor={sub}
          value={q}
          onChangeText={setQ}
          onSubmitEditing={send}
          returnKeyType="send"
        />
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('arreter')} style={[styles.micBtn, recording && { backgroundColor: k.danger }]} onPress={micPress} disabled={loading && !recording}>
          {recording ? <Square size={18} color={k.onAccent} /> : <Mic size={20} color={k.onAccent} />}
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('envoyer')} style={[styles.sendBtn, { backgroundColor: GREEN }]} onPress={send} disabled={loading}><Send size={20} color={k.onAccent} /></TouchableOpacity>
      </View>
    {/* Signalement d'une reponse du coach — exigence de la politique Google Play
        sur le contenu genere par IA. Aucun proprietaire n'est passe : on ne
        bloque pas un modele, et la feuille masque alors l'option d'elle-meme.
        Le TEXTE incrimine part avec le signalement, sans quoi l'equipe n'aurait
        rien a relire pour juger. */}
    <ModerationSheet
      visible={!!signale}
      onClose={() => setSignale(null)}
      targetType="ai"
      targetId={`coach_${String(signale || '').length}_${String(signale || '').slice(0, 24)}`}
      reporterEmail={auth.currentUser?.email || ''}
      note={String(signale || '').slice(0, 1000)}
      onReported={() => setSignale(null)}
    />
    </SafeAreaView>
  );
}

// Fabrique thémée : ce StyleSheet lisait des jetons alors qu'il était
// évalué UNE FOIS à l'importation, avant que le thème n'existe. Les
// couleurs y étaient donc figées sur la palette par défaut, à vie.
const makeStyles = (k: Tokens) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: k.surfaceSunken },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 8 },
  title: { fontSize: 22, fontWeight: '800', color: k.text },
  body: { padding: 16, gap: 10 },
  bubble: { maxWidth: '88%', borderRadius: 16, padding: 13 },
  coach: { backgroundColor: k.surface, alignSelf: 'flex-start', borderWidth: 1, borderColor: k.border },
  user: { alignSelf: 'flex-end' },
  bubbleTxt: { fontSize: 14, lineHeight: 20, color: k.text },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderTopWidth: 1, borderTopColor: k.border, backgroundColor: k.surface },
  input: { flex: 1, backgroundColor: k.surfaceSunken, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14 },
  sendBtn: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  micBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: k.info, alignItems: 'center', justifyContent: 'center' },
  speakBtn: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  msgActions: { alignItems: 'center', gap: 14 },
  personaRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 8, flexWrap: 'wrap' },
  personaChip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 11 },
  personaTxt: { fontWeight: '700', fontSize: 13 },
});
