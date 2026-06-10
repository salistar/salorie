import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, ActivityIndicator, RefreshControl, TouchableOpacity, Modal, Pressable } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { LinearGradient } from 'expo-linear-gradient';
import { Flame, TrendingDown, TrendingUp, Minus, Lightbulb, Sparkles, ChefHat, ChevronRight, Apple, Trophy, HeartPulse, Lock, CheckCircle2, X, Dumbbell, MapPin, ScanText, Timer } from 'lucide-react-native';

const PLANS_CTA: Record<string, { t: string; s: string }> = {
  en: { t: 'Workout plans', s: 'Ready-made training programs' },
  fr: { t: 'Plans sportifs', s: "Des programmes d'entraînement prêts à l'emploi" },
  ar: { t: 'برامج رياضية', s: 'برامج تدريب جاهزة' },
};
const RUN_CTA: Record<string, { t: string; s: string }> = {
  en: { t: 'Solo run (GPS)', s: 'Track distance, pace & calories on the map' },
  fr: { t: 'Course solo (GPS)', s: 'Distance, allure & calories sur la carte' },
  ar: { t: 'جري فردي (GPS)', s: 'المسافة والإيقاع والسعرات على الخريطة' },
};
const RACES_CTA: Record<string, { t: string; s: string }> = {
  en: { t: 'Races & challenges', s: 'Live group races + virtual distance challenges' },
  fr: { t: 'Courses & défis', s: 'Courses groupe en direct + défis distance virtuels' },
  ar: { t: 'سباقات وتحديات', s: 'سباقات جماعية مباشرة + تحديات مسافة افتراضية' },
};

