// Comptage de répétitions ON-DEVICE via l'accéléromètre (expo-sensors).
// Modèle = détection de pics sur la magnitude d'accélération (machine à états
// haut/bas + anti-rebond temporel). 100% local, hors-ligne, aucune caméra.
import React, { useEffect, useRef, useState } from 'react';
import { useTokens } from '../../constants/tokens';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Accelerometer } from 'expo-sensors';
import { Play, Pause, RotateCcw, Activity } from 'lucide-react-native';
import { router } from 'expo-router';
import ScreenTopBar from '../../components/ScreenTopBar';
import { useTranslation } from '../../lib/i18n';
import { useTheme } from '../../lib/ThemeContext';
import { useScreenGate } from '../../components/FeatureGate';

const GREEN = '#2E8B57';
// Seuils (en g). Un rep = la magnitude passe au-dessus de HIGH puis revient sous LOW.
const HIGH = 1.28;
const LOW = 0.82;
const MIN_REP_MS = 350; // anti-rebond

const TXT: any = {
  en: {
    title: 'Rep counter', sub: 'Hold your phone (armband / pocket) during the exercise. On-device detection.', reps: 'reps', running: '· running', stopped: '· stopped', reset: 'Reset', pause: 'Pause', start: 'Start', note: 'Model: acceleration peaks (state machine + debounce). Great for squats, curls, push-ups.',
    howTitle: 'How to use',
    howIntro: 'The counter uses your phone\'s motion sensor (accelerometer) to detect each repetition. No camera, fully offline.',
    step1Title: '1. Position your phone',
    step1Body: 'Strap it to your arm, hold it firmly, or put it in a pocket that moves with your body during the exercise. The phone must move with each rep.',
    step2Title: '2. Press Start',
    step2Body: 'Tap Start, then begin your movement. The counter starts listening to motion immediately.',
    step3Title: '3. Do your reps',
    step3Body: 'Each full repetition creates an up-and-down spike in acceleration. When the motion rises above a peak and comes back down, one rep is counted. A short delay between reps avoids double-counting.',
    step4Title: '4. Pause or Reset',
    step4Body: 'Press Pause to stop counting (the number is kept). Press Reset to set the count back to zero.',
    readTitle: 'Reading the numbers',
    readBig: 'The big green number = total reps counted.',
    readMag: 'The "g" value = current acceleration force. It rises while you move and sits near 1.00 g when still. "running / stopped" shows if detection is active.',
  },
  fr: {
    title: 'Compteur de répétitions', sub: "Tiens ton téléphone (brassard / poche) pendant l'exercice. Détection on-device.", reps: 'reps', running: '· en cours', stopped: '· arrêté', reset: 'Reset', pause: 'Pause', start: 'Démarrer', note: "Modèle : pics d'accélération (machine à états + anti-rebond). Idéal pour squats, curls, pompes.",
    howTitle: 'Comment utiliser',
    howIntro: "Le compteur utilise le capteur de mouvement (accéléromètre) de ton téléphone pour détecter chaque répétition. Aucune caméra, 100% hors-ligne.",
    step1Title: '1. Place ton téléphone',
    step1Body: "Attache-le à ton bras, tiens-le fermement, ou mets-le dans une poche qui bouge avec ton corps pendant l'exercice. Le téléphone doit bouger à chaque répétition.",
    step2Title: '2. Appuie sur Démarrer',
    step2Body: 'Touche Démarrer, puis commence ton mouvement. Le compteur écoute le mouvement immédiatement.',
    step3Title: '3. Fais tes répétitions',
    step3Body: "Chaque répétition complète crée un pic d'accélération vers le haut puis le bas. Quand le mouvement dépasse un seuil puis redescend, une répétition est comptée. Un court délai entre les répétitions évite le double comptage.",
    step4Title: '4. Pause ou Reset',
    step4Body: 'Appuie sur Pause pour arrêter le comptage (le nombre est conservé). Appuie sur Reset pour remettre le compteur à zéro.',
    readTitle: 'Lire les chiffres',
    readBig: 'Le grand nombre vert = total des répétitions comptées.',
    readMag: 'La valeur en « g » = force d\'accélération actuelle. Elle monte quand tu bouges et reste près de 1,00 g à l\'arrêt. « en cours / arrêté » indique si la détection est active.',
  },
  ar: {
    title: 'عدّاد التكرارات', sub: 'أمسك هاتفك (حزام الذراع / الجيب) أثناء التمرين. كشف على الجهاز.', reps: 'تكرار', running: '· جارٍ', stopped: '· متوقف', reset: 'تصفير', pause: 'إيقاف', start: 'ابدأ', note: 'النموذج: قمم التسارع (آلة حالات + مانع ارتداد). مثالي للسكوات والضغط.',
    howTitle: 'كيفية الاستخدام',
    howIntro: 'يستخدم العدّاد مستشعر الحركة (مقياس التسارع) في هاتفك لاكتشاف كل تكرار. بدون كاميرا، يعمل دون اتصال بالكامل.',
    step1Title: '1. ضع هاتفك',
    step1Body: 'اربطه على ذراعك، أو أمسكه بإحكام، أو ضعه في جيب يتحرك مع جسمك أثناء التمرين. يجب أن يتحرك الهاتف مع كل تكرار.',
    step2Title: '2. اضغط ابدأ',
    step2Body: 'اضغط ابدأ ثم ابدأ حركتك. يبدأ العدّاد في الاستماع للحركة فوراً.',
    step3Title: '3. قم بتكراراتك',
    step3Body: 'كل تكرار كامل ينشئ قمة تسارع صعوداً ثم هبوطاً. عندما تتجاوز الحركة عتبة معينة ثم تنخفض، يُحتسب تكرار واحد. تأخير قصير بين التكرارات يمنع العدّ المزدوج.',
    step4Title: '4. إيقاف أو تصفير',
    step4Body: 'اضغط إيقاف لوقف العدّ (يُحفظ الرقم). اضغط تصفير لإعادة العدّاد إلى الصفر.',
    readTitle: 'قراءة الأرقام',
    readBig: 'الرقم الأخضر الكبير = إجمالي التكرارات المحتسبة.',
    readMag: 'قيمة «g» = قوة التسارع الحالية. ترتفع عند الحركة وتبقى قرب 1.00 g عند السكون. «جارٍ / متوقف» يبيّن ما إذا كان الكشف نشطاً.',
  },
};

