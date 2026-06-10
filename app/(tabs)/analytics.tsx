import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, ActivityIndicator, Image, TouchableOpacity, Modal, Dimensions } from 'react-native';
import { TrendingUp, TrendingDown, Minus, Scale, Check, Circle, ChevronRight, X } from 'lucide-react-native';
import { Colors } from '../../constants/Colors';
import { useAnalyticsData } from '../../hooks/useAnalyticsData';
import { router, useFocusEffect } from 'expo-router';
import { BentoInsight } from '../../lib/AiModel';
import { useTranslation } from '../../lib/i18n';
import { translate } from '../../lib/translator';
import { getInsights, pickLang, StoredInsight, InsightScope } from '../../lib/InsightsService';
import { emailToDocId, fetchAllUserData } from '../../lib/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ScreenTopBar from '../../components/ScreenTopBar';
import BrandBanner from '../../components/BrandBanner';
import MlInsightsCard from '../../components/MlInsightsCard';
import MacroTargets from '../../components/MacroTargets';
import CollapsibleSection from '../../components/CollapsibleSection';
import { useTheme } from '../../lib/ThemeContext';
import { useUser } from '@clerk/clerk-expo';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { useEffect } from 'react';

const { width, height } = Dimensions.get('window');

import { BarChart, LineChart } from 'react-native-chart-kit';

