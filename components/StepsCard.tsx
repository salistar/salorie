import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Footprints, Flame, ChevronRight } from 'lucide-react-native';
import { Colors } from '../constants/Colors';
import { useTranslation } from '../lib/i18n';
import { isHealthAvailable, readToday } from '../lib/health';

const TXT: Record<string, { steps: string; today: string; kcal: string; goal: string; connect: string }> = {
  en: { steps: 'Steps', today: 'Today', kcal: 'kcal', goal: 'Goal 10,000', connect: 'Connect Health Connect →' },
  fr: { steps: 'Pas', today: "Aujourd'hui", kcal: 'kcal', goal: 'Objectif 10 000', connect: 'Connecter Health Connect →' },
  ar: { steps: 'خطوات', today: 'اليوم', kcal: 'سعرة', goal: 'الهدف 10٬000', connect: '← اربط Health Connect' },
};
const GOAL = 10000;

export default function StepsCard() {
  const router = useRouter();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;

  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [steps, setSteps] = useState(0);
  const [kcal, setKcal] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const avail = await isHealthAvailable();
        if (avail) {
          const d = await readToday();
          if (!alive) return;
          setSteps(d.steps || 0);
          setKcal(d.activeKcal || 0);
          setConnected((d.steps || 0) > 0);
        }
      } catch { /* show connect CTA */ }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  const pct = Math.min(100, Math.round((steps / GOAL) * 100));
  const row = (rev = false): any => ({ flexDirection: isRTL ? (rev ? 'row' : 'row-reverse') : (rev ? 'row-reverse' : 'row') });

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={() => router.push('/health' as any)} style={styles.wrap}>
      <LinearGradient colors={[Colors.light.primary, Colors.light.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        {/* decorative blobs */}
        <View style={styles.blob1} />
        <View style={styles.blob2} />

        {loading ? (
          <View style={{ paddingVertical: 26, alignItems: 'center' }}><ActivityIndicator color="#fff" /></View>
        ) : (
          <>
            <View style={[styles.head, row()]}>
              <View style={[styles.titleWrap, row()]}>
                <View style={styles.iconBubble}><Footprints size={20} color="#fff" /></View>
                <View>
                  <Text style={styles.label}>{t.steps}</Text>
                  <Text style={styles.today}>{t.today}</Text>
                </View>
              </View>
              <ChevronRight size={22} color="rgba(255,255,255,0.9)" style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
            </View>

            <View style={[styles.valueRow, row()]}>
              <Text style={styles.steps}>{steps.toLocaleString()}</Text>
              <Text style={styles.unit}>  /10k</Text>
            </View>

            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.max(3, pct)}%` }]} />
            </View>

            <View style={[styles.footer, row()]}>
              <View style={[styles.pill, row()]}>
                <Flame size={14} color="#fff" />
                <Text style={styles.pillTxt}>{kcal} {t.kcal}</Text>
              </View>
              <Text style={styles.goalTxt}>{connected ? `${pct}% · ${t.goal}` : t.connect}</Text>
            </View>
          </>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 20, marginBottom: 16, borderRadius: 26, shadowColor: Colors.light.primary, shadowOpacity: 0.3, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
  card: { borderRadius: 26, padding: 20, overflow: 'hidden' },
  blob1: { position: 'absolute', top: -40, right: -30, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.10)' },
  blob2: { position: 'absolute', bottom: -50, left: -20, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.07)' },
  head: { alignItems: 'center', justifyContent: 'space-between' },
  titleWrap: { alignItems: 'center', gap: 12 },
  iconBubble: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  label: { color: '#fff', fontSize: 17, fontWeight: '900', letterSpacing: -0.3 },
  today: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600', marginTop: 1 },
  valueRow: { alignItems: 'flex-end', marginTop: 16 },
  steps: { color: '#fff', fontSize: 44, fontWeight: '900', letterSpacing: -2 },
  unit: { color: 'rgba(255,255,255,0.85)', fontSize: 16, fontWeight: '800', marginBottom: 7 },
  track: { height: 10, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden', marginTop: 14 },
  fill: { height: 10, borderRadius: 6, backgroundColor: '#fff' },
  footer: { alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  pill: { alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  pillTxt: { color: '#fff', fontSize: 13, fontWeight: '800' },
  goalTxt: { color: 'rgba(255,255,255,0.92)', fontSize: 12.5, fontWeight: '700' },
});
