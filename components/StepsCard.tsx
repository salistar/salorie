import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Footprints, Flame, ChevronRight } from 'lucide-react-native';
import { Colors } from '../constants/Colors';
import { useTheme } from '../lib/ThemeContext';
import { useTranslation } from '../lib/i18n';
import { isHealthAvailable, readToday } from '../lib/health';

const TXT: Record<string, { steps: string; today: string; kcal: string; goal: string; connect: string }> = {
  en: { steps: 'Steps', today: 'today', kcal: 'active kcal', goal: 'of 10,000', connect: 'Tap to connect Health Connect' },
  fr: { steps: 'Pas', today: "aujourd'hui", kcal: 'kcal actives', goal: 'sur 10 000', connect: 'Touche pour connecter Health Connect' },
  ar: { steps: 'خطوات', today: 'اليوم', kcal: 'سعرات نشطة', goal: 'من 10٬000', connect: 'اضغط لربط Health Connect' },
};
const GOAL = 10000;

export default function StepsCard() {
  const router = useRouter();
  const { resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';

  const [status, setStatus] = useState<'loading' | 'hidden' | 'ready'>('loading');
  const [steps, setSteps] = useState(0);
  const [kcal, setKcal] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const avail = await isHealthAvailable();
        if (!avail) { if (alive) setStatus('hidden'); return; } // iOS / no Health Connect → no card
        const d = await readToday();
        if (!alive) return;
        setSteps(d.steps || 0);
        setKcal(d.activeKcal || 0);
        setStatus('ready');
      } catch {
        if (alive) setStatus('ready'); // show the connect CTA
      }
    })();
    return () => { alive = false; };
  }, []);

  if (status === 'hidden') return null;

  const text = isDark ? '#fff' : Colors.light.gray[900];
  const sub = isDark ? '#9BA1A6' : Colors.light.gray[500];
  const card = isDark ? Colors.dark.card : '#fff';
  const pct = Math.min(100, Math.round((steps / GOAL) * 100));
  const row = (rev = false): any => ({ flexDirection: isRTL ? (rev ? 'row' : 'row-reverse') : (rev ? 'row-reverse' : 'row') });

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/health' as any)} style={[styles.card, { backgroundColor: card }]}>
      {status === 'loading' ? (
        <View style={{ paddingVertical: 18, alignItems: 'center' }}><ActivityIndicator color={Colors.light.primary} /></View>
      ) : (
        <>
          <View style={[styles.head, row()]}>
            <View style={[styles.titleWrap, row()]}>
              <View style={styles.iconBubble}><Footprints size={20} color={Colors.light.primary} /></View>
              <Text style={[styles.title, { color: text }]}>{t.steps}</Text>
            </View>
            <ChevronRight size={20} color={sub} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
          </View>

          <View style={[styles.valueRow, row()]}>
            <Text style={[styles.steps, { color: text }]}>{steps.toLocaleString()}</Text>
            <Text style={[styles.goal, { color: sub }]}>  {t.goal}</Text>
          </View>

          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.max(2, pct)}%` }]} />
          </View>

          <View style={[styles.footer, row()]}>
            <View style={[styles.kcalWrap, row()]}>
              <Flame size={15} color="#f59e0b" />
              <Text style={[styles.kcal, { color: sub }]}>{kcal} {t.kcal}</Text>
            </View>
            <Text style={[styles.todayTxt, { color: sub }]}>{steps === 0 ? t.connect : t.today}</Text>
          </View>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 24, marginBottom: 16, borderRadius: 24, padding: 18, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  head: { alignItems: 'center', justifyContent: 'space-between' },
  titleWrap: { alignItems: 'center', gap: 10 },
  iconBubble: { width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.light.primary + '18', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '800' },
  valueRow: { alignItems: 'flex-end', marginTop: 14 },
  steps: { fontSize: 34, fontWeight: '900', letterSpacing: -1 },
  goal: { fontSize: 14, fontWeight: '600', marginBottom: 5 },
  track: { height: 9, borderRadius: 5, backgroundColor: 'rgba(120,140,130,0.18)', overflow: 'hidden', marginTop: 12 },
  fill: { height: 9, borderRadius: 5, backgroundColor: Colors.light.primary },
  footer: { alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  kcalWrap: { alignItems: 'center', gap: 6 },
  kcal: { fontSize: 13, fontWeight: '700' },
  todayTxt: { fontSize: 12, fontWeight: '600' },
});
