import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { LinearGradient } from 'expo-linear-gradient';
import { Flame, TrendingDown, TrendingUp, Minus, Lightbulb, Sparkles, ChefHat, ChevronRight, Apple, Trophy } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { Colors } from '../../constants/Colors';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { loadEngagement, EngagementData } from '../../lib/engagement';
import { publishStats } from '../../lib/social';

export default function CoachScreen() {
  const { user } = useUser();
  const { resolved } = useTheme();
  const { t, language } = useTranslation();
  const isDark = resolved === 'dark';
  const [data, setData] = useState<EngagementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const email = user?.primaryEmailAddress?.emailAddress || '';
    if (!email) { setLoading(false); return; }
    try {
      const d = await loadEngagement(email, language);
      setData(d);
      // Publish public stats so friends' leaderboards stay fresh.
      const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.fullName || email.split('@')[0];
      publishStats(email, { name, imageUrl: user?.imageUrl || undefined, streak: d.streak, daysTracked: d.daysTracked }).catch(() => {});
    } catch (e) {
      console.warn('[Coach] load failed', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, language]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const text = isDark ? '#fff' : Colors.light.gray[900];
  const sub = isDark ? '#9BA1A6' : Colors.light.gray[500];
  const card = isDark ? Colors.dark.card : '#fff';
  const bg = isDark ? '#000' : 'transparent';

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
        <ScreenTopBar />
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.light.primary} /></View>
      </SafeAreaView>
    );
  }

  const d = data!;
  const hasPlan = d.recommendedTarget != null;
  const trend = d.weightTrendKgPerWeek;
  const TrendIcon = trend == null || Math.abs(trend) < 0.05 ? Minus : trend < 0 ? TrendingDown : TrendingUp;
  const trendColor = trend == null ? sub : trend < 0 ? '#34D399' : '#fbbf24';
  const unlocked = d.achievements.filter(a => a.unlocked).length;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.light.primary} />}
      >
        <ScreenTopBar />

        <View style={styles.titleRow}>
          <Sparkles size={26} color={Colors.light.primary} />
          <Text style={[styles.title, { color: text }]}>{t('coach.title')}</Text>
        </View>

        {/* ── Adaptive target hero ── */}
        <LinearGradient colors={[Colors.light.primary, Colors.light.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <Text style={styles.heroLabel}>{t('coach.adaptive_label')}</Text>
          {hasPlan ? (
            <>
              <Text style={styles.heroValue}>{d.recommendedTarget}<Text style={styles.heroUnit}> kcal</Text></Text>
              <View style={styles.heroRow}>
                <View style={styles.heroStat}>
                  <Text style={styles.heroStatLabel}>{t('coach.real_burn')}</Text>
                  <Text style={styles.heroStatValue}>{d.adaptiveTDEE} kcal</Text>
                </View>
                <View style={styles.heroDivider} />
                <View style={styles.heroStat}>
                  <Text style={styles.heroStatLabel}>{t('coach.weight_trend')}</Text>
                  <View style={styles.trendRow}>
                    <TrendIcon size={16} color="#fff" />
                    <Text style={styles.heroStatValue}>{trend != null ? `${trend > 0 ? '+' : ''}${trend} kg/wk` : '—'}</Text>
                  </View>
                </View>
              </View>
              <View style={styles.confChip}>
                <Text style={styles.confText}>{t('coach.confidence')}: {t(`coach.conf_${d.confidence}` as any)}</Text>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.heroBuilding}>{t('coach.building_title')}</Text>
              <Text style={styles.heroBuildingSub}>{t('coach.building_sub')}</Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.min(100, (d.daysTracked / 7) * 100)}%` }]} />
              </View>
              <Text style={styles.heroBuildingSub}>{Math.min(d.daysTracked, 7)}/7 {t('coach.days_tracked')}</Text>
            </>
          )}
        </LinearGradient>

        {/* ── Meal plan CTA ── */}
        <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/meal-plan' as any)} style={[styles.mealCta, { backgroundColor: card }]}>
          <View style={styles.mealCtaIcon}><ChefHat size={24} color={Colors.light.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.mealCtaTitle, { color: text }]}>{t('coach.meal_title')}</Text>
            <Text style={[styles.mealCtaSub, { color: sub }]}>{t('coach.meal_sub')}</Text>
          </View>
          <ChevronRight size={22} color={sub} />
        </TouchableOpacity>

        {/* ── Today's nutrients CTA ── */}
        <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/nutrients' as any)} style={[styles.mealCta, { backgroundColor: card }]}>
          <View style={styles.mealCtaIcon}><Apple size={24} color={Colors.light.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.mealCtaTitle, { color: text }]}>{t('coach.nutrients_title')}</Text>
            <Text style={[styles.mealCtaSub, { color: sub }]}>{t('coach.nutrients_sub')}</Text>
          </View>
          <ChevronRight size={22} color={sub} />
        </TouchableOpacity>

        {/* ── Social / leaderboard CTA ── */}
        <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/social' as any)} style={[styles.mealCta, { backgroundColor: card }]}>
          <View style={styles.mealCtaIcon}><Trophy size={24} color={Colors.light.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.mealCtaTitle, { color: text }]}>{t('coach.social_title')}</Text>
            <Text style={[styles.mealCtaSub, { color: sub }]}>{t('coach.social_sub')}</Text>
          </View>
          <ChevronRight size={22} color={sub} />
        </TouchableOpacity>

        {/* ── Streak ── */}
        <View style={[styles.streakCard, { backgroundColor: card }]}>
          <View style={styles.streakIcon}><Flame size={28} color="#f59e0b" /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.streakValue, { color: text }]}>{d.streak} {t('coach.streak_suffix')}</Text>
            <Text style={[styles.streakSub, { color: sub }]}>
              {d.streak === 0 ? t('coach.streak_0') : d.streak < 3 ? t('coach.streak_low') : t('coach.streak_high')}
            </Text>
          </View>
        </View>

        {/* ── Achievements ── */}
        <View style={styles.sectionRow}>
          <Text style={[styles.section, { color: text }]}>{t('coach.achievements')}</Text>
          <Text style={[styles.sectionCount, { color: sub }]}>{unlocked}/{d.achievements.length}</Text>
        </View>
        <View style={styles.badgeGrid}>
          {d.achievements.map(a => (
            <View key={a.id} style={[styles.badge, { backgroundColor: card }, !a.unlocked && styles.badgeLocked]}>
              <Text style={[styles.badgeIcon, !a.unlocked && styles.badgeIconLocked]}>{a.icon}</Text>
              <Text style={[styles.badgeTitle, { color: a.unlocked ? text : sub }]} numberOfLines={1}>{a.title}</Text>
              <Text style={[styles.badgeDesc, { color: sub }]} numberOfLines={2}>{a.desc}</Text>
            </View>
          ))}
        </View>

        {/* ── Daily lesson ── */}
        <View style={styles.sectionRow}>
          <Text style={[styles.section, { color: text }]}>{t('coach.lesson_title')}</Text>
        </View>
        <View style={[styles.lessonCard, { backgroundColor: card }]}>
          <View style={styles.lessonIcon}><Lightbulb size={22} color={Colors.light.primary} /></View>
          <Text style={[styles.lessonTitle, { color: text }]}>{d.lesson.title}</Text>
          <Text style={[styles.lessonBody, { color: sub }]}>{d.lesson.body}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 130 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, marginBottom: 18 },
  title: { fontSize: 30, fontWeight: '900', letterSpacing: -1 },

  hero: { borderRadius: 26, padding: 24, marginBottom: 18 },
  heroLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  heroValue: { color: '#fff', fontSize: 52, fontWeight: '900', marginTop: 4, letterSpacing: -2 },
  heroUnit: { fontSize: 22, fontWeight: '800' },
  heroRow: { flexDirection: 'row', marginTop: 14, gap: 16 },
  heroStat: { flex: 1 },
  heroDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.25)' },
  heroStatLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600' },
  heroStatValue: { color: '#fff', fontSize: 17, fontWeight: '800', marginTop: 2 },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  confChip: { alignSelf: 'flex-start', marginTop: 14, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  confText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  heroBuilding: { color: '#fff', fontSize: 24, fontWeight: '900', marginTop: 6 },
  heroBuildingSub: { color: 'rgba(255,255,255,0.9)', fontSize: 14, marginTop: 8, lineHeight: 20 },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.25)', marginTop: 14, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: '#fff' },

  mealCta: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 20, padding: 16, marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  mealCtaIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: Colors.light.primaryLight, alignItems: 'center', justifyContent: 'center' },
  mealCtaTitle: { fontSize: 17, fontWeight: '800' },
  mealCtaSub: { fontSize: 13, marginTop: 3, lineHeight: 18 },
  streakCard: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 20, padding: 18, marginBottom: 22, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  streakIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#FEF3E0', alignItems: 'center', justifyContent: 'center' },
  streakValue: { fontSize: 20, fontWeight: '900' },
  streakSub: { fontSize: 13, marginTop: 3, lineHeight: 18 },

  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  section: { fontSize: 20, fontWeight: '800' },
  sectionCount: { fontSize: 14, fontWeight: '700' },
  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  badge: { width: '47%', borderRadius: 18, padding: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  badgeLocked: { opacity: 0.55 },
  badgeIcon: { fontSize: 28 },
  badgeIconLocked: { opacity: 0.4 },
  badgeTitle: { fontSize: 15, fontWeight: '800', marginTop: 8 },
  badgeDesc: { fontSize: 12, marginTop: 2, lineHeight: 16 },

  lessonCard: { borderRadius: 20, padding: 20, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  lessonIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.light.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  lessonTitle: { fontSize: 18, fontWeight: '800' },
  lessonBody: { fontSize: 14, marginTop: 6, lineHeight: 21 },
});
