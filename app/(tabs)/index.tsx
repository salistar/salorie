import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity } from 'react-native';
import { flipAuto } from '../../lib/rtl';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { UtensilsCrossed, Activity as ActivityIcon, ChevronRight, Flame } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Card, SkeletonCard , PressableScale, Apparition } from '../../components/ui';
import { spacing, radius, type } from '../../constants/theme';
import HomeHeader from '../../components/HomeHeader';
import BrandBanner from '../../components/BrandBanner';
import WeekCalendar from '../../components/WeekCalendar';
import RemainingCaloriesCard from '../../components/RemainingCaloriesCard';
import WaterIntakeCard from '../../components/WaterIntakeCard';
import StepsCard from '../../components/StepsCard';
import DailyHealthScore from '../../components/DailyHealthScore';
import OfflineBanner from '../../components/OfflineBanner';
import HomeQuickActions from '../../components/HomeQuickActions';
import HomeDiscover from '../../components/HomeDiscover';
import CollapsibleSection from '../../components/CollapsibleSection';
import { useLogging } from '../../lib/LoggingContext';
import { useNutritionData } from '../../hooks/useNutritionData';
import { updateWidgetData } from '../../lib/widgetData';
import { saveUserToFirestore } from '../../lib/firebase';
import { useUser } from '@clerk/clerk-expo';
import { isCacheEmpty, syncAllUserData } from '../../lib/LocalDataStore';
import { getMealStreak } from '../../lib/streaks';
import { useExperiment } from '../../lib/experiments';

// Session-level guard : on ne veut PAS que HomeScreen relance un sync Firestore
// a chaque retour depuis scan-analysis (ca faisait "reload" l'app). Tant que
// le module est vivant, on ne re-sync qu'UNE fois par user.id.
const _homeSyncedUserIds = new Set<string>();
import ActivityList from '../../components/ActivityList';
import { useTranslation } from '../../lib/i18n';
import { useTheme } from '../../lib/ThemeContext';
import FeatureGate from '../../components/FeatureGate';

