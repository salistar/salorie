import React, { useState, useRef, useMemo } from 'react';
import { a11y } from '../../lib/a11y';
import { useTokens, type Tokens } from '../../constants/tokens';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { Mic, Square, Check, RotateCcw } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { addNutritionLog } from '../../lib/firebase';
import { todayStr } from '../../lib/tracking';
import { parseMealFromAudio, ParsedMeal } from '../../lib/voiceMeal';
import { useTranslation } from '../../lib/i18n';
import { useTheme } from '../../lib/ThemeContext';
import { useScreenGate } from '../../components/FeatureGate';

type Phase = 'idle' | 'recording' | 'analyzing' | 'preview' | 'saved';

const TXT: any = {
  en: {
    title: 'Voice logging', sub: 'Say what you ate (e.g. "a bowl of chicken couscous and an orange") — AI transcribes and estimates calories.',
    mic_perm: 'Microphone permission denied.', mic_err: 'Microphone error', no_audio: 'No audio', not_understood: "I didn't catch any food. Try again speaking clearly.", analysis_err: 'Analysis error',
    alert_err: 'Error', save_fail: 'Saving failed',
    recording: 'Recording… tap to stop', analyzing: 'Analyzing…', tap_to_talk: 'Tap to talk',
    protein: 'Protein', carbs: 'Carbs', fat: 'Fat',
    retry: 'Retry', add: 'Add',
    added_b: 'added', kcal: 'kcal', log_another: 'Log another meal',
  },
  fr: {
    title: 'Logging vocal', sub: "Dis ce que tu as mangé (ex: « un bol de couscous au poulet et une orange ») — l'IA transcrit et estime les calories.",
    mic_perm: 'Permission micro refusée.', mic_err: 'Erreur micro', no_audio: "Pas d'audio", not_understood: "Je n'ai pas compris d'aliment. Réessaie en parlant clairement.", analysis_err: "Erreur d'analyse",
    alert_err: 'Erreur', save_fail: "Échec de l'enregistrement",
    recording: 'Enregistrement… appuie pour arrêter', analyzing: 'Analyse en cours…', tap_to_talk: 'Appuie pour parler',
    protein: 'Protéines', carbs: 'Glucides', fat: 'Lipides',
    retry: 'Refaire', add: 'Ajouter',
    added_b: 'ajouté', kcal: 'kcal', log_another: 'Logger un autre repas',
  },
  ar: {
    title: 'تسجيل صوتي', sub: 'قل ما أكلته (مثلاً: «طبق كسكس بالدجاج وبرتقالة») — الذكاء الاصطناعي ينسخ ويقدّر السعرات.',
    mic_perm: 'تم رفض إذن الميكروفون.', mic_err: 'خطأ في الميكروفون', no_audio: 'لا يوجد صوت', not_understood: 'لم أفهم أي طعام. أعد المحاولة بصوت واضح.', analysis_err: 'خطأ في التحليل',
    alert_err: 'خطأ', save_fail: 'فشل الحفظ',
    recording: 'جارٍ التسجيل… اضغط للإيقاف', analyzing: 'جارٍ التحليل…', tap_to_talk: 'اضغط للتحدث',
    protein: 'بروتين', carbs: 'كربوهيدرات', fat: 'دهون',
    retry: 'إعادة', add: 'أضف',
    added_b: 'أُضيف', kcal: 'سعرة', log_another: 'سجّل وجبة أخرى',
  },
};

