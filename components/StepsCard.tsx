import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useCallback, useState } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { LinearGradient } from 'expo-linear-gradient';
import { Footprints, Flame, ChevronRight } from 'lucide-react-native';
import { useTranslation } from '../lib/i18n';
import { isHealthAvailable, readToday } from '../lib/health';
import { getStepsMode, getActivitySteps, getSimSteps, getNativeDeviceSteps, syncActivityFile, flushStepHistory } from '../lib/steps';
import { rememberEmail, ensureNotifPermission } from '../lib/stepsNotif';
import { useTokens, Tokens } from '../constants/tokens';

const TXT: Record<string, { steps: string; today: string; kcal: string; goal: string; connect: string; real: string }> = {
  en: { steps: 'Steps', today: 'Today', kcal: 'kcal', goal: 'Goal 10,000', connect: 'Connect Health Connect →', real: 'REAL' },
  fr: { steps: 'Pas', today: "Aujourd'hui", kcal: 'kcal', goal: 'Objectif 10 000', connect: 'Connecter Health Connect →', real: 'RÉEL' },
  ar: { steps: 'خطوات', today: 'اليوم', kcal: 'سعرة', goal: 'الهدف 10٬000', connect: '← اربط Health Connect', real: 'حقيقي' },
};
const GOAL = 10000;

export default function StepsCard() {
  const k = useTokens();
  const router = useRouter();
  const { user } = useUser();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const email = user?.primaryEmailAddress?.emailAddress || '';

  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [steps, setSteps] = useState(0);
  const [kcal, setKcal] = useState(0);
  const [mode, setMode] = useState<'real' | 'sim'>('real');

  // Re-read on focus + poll every few seconds so steps from the native sensor
  // service and from runs/challenges show live. The persistent notification is
  // owned by the native foreground service (counts even when the app is closed).
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      let hcKcal = 0;
      let hcRead = false;
      const load = async () => {
        try {
          const m = await getStepsMode();
          const activity = await getActivitySteps(email);
          let base = 0;
          if (m === 'sim') {
            base = await getSimSteps(email);
          } else {
            const device = await getNativeDeviceSteps();
            let hc = 0;
            if (!hcRead) {
              hcRead = true;
              try { if (await isHealthAvailable()) { const d = await readToday(); hc = d.steps || 0; hcKcal = d.activeKcal || 0; } } catch {}
            }
            base = Math.max(device, hc);
          }
          if (!alive) return;
          const total = base + activity;
          setMode(m);
          setSteps(total);
          setKcal(hcKcal);
          setConnected(total > 0);
        } catch { /* show connect CTA */ }
        finally { if (alive) setLoading(false); }
      };
      if (email) { rememberEmail(email); ensureNotifPermission(); syncActivityFile(email); flushStepHistory(email); }
      load();
      const timer = setInterval(load, 3000);
      return () => { alive = false; clearInterval(timer); };
    }, [email])
  );

  const pct = Math.min(100, Math.round((steps / GOAL) * 100));
  const row = (rev = false): any => ({ flexDirection: isRTL ? (rev ? 'row' : 'row-reverse') : (rev ? 'row-reverse' : 'row') });

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={() => router.push('/health' as any)} style={[styles.wrap, { shadowColor: k.accent }]}>
      <LinearGradient colors={[k.accent, k.accentStrong]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
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
              <View style={[styles.head, row(), { gap: 8 }]}>
                <View style={styles.modePill}><Text style={styles.modePillTxt}>{mode === 'sim' ? 'SIM' : t.real}</Text></View>
                <View style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}><ChevronRight size={22} color="rgba(255,255,255,0.9)" /></View>
              </View>
            </View>

            <View style={[styles.valueRow, row()]}>
              <Text style={styles.steps} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>{steps.toLocaleString()}</Text>
              <Text style={styles.unit} numberOfLines={1}>  /10k</Text>
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
  wrap: { marginHorizontal: 20, marginBottom: 16, borderRadius: 26, shadowOpacity: 0.3, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
  card: { borderRadius: 26, padding: 20, overflow: 'hidden' },
  blob1: { position: 'absolute', top: -40, right: -30, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.10)' },
  blob2: { position: 'absolute', bottom: -50, left: -20, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.07)' },
  head: { alignItems: 'center', justifyContent: 'space-between' },
  titleWrap: { alignItems: 'center', gap: 12 },
  iconBubble: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  label: { color: '#fff', fontSize: 17, fontWeight: '900', letterSpacing: -0.3 },
  today: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600', marginTop: 1 },
  valueRow: { alignItems: 'flex-end', marginTop: 16 },
  steps: { color: '#fff', fontSize: 44, fontWeight: '900', letterSpacing: -2, flexShrink: 1 },
  unit: { color: 'rgba(255,255,255,0.85)', fontSize: 16, fontWeight: '800', marginBottom: 7, flexShrink: 0 },
  track: { height: 10, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden', marginTop: 14 },
  fill: { height: 10, borderRadius: 6, backgroundColor: '#fff' },
  footer: { alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  pill: { alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  pillTxt: { color: '#fff', fontSize: 13, fontWeight: '800' },
  goalTxt: { color: 'rgba(255,255,255,0.92)', fontSize: 12.5, fontWeight: '700' },
  modePill: { backgroundColor: 'rgba(255,255,255,0.22)', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 },
  modePillTxt: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
});
