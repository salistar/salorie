import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { numLocaleFor } from '../../lib/format';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { router } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { ArrowLeft, Footprints, Flame, Scale, RefreshCw, HeartPulse, Plus, Zap, Navigation, RotateCcw, Activity, ChevronRight } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { useScreenGate } from '../../components/FeatureGate';
import { SkeletonCard } from '../../components/ui';
import { Colors } from '../../constants/Colors';
import { type as typo } from '../../constants/theme';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { rowDir, txtAlign } from '../../lib/rtl';
import { isHealthAvailable, connectHealthStatus, openHealthConnectInstall, openHealthSettings, hasStepsPermission, readToday, HealthToday } from '../../lib/health';
import { addNutritionLog } from '../../lib/firebase';
import { getStepsMode, setStepsMode, getSimSteps, addSimSteps, resetSimSteps, getActivitySteps } from '../../lib/steps';

const TXT: any = {
  en: {
    real: 'Real', simulation: 'Simulation',
    stepsToday: 'steps today', ofWhich: (n: string) => ` · incl. +${n} from races/challenges`,
    simHint: 'Simulation mode — generate steps to test (no sensor).',
    walk: 'Walk', stop: 'Stop',
    hcInstall: 'Health Connect must be installed / updated. Opening the Play Store…',
    hcDenied: 'Allow access to "Steps" for Salorie in Health Connect, then come back.',
    hcRetry: 'Connection failed. Retry, open Health Connect, or use Simulation mode.',
    hcRetry2: 'Connection failed. Retry or use Simulation mode.',
    openHC: 'Open Health Connect',
    tip: 'Tip: in Health Connect → App permissions → Salorie, enable "Steps".',
    watches: '⌚ Compatible watches: Garmin, Fitbit, Samsung Health, Google Fit — connect them in Health Connect and their data (steps, calories, weight) arrives here automatically.',
    syncLabel: 'Sync workouts + weight',
    syncFail: 'Sync failed',
    imported: (n: number, w: boolean) => `✅ ${n} workout(s) imported${w ? ' + weight' : ''}`,
    readiness: 'Daily readiness', readinessSub: 'Recovery score from sleep & resting HR',
    disclaimer: 'Wellness estimates for information only — not medical advice.',
  },
  fr: {
    real: 'Réel', simulation: 'Simulation',
    stepsToday: "pas aujourd'hui", ofWhich: (n: string) => ` · dont +${n} courses/défis`,
    simHint: 'Mode simulation — génère des pas pour tester (sans capteur).',
    walk: 'Marcher', stop: 'Stop',
    hcInstall: 'Health Connect doit être installé / mis à jour. Ouverture du Play Store…',
    hcDenied: 'Autorise l\'accès aux « Pas » pour Salorie dans Health Connect, puis reviens.',
    hcRetry: 'Connexion impossible. Réessaie, ouvre Health Connect, ou utilise le mode Simulation.',
    hcRetry2: 'Connexion impossible. Réessaie ou utilise le mode Simulation.',
    openHC: 'Ouvrir Health Connect',
    tip: 'Astuce : dans Health Connect → Autorisations des applications → Salorie, active « Pas ».',
    watches: '⌚ Montres compatibles : Garmin, Fitbit, Samsung Health, Google Fit — connecte-les dans Health Connect et leurs données (pas, calories, poids) arrivent automatiquement ici.',
    syncLabel: 'Synchroniser séances + poids',
    syncFail: 'Sync échouée',
    imported: (n: number, w: boolean) => `✅ ${n} séance(s) importée(s)${w ? ' + poids' : ''}`,
    readiness: 'Forme du jour', readinessSub: 'Score de récup. selon sommeil & FC repos',
  },
  ar: {
    real: 'حقيقي', simulation: 'محاكاة',
    stepsToday: 'خطوة اليوم', ofWhich: (n: string) => ` · منها +${n} من السباقات/التحديات`,
    simHint: 'وضع المحاكاة — أنشئ خطوات للاختبار (بدون مستشعر).',
    walk: 'المشي', stop: 'إيقاف',
    hcInstall: 'يجب تثبيت / تحديث Health Connect. جارٍ فتح متجر Play…',
    hcDenied: 'اسمح بالوصول إلى «الخطوات» لـ Salorie في Health Connect ثم عُد.',
    hcRetry: 'تعذّر الاتصال. أعد المحاولة، أو افتح Health Connect، أو استخدم وضع المحاكاة.',
    hcRetry2: 'تعذّر الاتصال. أعد المحاولة أو استخدم وضع المحاكاة.',
    openHC: 'فتح Health Connect',
    tip: 'نصيحة: في Health Connect ← أذونات التطبيقات ← Salorie، فعّل «الخطوات».',
    watches: '⌚ ساعات متوافقة: Garmin وFitbit وSamsung Health وGoogle Fit — اربطها في Health Connect وستصل بياناتها (الخطوات، السعرات، الوزن) هنا تلقائياً.',
    syncLabel: 'مزامنة التمارين + الوزن',
    syncFail: 'فشلت المزامنة',
    imported: (n: number, w: boolean) => `✅ تم استيراد ${n} تمرين${w ? ' + الوزن' : ''}`,
    readiness: 'لياقة اليوم', readinessSub: 'درجة تعافٍ من النوم ونبض الراحة',
  },
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function HealthScreen() {
  const __gate = useScreenGate('health');
  const { user } = useUser();
  const { resolved } = useTheme();
  const { t, language, isRTL } = useTranslation() as any;
  const isDark = resolved === 'dark';
  const styles = useMemo(() => makeStyles(isDark), [isDark]);
  const tx = TXT[language] || TXT.en;
  const accent = isDark ? Colors.dark.primary : Colors.light.primary;

  // i18n #90 — locale-aware number formatting (display only, no calc change).
  const numLocale = numLocaleFor(language);
  const fmtNum = (n: number) => {
    try { return Number(n).toLocaleString(numLocale); } catch { return String(n); }
  };

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

  useEffect(() => {
    (async () => {
      const avail = await isHealthAvailable();
      setAvailable(avail);
      // Auto-connect if Steps access was already granted before.
      if (avail && (await hasStepsPermission())) {
        setConnected(true);
        try { setData(await readToday()); } catch {}
      }
    })();
  }, []);
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
  const bg = isDark ? '#0f1419' : 'transparent';

  const connect = useCallback(async () => {
    setBusy(true); setMsg(null);
    try {
      const res = await connectHealthStatus();
      if (res === 'ok') {
        setConnected(true);
        setData(await readToday());
        setMsg(null);
      } else if (res === 'unavailable' || res === 'update_required') {
        setMsg(tx.hcInstall);
        openHealthConnectInstall();
      } else if (res === 'denied') {
        setMsg(tx.hcDenied);
      } else {
        setMsg(tx.hcRetry);
      }
    } catch {
      setMsg(tx.hcRetry2);
    } finally {
      setBusy(false);
    }
  }, [tx]);

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

  // Import des séances de la montre (anti-doublon via clé locale par jour) + poids.
  const syncLabel = tx.syncLabel;
  const syncSessions = async () => {
    const email = user?.primaryEmailAddress?.emailAddress || '';
    if (!email) return;
    setBusy(true);
    try {
      const { readTodaySessions } = require('../../lib/health');
      const { addWeightLog } = require('../../lib/firebase');
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const sessions = await readTodaySessions();
      const dedupKey = `hc_sessions_${todayStr()}`;
      let done: string[] = [];
      try { done = JSON.parse((await AsyncStorage.getItem(dedupKey)) || '[]'); } catch {}
      let added = 0;
      for (const s of sessions) {
        if (done.includes(s.startISO)) continue;
        await addNutritionLog({ userId: email, type: 'activity', name: s.name, calories: s.calories, duration: s.durationMin, date: todayStr() } as any);
        done.push(s.startISO); added++;
      }
      await AsyncStorage.setItem(dedupKey, JSON.stringify(done));
      // Poids du jour (si dispo) → historique.
      let w = 0;
      if (data?.weightKg) { try { await addWeightLog(email, data.weightKg); w = 1; } catch {} }
      setMsg(tx.imported(added, !!w));
    } catch { setMsg(tx.syncFail); } finally { setBusy(false); }
  };

  const Stat = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
    <View style={[styles.stat, { backgroundColor: card, borderWidth: 1, borderColor: isDark ? '#283241' : 'transparent' }, !isDark && styles.cardShadow]}>
      <View style={styles.statIcon}>{icon}</View>
      <Text style={[styles.statValue, { color: text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: sub }]}>{label}</Text>
    </View>
  );

  if (!__gate.ok) return __gate.node;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenTopBar showBack showBrand={false} showNotif={false} />

        <View style={[styles.titleRow, { flexDirection: rowDir(isRTL) }]}>
          <HeartPulse size={26} color={accent} />
          <Text style={[styles.title, { color: text, textAlign: txtAlign(isRTL) }]}>{t('health.title')}</Text>
        </View>
        <Text style={[styles.subtitle, { color: sub, textAlign: txtAlign(isRTL) }]}>{t('health.subtitle')}</Text>
        <Image source={require('../../assets/images/illustrations/running.jpg')} style={styles.hero} resizeMode="cover" />

        {/* Lien vers l'écran "Forme du jour" (score de récupération) */}
        <TouchableOpacity
          style={[styles.readinessTile, { backgroundColor: card, borderColor: isDark ? '#283241' : 'transparent', flexDirection: rowDir(isRTL) }, !isDark && styles.cardShadow]}
          activeOpacity={0.85}
          onPress={() => router.push('/readiness' as any)}
        >
          <View style={styles.readinessIcon}><Activity size={22} color={accent} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.readinessTitle, { color: text, textAlign: txtAlign(isRTL) }]}>{tx.readiness}</Text>
            <Text style={[styles.readinessSub, { color: sub, textAlign: txtAlign(isRTL) }]}>{tx.readinessSub}</Text>
          </View>
          <ChevronRight size={20} color={sub} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
        </TouchableOpacity>

        {/* Steps mode: Real (Health Connect) vs Simulation */}
        <View style={[styles.modeRow, { backgroundColor: isDark ? Colors.dark.gray[100] : '#f1f5f9', flexDirection: rowDir(isRTL) }]}>
          <TouchableOpacity style={[styles.modeBtn, mode === 'real' && { backgroundColor: card }]} onPress={() => switchMode('real')}>
            <Navigation size={16} color={mode === 'real' ? accent : sub} />
            <Text style={[styles.modeTxt, { color: mode === 'real' ? accent : sub }]}>{tx.real}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.modeBtn, mode === 'sim' && { backgroundColor: card }]} onPress={() => switchMode('sim')}>
            <Zap size={16} color={mode === 'sim' ? '#0ea5e9' : sub} />
            <Text style={[styles.modeTxt, { color: mode === 'sim' ? '#0ea5e9' : sub }]}>{tx.simulation}</Text>
          </TouchableOpacity>
        </View>

        {/* Combined steps banner (mode base + activity steps from runs/challenges) */}
        <View style={[styles.totalCard, { backgroundColor: card, borderWidth: 1, borderColor: isDark ? '#283241' : 'transparent' }, !isDark && styles.cardShadow]}>
          <Footprints size={22} color={accent} />
          <Text style={[styles.totalSteps, { color: text }]}>
            {fmtNum((mode === 'sim' ? simSteps : (data?.steps || 0)) + activitySteps)}
          </Text>
          <Text style={[styles.totalLabel, { color: sub }]}>{tx.stepsToday}{activitySteps > 0 ? tx.ofWhich(fmtNum(activitySteps)) : ''}</Text>
        </View>

        {/* Simulation controls */}
        {mode === 'sim' && (
          <View style={[styles.simCard, { backgroundColor: card, borderWidth: 1, borderColor: isDark ? '#283241' : 'transparent' }]}>
            <Text style={[styles.simHint, { color: sub, textAlign: txtAlign(isRTL) }]}>{tx.simHint}</Text>
            <View style={[styles.simBtns, { flexDirection: rowDir(isRTL) }]}>
              <TouchableOpacity style={[styles.simBtn, { backgroundColor: walking ? '#ef4444' : '#0ea5e9' }]} onPress={toggleWalk}>
                <Zap size={16} color="#fff" />
                <Text style={styles.simBtnTxt}>{walking ? tx.stop : tx.walk}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.simBtn, { backgroundColor: accent }]} onPress={addChunk}>
                <Plus size={16} color="#fff" />
                <Text style={styles.simBtnTxt}>+1 000</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.simBtnGhost, { borderColor: isDark ? '#283241' : '#cbd5e1' }]} onPress={resetWalk}>
                <RotateCcw size={16} color={sub} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Chargement initial de Health Connect — squelette (pas d'écran vide/flash). */}
        {mode === 'real' && available === null && !connected && (
          <SkeletonCard height={140} />
        )}

        {mode === 'real' && available === false && (
          <View style={[styles.box, { backgroundColor: card }]}>
            <Text style={[styles.boxText, { color: sub }]}>{t('health.unavailable')}</Text>
          </View>
        )}

        {mode === 'real' && available === true && !connected && (
          <>
            <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: accent }]} onPress={connect} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <><HeartPulse size={20} color="#fff" /><Text style={styles.primaryBtnText}>{t('health.connect')}</Text></>}
            </TouchableOpacity>
            {!!msg && <Text style={[styles.msg, { color: sub }]}>{msg}</Text>}
            <TouchableOpacity style={[styles.ghostBtn, { flexDirection: rowDir(isRTL) }]} onPress={openHealthSettings}>
              <HeartPulse size={18} color={accent} />
              <Text style={[styles.ghostText, { color: accent }]}>{tx.openHC}</Text>
            </TouchableOpacity>
            <Text style={[styles.msg, { color: sub }]}>
              {tx.tip}
            </Text>
            <Text style={[styles.msg, { color: sub, marginTop: 8 }]}>
              {tx.watches}
            </Text>
          </>
        )}

        {mode === 'real' && connected && (
          <>
            <Text style={[styles.connected, { color: accent, textAlign: txtAlign(isRTL) }]}>{t('health.connected')}</Text>
            <View style={[styles.statsRow, { flexDirection: rowDir(isRTL) }]}>
              <Stat icon={<Footprints size={22} color={accent} />} label={t('health.steps')} value={data ? fmtNum(data.steps) : '—'} />
              <Stat icon={<Flame size={22} color="#f59e0b" />} label={t('health.active_kcal')} value={data ? fmtNum(data.activeKcal) : '—'} />
              <Stat icon={<Scale size={22} color={accent} />} label={t('health.weight')} value={data?.weightKg != null ? `${fmtNum(data.weightKg)} kg` : '—'} />
            </View>

            {data && data.steps === 0 && data.activeKcal === 0 && (
              <Text style={[styles.noData, { color: sub }]}>{t('health.no_data')}</Text>
            )}

            {data && data.activeKcal > 0 && (
              <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: accent }]} onPress={logActivity}>
                <Plus size={18} color="#fff" /><Text style={styles.primaryBtnText}>{t('health.log_activity')}</Text>
              </TouchableOpacity>
            )}

            {/* Import séances (montre) + poids depuis Health Connect */}
            <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: '#0EA5E9' }]} onPress={syncSessions} disabled={busy}>
              <RefreshCw size={18} color="#fff" /><Text style={styles.primaryBtnText}>{syncLabel}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.ghostBtn, { flexDirection: rowDir(isRTL) }]} onPress={refresh} disabled={busy}>
              <RefreshCw size={18} color={accent} /><Text style={[styles.ghostText, { color: accent }]}>{t('health.refresh')}</Text>
            </TouchableOpacity>
            {!!msg && <Text style={[styles.msg, { color: sub }]}>{msg}</Text>}
          </>
        )}

        {/* Cohérence #133 — disclaimer médical discret (info, pas conseil médical). */}
        <Text style={[styles.disclaimer, { color: sub, textAlign: txtAlign(isRTL) }]}>{tx.disclaimer}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// Fabrique thémée : un StyleSheet est évalué au chargement du module, où `isDark`
