// Comptage de répétitions ON-DEVICE via l'accéléromètre (expo-sensors).
// Modèle = détection de pics sur la magnitude d'accélération (machine à états
// haut/bas + anti-rebond temporel). 100% local, hors-ligne, aucune caméra.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { Accelerometer } from 'expo-sensors';
import { Play, Pause, RotateCcw, Activity } from 'lucide-react-native';
import { router } from 'expo-router';
import ScreenTopBar from '../../components/ScreenTopBar';
import { useTranslation } from '../../lib/i18n';
import { useTheme } from '../../lib/ThemeContext';

const GREEN = '#2E8B57';
// Seuils (en g). Un rep = la magnitude passe au-dessus de HIGH puis revient sous LOW.
const HIGH = 1.28;
const LOW = 0.82;
const MIN_REP_MS = 350; // anti-rebond

const TXT: any = {
  en: { title: 'Rep counter', sub: 'Hold your phone (armband / pocket) during the exercise. On-device detection.', reps: 'reps', running: '· running', stopped: '· stopped', reset: 'Reset', pause: 'Pause', start: 'Start', note: 'Model: acceleration peaks (state machine + debounce). Great for squats, curls, push-ups.' },
  fr: { title: 'Compteur de répétitions', sub: "Tiens ton téléphone (brassard / poche) pendant l'exercice. Détection on-device.", reps: 'reps', running: '· en cours', stopped: '· arrêté', reset: 'Reset', pause: 'Pause', start: 'Démarrer', note: "Modèle : pics d'accélération (machine à états + anti-rebond). Idéal pour squats, curls, pompes." },
  ar: { title: 'عدّاد التكرارات', sub: 'أمسك هاتفك (حزام الذراع / الجيب) أثناء التمرين. كشف على الجهاز.', reps: 'تكرار', running: '· جارٍ', stopped: '· متوقف', reset: 'تصفير', pause: 'إيقاف', start: 'ابدأ', note: 'النموذج: قمم التسارع (آلة حالات + مانع ارتداد). مثالي للسكوات والضغط.' },
};

export default function RepCounterScreen() {
  const { language } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  const bg = isDark ? '#0f172a' : '#F8FAFC';
  const text = isDark ? '#f1f5f9' : '#0F172A';
  const sub = isDark ? '#94a3b8' : '#64748B';

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

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar />
      <View style={styles.body}>
        <Text style={[styles.title, { color: text }]}>{t.title}</Text>
        <Text style={[styles.sub, { color: sub }]}>{t.sub}</Text>

        <View style={styles.counterWrap}>
          <Text style={styles.count}>{reps}</Text>
          <Text style={[styles.countLabel, { color: sub }]}>{t.reps}</Text>
        </View>

        <View style={styles.magRow}>
          <Activity size={16} color={running ? GREEN : '#CBD5E1'} />
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
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  body: { flex: 1, padding: 24, alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: '#0F172A', marginTop: 8 },
  sub: { fontSize: 13, color: '#64748B', textAlign: 'center', marginTop: 8 },
  counterWrap: { marginTop: 48, alignItems: 'center' },
  count: { fontSize: 96, fontWeight: '900', color: GREEN, lineHeight: 100 },
  countLabel: { fontSize: 16, color: '#94A3B8', marginTop: -6 },
  magRow: { flexDirection: 'row', alignItems: 'center', marginTop: 24 },
  magTxt: { fontSize: 13, color: '#64748B', marginLeft: 6 },
  actions: { flexDirection: 'row', gap: 14, marginTop: 48 },
  btn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 26, borderRadius: 16, gap: 8 },
  primary: { backgroundColor: GREEN },
  secondary: { backgroundColor: '#E2E8F0' },
  btnTxt: { color: '#fff', fontWeight: '700', fontSize: 16 },
  btnTxtDark: { color: '#475569', fontWeight: '700', fontSize: 16 },
  note: { fontSize: 11, color: '#94A3B8', textAlign: 'center', marginTop: 'auto', marginBottom: 8 },
});
