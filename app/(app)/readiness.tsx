import React, { useEffect, useState, useMemo } from 'react';
import { a11y } from '../../lib/a11y';
import { useTokens, Tokens } from '../../constants/tokens';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Activity, Moon, HeartPulse, Minus, Plus } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ScreenTopBar from '../../components/ScreenTopBar';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { rowDir, txtAlign } from '../../lib/rtl';
import { computeReadiness } from '../../lib/readiness';
import { type } from '../../constants/theme';

const STORE_KEY = 'readiness_v1';

const TXT: any = {
  en: {
    title: 'Daily readiness',
    sub: 'A quick recovery score from your sleep and resting heart rate.',
    sleep: 'Sleep last night',
    hours: 'h',
    restingHr: 'Resting heart rate (optional)',
    bpm: 'bpm',
    compute: 'Compute my readiness',
    yourScore: 'Your readiness',
    labels: { great: 'Great form', good: 'Good', moderate: 'Moderate', low: 'Low — take it easy' },
    advice: {
      'advice.go': 'You are well recovered — go for a strong session today.',
      'advice.steady': 'Solid day. A steady, moderate effort suits you well.',
      'advice.rest': 'Recovery looks limited — keep it light or rest today.',
      'advice.sleep': 'Short night. Prioritize sleep tonight and avoid hard efforts.',
      'advice.recover': 'Elevated resting heart rate — favor recovery over intensity.',
      'advice.easy': 'Heavy recent load. Choose an easy, low-impact session.',
    },
    hrPlaceholder: 'e.g. 58',
    disclaimer: 'Indicative only — not medical advice.',
  },
  fr: {
    title: 'Forme du jour',
    sub: 'Un score de récupération rapide à partir de ton sommeil et de ta FC au repos.',
    sleep: 'Sommeil cette nuit',
    hours: 'h',
    restingHr: 'FC au repos (optionnel)',
    bpm: 'bpm',
    compute: 'Calculer ma forme',
    yourScore: 'Ta forme',
    labels: { great: 'Très en forme', good: 'Bonne', moderate: 'Moyenne', low: 'Faible — vas-y doucement' },
    advice: {
      'advice.go': 'Tu es bien récupéré — pars sur une grosse séance aujourd’hui.',
      'advice.steady': 'Bonne journée. Un effort modéré et régulier te convient bien.',
      'advice.rest': 'Récupération limitée — reste léger ou repose-toi aujourd’hui.',
      'advice.sleep': 'Nuit courte. Priorise le sommeil ce soir et évite les efforts durs.',
      'advice.recover': 'FC au repos élevée — privilégie la récupération à l’intensité.',
      'advice.easy': 'Grosse charge récente. Choisis une séance facile et peu traumatisante.',
    },
    hrPlaceholder: 'ex. 58',
    disclaimer: 'Indicatif — pas un avis médical.',
  },
  ar: {
    title: 'لياقة اليوم',
    sub: 'درجة تعافٍ سريعة من نومك ونبضك أثناء الراحة.',
    sleep: 'نوم الليلة الماضية',
    hours: 'س',
    restingHr: 'نبض القلب أثناء الراحة (اختياري)',
    bpm: 'ن/د',
    compute: 'احسب لياقتي',
    yourScore: 'لياقتك',
    labels: { great: 'لياقة ممتازة', good: 'جيدة', moderate: 'متوسطة', low: 'منخفضة — خذ راحتك' },
    advice: {
      'advice.go': 'تعافيت جيداً — انطلق في حصة قوية اليوم.',
      'advice.steady': 'يوم جيد. مجهود معتدل ومنتظم يناسبك.',
      'advice.rest': 'التعافي محدود — خفّف الحمل أو ارتح اليوم.',
      'advice.sleep': 'ليلة قصيرة. أعطِ الأولوية للنوم الليلة وتجنّب المجهود الشاق.',
      'advice.recover': 'نبض الراحة مرتفع — فضّل التعافي على الشدة.',
      'advice.easy': 'حمل تدريبي ثقيل مؤخراً. اختر حصة سهلة وخفيفة.',
    },
    hrPlaceholder: 'مثال 58',
  },
};