export default function HomeScreen() {
  const { user } = useUser();
  const router = useRouter();
  const { t, language } = useTranslation() as any;
  const { resolved, colors } = useTheme();
  // Local FR/EN/AR tagline for the brand banner (D2 — replaces stock cover photo).
  const HSTR: Record<string, { sub: string }> = {
    en: { sub: 'Track. Eat smart. Reach your goal.' },
    fr: { sub: 'Suis. Mange malin. Atteins ton objectif.' },
    ar: { sub: 'تتبّع. كل بذكاء. حقّق هدفك.' },
  };
  const bannerSub = (HSTR[String(language)] || HSTR.en).sub;
  const bgColor = resolved === 'dark' ? '#0f1419' : 'transparent';
  const { selectedDate, refreshCount, showLogModal } = useLogging();
  const { loading, goals, consumed, logs, refresh } = useNutritionData(selectedDate);

  // Perf (#17/#24) — callback de log STABLE : les enfants mémoïsés (ActivityList)
  // recevaient une arrow inline recréée à chaque render, ce qui annulait React.memo.
  // useCallback fige la référence tant que showLogModal ne change pas.
  const handleLog = useCallback(() => showLogModal(), [showLogModal]);

  // A/B réel (#191) — test de conversion sur le CTA de log : une tuile plus
  // proéminente augmente-t-elle le logging ? Différence PRÉSENTATIONNELLE seulement,
  // le handler (handleLog) est IDENTIQUE dans les 2 variantes. Exposition loggée
  // automatiquement une fois par useExperiment ('[exp] ...').
  const expUserId = user?.primaryEmailAddress?.emailAddress || user?.id || 'anon';
  const { variant: logCtaVariant } = useExperiment(expUserId, 'home_log_cta', ['control', 'prominent']);

  // #38 — Série repas + gel intelligent, surfacés sur l'accueil (levier rétention).
  const [mealStreak, setMealStreak] = useState<{ streak: number; freezes: number } | null>(null);
  useEffect(() => {
    const email = user?.primaryEmailAddress?.emailAddress;
    if (!email) return;
    getMealStreak(email).then(setMealStreak).catch(() => {});
  }, [user?.primaryEmailAddress?.emailAddress, refreshCount]);

  // Synchronise le widget écran d'accueil (calories + eau du jour) à chaque màj.
  useEffect(() => {
    updateWidgetData({ calories: consumed.calories, water: consumed.water });
  }, [consumed.calories, consumed.water]);

  // Si l app a ete tuee par Android pendant qu on prenait une photo,
  // ActionMenu a persiste l URI dans AsyncStorage (pending_scan_v1). On
  // detecte ca ici et on re-navigue automatiquement vers scan-analysis
  // pour que l utilisateur ne perde pas sa photo.
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('pending_scan_v1');
        if (!raw) return;
        const { uri, at } = JSON.parse(raw);
        const ageMs = Date.now() - (at || 0);
        console.log('\x1b[33m[HomeScreen] pending_scan detecte — ageMs=\x1b[0m', ageMs, '\x1b[33muri=\x1b[0m', uri);
        if (ageMs > 5 * 60 * 1000) {
          // > 5 minutes : trop vieux, probablement abandonne — on nettoie
          console.log('\x1b[31m[HomeScreen] pending_scan trop vieux (>5min), on supprime\x1b[0m');
          await AsyncStorage.removeItem('pending_scan_v1');
          return;
        }
        console.log('\x1b[33m[HomeScreen] → reprise automatique : navigation vers /scan-analysis avec la photo sauvee sur disque (l app avait ete tuee par Android pendant la camera)\x1b[0m');
        router.push({ pathname: '/scan-analysis' as any, params: { imageUri: uri } });
      } catch (e: any) {
        console.warn('[HomeScreen] pending_scan check failed:', e?.message);
      }
    })();
  }, []);

  // Mount log + refresh when a new log is added
  useEffect(() => {
    console.log('[HomeScreen] mounted — selectedDate:', selectedDate);
    // First-connection detection: if the phone cache is empty for this user
    // we fetch EVERYTHING (profile + logs + weight + notifs + insights in 3
    // languages). If cache exists, syncAllUserData still runs so it can
    // compare and refresh any stale entries vs Firestore.
    const email = user?.primaryEmailAddress?.emailAddress || '';
    const uid = user?.id;
    if (!email || !uid) return;
    // Crash de la session précédente ? → envoi automatique au support (best-effort).
    try { require('../../lib/logBuffer').maybeReportCrash(email); } catch {}
    if (_homeSyncedUserIds.has(uid)) {
      console.log('\x1b[33m[HomeScreen] sync deja effectue dans cette session pour\x1b[0m', email, '\x1b[33m— on skip pour eviter le reload quand on revient du scan\x1b[0m');
      return;
    }
    _homeSyncedUserIds.add(uid);
    (async () => {
      try {
        const empty = await isCacheEmpty(email);
        if (empty) {
          console.log('\x1b[33m[HomeScreen] PREMIERE CONNEXION — cache telephone VIDE pour\x1b[0m', email);
          console.log('\x1b[33m[HomeScreen] → recuperation complete des donnees utilisateur en 3 langues depuis Firestore\x1b[0m');
        } else {
          console.log('\x1b[33m[HomeScreen] cache telephone PRESENT pour\x1b[0m', email);
          console.log('\x1b[33m[HomeScreen] → comparaison avec Firestore et mise a jour du cache local si necessaire\x1b[0m');
        }
        await syncAllUserData(email);
        console.log('\x1b[33m[HomeScreen] sync termine — rafraichissement des donnees ecran\x1b[0m');
        refresh();
      } catch (e: any) {
        console.warn('[HomeScreen] first-connection sync failed:', e?.message);
      }
    })();
  }, [user?.id]);

  useEffect(() => {
    if (refreshCount > 0) {
      console.log('[HomeScreen] refreshCount bumped to', refreshCount, '→ refreshing');
      refresh();
    }
  }, [refreshCount]);

  useEffect(() => {
    console.log('[HomeScreen] selectedDate changed:', selectedDate);
  }, [selectedDate]);

  const handleGoalUpdate = async (updates: {
    dailyCalories: number;
    proteins: number;
    carbs: number;
    fats: number;
  }) => {
    const email = user?.primaryEmailAddress?.emailAddress || '';
    if (!user || !email) return;
    try {
      await saveUserToFirestore({
        id: user.id,
        email,
        nutritionalPlan: {
          ...goals,
          ...updates
        }
      });
      refresh();
    } catch (error) {
      console.error('Error updating goal:', error);
    }
  };

  const formatDisplayDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return t('home.today');

    // Localised "Monday, April 19" — goes through i18n instead of en-US.
    const dayKeys = ['sun','mon','tue','wed','thu','fri','sat'] as const;
    const monthKeys = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'] as const;
    const dayName = t(`days.long.${dayKeys[d.getDay()]}` as any);
    const monthName = t(`months.long.${monthKeys[d.getMonth()]}` as any);
    return `${dayName}, ${monthName} ${d.getDate()}`;
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: bgColor }]}>
      <OfflineBanner />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Top Header (brand + language + theme + notif) ──── */}
        <HomeHeader />

        {/* ── Brand Banner (replaces stock cover photo, D2) ──────────────── */}
        <View style={{ paddingHorizontal: spacing.xl }}>
          <BrandBanner title="Salorie" subtitle={bannerSub} height={110} />
        </View>

        {/* ── Week Calendar Strip ────────────────── */}
        <View style={styles.calendarWrapper}>
          <WeekCalendar />
        </View>

        {/* ── Série repas + gel (#38) — visible seulement si série active ET flag 'streaks' ON ── */}
        {mealStreak && mealStreak.streak > 0 ? (
          <FeatureGate flag="streaks" hideWhenDisabled>{(() => {
          const S: Record<string, { d: string; days: string; day: string; prot: string }> = {
            en: { d: 'Meal streak', days: 'days', day: 'day', prot: 'Protected' },
            fr: { d: 'Série repas', days: 'jours', day: 'jour', prot: 'Protégée' },
            ar: { d: 'سلسلة الوجبات', days: 'أيام', day: 'يوم', prot: 'محمية' },
          };
          const s = S[String(language)] || S.en;
          const isDark = resolved === 'dark';
          return (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push('/streaks' as any)}
              style={{
                marginHorizontal: spacing.xl, marginBottom: spacing.md,
                flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
                backgroundColor: isDark ? colors.gray[100] : '#FFF7ED',
                borderRadius: radius.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                borderWidth: 1, borderColor: isDark ? colors.gray[200] : '#FED7AA',
              }}
            >
              <Flame size={22} color="#F59E0B" />
              <Text style={{ ...(type.cardTitle as any), color: colors.gray[900], flex: 1 }}>
                {s.d} · {mealStreak.streak} {mealStreak.streak > 1 ? s.days : s.day}
                {mealStreak.freezes > 0 ? `   🛡️ ${s.prot}${mealStreak.freezes > 1 ? ` ×${mealStreak.freezes}` : ''}` : ''}
              </Text>
              <ChevronRight size={18} color={colors.gray[400]} style={flipAuto()} />
            </TouchableOpacity>
          );
        })()}</FeatureGate>
        ) : null}

        {/* A/B (#191, exp 'home_log_cta') — variante 'prominent' : CTA de log plein
            écran en primary plein + icône, présentation seulement. 'control' = rien
            ici (le chip de log existant dans HomeQuickActions reste la seule entrée).
            Handler IDENTIQUE (handleLog) dans les 2 cas. */}
        {logCtaVariant === 'prominent' ? (() => {
          const LOG_LABEL: Record<string, string> = {
            en: 'Log a meal',
            fr: 'Logger un repas',
            ar: 'سجّل وجبة',
          };
          const label = LOG_LABEL[String(language)] || LOG_LABEL.en;
          return (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handleLog}
              accessibilityRole="button"
              accessibilityLabel={label}
              style={{
                marginHorizontal: spacing.xl, marginBottom: spacing.sm,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                gap: spacing.sm, backgroundColor: colors.primary,
                borderRadius: radius.lg, paddingVertical: spacing.lg, paddingHorizontal: spacing.lg,
              }}
            >
              <UtensilsCrossed size={22} color="#FFFFFF" />
              <Text style={{ ...(type.cardTitle as any), color: '#FFFFFF' }}>{label}</Text>
            </TouchableOpacity>
          );
        })() : null}

        {/* Lance-toi : courses virtuelles / groupe / défis + notifs */}
        <HomeQuickActions onLog={handleLog} />

        {/* Accès rapides : Journal alimentaire + Activité (déplacés ici) */}
        {(() => {
          const txt = colors.gray[900];
          const SHORT: Record<string, { diary: string; activity: string }> = {
            en: { diary: 'Food diary', activity: 'Activity' },
            fr: { diary: 'Journal alimentaire', activity: 'Activité' },
            ar: { diary: 'يوميات الطعام', activity: 'النشاط' },
          };
          const sx = SHORT[String(language)] || SHORT.en;
          return (
            <View style={styles.shortcutRow}>
              <Apparition index={0} style={styles.shortcut}>
                <PressableScale
                  onPress={() => router.push('/diary' as any)}
                  accessibilityRole="button"
                  accessibilityLabel={sx.diary}
                >
                  <Card variant="raised" padded={false} style={styles.shortcutCard}>
                    <View style={[styles.shortcutIcon, { backgroundColor: colors.primaryLight }]}><UtensilsCrossed size={20} color={colors.primary} /></View>
                    <Text style={[styles.shortcutTxt, { color: txt }]} numberOfLines={2}>{sx.diary}</Text>
                  </Card>
                </PressableScale>
              </Apparition>
              <Apparition index={1} style={styles.shortcut}>
                <PressableScale
                  onPress={() => router.push('/activity' as any)}
                  accessibilityRole="button"
                  accessibilityLabel={sx.activity}
                >
                  <Card variant="raised" padded={false} style={styles.shortcutCard}>
                    <View style={[styles.shortcutIcon, { backgroundColor: colors.primaryLight }]}><ActivityIcon size={20} color={colors.primary} /></View>
                    <Text style={[styles.shortcutTxt, { color: txt }]} numberOfLines={2}>{sx.activity}</Text>
                  </Card>
                </PressableScale>
              </Apparition>
            </View>
          );
        })()}

        <HomeDiscover />

        {/* Score santé quotidien — hook de rétention */}
        <DailyHealthScore />

        {/* ── Scrollable Content ─────────────────── */}
        <View style={styles.contentHeader}>
          <Text style={[styles.dateLabel, { color: colors.gray[900] }]}>
            {formatDisplayDate(selectedDate)}
          </Text>
          <View style={[styles.divider, { backgroundColor: colors.gray[100] }]} />
        </View>

        {loading ? (
          <View style={styles.loadingWrapper}>
            <SkeletonCard height={120} />
            <SkeletonCard height={160} />
            <SkeletonCard height={110} />
          </View>
        ) : (
          <>
            {/* Steps first — premium card */}
            <StepsCard />

            <RemainingCaloriesCard
              consumed={consumed.calories}
              goal={goals.calories}
              protein={consumed.protein}
              proteinGoal={goals.protein}
              carbs={consumed.carbs}
              carbsGoal={goals.carbs}
              fat={consumed.fat}
              fatGoal={goals.fat}
              onGoalUpdate={handleGoalUpdate}
            />

            <WaterIntakeCard
              consumedMl={consumed.water}
              goalMl={goals.water}
              onEditPress={() => {
                router.push('/add-water' as any);
              }}
            />

            <CollapsibleSection title={language === 'fr' ? 'Activité récente' : language === 'ar' ? 'النشاط الأخير' : 'Recent activity'}>
              <ActivityList
                logs={logs}
                onAddPress={handleLog}
              />
            </CollapsibleSection>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scroll: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scrollContent: {
    paddingBottom: 120,
  },
  calendarWrapper: {
    marginTop: 6,
    marginBottom: 4,
  },
  shortcutRow: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.xl, marginTop: spacing.xs, marginBottom: spacing.sm },
  shortcut: { flex: 1 },
  shortcutCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md, paddingHorizontal: spacing.md },
  shortcutIcon: { width: 38, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  shortcutTxt: { flex: 1, ...type.sub, fontWeight: '800' },
  contentHeader: {
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  dateLabel: {
    ...type.cardTitle,
  },
  divider: {
    flex: 1,
    height: 1,
  },
  loadingWrapper: {
    paddingHorizontal: spacing.xl,
    marginTop: spacing.lg,
  },
  card: {
    // reserved
  },
  cardTitle: {
    // reserved
  },
  cardSub: {
    // reserved
  },
});
