import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { numLocaleFor } from '../../lib/format';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowLeft, RefreshCw, TrendingUp, AlertTriangle, Apple } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { emailToDocId } from '../../lib/firebase';
import { auth } from '../../lib/firebaseAuth';
import { estimateMicros, MicroReport } from '../../lib/AiModel';
import { getMicrosReport, saveMicrosReport } from '../../lib/aiStore';
import { useScreenGate } from '../../components/FeatureGate';
import { useTokens, Tokens } from '../../constants/tokens';

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function NutrientsScreen() {
  const __gate = useScreenGate('nutrients');
  const { user } = useUser();
  const { resolved } = useTheme();
  const k = useTokens();
  const { t, language } = useTranslation() as any;
  const isDark = resolved === 'dark';
  const styles = useMemo(() => makeStyles(k), [k]);

  // i18n #90 — locale-aware number formatting (display only, no calc change).
  const numLocale = numLocaleFor(language);
  const fmtNum = (n: number) => {
    try { return Number(n).toLocaleString(numLocale); } catch { return String(n); }
  };

  const [foods, setFoods] = useState<{ name: string; calories?: number }[]>([]);
  const [report, setReport] = useState<MicroReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const text = k.text;
  const sub = k.textMuted;
  const card = k.surface;
  const bg = isDark ? k.surface : 'transparent';

  const run = useCallback(async (force = false) => {
    const email = user?.primaryEmailAddress?.emailAddress || '';
    if (!email) { setLoading(false); return; }
    const docId = emailToDocId(email);
    const today = todayStr();
    setLoading(true); setError(null);
    try {
      const raw = await AsyncStorage.getItem(`logs_${docId}`);
      const logs: any[] = raw ? JSON.parse(raw) : [];
      const meals = logs.filter((l) => l?.type === 'meal' && l.date === today)
        .map((l) => ({ name: l.name as string, calories: l.calories as number }));
      setFoods(meals);

      if (meals.length === 0) { setReport(null); setLoading(false); return; }

      const hash = meals.map((m) => `${m.name}:${Math.round(m.calories || 0)}`).sort().join('|');
      // Cache PER LANGUAGE — otherwise switching language would return the
      // micronutrient names/insights generated in the previous language.
      const cacheKey = `micros_${docId}_${today}_${language}`;
      if (!force) {
        // 1) local cache
        const cachedRaw = await AsyncStorage.getItem(cacheKey);
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw);
          if (cached.hash === hash && cached.report) { setReport(cached.report); setLoading(false); return; }
        }
        // 2) Firestore (DB table) — survives reinstall / other devices
        const dbReport = await getMicrosReport(email, today, language, hash);
        if (dbReport) {
          setReport(dbReport);
          await AsyncStorage.setItem(cacheKey, JSON.stringify({ hash, report: dbReport })).catch(() => {});
          setLoading(false); return;
        }
      }
      // 3) DETERMINISTIC backend (0 AI — computed from OpenFoodFacts, Redis-cached)
      //    if configured; otherwise fall back to Gemini.
      let rep: any = null;
      const apiUrl = (process.env.EXPO_PUBLIC_API_URL || '').trim();
      if (apiUrl) {
        try {
          const ctrl = new AbortController();
          const to = setTimeout(() => ctrl.abort(), 4000);
          const tok = await auth.currentUser?.getIdToken().catch(() => null);
          const res = await fetch(`${apiUrl}/nutrition/micros`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
            body: JSON.stringify({ foods: meals, lang: language }), signal: ctrl.signal,
          });
          clearTimeout(to);
          const j = await res.json();
          if (j?.micros?.length) rep = { micros: j.micros, highlight: j.good || '', gap: j.lack || '' };
        } catch { /* backend unreachable → Gemini */ }
      }
      if (!rep) rep = await estimateMicros(meals, (language as any) || 'en');
      setReport(rep);
      await AsyncStorage.setItem(cacheKey, JSON.stringify({ hash, report: rep })).catch(() => {});
      saveMicrosReport(email, today, language, hash, rep);
    } catch (e) {
      setError('Could not estimate nutrients. Check your connection and retry.');
    } finally {
      setLoading(false);
    }
  }, [user, language]);

  useEffect(() => { run(false); }, [run]);

  if (!__gate.ok) return __gate.node;

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.container, { backgroundColor: bg }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenTopBar showBack showBrand={false} showNotif={false} />

        <View style={styles.titleRow}>
          <Apple size={26} color={k.accent} />
          <Text style={[styles.title, { color: text }]}>{t('nutrients.title')}</Text>
        </View>
        <Text style={[styles.subtitle, { color: sub }]}>
          {t('nutrients.subtitle')}
        </Text>
        <Image source={require('../../assets/images/illustrations/splash_bg.jpg')} style={styles.hero} resizeMode="cover" />

        {loading && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={k.accent} />
            <Text style={[styles.loadingText, { color: sub }]}>{t('nutrients.analyzing')}</Text>
          </View>
        )}

        {!loading && foods.length === 0 && (
          <View style={[styles.emptyBox, { backgroundColor: card }]}>
            <Apple size={40} color={k.textFaint} />
            <Text style={[styles.emptyTitle, { color: text }]}>{t('nutrients.empty_title')}</Text>
            <Text style={[styles.emptySub, { color: sub }]}>{t('nutrients.empty_sub')}</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/food-database' as any)}>
              <Text style={styles.primaryBtnText}>{t('nutrients.log_food')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && error && foods.length > 0 && (
          <View style={[styles.emptyBox, { backgroundColor: card }]}>
            <Text style={{ color: k.danger, fontWeight: '600', textAlign: 'center' }}>{t('nutrients.error')}</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => run(true)}>
              <RefreshCw size={18} color={k.onAccent} /><Text style={styles.primaryBtnText}>{t('nutrients.retry')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && report && (
          <>
            <Text style={[styles.basedOn, { color: sub }]}>{t('nutrients.based_on')} {fmtNum(foods.length)} {t('nutrients.items')}: {foods.map(f => f.name).join(', ')}</Text>

            <View style={[styles.microCard, { backgroundColor: card }]}>
              {report.micros.map((mi, i) => (
                <View key={i} style={styles.microRow}>
                  <Text style={[styles.microName, { color: text }]} numberOfLines={1}>{mi.name}</Text>
                  <View style={styles.microBarTrack}>
                    <View style={[styles.microBarFill, { width: `${Math.min(100, Math.max(2, mi.pct))}%`, backgroundColor: mi.pct >= 90 ? k.success : mi.pct >= 50 ? k.accent: k.warning }]} />
                  </View>
                  <Text style={[styles.microPct, { color: sub }]}>{fmtNum(mi.pct)}%</Text>
                </View>
              ))}
            </View>

            {!!report.highlight && (
              <View style={[styles.insightCard, { backgroundColor: k.successSoft }]}>
                <TrendingUp size={20} color={k.success} />
                <Text style={[styles.insightText, { color: k.successInk }]}>{report.highlight}</Text>
              </View>
            )}
            {!!report.gap && (
              <View style={[styles.insightCard, { backgroundColor: k.warningSoft }]}>
                <AlertTriangle size={20} color={k.warning} />
                <Text style={[styles.insightText, { color: k.warningInk }]}>{report.gap}</Text>
              </View>
            )}

            <TouchableOpacity style={styles.regenBtn} onPress={() => run(true)}>
              <RefreshCw size={18} color={k.accent} /><Text style={styles.regenText}>{t('nutrients.recalculate')}</Text>
            </TouchableOpacity>
            <Text style={[styles.disclaimer, { color: sub }]}>{t('nutrients.disclaimer')}</Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// Fabrique thémée : un StyleSheet est évalué au chargement du module, où `isDark`
// n'existe pas. Le composant l'appelle via useMemo, recalculé au changement de thème.
const makeStyles = (k: Tokens) => StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 60 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: k.surfaceSunken },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  title: { fontSize: 28, fontWeight: '900', letterSpacing: -1 },
  subtitle: { fontSize: 14, marginTop: 8, marginBottom: 14, lineHeight: 20 },
  hero: { width: '100%', height: 130, borderRadius: 18, marginBottom: 16 },
  loadingBox: { alignItems: 'center', gap: 12, paddingVertical: 60 },
  loadingText: { fontSize: 15, fontWeight: '600' },
  emptyBox: { borderRadius: 20, padding: 28, alignItems: 'center', gap: 12, marginTop: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '800' },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  primaryBtn: { flexDirection: 'row', gap: 8, backgroundColor: k.accent, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginTop: 6 },
  primaryBtnText: { color: k.onAccent, fontSize: 15, fontWeight: '800' },
  basedOn: { fontSize: 13, marginBottom: 14, lineHeight: 18 },
  microCard: { borderRadius: 18, padding: 16, marginBottom: 16, gap: 13 },
  microRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  microName: { width: 96, fontSize: 13, fontWeight: '700' },
  microBarTrack: { flex: 1, height: 9, borderRadius: 5, backgroundColor: 'rgba(120,140,130,0.18)', overflow: 'hidden' },
  microBarFill: { height: 9, borderRadius: 5 },
  microPct: { width: 46, textAlign: 'right', fontSize: 13, fontWeight: '700' },
  insightCard: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', borderRadius: 16, padding: 16, marginBottom: 12 },
  insightText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  regenBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, marginTop: 4 },
  regenText: { color: k.accent, fontSize: 15, fontWeight: '700' },
  disclaimer: { fontSize: 11, textAlign: 'center', marginTop: 6 },
});
