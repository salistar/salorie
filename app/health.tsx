import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { router } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { ArrowLeft, Footprints, Flame, Scale, RefreshCw, HeartPulse, Plus } from 'lucide-react-native';
import ScreenTopBar from '../components/ScreenTopBar';
import { Colors } from '../constants/Colors';
import { useTheme } from '../lib/ThemeContext';
import { useTranslation } from '../lib/i18n';
import { isHealthAvailable, connectHealth, readToday, HealthToday } from '../lib/health';
import { addNutritionLog } from '../lib/firebase';

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

  useEffect(() => { isHealthAvailable().then(setAvailable); }, []);

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

        {available === false && (
          <View style={[styles.box, { backgroundColor: card }]}>
            <Text style={[styles.boxText, { color: sub }]}>{t('health.unavailable')}</Text>
          </View>
        )}

        {available !== false && !connected && (
          <TouchableOpacity style={styles.primaryBtn} onPress={connect} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <><HeartPulse size={20} color="#fff" /><Text style={styles.primaryBtnText}>{t('health.connect')}</Text></>}
          </TouchableOpacity>
        )}

        {connected && (
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
});