export default function AnalyticsScreen() {
  const { user } = useUser();
  const { t, language } = useTranslation();

  // Local FR/EN/AR strings for the score explanation (D3) + empty-state CTA (D4).
  // Inline to avoid touching the shared i18n file.
  const ASTR: Record<string, Record<string, string>> = {
    en: { banner_title: 'Your Progress', banner_sub: 'Trends, streaks and AI insights from your week.', score_hint: 'What is this?', score_info_title: 'Your Health Score', score_info_body: 'A 0–100 score based on your consistency, nutrition balance, hydration and activity this week. Log meals, water and workouts to raise it.', log_workout: 'Log a workout', close: 'Got it' },
    fr: { banner_title: 'Ta progression', banner_sub: 'Tendances, séries et insights IA de ta semaine.', score_hint: "C'est quoi ?", score_info_title: 'Ton Score Santé', score_info_body: "Un score de 0 à 100 basé sur ta régularité, l'équilibre nutritionnel, l'hydratation et l'activité cette semaine. Logge tes repas, ton eau et tes séances pour le faire monter.", log_workout: 'Logger une séance', close: 'Compris' },
    ar: { banner_title: 'تقدّمك', banner_sub: 'الاتجاهات والسلاسل ورؤى الذكاء لأسبوعك.', score_hint: 'ما هذا؟', score_info_title: 'نقاط صحتك', score_info_body: 'نتيجة من 0 إلى 100 تعتمد على انتظامك وتوازن تغذيتك وترطيبك ونشاطك هذا الأسبوع. سجّل وجباتك ومياهك وتمارينك لرفعها.', log_workout: 'سجّل تمرينًا', close: 'حسنًا' },
  };
  const A_ = (k: string) => (ASTR[String(language)] || ASTR.en)[k] || ASTR.en[k] || k;

  // Map 'Mon'/'Tue'/... (produced by useAnalyticsData) to translated short day
  // names via i18n. Keeps chart labels in the user's language.
  const translateDayShort = (en: string) => {
    const k = `days.${en.toLowerCase()}` as any;
    const v = t(k);
    return v && v !== k ? v : en;
  };
  const { resolved, colors } = useTheme();
  const isDark = resolved === 'dark';
  const bgColor = isDark ? '#000000' : 'transparent';
  // Premium + dark-aware palette (P2/P4): one accent (green) + neutral surfaces,
  // instead of the loud pink/blue/amber cards. All surfaces/text adapt to theme.
  const surface = isDark ? colors.card : '#fff';
  const surfaceSoft = isDark ? '#161c23' : Colors.light.gray[50];
  const tPrimary = isDark ? '#fff' : Colors.light.gray[900];
  const tMuted = isDark ? '#9BA1A6' : Colors.light.gray[500];
  const greenSoft = isDark ? 'rgba(74,222,128,0.12)' : Colors.light.primaryLight;
  const { loading, streakData, weight, weeklyLogs, refresh } = useAnalyticsData();
  const [isStreakModalVisible, setIsStreakModalVisible] = useState(false);
  const [scoreInfoVisible, setScoreInfoVisible] = useState(false);
  // Three period-scoped insight docs. Each holds all 3 languages in one doc,
  // so switching language is free after the first generation. Data flow is
  // handled by InsightsService: cache-first → server compare → regenerate
  // if stale or > 7 days. All 3 languages are persisted in Firestore.
  const [weekIns, setWeekIns] = useState<StoredInsight | null>(null);
  const [monthIns, setMonthIns] = useState<StoredInsight | null>(null);
  const [allIns, setAllIns] = useState<StoredInsight | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  // Real user goal (lose / maintain / gain) and the longer-range data the
  // weekly hook doesn't expose. Loaded once from the cached profile, then
  // upgraded from Firestore. Drives BOTH the AI profile passed to insight
  // generation AND the weight-trend badge below.
  const [goal, setGoal] = useState<'lose' | 'maintain' | 'gain'>('maintain');
  const [weightHistory, setWeightHistory] = useState<Array<{ weight: number; date?: string; timestamp?: number }>>([]);
  // Logs covering ~30 days (and the broadest history we fetch). Used so the
  // month / all-time insight cards aren't graded on just the 7-day window.
  const [extendedLogs, setExtendedLogs] = useState<any[]>([]);

  const normalizeGoal = (g: any): 'lose' | 'maintain' | 'gain' => {
    const s = String(g || '').toLowerCase();
    if (s.includes('lose') || s.includes('lose_weight') || s.includes('cut')) return 'lose';
    if (s.includes('gain') || s.includes('bulk') || s.includes('muscle')) return 'gain';
    return 'maintain';
  };

  // Load the real goal + weight history + extended logs. Cache-first (instant),
  // then Firestore for fresh data. Falls back to 'maintain' only if nothing is
  // available.
  useEffect(() => {
    const email = user?.primaryEmailAddress?.emailAddress || '';
    if (!email) return;
    let cancelled = false;

    (async () => {
      // 1. Cache-first: the analytics hook already caches `profile_${docId}`.
      try {
        const raw = await AsyncStorage.getItem(`profile_${emailToDocId(email)}`);
        if (raw && !cancelled) {
          const p = JSON.parse(raw);
          if (p?.goal) setGoal(normalizeGoal(p.goal));
        }
      } catch (e) {
        console.warn('[Analytics] cached profile read failed:', e);
      }

      // 2. Firestore: real profile.goal + weight_history + 30-day logs.
      try {
        const all = await fetchAllUserData(email);
        if (cancelled || !all) return;
        if (all.profile?.goal) setGoal(normalizeGoal(all.profile.goal));
        if (Array.isArray(all.weightHistory)) setWeightHistory(all.weightHistory);
        if (Array.isArray(all.logs)) setExtendedLogs(all.logs);
      } catch (e) {
        console.warn('[Analytics] fetchAllUserData failed:', e);
      }
    })();

    return () => { cancelled = true; };
  }, [user]);

  // Weight trend derived from real weight_history. `weightHistory` is ordered
  // newest-first (fetchAllUserData uses orderBy timestamp desc). We compare the
  // average of the recent half vs the older half so a single noisy weigh-in
  // doesn't flip the badge.
  const weightTrend = useMemo(() => {
    const series = weightHistory
      .map(w => (typeof w?.weight === 'number' ? w.weight : null))
      .filter((w): w is number => w != null);
    if (series.length < 2) return null; // not enough data to judge a direction

    const recentFirst = series; // newest → oldest
    const half = Math.max(1, Math.floor(recentFirst.length / 2));
    const recentAvg = recentFirst.slice(0, half).reduce((a, b) => a + b, 0) / half;
    const olderSlice = recentFirst.slice(recentFirst.length - half);
    const olderAvg = olderSlice.reduce((a, b) => a + b, 0) / olderSlice.length;
    const delta = recentAvg - olderAvg; // >0 rising, <0 falling

    // Treat tiny changes as flat (< ~0.3 kg of net movement).
    const direction: 'rising' | 'falling' | 'stable' =
      Math.abs(delta) < 0.3 ? 'stable' : delta > 0 ? 'rising' : 'falling';

    // Is this direction good given the user's goal?
    let good: boolean;
    if (goal === 'lose') good = direction === 'falling';
    else if (goal === 'gain') good = direction === 'rising';
    else good = direction === 'stable'; // maintain

    return { direction, good, delta };
  }, [weightHistory, goal]);

  // Kept for compatibility with the existing Bento grid below: read the week
  // doc in the user's language.
  const aiInsights = useMemo(() => pickLang(weekIns, language as any), [weekIns, language]);
  const healthScore = weekIns?.healthScore || 0;
  const ai = (field: keyof BentoInsight) => (aiInsights as any)?.[field];

  // Diagnostic — prints what the Bento card will actually receive for
  // exerciseAnalysis, in the current language + EN fallback.
  useEffect(() => {
    if (!weekIns) { console.log('[AnalyticsScreen] weekIns is null'); return; }
    console.log('[AnalyticsScreen] weekIns keys:', Object.keys(weekIns));
    console.log('[AnalyticsScreen] language=', language,
      '| ai.exerciseAnalysis=', ai('exerciseAnalysis'),
      '| en.exerciseAnalysis=', (weekIns as any)?.en?.exerciseAnalysis,
      '| fr.exerciseAnalysis=', (weekIns as any)?.fr?.exerciseAnalysis);
  }, [weekIns, language]);

  useEffect(() => {
    console.log('[AnalyticsScreen] mounted');
  }, []);

  // Refresh analytics whenever the tab gains focus (e.g. after seeding demo data)
  useFocusEffect(
    React.useCallback(() => {
      console.log('[AnalyticsScreen] focused → refreshing analytics');
      refresh?.();
    }, [refresh])
  );

  useEffect(() => {
    console.log('[AnalyticsScreen] data update — loading:', loading, 'weeklyLogs:', weeklyLogs.length, 'weight:', weight);
  }, [loading, weeklyLogs.length, weight]);

  useEffect(() => {
    const email = user?.primaryEmailAddress?.emailAddress || '';
    if (!email) return;
    const profile = { goal: 'maintain' as const, weight: weight || 70 };

    // Kick off all 3 scopes in parallel. Each call renders cache instantly
    // then upgrades with server/Gemini in the background. The month+all_time
    // calls use weeklyLogs as a proxy; in production we'd fetch the matching
    // range, but for the MVP it's fine because the AI summary still grades
    // consistency.
    let cancelled = false;
    setIsAiLoading(true);
    const scopes: InsightScope[] = ['week', 'month', 'all'];
    const setters: Record<InsightScope, (v: StoredInsight | null) => void> = {
      week: setWeekIns, month: setMonthIns, all: setAllIns,
    };
    Promise.all(scopes.map(scope =>
      getInsights({
        email, scope, profile, logs: weeklyLogs,
        onCacheHit: (ins) => { if (!cancelled) setters[scope](ins); },
      }).then(ins => { if (!cancelled && ins) setters[scope](ins); })
    )).catch(e => console.warn('[Analytics] insights load failed:', e))
      .finally(() => { if (!cancelled) setIsAiLoading(false); });
    return () => { cancelled = true; };
  }, [user, weeklyLogs, weight]);

  const currentStreak = streakData.filter(d => d.hasActivity).length;

  const chartData = {
    labels: streakData.map(d => translateDayShort(d.dayName)),
    datasets: [
      {
        data: streakData.map(d => d.consumedCalories),
        color: (opacity = 1) => `rgba(132, 94, 194, ${opacity})`, // Consumed - Purple
      },
      {
        data: streakData.map(d => d.burnedCalories),
        color: (opacity = 1) => `rgba(255, 153, 102, ${opacity})`, // Burned - Orange
      }
    ],
    legend: [t('analytics.consumed'), t('analytics.burned')]
  };

  const totalWeekConsumed = streakData.reduce((acc, d) => acc + d.consumedCalories, 0);
  const totalWeekBurned = streakData.reduce((acc, d) => acc + d.burnedCalories, 0);
  const netEnergy = totalWeekConsumed - totalWeekBurned;

  const chartConfig = {
    backgroundColor: surface,
    backgroundGradientFrom: surface,
    backgroundGradientTo: surface,
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(132, 94, 194, ${opacity})`,
    labelColor: (opacity = 1) => isDark ? `rgba(155,161,166,${opacity})` : `rgba(107, 114, 128, ${opacity})`,
    style: {
      borderRadius: 16
    },
    barPercentage: 0.6,
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]}>
      <ScrollView 
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <ScreenTopBar />
        <View style={styles.header}>
          <Text style={[styles.title, { color: resolved === 'dark' ? '#fff' : Colors.light.gray[900] }]}>
            {t('analytics.progress')}
          </Text>
        </View>
        <BrandBanner title={A_('banner_title')} subtitle={A_('banner_sub')} height={120} style={{ marginBottom: 16 }} />

        {/* Insights IA — modèles ML backend (prévision poids + reco repas) */}
        <MlInsightsCard />

        {/* Macros par objectif — répartition P/G/L vs cible */}
        <MacroTargets />

        {/* Bento Grid Insights */}
        <View style={styles.bentoContainer}>
          <View style={styles.bentoRow}>
            {/* Cell 1: Weekly Outlook (Large) */}
            <Animated.View entering={FadeInDown.duration(800)} style={styles.bentoSummaryCard}>
              <Text style={styles.bentoLabel}>{t('analytics.weekly_outlook')}</Text>
              {isAiLoading ? (
                <ActivityIndicator size="small" color={Colors.light.primary} style={{ marginTop: 10 }} />
              ) : (
                <Text style={styles.bentoValue}>{ai('summary') || t('analytics.log_more')}</Text>
              )}
            </Animated.View>

            {/* Cell 2: Health Score (Small) — tappable, explains the score (D3) */}
            <TouchableOpacity style={{ flex: 1 }} activeOpacity={0.85} onPress={() => setScoreInfoVisible(true)}>
              <Animated.View entering={FadeInDown.delay(100).duration(800)} style={styles.bentoScoreCard}>
                <Text style={styles.bentoLabel}>{t('analytics.score')}</Text>
                <Text style={styles.bentoScoreValue}>{healthScore || '--'}</Text>
                <View style={styles.scoreIndicator}>
                  <View style={[styles.scoreFill, { width: `${healthScore}%` }]} />
                </View>
                <Text style={styles.scoreHint}>{A_('score_hint')}</Text>
              </Animated.View>
            </TouchableOpacity>
          </View>

          {/* Cell 6 (promoted to top — right under Weekly Outlook): Exercise
              Insight. Kept as plain View (no reanimated) so it cannot get
              stuck at opacity 0 under Bridgeless / Expo Go. */}
          <View style={[styles.bentoFullCard, { backgroundColor: greenSoft, borderColor: colors.primary, borderWidth: 1.5 }]}>
             <View style={[styles.aiBadge, { backgroundColor: colors.primary }]}>
                <Text style={styles.aiBadgeText}>{t('analytics.exercise_insight')}</Text>
             </View>
             <Text style={[styles.bentoRecommendation, { color: tPrimary }]}>
                {ai('exerciseAnalysis') || t('analytics.waiting')}
             </Text>
             {/* D4: actionable empty-state CTA */}
             <TouchableOpacity style={styles.exerciseCta} activeOpacity={0.85} onPress={() => router.push('/log-exercise' as any)}>
                <Text style={styles.exerciseCtaTxt}>{A_('log_workout')}</Text>
             </TouchableOpacity>
          </View>

          <View style={styles.bentoRow}>
             {/* Cell 3: Top Food */}
             <Animated.View entering={FadeInDown.delay(200).duration(800)} style={[styles.bentoCommonCard, { backgroundColor: surfaceSoft, borderColor: isDark ? colors.gray[200] : Colors.light.gray[100] }]}>
                <Text style={styles.bentoLabel}>{t('analytics.top_logged')}</Text>
                <Text style={[styles.bentoSmallValue, { color: tPrimary }]}>{ai('topFood') || '...'}</Text>
             </Animated.View>

             {/* Cell 4: Hydration */}
             <Animated.View entering={FadeInDown.delay(300).duration(800)} style={[styles.bentoCommonCard, { backgroundColor: surfaceSoft, borderColor: isDark ? colors.gray[200] : Colors.light.gray[100] }]}>
                <Text style={[styles.bentoLabel, { color: colors.primary }]}>{t('analytics.hydration')}</Text>
                <Text style={[styles.bentoSmallValue, { color: tPrimary }]}>{ai('hydrationStatus') || '...'}</Text>
             </Animated.View>
          </View>

          {/* Cell 5: Recommendation (Wide) */}
          <Animated.View entering={FadeInDown.delay(400).duration(800)} style={[styles.bentoFullCard, { backgroundColor: greenSoft, borderColor: colors.primary }]}>
             <View style={[styles.aiBadge, { backgroundColor: colors.primary }]}>
                <Text style={styles.aiBadgeText}>{t('analytics.ai_badge')}</Text>
             </View>
             <Text style={[styles.bentoRecommendation, { color: tPrimary }]}>{ai('recommendation') || t('analytics.waiting')}</Text>
          </Animated.View>
        </View>

        {loading ? (
          <View style={styles.loadingWrapper}>
            <ActivityIndicator size="large" color={Colors.light.primary} />
          </View>
        ) : (
          <>
            <CollapsibleSection title="Graphes détaillés">
            {/* Calories Chart Card */}
            <Animated.View entering={FadeInDown.duration(600)} style={[styles.chartCard, { backgroundColor: surface, borderColor: isDark ? colors.gray[200] : Colors.light.gray[50] }]}>
              <View style={styles.chartHeader}>
                <Text style={[styles.chartTitle, { color: tPrimary }]}>{t('analytics.weekly_calories')}</Text>
                <Text style={[styles.chartSubtitle, { color: tMuted }]}>{t('analytics.daily_consumption')}</Text>
              </View>
              
              <View style={styles.chartContainer}>
                <BarChart
                  data={{
                    labels: chartData.labels,
                    datasets: [{ data: streakData.map(d => d.consumedCalories) }]
                  }}
                  width={width - 56} 
                  height={200}
                  yAxisLabel=""
                  yAxisSuffix=""
                  chartConfig={chartConfig}
                  verticalLabelRotation={0}
                  fromZero
                  showValuesOnTopOfBars
                  withInnerLines={false}
                />
              </View>
            </Animated.View>

            {/* Weekly Energy Card */}
            <Animated.View entering={FadeInDown.delay(100).duration(600)} style={[styles.chartCard, { backgroundColor: surface, borderColor: isDark ? colors.gray[200] : Colors.light.gray[50], marginBottom: 32 }]}>
              <View style={styles.chartHeader}>
                <Text style={[styles.chartTitle, { color: tPrimary }]}>{t('analytics.weekly_energy')}</Text>
                <Text style={[styles.chartSubtitle, { color: tMuted }]}>{t('analytics.calorie_balance')}</Text>
              </View>

              <View style={styles.energySummaryRow}>
                <View style={styles.energyStat}>
                  <Text style={styles.energyStatLabel}>{t('analytics.consumed')}</Text>
                  <Text style={[styles.energyStatValue, { color: '#845EC2' }]}>{totalWeekConsumed.toLocaleString()}</Text>
                </View>
                <View style={styles.energyStatDivider} />
                <View style={styles.energyStat}>
                  <Text style={styles.energyStatLabel}>{t('analytics.burned')}</Text>
                  <Text style={[styles.energyStatValue, { color: '#FF9966' }]}>{totalWeekBurned.toLocaleString()}</Text>
                </View>
                <View style={styles.energyStatDivider} />
                <View style={styles.energyStat}>
                  <Text style={styles.energyStatLabel}>{t('analytics.net')}</Text>
                  <Text style={[styles.energyStatValue, { color: Colors.light.gray[900] }]}>{netEnergy.toLocaleString()}</Text>
                </View>
              </View>
              
              <View style={styles.chartContainer}>
                <BarChart
                  data={chartData}
                  width={width - 56} 
                  height={220}
                  yAxisLabel=""
                  yAxisSuffix=""
                  chartConfig={{
                    ...chartConfig,
                    propsForLabels: {
                      fontSize: 10,
                    }
                  }}
                  verticalLabelRotation={0}
                  fromZero
                  withInnerLines={false}
                  showBarTops={false}
                />
              </View>

              <View style={styles.legendRow}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#845EC2' }]} />
                  <Text style={styles.legendText}>{t('analytics.consumed')}</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#FF9966' }]} />
                  <Text style={styles.legendText}>{t('analytics.burned')}</Text>
                </View>
              </View>
            </Animated.View>

            {/* Water Intake Card */}
            <Animated.View entering={FadeInDown.delay(200).duration(600)} style={[styles.chartCard, { backgroundColor: surface, borderColor: isDark ? colors.gray[200] : Colors.light.gray[50] }]}>
              <View style={styles.chartHeader}>
                <Text style={[styles.chartTitle, { color: tPrimary }]}>{t('analytics.water_intake')}</Text>
                <Text style={[styles.chartSubtitle, { color: tMuted }]}>{t('analytics.hydration_levels')}</Text>
              </View>

              <View style={styles.waterSummaryRow}>
                <View style={styles.waterStat}>
                  <Text style={styles.waterStatLabel}>{t('analytics.total_week')}</Text>
                  <Text style={styles.waterStatValue}>
                    {streakData.reduce((acc, d) => acc + d.waterConsumed, 0).toLocaleString()} ml
                  </Text>
                </View>
                <View style={[styles.waterStat, { alignItems: 'flex-end' }]}>
                  <Text style={styles.waterStatLabel}>{t('analytics.daily_avg')}</Text>
                  <Text style={[styles.waterStatValue, { color: Colors.light.gray[500] }]}>
                    {Math.round(streakData.reduce((acc, d) => acc + d.waterConsumed, 0) / 7).toLocaleString()} ml
                  </Text>
                </View>
              </View>
              
              <View style={styles.chartContainer}>
                <LineChart
                  data={{
                    labels: chartData.labels,
                    datasets: [{ data: streakData.map(d => d.waterConsumed) }]
                  }}
                  width={width - 56}
                  height={180}
                  yAxisLabel=""
                  yAxisSuffix="ml"
                  chartConfig={{
                    ...chartConfig,
                    color: (opacity = 1) => `rgba(0, 122, 255, ${opacity})`, // Blue
                    labelColor: (opacity = 1) => `rgba(107, 114, 128, ${opacity})`,
                    propsForDots: {
                      r: "4",
                      strokeWidth: "2",
                      stroke: "#007AFF"
                    }
                  }}
                  bezier
                  fromZero
                  withInnerLines={false}
                  
                />
              </View>
            </Animated.View>
            </CollapsibleSection>

            {/* Stats Row */}
            <View style={styles.statsRow}>
              {/* Streak Card */}
              <TouchableOpacity 
                style={{ flex: 1 }}
                activeOpacity={0.8}
                onPress={() => setIsStreakModalVisible(true)}
              >
                <Animated.View entering={FadeInDown.duration(600)} style={styles.statCard}>
                  <View style={styles.streakIconContainer}>
                    <Image 
                      source={require('../../assets/images/fire.png')} 
                      style={styles.fireIcon} 
                    />
                  </View>
                  <Text style={styles.streakValue}>{currentStreak}</Text>
                  <Text style={styles.streakLabel}>{t('analytics.day_streak')}</Text>
                  
                  {/* 7-Day Grid */}
                  <View style={styles.weekGrid}>
                    {streakData.map((day, index) => (
                      <View key={index} style={styles.dayCol}>
                        <View style={[
                          styles.dayIndicator,
                          day.hasActivity && styles.activeIndicator
                        ]}>
                          {day.hasActivity ? (
                            <Check size={10} color={Colors.light.white} strokeWidth={4} />
                          ) : (
                            <Circle size={10} color={Colors.light.gray[200]} />
                          )}
                        </View>
                        <Text style={styles.dayName}>{translateDayShort(day.dayName)}</Text>
                      </View>
                    ))}
                  </View>
                </Animated.View>
              </TouchableOpacity>

              {/* Weight Card */}
              <TouchableOpacity 
                style={{ flex: 1 }}
                activeOpacity={0.8}
                onPress={() => router.push({
                  pathname: '/update-weight' as any,
                  params: { currentWeight: weight }
                })}
              >
                <Animated.View entering={FadeInDown.delay(200).duration(600)} style={[styles.statCard, styles.weightCard]}>
                <View style={styles.weightIconContainer}>
                  <Scale size={24} color={Colors.light.primary} />
                </View>
                <View style={styles.weightValueRow}>
                  <Text style={styles.weightValue}>{weight || '--'}</Text>
                  <Text style={styles.weightUnit}>kg</Text>
                </View>
                <Text style={styles.weightLabel}>{t('analytics.my_weight')}</Text>
                
                {(() => {
                  const tr = weightTrend;
                  const good = !tr || tr.good;
                  const Icon = !tr || tr.direction === 'stable' ? Minus : tr.direction === 'rising' ? TrendingUp : TrendingDown;
                  const c = good ? '#22C55E' : '#F59E0B';
                  const bgc = good ? '#F0FDF4' : '#FFFBEB';
                  const label = good ? t('analytics.on_track') : `${tr!.delta > 0 ? '+' : ''}${tr!.delta.toFixed(1)} kg`;
                  return (
                    <View style={[styles.trendBadge, { backgroundColor: bgc }]}>
                      <Icon size={14} color={c} />
                      <Text style={[styles.trendText, { color: c }]}>{label}</Text>
                    </View>
                  );
                })()}

                <View style={styles.nextIconContainer}>
                  <ChevronRight size={18} color={Colors.light.gray[300]} strokeWidth={3} />
                </View>
              </Animated.View>
            </TouchableOpacity>
          </View>
          </>
        )}
      </ScrollView>

      {/* Streak Details Modal */}
      <Modal
        visible={isStreakModalVisible}
        transparent
        animationType="none"
        onRequestClose={() => setIsStreakModalVisible(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setIsStreakModalVisible(false)}
        >
          <Animated.View 
            entering={FadeIn.duration(200)}
            style={styles.modalBg} 
          />
          <Animated.View 
            entering={FadeIn.duration(400)}
            style={styles.modalContent}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('analytics.daily_streak')}</Text>
              <TouchableOpacity onPress={() => setIsStreakModalVisible(false)}>
                <X size={24} color={Colors.light.gray[400]} />
              </TouchableOpacity>
            </View>

            <View style={styles.largeStreakCard}>
              <View style={styles.largeIconBox}>
                <Image 
                  source={require('../../assets/images/fire.png')} 
                  style={styles.largeFireIcon} 
                />
              </View>

              <View style={styles.streakInfoRow}>
                <Text style={styles.largeStreakValue}>{currentStreak}</Text>
                <View style={styles.streakChip}>
                   <Text style={styles.chipText}>{t('analytics.keep_going_emoji')}</Text>
                </View>
              </View>
              <Text style={styles.largeStreakLabel}>{t('analytics.day_streak')}</Text>

              <View style={styles.largeWeekGrid}>
                {streakData.map((day, index) => (
                  <View key={index} style={styles.largeDayCol}>
                    <View style={[
                      styles.largeDayIndicator,
                      day.hasActivity && styles.largeActiveIndicator
                    ]}>
                      {day.hasActivity ? (
                        <Check size={16} color={Colors.light.white} strokeWidth={4} />
                      ) : (
                        <Circle size={16} color={Colors.light.gray[200]} />
                      )}
                    </View>
                    <Text style={styles.largeDayName}>{translateDayShort(day.dayName)}</Text>
                  </View>
                ))}
              </View>
            </View>
          </Animated.View>
        </TouchableOpacity>
      </Modal>

      {/* Health Score explanation modal (D3) */}
      <Modal
        visible={scoreInfoVisible}
        transparent
        animationType="none"
        onRequestClose={() => setScoreInfoVisible(false)}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setScoreInfoVisible(false)}>
          <Animated.View entering={FadeIn.duration(200)} style={styles.modalBg} />
          <Animated.View entering={FadeIn.duration(400)} style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{A_('score_info_title')}</Text>
              <TouchableOpacity onPress={() => setScoreInfoVisible(false)}>
                <X size={24} color={Colors.light.gray[400]} />
              </TouchableOpacity>
            </View>
            <View style={styles.scoreInfoBig}>
              <Text style={styles.scoreInfoBigValue}>{healthScore || '--'}</Text>
              <Text style={styles.scoreInfoBigMax}>/ 100</Text>
            </View>
            <Text style={styles.scoreInfoBody}>{A_('score_info_body')}</Text>
            <TouchableOpacity style={styles.scoreInfoBtn} onPress={() => setScoreInfoVisible(false)}>
              <Text style={styles.scoreInfoBtnTxt}>{A_('close')}</Text>
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    padding: 24,
    paddingTop: 20,
    // Tab bar (~60-80px) overlaps the ScrollView bottom; without extra bottom
    // padding the last Bento cards (Exercise Insight, Monthly, All-time) stay
    // hidden behind it — the data loads fine but the cards are never visible.
    paddingBottom: 140,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 40,
    fontWeight: '900',
    color: Colors.light.gray[900],
    letterSpacing: -1.5,
  },
  loadingWrapper: {
    marginTop: 100,
    alignItems: 'center',
  },
  bentoContainer: {
    gap: 12,
    marginBottom: 24,
  },
  bentoRow: {
    flexDirection: 'row',
    gap: 12,
  },
  bentoSummaryCard: {
    flex: 2,
    backgroundColor: Colors.light.gray[900],
    borderRadius: 24,
    padding: 20,
    minHeight: 120,
  },
  bentoScoreCard: {
    flex: 1,
    backgroundColor: Colors.light.primary,
    borderRadius: 24,
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bentoCommonCard: {
    flex: 1,
    backgroundColor: Colors.light.gray[50],
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.light.gray[100],
    minHeight: 100,
  },
  bentoFullCard: {
    backgroundColor: '#FDF2F8',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#FCE7F3',
  },
  bentoLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.light.gray[400],
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  bentoValue: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.light.white,
    lineHeight: 24,
  },
  bentoSmallValue: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.light.gray[800],
  },
  bentoScoreValue: {
    fontSize: 32,
    fontWeight: '900',
    color: Colors.light.white,
  },
  scoreIndicator: {
    height: 4,
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    marginTop: 8,
  },
  scoreFill: {
    height: '100%',
    backgroundColor: Colors.light.white,
    borderRadius: 2,
  },
  scoreHint: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
    marginTop: 6,
    textDecorationLine: 'underline',
  },
  exerciseCta: {
    marginTop: 12,
    alignSelf: 'flex-start',
    backgroundColor: '#065F46',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  exerciseCtaTxt: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },
  scoreInfoBig: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 4,
    marginBottom: 12,
  },
  scoreInfoBigValue: {
    fontSize: 56,
    fontWeight: '900',
    color: Colors.light.primary,
  },
  scoreInfoBigMax: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.light.gray[400],
  },
  scoreInfoBody: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.gray[600],
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 20,
  },
  scoreInfoBtn: {
    backgroundColor: Colors.light.primary,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  scoreInfoBtnTxt: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },
  aiBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#BE185D',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 10,
  },
  aiBadgeText: {
    color: Colors.light.white,
    fontSize: 8,
    fontWeight: '900',
  },
  bentoRecommendation: {
    fontSize: 16,
    fontWeight: '700',
    color: '#9D174D',
  },
  chartCard: {
    backgroundColor: Colors.light.white,
    borderRadius: 32,
    padding: 24,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.05,
    shadowRadius: 24,
    elevation: 8,
    borderWidth: 1.5,
    borderColor: Colors.light.gray[50],
  },
  chartHeader: {
    marginBottom: 20,
  },
  chartTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.light.gray[900],
  },
  chartSubtitle: {
    fontSize: 14,
    color: Colors.light.gray[400],
    fontWeight: '600',
    marginTop: 2,
  },
  chartContainer: {
    marginLeft: -16, 
  },
  waterSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 20,
  },
  waterStat: {
    flex: 1,
  },
  waterStatLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.light.gray[400],
    marginBottom: 4,
  },
  waterStatValue: {
    fontSize: 22,
    fontWeight: '900',
    color: '#007AFF',
  },
  energySummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.light.gray[50],
    padding: 16,
    borderRadius: 20,
    marginBottom: 20,
  },
  energyStat: {
    alignItems: 'center',
    flex: 1,
  },
  energyStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: Colors.light.gray[200],
  },
  energyStatLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.light.gray[400],
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  energyStatValue: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.light.gray[900],
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.light.gray[50],
    paddingTop: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.light.gray[500],
  },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.light.gray[50],
    borderRadius: 32,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.light.gray[100],
  },
  weightCard: {
    backgroundColor: Colors.light.white,
    borderColor: Colors.light.gray[50],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 5,
  },
  streakIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: Colors.light.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  fireIcon: {
    width: 32,
    height: 32,
    resizeMode: 'contain',
  },
  streakValue: {
    fontSize: 28,
    fontWeight: '900',
    color: Colors.light.gray[900],
  },
  streakLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.light.gray[400],
    marginTop: -2,
    marginBottom: 16,
  },
  weekGrid: {
    flexDirection: 'row',
    gap: 4,
    width: '100%',
    justifyContent: 'center',
  },
  dayCol: {
    alignItems: 'center',
    gap: 4,
  },
  dayIndicator: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.light.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.light.gray[100],
  },
  activeIndicator: {
    backgroundColor: Colors.light.primary,
    borderColor: Colors.light.primary,
  },
  dayName: {
    fontSize: 8,
    fontWeight: '700',
    color: Colors.light.gray[300],
    textTransform: 'uppercase',
  },
  weightIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: '#F0F9FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  weightValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  weightValue: {
    fontSize: 32,
    fontWeight: '900',
    color: Colors.light.gray[900],
  },
  weightUnit: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.light.gray[400],
  },
  weightLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.light.gray[400],
    marginBottom: 16,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  trendText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#22C55E',
  },
  nextIconContainer: {
    position: 'absolute',
    bottom: 12,
    right: 12,
  },
  comingSoonCard: {
    marginTop: 24,
    padding: 32,
    backgroundColor: Colors.light.gray[50],
    borderRadius: 32,
    borderWidth: 2,
    borderColor: Colors.light.gray[100],
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  comingSoonTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.light.gray[900],
    marginBottom: 8,
  },
  comingSoonDesc: {
    fontSize: 14,
    color: Colors.light.gray[400],
    textAlign: 'center',
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalContent: {
    width: width - 40,
    backgroundColor: Colors.light.white,
    borderRadius: 36,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.2,
    shadowRadius: 30,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.light.gray[900],
  },
  largeStreakCard: {
    alignItems: 'center',
    backgroundColor: Colors.light.gray[50],
    borderRadius: 32,
    padding: 32,
    borderWidth: 2,
    borderColor: Colors.light.gray[100],
  },
  largeIconBox: {
    width: 80,
    height: 80,
    borderRadius: 28,
    backgroundColor: Colors.light.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  largeFireIcon: {
    width: 44,
    height: 44,
  },
  streakInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  largeStreakValue: {
    fontSize: 48,
    fontWeight: '900',
    color: Colors.light.gray[900],
  },
  streakChip: {
    backgroundColor: Colors.light.white,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: Colors.light.gray[100],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.light.gray[900],
  },
  largeStreakLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.light.gray[400],
    marginBottom: 32,
  },
  largeWeekGrid: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    width: '100%',
  },
  largeDayCol: {
    alignItems: 'center',
    gap: 8,
  },
  largeDayIndicator: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.light.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.light.gray[100],
  },
  largeActiveIndicator: {
    backgroundColor: Colors.light.primary,
    borderColor: Colors.light.primary,
  },
  largeDayName: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.light.gray[400],
    textTransform: 'uppercase',
  },
});