function verdictColor(score: number, k: Tokens) {
  if (score >= 80) return k.success;
  if (score >= 60) return '#84cc16';
  if (score >= 40) return k.warning;
  return k.danger;
}

export default function ReadinessScreen() {
  const k = useTokens();
  const { resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const isDark = resolved === 'dark';
  const styles = useMemo(() => makeStyles(k), [k]);
  const tx = TXT[language] || TXT.en;
  const accent = k.accent;

  const text = k.text;
  const sub = k.textMuted;
  const card = k.surface;
  const bg = isDark ? k.surface : 'transparent';
  const tok = useTokens();
  const border = tok.border;

  const [sleep, setSleep] = useState(7.5);
  const [hr, setHr] = useState('');
  const [result, setResult] = useState<ReturnType<typeof computeReadiness> | null>(null);

  // Restaure la dernière saisie.
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORE_KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          if (typeof saved.sleep === 'number') setSleep(saved.sleep);
          if (typeof saved.hr === 'string') setHr(saved.hr);
          // Recalcule pour afficher d'emblée le dernier score.
          const hrNum = saved.hr ? parseInt(saved.hr, 10) : undefined;
          setResult(computeReadiness({ sleepHours: saved.sleep, restingHr: hrNum && hrNum > 0 ? hrNum : undefined }));
        }
      } catch {}
    })();
  }, []);

  const bumpSleep = (delta: number) => setSleep((s) => Math.max(0, Math.min(14, Math.round((s + delta) * 2) / 2)));

  const onCompute = async () => {
    const hrNum = hr ? parseInt(hr, 10) : undefined;
    const r = computeReadiness({ sleepHours: sleep, restingHr: hrNum && hrNum > 0 ? hrNum : undefined });
    setResult(r);
    try { await AsyncStorage.setItem(STORE_KEY, JSON.stringify({ sleep, hr, ts: Date.now() })); } catch {}
  };

  const Stepper = ({ label, value, unit, onMinus, onPlus }: any) => (
    <View style={[styles.field, { backgroundColor: card, borderColor: border }]}>
      <View style={[styles.fieldHead, { flexDirection: rowDir(isRTL) }]}>
        <Moon size={18} color={accent} />
        <Text style={[styles.fieldLabel, { color: text, textAlign: txtAlign(isRTL) }]}>{label}</Text>
      </View>
      <View style={[styles.stepperRow, { flexDirection: rowDir(isRTL) }]}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('retirer')} style={[styles.stepBtn, { borderColor: border }]} onPress={onMinus}>
          <Minus size={20} color={text} />
        </TouchableOpacity>
        <Text style={[styles.stepValue, { color: text }]}>{value} {unit}</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('ajouter')} style={[styles.stepBtn, { borderColor: border }]} onPress={onPlus}>
          <Plus size={20} color={text} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.container, { backgroundColor: bg }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenTopBar showBack showBrand={false} showNotif={false} />

        <View style={[styles.titleRow, { flexDirection: rowDir(isRTL) }]}>
          <Activity size={26} color={accent} />
          <Text style={[styles.title, { color: text, textAlign: txtAlign(isRTL) }]}>{tx.title}</Text>
        </View>
        <Text style={[styles.subtitle, { color: sub, textAlign: txtAlign(isRTL) }]}>{tx.sub}</Text>

        {/* Score gauge */}
        {result && (
          <View style={[styles.gaugeCard, { backgroundColor: card, borderColor: border }]}>
            <View style={[styles.circle, { borderColor: verdictColor(result.score, k) }]}>
              <Text style={[styles.scoreNum, { color: verdictColor(result.score, k) }]}>{result.score}</Text>
              <Text style={[styles.scoreOf, { color: sub }]}>/ 100</Text>
            </View>
            <Text style={[styles.scoreCaption, { color: sub, textAlign: 'center' }]}>{tx.yourScore}</Text>
            <View style={[styles.badge, { backgroundColor: verdictColor(result.score, k) + '22' }]}>
              <Text style={[styles.badgeTxt, { color: verdictColor(result.score, k) }]}>{tx.labels[result.label]}</Text>
            </View>
            <Text style={[styles.advice, { color: text, textAlign: 'center' }]}>{tx.advice[result.advice]}</Text>
          </View>
        )}

        {/* Sleep stepper */}
        <Stepper
          label={tx.sleep}
          value={sleep.toFixed(1)}
          unit={tx.hours}
          onMinus={() => bumpSleep(-0.5)}
          onPlus={() => bumpSleep(0.5)}
        />

        {/* Resting HR (optional) */}
        <View style={[styles.field, { backgroundColor: card, borderColor: border }]}>
          <View style={[styles.fieldHead, { flexDirection: rowDir(isRTL) }]}>
            <HeartPulse size={18} color={accent} />
            <Text style={[styles.fieldLabel, { color: text, textAlign: txtAlign(isRTL) }]}>{tx.restingHr}</Text>
          </View>
          <View style={[styles.hrRow, { flexDirection: rowDir(isRTL) }]}>
            <TextInput
              style={[styles.hrInput, { color: text, borderColor: border, textAlign: txtAlign(isRTL) }]}
              value={hr}
              onChangeText={(v) => setHr(v.replace(/[^0-9]/g, '').slice(0, 3))}
              keyboardType="number-pad"
              placeholder={tx.hrPlaceholder}
              placeholderTextColor={sub}
              maxLength={3}
            />
            <Text style={[styles.hrUnit, { color: sub }]}>{tx.bpm}</Text>
          </View>
        </View>

        <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: accent }]} onPress={onCompute}>
          <Activity size={20} color={k.onAccent} />
          <Text style={styles.primaryBtnText}>{tx.compute}</Text>
        </TouchableOpacity>

        <Text style={[styles.disclaimer, { color: sub, textAlign: 'center' }]}>{tx.disclaimer}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// Fabrique thémée : un StyleSheet est évalué au chargement du module, où `isDark`
