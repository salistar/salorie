import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { router } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { ArrowLeft, Footprints, Flame, Scale, RefreshCw, HeartPulse, Plus, Zap, Navigation, RotateCcw } from 'lucide-react-native';
import ScreenTopBar from '../components/ScreenTopBar';
import { Colors } from '../constants/Colors';
import { useTheme } from '../lib/ThemeContext';
import { useTranslation } from '../lib/i18n';
import { isHealthAvailable, connectHealth, readToday, HealthToday } from '../lib/health';
import { addNutritionLog } from '../lib/firebase';
import { getStepsMode, setStepsMode, getSimSteps, addSimSteps, resetSimSteps, getActivitySteps } from '../lib/steps';

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function HealthScreen() {
  const { user } = useUser();
  const { resolved } = useTheme();
  const { t } = useTranslation();
  const isDark = resolved === 'dark';

  const [available, setAvailable] = useState<boolean | null>(null);
  const [connected, setConnected] = useState(false);
  const [data, setData] = useState<HealthToday | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [mode, setMode] = useState<'real' | 'sim'>('real');
  const [simSteps, setSimSteps] = useState(0);
  const [activitySteps, setActivitySteps] = useState(0);
  const [walking, setWalking] = useState(false);
  const email = user?.primaryEmailAddress?.emailAddress || '';
  const walkRef = React.useRef<any>(null);

  useEffect(() => { isHealthAvailable().then(setAvailable); }, []);
  useEffect(() => {
    (async () => {
      setMode(await getStepsMode());
      if (email) { setSimSteps(await getSimSteps(email)); setActivitySteps(await getActivitySteps(email)); }
    })();
    return () => { if (walkRef.current) clearInterval(walkRef.current); };
  }, [email]);

  const switchMode = async (m: 'real' | 'sim') => {
    setMode(m);
    await setStepsMode(m);
    if (m === 'real' && walkRef.current) { clearInterval(walkRef.current); walkRef.current = null; setWalking(false); }
  };

  // Live walk simulation: a brisk cadence (~2 steps/sec) while active.
  const toggleWalk = () => {
    if (walking) {
      if (walkRef.current) { clearInterval(walkRef.current); walkRef.current = null; }
      setWalking(false);
      return;
    }
    setWalking(true);
    walkRef.current = setInterval(async () => {
      const n = await addSimSteps(email, 2);
      setSimSteps(n);
    }, 1000);
  };
  const addChunk = async () => { setSimSteps(await addSimSteps(email, 1000)); };
  const resetWalk = async () => { await resetSimSteps(email); setSimSteps(0); };

  const text = isDark ? '#fff' : Colors.light.gray[900];
  const sub = isDark ? '#9BA1A6' : Colors.light.gray[500];
  const card = isDark ? Colors.dark.card : '#fff';
  const bg = isDark ? '#000' : 'transparent';

  const connect = useCallback(async () => {
    setBusy(true); setMsg(null);
    const ok = await connectHealth();
    setConnected(ok);
    if (ok) setData(await readToday());
    setBusy(false);
  }, []);

  const refresh = useCallback(async () => {
    setBusy(true);
    setData(await readToday());
    setBusy(false);
  }, []);

  const logActivity = async () => {
    const email = user?.primaryEmailAddress?.emailAddress || '';
    if (!email || !data || data.activeKcal <= 0) return;
    try {
      await addNutritionLog({ userId: email, type: 'activity', name: 'Health Connect', calories: data.activeKcal, date: todayStr() } as any);
      setMsg(t('health.logged'));
    } catch {}
  };

  const Stat = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
    <View style={[styles.stat, { backgroundColor: card }]}>
      <View style={styles.statIcon}>{icon}</View>
      <Text style={[styles.statValue, { color: text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: sub }]}>{label}</Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <ArrowLeft size={22} color={text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}><ScreenTopBar showBrand={false} showNotif={false} /></View>
        </View>

        <View style={styles.titleRow}>
          <HeartPulse size={26} color={Colors.light.primary} />
          <Text style={[styles.title, { color: text }]}>{t('health.title')}</Text>
        </View>
        <Text style={[styles.subtitle, { color: sub }]}>{t('health.subtitle')}</Text>
        <Image source={require('../assets/images/illustrations/running.jpg')} style={styles.hero} resizeMode="cover" />

        {/* Steps mode: Real (Health Connect) vs Simulation */}
        <View style={[styles.modeRow, { backgroundColor: isDark ? '#1e293b' : '#f1f5f9' }]}>
          <TouchableOpacity style={[styles.modeBtn, mode === 'real' && { backgroundColor: card }]} onPress={() => switchMode('real')}>
            <Navigation size={16} color={mode === 'real' ? Colors.light.primary : sub} />
            <Text style={[styles.modeTxt, { color: mode === 'real' ? Colors.light.primary : sub }]}>Réel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.modeBtn, mode === 'sim' && { backgroundColor: card }]} onPress={() => switchMode('sim')}>
            <Zap size={16} color={mode === 'sim' ? '#0ea5e9' : sub} />
            <Text style={[styles.modeTxt, { color: mode === 'sim' ? '#0ea5e9' : sub }]}>Simulation</Text>
          </TouchableOpacity>
        </View>

        {/* Combined steps banner (mode base + activity steps from runs/challenges) */}
        <View style={[styles.totalCard, { backgroundColor: card }]}>
          <Footprints size={22} color={Colors.light.primary} />
          <Text style={[styles.totalSteps, { color: text }]}>
            {((mode === 'sim' ? simSteps : (data?.steps || 0)) + activitySteps).toLocaleString()}
          </Text>
          <Text style={[styles.totalLabel, { color: sub }]}>pas aujourd'hui{activitySteps > 0 ? ` · dont +${activitySteps.toLocaleString()} courses/défis` : ''}</Text>
        </View>

        {/* Simulation controls */}
        {mode === 'sim' && (
          <View style={[styles.simCard, { backgroundColor: card }]}>
            <Text style={[styles.simHint, { color: sub }]}>Mode simulation — génère des pas pour tester (sans capteur).</Text>
            <View style={styles.simBtns}>
              <TouchableOpacity style={[styles.simBtn, { backgroundColor: walking ? '#ef4444' : '#0ea5e9' }]} onPress={toggleWalk}>
                <Zap size={16} color="#fff" />
                <Text style={styles.simBtnTxt}>{walking ? 'Stop' : 'Marcher'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.simBtn, { backgroundColor: Colors.light.primary }]} onPress={addChunk}>
                <Plus size={16} color="#fff" />
                <Text style={styles.simBtnTxt}>+1 000</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.simBtnGhost]} onPress={resetWalk}>
                <RotateCcw size={16} color={sub} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {mode === 'real' && available === false && (
          <View style={[styles.box, { backgroundColor: card }]}>
            <Text style={[styles.boxText, { color: sub }]}>{t('health.unavailable')}</Text>
          </View>
        )}

        {mode === 'real' && available !== false && !connected && (
          <TouchableOpacity style={styles.primaryBtn} onPress={connect} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <><HeartPulse size={20} color="#fff" /><Text style={styles.primaryBtnText}>{t('health.connect')}</Text></>}
          </TouchableOpacity>
        )}

        {mode === 'real' && connected && (
          <>
            <Text style={[styles.connected, { color: Colors.light.primary }]}>{t('health.connected')}</Text>
            <View style={styles.statsRow}>
              <Stat icon={<Footprints size={22} color={Colors.light.primary} />} label={t('health.steps')} value={data ? String(data.steps) : '—'} />
              <Stat icon={<Flame size={22} color="#f59e0b" />} label={t('health.active_kcal')} value={data ? `${data.activeKcal}` : '—'} />
              <Stat icon={<Scale size={22} color={Colors.light.primary} />} label={t('health.weight')} value={data?.weightKg != null ? `${data.weightKg} kg` : '—'} />
            </View>

            {data && data.steps === 0 && data.activeKcal === 0 && (
              <Text style={[styles.noData, { color: sub }]}>{t('health.no_data')}</Text>
            )}

            {data && data.activeKcal > 0 && (
              <TouchableOpacity style={styles.primaryBtn} onPress={logActivity}>
                <Plus size={18} color="#fff" /><Text style={styles.primaryBtnText}>{t('health.log_activity')}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.ghostBtn} onPress={refresh} disabled={busy}>
              <RefreshCw size={18} color={Colors.light.primary} /><Text style={styles.ghostText}>{t('health.refresh')}</Text>
            </TouchableOpacity>
            {!!msg && <Text style={[styles.msg, { color: sub }]}>{msg}</Text>}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 60 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.light.gray[50] },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  title: { fontSize: 28, fontWeight: '900', letterSpacing: -1 },
  subtitle: { fontSize: 14, marginTop: 8, marginBottom: 14, lineHeight: 20 },
  hero: { width: '100%', height: 130, borderRadius: 18, marginBottom: 18 },
  box: { borderRadius: 16, padding: 20 },
  boxText: { fontSize: 14, lineHeight: 20 },
  primaryBtn: { flexDirection: 'row', gap: 8, backgroundColor: Colors.light.primary, paddingVertical: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  connected: { fontSize: 14, fontWeight: '800', marginBottom: 14 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  stat: { flex: 1, borderRadius: 18, padding: 16, alignItems: 'center', gap: 6, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  statIcon: { marginBottom: 2 },
  statValue: { fontSize: 22, fontWeight: '900' },
  statLabel: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  noData: { fontSize: 14, textAlign: 'center', marginVertical: 16, lineHeight: 20 },
  ghostBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, marginTop: 4 },
  ghostText: { color: Colors.light.primary, fontSize: 15, fontWeight: '700' },
  msg: { fontSize: 13, textAlign: 'center', fontWeight: '600', marginTop: 6 },
  modeRow: { flexDirection: 'row', borderRadius: 14, padding: 4, gap: 4, marginBottom: 14 },
  modeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 11 },
  modeTxt: { fontSize: 14, fontWeight: '800' },
  totalCard: { borderRadius: 18, padding: 18, alignItems: 'center', gap: 4, marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  totalSteps: { fontSize: 38, fontWeight: '900', letterSpacing: -1.5 },
  totalLabel: { fontSize: 12.5, fontWeight: '600', textAlign: 'center' },
  simCard: { borderRadius: 18, padding: 16, marginBottom: 14 },
  simHint: { fontSize: 13, fontWeight: '500', lineHeight: 18, marginBottom: 12 },
  simBtns: { flexDirection: 'row', gap: 10 },
  simBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 13, borderRadius: 13 },
  simBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  simBtnGhost: { width: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 13, borderWidth: 1.5, borderColor: '#cbd5e1' },
});