export default function VoiceLog() {
  const k = useTokens();
  const s = useMemo(() => makeS(k), [k]);
  const { user } = useUser();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  // Accent thémé : k.accent est le vert CLAIR ; en sombre on utilise le token
  // dark officiel (contraste correct sur fond sombre).
  // L'accent vient du theme : le couple clair/sombre fige
  // n'ouvrait que deux des six palettes.
  const accent = k.accent;
  const tok = useTokens();
  const bg = tok.bg;
  const cardBg = tok.surface;
  const text = tok.text;
  const sub = tok.textMuted;
  const align: any = { textAlign: isRTL ? 'right' : 'left' };

  const email = user?.primaryEmailAddress?.emailAddress || '';
  const [phase, setPhase] = useState<Phase>('idle');
  const [meal, setMeal] = useState<ParsedMeal | null>(null);
  const [err, setErr] = useState('');
  const recRef = useRef<Audio.Recording | null>(null);

  const __gate = useScreenGate('voice-log');

  const start = async () => {
    setErr('');
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) { setErr(t.mic_perm); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recRef.current = recording;
      setPhase('recording');
    } catch (e: any) { setErr(e?.message || t.mic_err); }
  };

  const stop = async () => {
    const rec = recRef.current;
    if (!rec) return;
    setPhase('analyzing');
    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      recRef.current = null;
      if (!uri) throw new Error(t.no_audio);
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const parsed = await parseMealFromAudio(base64, 'audio/mp4');
      if (!parsed || !parsed.name) { setErr(t.not_understood); setPhase('idle'); return; }
      setMeal(parsed);
      setPhase('preview');
    } catch (e: any) { setErr(e?.message || t.analysis_err); setPhase('idle'); }
  };

  const save = async () => {
    if (!meal || !email) return;
    try {
      await addNutritionLog({
        userId: email, type: 'meal', name: meal.name,
        calories: meal.calories, protein: meal.protein, carbs: meal.carbs, fat: meal.fat,
        date: todayStr(),
      } as any);
      setPhase('saved');
    } catch (e: any) { Alert.alert(t.alert_err, e?.message || t.save_fail); }
  };

  const reset = () => { setMeal(null); setErr(''); setPhase('idle'); };

  if (!__gate.ok) return __gate.node;

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[s.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={s.body}>
        <View style={s.head}><Mic size={26} color={accent} /><Text style={[s.title, { color: text }]}>{t.title}</Text></View>
        <Text style={[s.sub, { color: sub }, align]}>{t.sub}</Text>

        {(phase === 'idle' || phase === 'recording' || phase === 'analyzing') && (
          <View style={s.micWrap}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('arreter')}
              style={[s.micBtn, phase === 'recording' && s.micBtnRec]}
              onPress={phase === 'recording' ? stop : start}
              disabled={phase === 'analyzing'}
            >
              {phase === 'analyzing' ? <ActivityIndicator color={k.onAccent} size="large" />
                : phase === 'recording' ? <Square size={42} color={k.onAccent} fill={k.surface} />
                : <Mic size={48} color={k.onAccent} />}
            </TouchableOpacity>
            <Text style={[s.micLabel, { color: sub }]}>
              {phase === 'recording' ? t.recording
                : phase === 'analyzing' ? t.analyzing
                : t.tap_to_talk}
            </Text>
          </View>
        )}

        {!!err && <Text style={s.err}>{err}</Text>}

        {phase === 'preview' && meal && (
          <View style={[s.card, { backgroundColor: cardBg }, isDark && { borderColor: k.borderStrong }]}>
            <Text style={[s.mealName, { color: text }]}>{meal.name}</Text>
            <Text style={s.kcal}>{meal.calories} kcal</Text>
            <View style={s.macros}>
              <View style={s.macro}><Text style={[s.mVal, { color: text }]}>{meal.protein}g</Text><Text style={s.mLbl}>{t.protein}</Text></View>
              <View style={s.macro}><Text style={[s.mVal, { color: text }]}>{meal.carbs}g</Text><Text style={s.mLbl}>{t.carbs}</Text></View>
              <View style={s.macro}><Text style={[s.mVal, { color: text }]}>{meal.fat}g</Text><Text style={s.mLbl}>{t.fat}</Text></View>
            </View>
            <View style={s.actions}>
              <TouchableOpacity style={s.retry} onPress={reset}><RotateCcw size={15} color={accent} /><Text style={s.retryTxt} numberOfLines={1}>{t.retry}</Text></TouchableOpacity>
              <TouchableOpacity style={s.add} onPress={save}><Check size={17} color={k.onAccent} /><Text style={s.addTxt} numberOfLines={1}>{t.add}</Text></TouchableOpacity>
            </View>
          </View>
        )}

        {phase === 'saved' && meal && (
          <View style={[s.card, { backgroundColor: cardBg }, isDark && { borderColor: k.borderStrong }]}>
            <Check size={40} color={accent} style={{ alignSelf: 'center' }} />
            <Text style={[s.savedTxt, { color: text }]}>« {meal.name} » {t.added_b} ({meal.calories} {t.kcal}) ✅</Text>
            <TouchableOpacity style={s.add} onPress={reset}><Mic size={18} color={k.onAccent} /><Text style={s.addTxt}>{t.log_another}</Text></TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// Fabrique themee : cette feuille lisait des jetons alors qu elle etait
// evaluee UNE FOIS a l importation.
const makeS = (k: Tokens) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: k.surfaceSunken },
  body: { padding: 18, paddingBottom: 90 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  title: { fontSize: 26, fontWeight: '800', color: k.text },
  sub: { fontSize: 13, color: k.textMuted, marginTop: 6, lineHeight: 19 },
  micWrap: { alignItems: 'center', marginTop: 50 },
  micBtn: { width: 130, height: 130, borderRadius: 65, backgroundColor: k.accent, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: k.accent, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  micBtnRec: { backgroundColor: k.danger },
  micLabel: { marginTop: 20, fontSize: 14, color: k.textMuted, fontWeight: '600' },
  err: { color: k.danger, fontSize: 13, marginTop: 18, textAlign: 'center' },
  card: { backgroundColor: k.surface, borderRadius: 20, padding: 22, marginTop: 28, borderWidth: 1, borderColor: k.border },
  mealName: { fontSize: 20, fontWeight: '800', color: k.text, textAlign: 'center' },
  kcal: { fontSize: 40, fontWeight: '900', color: k.accent, textAlign: 'center', marginTop: 4 },
  macros: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 18 },
  macro: { alignItems: 'center' },
  mVal: { fontSize: 18, fontWeight: '800', color: k.text },
  mLbl: { fontSize: 11, color: k.textFaint, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 22 },
  retry: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, flex: 1, paddingVertical: 14, paddingHorizontal: 8, borderRadius: 14, borderWidth: 1.5, borderColor: k.accent },
  retryTxt: { color: k.accent, fontWeight: '700', fontSize: 14.5, flexShrink: 1 },
  add: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, flex: 1, paddingVertical: 14, paddingHorizontal: 8, borderRadius: 14, backgroundColor: k.accent },
  addTxt: { color: k.onAccent, fontWeight: '800', fontSize: 14.5, flexShrink: 1 },
  savedTxt: { fontSize: 16, fontWeight: '700', color: k.text, textAlign: 'center', marginVertical: 16 },
});