// n'existe pas. Le composant l'appelle via useMemo, recalculé au changement de thème.
const makeStyles = (k: Tokens) => StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 60 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  title: { fontSize: 28, fontWeight: '900', letterSpacing: -1 },
  subtitle: { fontSize: 14, marginTop: 8, marginBottom: 18, lineHeight: 20 },
  gaugeCard: { borderRadius: 20, padding: 22, alignItems: 'center', borderWidth: 1, marginBottom: 18 },
  circle: { width: 150, height: 150, borderRadius: 75, borderWidth: 10, alignItems: 'center', justifyContent: 'center' },
  scoreNum: { fontSize: 48, fontWeight: '900', letterSpacing: -2 },
  scoreOf: { fontSize: 13, fontWeight: '700', marginTop: -4 },
  scoreCaption: { fontSize: 12.5, fontWeight: '600', marginTop: 12 },
  badge: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, marginTop: 8 },
  badgeTxt: { fontSize: 14, fontWeight: '800' },
  advice: { fontSize: 14, lineHeight: 20, marginTop: 14, fontWeight: '500' },
  field: { borderRadius: 18, padding: 16, borderWidth: 1, marginBottom: 14 },
  fieldHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  fieldLabel: { fontSize: 15, fontWeight: '800', flex: 1 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepBtn: { width: 52, height: 52, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  stepValue: { fontSize: 26, fontWeight: '900', letterSpacing: -1 },
  hrRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  hrInput: { flex: 1, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 20, fontWeight: '800' },
  hrUnit: { fontSize: 15, fontWeight: '700' },
  primaryBtn: { flexDirection: 'row', gap: 8, paddingVertical: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  primaryBtnText: { color: k.onAccent, fontSize: 16, fontWeight: '800' },
  disclaimer: { ...type.micro, marginTop: 18, opacity: 0.85, lineHeight: 16 },
});
