import { View, Text, StyleSheet, ScrollView, SafeAreaView, ActivityIndicator } from 'react-native';
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../../constants/Colors';
import HomeHeader from '../../components/HomeHeader';
import BrandBanner from '../../components/BrandBanner';
import WeekCalendar from '../../components/WeekCalendar';
import RemainingCaloriesCard from '../../components/RemainingCaloriesCard';
import WaterIntakeCard from '../../components/WaterIntakeCard';
import StepsCard from '../../components/StepsCard';
import DailyHealthScore from '../../components/DailyHealthScore';
import OfflineBanner from '../../components/OfflineBanner';
import HomeQuickActions from '../../components/HomeQuickActions';
import { useLogging } from '../../lib/LoggingContext';
import { useNutritionData } from '../../hooks/useNutritionData';
import { updateWidgetData } from '../../lib/widgetData';
import { saveUserToFirestore } from '../../lib/firebase';
import { useUser } from '@clerk/clerk-expo';
import { isCacheEmpty, syncAllUserData } from '../../lib/LocalDataStore';

// Session-level guard : on ne veut PAS que HomeScreen relance un sync Firestore
// a chaque retour depuis scan-analysis (ca faisait "reload" l'app). Tant que
// le module est vivant, on ne re-sync qu'UNE fois par user.id.
const _homeSyncedUserIds = new Set<string>();
import ActivityList from '../../components/ActivityList';
import { useTranslation } from '../../lib/i18n';
import { useTheme } from '../../lib/ThemeContext';

export default function HomeScreen() {
  const { user } = useUser();
  const router = useRouter();
  const { t, language } = useTranslation() as any;
  const { resolved } = useTheme();
  // Local FR/EN/AR tagline for the brand banner (D2 — replaces stock cover photo).
  const HSTR: Record<string, { sub: string }> = {
    en: { sub: 'Track. Eat smart. Reach your goal.' },
    fr: { sub: 'Suis. Mange malin. Atteins ton objectif.' },
    ar: { sub: 'تتبّع. كل بذكاء. حقّق هدفك.' },
  };
  const bannerSub = (HSTR[String(language)] || HSTR.en).sub;
  const bgColor = resolved === 'dark' ? '#000000' : 'transparent';
  const { selectedDate, refreshCount, showLogModal } = useLogging();
  const { loading, goals, consumed, logs, refresh } = useNutritionData(selectedDate);

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
        <View style={{ paddingHorizontal: 24 }}>
          <BrandBanner title="Salorie" subtitle={bannerSub} height={110} />
        </View>

        {/* ── Week Calendar Strip ────────────────── */}
        <View style={styles.calendarWrapper}>
          <WeekCalendar />
        </View>

        {/* Lance-toi : courses virtuelles / groupe / défis + notifs */}
        <HomeQuickActions />

        {/* Score santé quotidien — hook de rétention */}
        <DailyHealthScore />

        {/* ── Scrollable Content ─────────────────── */}
        <View style={styles.contentHeader}>
          <Text style={[styles.dateLabel, { color: resolved === 'dark' ? '#fff' : Colors.light.gray[900] }]}>
            {formatDisplayDate(selectedDate)}
          </Text>
          <View style={styles.divider} />
        </View>

        {loading ? (
          <View style={styles.loadingWrapper}>
            <ActivityIndicator size="large" color={Colors.light.primary} />
            <Text style={styles.loadingText}>{t('home.today')}...</Text>
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

            <ActivityList
              logs={logs}
              onAddPress={() => showLogModal()}
            />
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
  contentHeader: {
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 12,
    gap: 12,
  },
  dateLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.light.gray[900],
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.light.gray[100],
  },
  loadingWrapper: {
    marginTop: 60,
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    color: Colors.light.gray[400],
    fontSize: 15,
    fontWeight: '500',
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