export default function RepCounterScreen() {
  const k = useTokens();
  const __gate = useScreenGate('rep-counter');
  const { language } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  // Accent thémé : GREEN est le vert CLAIR ; en sombre on utilise le token
  // dark officiel (contraste correct sur fond sombre).
  const accent = isDark ? '#4ade80' : GREEN;
  const tok = useTokens();
  const bg = tok.bg;
  const text = tok.text;
  const sub = tok.textMuted;

  const [running, setRunning] = useState(false);
  const [reps, setReps] = useState(0);
  const [mag, setMag] = useState(1);
  const phase = useRef<'idle' | 'peak'>('idle');
  const lastRepTs = useRef(0);
  const subRef = useRef<any>(null);
  const startTs = useRef(0);

  const stop = () => {
    subRef.current?.remove?.();
    subRef.current = null;
    setRunning(false);
  };

  const start = () => {
    phase.current = 'idle';
    startTs.current = Date.now();
    Accelerometer.setUpdateInterval(50); // 20 Hz
    subRef.current = Accelerometer.addListener(({ x, y, z }) => {
      const m = Math.sqrt(x * x + y * y + z * z);
      setMag(m);
      const now = Date.now();
      if (phase.current === 'idle' && m > HIGH) {
        phase.current = 'peak';
      } else if (phase.current === 'peak' && m < LOW) {
        if (now - lastRepTs.current > MIN_REP_MS) {
          lastRepTs.current = now;
          setReps((r) => r + 1);
        }
        phase.current = 'idle';
      }
    });
    setRunning(true);
  };

  useEffect(() => () => stop(), []);

  const reset = () => { stop(); setReps(0); phase.current = 'idle'; };

  if (!__gate.ok) return __gate.node;

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.title, { color: text }]}>{t.title}</Text>
        <Text style={[styles.sub, { color: sub }]}>{t.sub}</Text>

        <View style={styles.counterWrap}>
          <Text style={styles.count}>{reps}</Text>
          <Text style={[styles.countLabel, { color: sub }]}>{t.reps}</Text>
        </View>

        <View style={styles.magRow}>
          <Activity size={16} color={running ? accent : '#CBD5E1'} />
          <Text style={[styles.magTxt, { color: sub }]}>{mag.toFixed(2)} g {running ? t.running : t.stopped}</Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={[styles.btn, styles.secondary, isDark && { backgroundColor: '#334155' }]} onPress={reset}>
            <RotateCcw size={20} color={isDark ? '#cbd5e1' : '#475569'} />
            <Text style={[styles.btnTxtDark, isDark && { color: '#cbd5e1' }]}>{t.reset}</Text>
          </TouchableOpacity>
          {running ? (
            <TouchableOpacity style={[styles.btn, styles.primary]} onPress={stop}>
              <Pause size={20} color="#fff" />
              <Text style={styles.btnTxt}>{t.pause}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.btn, styles.primary]} onPress={start}>
              <Play size={20} color="#fff" />
              <Text style={styles.btnTxt}>{t.start}</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={[styles.note, { color: sub }]}>{t.note}</Text>

        <View style={[styles.howCard, { backgroundColor: k.surface, borderColor: k.border }]}>
          <Text style={[styles.howTitle, { color: accent }]}>{t.howTitle}</Text>
          <Text style={[styles.howIntro, { color: sub }]}>{t.howIntro}</Text>

          {[
            [t.step1Title, t.step1Body],
            [t.step2Title, t.step2Body],
            [t.step3Title, t.step3Body],
            [t.step4Title, t.step4Body],
          ].map(([h, b], i) => (
            <View key={i} style={styles.howStep}>
              <Text style={[styles.howStepTitle, { color: text }]}>{h}</Text>
              <Text style={[styles.howStepBody, { color: sub }]}>{b}</Text>
            </View>
          ))}

          <View style={[styles.howSep, { backgroundColor: k.surfaceSunken }]} />
          <Text style={[styles.howStepTitle, { color: text }]}>{t.readTitle}</Text>
          <Text style={[styles.howStepBody, { color: sub }]}>{t.readBig}</Text>
          <Text style={[styles.howStepBody, { color: sub }]}>{t.readMag}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  body: { padding: 24, alignItems: 'center', paddingBottom: 60 },
  title: { fontSize: 22, fontWeight: '800', color: '#0F172A', marginTop: 8 },
  sub: { fontSize: 13, color: '#64748B', textAlign: 'center', marginTop: 8 },
  counterWrap: { marginTop: 48, alignItems: 'center' },
  count: { fontSize: 96, fontWeight: '900', color: GREEN, lineHeight: 100 },
  countLabel: { fontSize: 16, color: '#94A3B8', marginTop: -6 },
  magRow: { flexDirection: 'row', alignItems: 'center', marginTop: 24 },
  magTxt: { fontSize: 13, color: '#64748B', marginStart: 6 },
  actions: { flexDirection: 'row', gap: 14, marginTop: 48 },
  btn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 26, borderRadius: 16, gap: 8 },
  primary: { backgroundColor: GREEN },
  secondary: { backgroundColor: '#E2E8F0' },
  btnTxt: { color: '#fff', fontWeight: '700', fontSize: 16 },
  btnTxtDark: { color: '#475569', fontWeight: '700', fontSize: 16 },
  note: { fontSize: 11, color: '#94A3B8', textAlign: 'center', marginTop: 32, marginBottom: 8 },
  howCard: { alignSelf: 'stretch', borderRadius: 18, borderWidth: 1, padding: 18, marginTop: 12 },
  howTitle: { fontSize: 16, fontWeight: '900', marginBottom: 6 },
  howIntro: { fontSize: 13, lineHeight: 19, marginBottom: 12 },
  howStep: { marginBottom: 12 },
  howStepTitle: { fontSize: 14, fontWeight: '800', marginBottom: 3 },
  howStepBody: { fontSize: 13, lineHeight: 19, marginBottom: 4 },
  howSep: { height: 1, marginVertical: 10 },
});