// n'existe pas. Le composant l'appelle via useMemo, recalculé au changement de thème.
const makeStyles = (isDark: boolean) => StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 60 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? Colors.dark.gray[50] : Colors.light.gray[50] },
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
  stat: { flex: 1, borderRadius: 18, padding: 16, alignItems: 'center', gap: 6 },
  cardShadow: { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  statIcon: { marginBottom: 2 },
  statValue: { fontSize: 22, fontWeight: '900' },
  statLabel: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  noData: { fontSize: 14, textAlign: 'center', marginVertical: 16, lineHeight: 20 },
  ghostBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, marginTop: 4 },
  ghostText: { color: isDark ? Colors.dark.primary : Colors.light.primary, fontSize: 15, fontWeight: '700' },
  msg: { fontSize: 13, textAlign: 'center', fontWeight: '600', marginTop: 6 },
  modeRow: { flexDirection: 'row', borderRadius: 14, padding: 4, gap: 4, marginBottom: 14 },
  modeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 11 },
  modeTxt: { fontSize: 14, fontWeight: '800' },
  totalCard: { borderRadius: 18, padding: 18, alignItems: 'center', gap: 4, marginBottom: 14 },
  totalSteps: { fontSize: 38, fontWeight: '900', letterSpacing: -1.5 },
  totalLabel: { fontSize: 12.5, fontWeight: '600', textAlign: 'center' },
  simCard: { borderRadius: 18, padding: 16, marginBottom: 14 },
  simHint: { fontSize: 13, fontWeight: '500', lineHeight: 18, marginBottom: 12 },
  simBtns: { flexDirection: 'row', gap: 10 },
  simBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 13, borderRadius: 13 },
  simBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  simBtnGhost: { width: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 13, borderWidth: 1.5, borderColor: '#cbd5e1' },
  readinessTile: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 16, borderWidth: 1, marginBottom: 14 },
  readinessIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(46,139,87,0.12)', alignItems: 'center', justifyContent: 'center' },
  readinessTitle: { fontSize: 15.5, fontWeight: '800' },
  readinessSub: { fontSize: 12.5, fontWeight: '500', marginTop: 2, lineHeight: 17 },
  disclaimer: { ...typo.micro, fontWeight: '500', opacity: 0.7, lineHeight: 16, marginTop: 20 },
});