// Small inline strings (avoid editing the large i18n dictionary) for the
// achievements tap-affordance + detail modal.
const ACH_STR: Record<string, { hint: string; unlocked: string; locked: string; lockedMsg: string }> = {
  en: { hint: 'Tap a trophy to see how to unlock it', unlocked: 'Unlocked', locked: 'Locked', lockedMsg: 'Keep going to unlock this trophy!' },
  fr: { hint: 'Touche un trophée pour voir comment le débloquer', unlocked: 'Débloqué', locked: 'Verrouillé', lockedMsg: 'Continue comme ça pour débloquer ce trophée !' },
  ar: { hint: 'اضغط على وسام لمعرفة كيفية فتحه', unlocked: 'مفتوح', locked: 'مقفل', lockedMsg: 'واصل لفتح هذا الوسام!' },
};
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
  const [selAch, setSelAch] = useState<any>(null);
  const astr = ACH_STR[language] || ACH_STR.en;

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

        {/* ── Health sync CTA ── */}
        <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/health' as any)} style={[styles.mealCta, { backgroundColor: card }]}>
          <View style={styles.mealCtaIcon}><HeartPulse size={24} color={Colors.light.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.mealCtaTitle, { color: text }]}>{t('coach.health_title')}</Text>
            <Text style={[styles.mealCtaSub, { color: sub }]}>{t('coach.health_sub')}</Text>
          </View>
          <ChevronRight size={22} color={sub} />
        </TouchableOpacity>

        {/* ── Compteur de reps on-device (accéléromètre) ── */}
        <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/rep-counter' as any)} style={[styles.mealCta, { backgroundColor: card }]}>
          <View style={styles.mealCtaIcon}><Dumbbell size={24} color={Colors.light.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.mealCtaTitle, { color: text }]}>Compteur de reps</Text>
            <Text style={[styles.mealCtaSub, { color: sub }]}>Compte tes répétitions en temps réel (on-device)</Text>
          </View>
          <ChevronRight size={22} color={sub} />
        </TouchableOpacity>

        {/* ── Scanner d'étiquette OCR on-device (MLKit) ── */}
        <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/label-scan' as any)} style={[styles.mealCta, { backgroundColor: card }]}>
          <View style={styles.mealCtaIcon}><ScanText size={24} color={Colors.light.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.mealCtaTitle, { color: text }]}>Scanner une étiquette</Text>
            <Text style={[styles.mealCtaSub, { color: sub }]}>Lis le tableau nutritionnel par OCR (on-device)</Text>
          </View>
          <ChevronRight size={22} color={sub} />
        </TouchableOpacity>

        {/* ── Reconnaissance d'aliments TFLite on-device ── */}
        <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/food-recognition' as any)} style={[styles.mealCta, { backgroundColor: card }]}>
          <View style={styles.mealCtaIcon}><Apple size={24} color={Colors.light.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.mealCtaTitle, { color: text }]}>Reconnaître un aliment</Text>
            <Text style={[styles.mealCtaSub, { color: sub }]}>Classe ton plat par photo (TFLite on-device)</Text>
          </View>
          <ChevronRight size={22} color={sub} />
        </TouchableOpacity>

        {/* ── Jeûne intermittent ── */}
        <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/fasting' as any)} style={[styles.mealCta, { backgroundColor: card }]}>
          <View style={styles.mealCtaIcon}><Timer size={24} color={Colors.light.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.mealCtaTitle, { color: text }]}>Jeûne intermittent</Text>
            <Text style={[styles.mealCtaSub, { color: sub }]}>Minuteur 16:8 · 18:6 · 20:4 (on-device)</Text>
          </View>
          <ChevronRight size={22} color={sub} />
        </TouchableOpacity>

        {/* ── Workout plans CTA ── */}
        <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/workout-plans' as any)} style={[styles.mealCta, { backgroundColor: card }]}>
          <View style={styles.mealCtaIcon}><Dumbbell size={24} color={Colors.light.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.mealCtaTitle, { color: text }]}>{(PLANS_CTA[language] || PLANS_CTA.en).t}</Text>
            <Text style={[styles.mealCtaSub, { color: sub }]}>{(PLANS_CTA[language] || PLANS_CTA.en).s}</Text>
          </View>
          <ChevronRight size={22} color={sub} />
        </TouchableOpacity>

        {/* ── Solo run (GPS) CTA ── */}
        <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/run' as any)} style={[styles.mealCta, { backgroundColor: card }]}>
          <View style={styles.mealCtaIcon}><MapPin size={24} color={Colors.light.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.mealCtaTitle, { color: text }]}>{(RUN_CTA[language] || RUN_CTA.en).t}</Text>
            <Text style={[styles.mealCtaSub, { color: sub }]}>{(RUN_CTA[language] || RUN_CTA.en).s}</Text>
          </View>
          <ChevronRight size={22} color={sub} />
        </TouchableOpacity>

        {/* ── Races & challenges CTA (Phase 2 + 3) ── */}
        <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/races' as any)} style={[styles.mealCta, { backgroundColor: card }]}>
          <View style={styles.mealCtaIcon}><Trophy size={24} color={Colors.light.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.mealCtaTitle, { color: text }]}>{(RACES_CTA[language] || RACES_CTA.en).t}</Text>
            <Text style={[styles.mealCtaSub, { color: sub }]}>{(RACES_CTA[language] || RACES_CTA.en).s}</Text>
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
        <Text style={[styles.achHint, { color: sub }]}>{astr.hint}</Text>
        <View style={styles.badgeGrid}>
          {d.achievements.map(a => (
            <TouchableOpacity
              key={a.id}
              activeOpacity={0.8}
              onPress={() => setSelAch(a)}
              style={[styles.badge, { backgroundColor: card }, !a.unlocked && styles.badgeLocked]}
            >
              {/* status corner: check when unlocked, lock when not */}
              <View style={styles.badgeCorner}>
                {a.unlocked ? <CheckCircle2 size={16} color={Colors.light.primary} /> : <Lock size={14} color={sub} />}
              </View>
              <Text style={[styles.badgeIcon, !a.unlocked && styles.badgeIconLocked]}>{a.icon}</Text>
              <Text style={[styles.badgeTitle, { color: a.unlocked ? text : sub }]} numberOfLines={1}>{a.title}</Text>
              <Text style={[styles.badgeDesc, { color: sub }]} numberOfLines={2}>{a.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Achievement detail modal ── */}
        <Modal visible={!!selAch} transparent animationType="fade" onRequestClose={() => setSelAch(null)}>
          <Pressable style={styles.modalOverlay} onPress={() => setSelAch(null)}>
            <Pressable style={[styles.modalCard, { backgroundColor: card }]} onPress={() => {}}>
              <TouchableOpacity style={styles.modalClose} onPress={() => setSelAch(null)}><X size={20} color={sub} /></TouchableOpacity>
              <Text style={styles.modalIcon}>{selAch?.icon}</Text>
              <Text style={[styles.modalTitle, { color: text }]}>{selAch?.title}</Text>
              <Text style={[styles.modalDesc, { color: sub }]}>{selAch?.desc}</Text>
              <View style={[styles.statusPill, { backgroundColor: selAch?.unlocked ? 'rgba(41,143,80,0.15)' : 'rgba(120,140,130,0.15)' }]}>
                {selAch?.unlocked ? <CheckCircle2 size={16} color={Colors.light.primary} /> : <Lock size={14} color={sub} />}
                <Text style={[styles.statusText, { color: selAch?.unlocked ? Colors.light.primaryDark : sub }]}>
                  {selAch?.unlocked ? astr.unlocked : astr.locked}
                </Text>
              </View>
              {!selAch?.unlocked && <Text style={[styles.modalHint, { color: sub }]}>{astr.lockedMsg}</Text>}
            </Pressable>
          </Pressable>
        </Modal>

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
  achHint: { fontSize: 12.5, fontWeight: '600', marginTop: -4, marginBottom: 12 },
  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  badge: { width: '47%', borderRadius: 18, padding: 14, position: 'relative', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  badgeLocked: { opacity: 0.6 },
  badgeCorner: { position: 'absolute', top: 10, right: 10 },
  badgeIcon: { fontSize: 28 },
  badgeIconLocked: { opacity: 0.4 },
  badgeTitle: { fontSize: 15, fontWeight: '800', marginTop: 8 },
  badgeDesc: { fontSize: 12, marginTop: 2, lineHeight: 16 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  modalCard: { width: '100%', maxWidth: 360, borderRadius: 24, padding: 28, alignItems: 'center' },
  modalClose: { position: 'absolute', top: 14, right: 14, padding: 6 },
  modalIcon: { fontSize: 56, marginTop: 6 },
  modalTitle: { fontSize: 22, fontWeight: '900', marginTop: 12, textAlign: 'center' },
  modalDesc: { fontSize: 15, marginTop: 8, textAlign: 'center', lineHeight: 21 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, marginTop: 18 },
  statusText: { fontSize: 14, fontWeight: '800' },
  modalHint: { fontSize: 13, marginTop: 14, textAlign: 'center', lineHeight: 18 },

  lessonCard: { borderRadius: 20, padding: 20, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  lessonIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.light.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  lessonTitle: { fontSize: 18, fontWeight: '800' },
  lessonBody: { fontSize: 14, marginTop: 6, lineHeight: 21 },
});
