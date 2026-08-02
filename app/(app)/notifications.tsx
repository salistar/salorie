import ScreenTopBar from '../../components/ScreenTopBar';
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ChevronLeft,
  Bell,
  Trash2,
  Inbox,
  Clock,
  Circle,
  X,
} from 'lucide-react-native';
import { FlashList } from '@shopify/flash-list';
import { Colors } from '../../constants/Colors';
import {
  collection,
  query,
  orderBy,
  getDocs,
  doc,
  writeBatch,
  updateDoc,
} from 'firebase/firestore';
import { db, emailToDocId } from '../../lib/firebase';
import Animated, { FadeInDown, Layout } from 'react-native-reanimated';
import { useTranslation } from '../../lib/i18n';
import { useTheme } from '../../lib/ThemeContext';

const TXT: Record<string, {
  notifications: string;
  inboxEmpty: string;
  inboxSubtitle: string;
  calorieTarget: string;
  calories: string;
  protein: string;
  carbs: string;
  fats: string;
  hydrationGoal: string;
  dailyGoal: string;
  logWater: string;
  weeklyAnalytics: string;
  analyticsHint: string;
  goToAnalytics: string;
  yourProfile: string;
  name: string;
  email: string;
  goal: string;
  weight: string;
  language: string;
}> = {
  en: {
    notifications: 'Notifications',
    inboxEmpty: 'Your inbox is empty',
    inboxSubtitle: 'All your future updates and reminders will appear here.',
    calorieTarget: 'Daily Calorie Target',
    calories: 'Calories',
    protein: 'Protein',
    carbs: 'Carbs',
    fats: 'Fats',
    hydrationGoal: 'Hydration Goal',
    dailyGoal: 'Daily goal',
    logWater: 'Log water intake →',
    weeklyAnalytics: 'Weekly Analytics',
    analyticsHint: 'Open your dashboard for the full AI insights.',
    goToAnalytics: 'Go to Analytics →',
    yourProfile: 'Your Profile',
    name: 'Name',
    email: 'Email',
    goal: 'Goal',
    weight: 'Weight',
    language: 'Language',
  },
  fr: {
    notifications: 'Notifications',
    inboxEmpty: 'Votre boîte de réception est vide',
    inboxSubtitle: 'Toutes vos futures mises à jour et rappels apparaîtront ici.',
    calorieTarget: 'Objectif calorique quotidien',
    calories: 'Calories',
    protein: 'Protéines',
    carbs: 'Glucides',
    fats: 'Lipides',
    hydrationGoal: 'Objectif d’hydratation',
    dailyGoal: 'Objectif quotidien',
    logWater: 'Enregistrer la consommation d’eau →',
    weeklyAnalytics: 'Analyses hebdomadaires',
    analyticsHint: 'Ouvrez votre tableau de bord pour les analyses IA complètes.',
    goToAnalytics: 'Aller aux analyses →',
    yourProfile: 'Votre profil',
    name: 'Nom',
    email: 'E-mail',
    goal: 'Objectif',
    weight: 'Poids',
    language: 'Langue',
  },
  ar: {
    notifications: 'الإشعارات',
    inboxEmpty: 'صندوق الوارد فارغ',
    inboxSubtitle: 'ستظهر هنا جميع تحديثاتك وتذكيراتك المستقبلية.',
    calorieTarget: 'هدف السعرات الحرارية اليومي',
    calories: 'السعرات الحرارية',
    protein: 'البروتين',
    carbs: 'الكربوهيدرات',
    fats: 'الدهون',
    hydrationGoal: 'هدف الترطيب',
    dailyGoal: 'الهدف اليومي',
    logWater: '← تسجيل شرب الماء',
    weeklyAnalytics: 'التحليلات الأسبوعية',
    analyticsHint: 'افتح لوحة التحكم للحصول على تحليلات الذكاء الاصطناعي الكاملة.',
    goToAnalytics: '← الذهاب إلى التحليلات',
    yourProfile: 'ملفك الشخصي',
    name: 'الاسم',
    email: 'البريد الإلكتروني',
    goal: 'الهدف',
    weight: 'الوزن',
    language: 'اللغة',
  },
};

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  receivedAt: string;
  read?: boolean;
  data?: { kind?: string };
}

export default function NotificationsScreen() {
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  const styles = useMemo(() => makeStyles(isDark), [isDark]);
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress || '';
  const docId = emailToDocId(email);

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cachedProfile, setCachedProfile] = useState<any>(null);
  const [selected, setSelected] = useState<NotificationItem | null>(null);

  const fetchNotifications = async () => {
    if (!docId) {
      setLoading(false);
      return;
    }
    try {
      const q = query(
        collection(db, 'users', docId, 'notifications_history'),
        orderBy('timestamp', 'desc')
      );
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(
        (d) => ({ id: d.id, ...d.data() } as NotificationItem)
      );
      setNotifications(data);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    // Load the cached profile that was hydrated at login
    AsyncStorage.getItem(`profile_${docId}`)
      .then((raw) => (raw ? setCachedProfile(JSON.parse(raw)) : null))
      .catch(() => {});
  }, [docId]);

  const clearAll = async () => {
    if (!docId || notifications.length === 0) return;
    try {
      const batch = writeBatch(db);
      notifications.forEach((notif) => {
        const ref = doc(db, 'users', docId, 'notifications_history', notif.id);
        batch.delete(ref);
      });
      await batch.commit();
      setNotifications([]);
    } catch (error) {
      console.error('Error clearing notifications:', error);
    }
  };

  const openNotification = async (item: NotificationItem) => {
    setSelected(item);
    // Mark as read
    if (!item.read && docId) {
      try {
        await updateDoc(
          doc(db, 'users', docId, 'notifications_history', item.id),
          { read: true }
        );
        setNotifications((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, read: true } : n))
        );
      } catch {}
    }
  };

  const renderCardDetail = () => {
    if (!selected) return null;
    const kind = selected.data?.kind;
    const plan = cachedProfile?.nutritionalPlan || {};

    const detailCardStyle = [styles.detailCard, isDark && { backgroundColor: Colors.dark.card }];
    const detailTitleStyle = [styles.detailTitle, { color: isDark ? '#fff' : Colors.light.gray[900], textAlign: isRTL ? 'right' as const : 'left' as const }];
    const detailRowStyle = [styles.detailRow, { flexDirection: isRTL ? 'row-reverse' as const : 'row' as const }];
    const detailLabelStyle = [styles.detailLabel, { color: isDark ? '#9BA1A6' : Colors.light.gray[500], textAlign: isRTL ? 'right' as const : 'left' as const }];
    const detailValueStyle = [styles.detailValue, { color: isDark ? '#fff' : Colors.light.gray[900], textAlign: isRTL ? 'right' as const : 'left' as const }];

    if (kind === 'calories') {
      return (
        <View style={detailCardStyle}>
          <Text style={detailTitleStyle}>{t.calorieTarget}</Text>
          <View style={detailRowStyle}>
            <Text style={detailLabelStyle}>{t.calories}</Text>
            <Text style={detailValueStyle}>{plan.dailyCalories || plan.calories || '--'} kcal</Text>
          </View>
          <View style={detailRowStyle}>
            <Text style={detailLabelStyle}>{t.protein}</Text>
            <Text style={detailValueStyle}>{plan.proteins || plan.protein || '--'} g</Text>
          </View>
          <View style={detailRowStyle}>
            <Text style={detailLabelStyle}>{t.carbs}</Text>
            <Text style={detailValueStyle}>{plan.carbs || '--'} g</Text>
          </View>
          <View style={detailRowStyle}>
            <Text style={detailLabelStyle}>{t.fats}</Text>
            <Text style={detailValueStyle}>{plan.fats || plan.fat || '--'} g</Text>
          </View>
        </View>
      );
    }

    if (kind === 'water') {
      return (
        <View style={detailCardStyle}>
          <Text style={detailTitleStyle}>{t.hydrationGoal}</Text>
          <View style={detailRowStyle}>
            <Text style={detailLabelStyle}>{t.dailyGoal}</Text>
            <Text style={detailValueStyle}>{plan.water || 2500} ml</Text>
          </View>
          <TouchableOpacity
            style={styles.detailAction}
            onPress={() => {
              setSelected(null);
              router.push('/add-water' as any);
            }}
          >
            <Text style={styles.detailActionText}>{t.logWater}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (kind === 'analytics') {
      return (
        <View style={detailCardStyle}>
          <Text style={detailTitleStyle}>{t.weeklyAnalytics}</Text>
          <Text style={detailLabelStyle}>{t.analyticsHint}</Text>
          <TouchableOpacity
            style={styles.detailAction}
            onPress={() => {
              setSelected(null);
              router.push('/(tabs)/analytics' as any);
            }}
          >
            <Text style={styles.detailActionText}>{t.goToAnalytics}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // Default: profile card
    return (
      <View style={detailCardStyle}>
        <Text style={detailTitleStyle}>{t.yourProfile}</Text>
        <View style={detailRowStyle}>
          <Text style={detailLabelStyle}>{t.name}</Text>
          <Text style={detailValueStyle}>
            {cachedProfile?.firstName || ''} {cachedProfile?.lastName || ''}
          </Text>
        </View>
        <View style={detailRowStyle}>
          <Text style={detailLabelStyle}>{t.email}</Text>
          <Text style={detailValueStyle}>{cachedProfile?.email || email}</Text>
        </View>
        <View style={detailRowStyle}>
          <Text style={detailLabelStyle}>{t.goal}</Text>
          <Text style={detailValueStyle}>{cachedProfile?.goal || '--'}</Text>
        </View>
        <View style={detailRowStyle}>
          <Text style={detailLabelStyle}>{t.weight}</Text>
          <Text style={detailValueStyle}>{cachedProfile?.weight || '--'} kg</Text>
        </View>
        <View style={detailRowStyle}>
          <Text style={detailLabelStyle}>{t.language}</Text>
          <Text style={detailValueStyle}>{cachedProfile?.language || 'en'}</Text>
        </View>
      </View>
    );
  };

  const NotificationCard = ({
    item,
    index,
  }: {
    item: NotificationItem;
    index: number;
  }) => (
    <Animated.View
      entering={FadeInDown.delay(index * 50).duration(500)}
      layout={Layout.springify()}
    >
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => openNotification(item)}
        style={[
          styles.card,
          { flexDirection: isRTL ? 'row-reverse' : 'row' },
          isDark && { backgroundColor: Colors.dark.card, borderColor: Colors.dark.gray[100] },
          !item.read && styles.cardUnread,
          // Dark mode: keep unread cards dark (cardUnread forces white otherwise).
          isDark && !item.read && { backgroundColor: Colors.dark.card, borderColor: Colors.light.primary + '55' },
        ]}
      >
        <View style={[styles.iconWrapper, isRTL ? { marginRight: 0, marginLeft: 16 } : null, isDark && { backgroundColor: Colors.dark.gray[100] }]}>
          <Bell size={20} color={isDark ? Colors.dark.primary : Colors.light.primary} />
        </View>
        <View style={styles.content}>
          <Text style={[styles.notifTitle, { color: isDark ? '#fff' : Colors.light.gray[900], textAlign: isRTL ? 'right' : 'left' }]}>{item.title}</Text>
          <Text style={[styles.notifBody, { color: isDark ? '#9BA1A6' : Colors.light.gray[500], textAlign: isRTL ? 'right' : 'left' }]}>{item.body}</Text>
          <View style={[styles.footer, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Clock size={12} color={isDark ? Colors.dark.gray[400] : Colors.light.gray[400]} />
            <Text style={styles.timeText}>
              {new Date(item.receivedAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
            <Circle
              size={4}
              color={isDark ? Colors.dark.gray[200] : Colors.light.gray[200]}
              fill={isDark ? Colors.dark.gray[200] : Colors.light.gray[200]}
              style={{ marginHorizontal: 8 }}
            />
            <Text style={styles.timeText}>
              {new Date(item.receivedAt).toLocaleDateString([], {
                month: 'short',
                day: 'numeric',
              })}
            </Text>
          </View>
        </View>
        {!item.read && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    </Animated.View>
  );

  return (
    <SafeAreaView style={[styles.container, isDark && { backgroundColor: '#000' }]}>
      <ScreenTopBar />
      <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <TouchableOpacity style={[styles.backButton, isDark && { backgroundColor: Colors.dark.gray[50] }]} onPress={() => router.back()}>
          <ChevronLeft size={24} color={isDark ? '#fff' : Colors.light.gray[900]} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: isDark ? '#fff' : Colors.light.gray[900] }]}>{t.notifications}</Text>
        <TouchableOpacity style={styles.clearButton} onPress={clearAll}>
          <Trash2
            size={20}
            color={notifications.length > 0 ? '#EF4444' : Colors.light.gray[200]}
          />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingWrapper}>
          <ActivityIndicator size="large" color={isDark ? Colors.dark.primary : Colors.light.primary} />
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={[styles.emptyIconCircle, isDark && { backgroundColor: Colors.dark.gray[50] }]}>
            <Inbox size={48} color={isDark ? Colors.dark.gray[200] : Colors.light.gray[200]} />
          </View>
          <Text style={[styles.emptyTitle, { color: isDark ? '#fff' : Colors.light.gray[900] }]}>{t.inboxEmpty}</Text>
          <Text style={[styles.emptySubtitle, { color: isDark ? '#9BA1A6' : Colors.light.gray[400] }]}>
            {t.inboxSubtitle}
          </Text>
        </View>
      ) : (
        // FlashList : l'historique de notifications n'est borné par rien côté client et
        // grossit indéfiniment. Depuis la version 2, la mesure des cartes est automatique
        // et `estimatedItemSize`, qu'il fallait renseigner auparavant, a disparu.
        <FlashList
          data={notifications}
          renderItem={({ item, index }) => (
            <NotificationCard item={item} index={index} />
          )}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Detail Modal */}
      <Modal
        visible={!!selected}
        transparent
        animationType="slide"
        onRequestClose={() => setSelected(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, isDark && { backgroundColor: Colors.dark.card }]}>
            <View style={[styles.modalHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Text style={[styles.modalTitle, { color: isDark ? '#fff' : Colors.light.gray[900], textAlign: isRTL ? 'right' : 'left' }]}>{selected?.title}</Text>
              <TouchableOpacity onPress={() => setSelected(null)}>
                <X size={24} color={isDark ? '#9BA1A6' : Colors.light.gray[500]} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              <Text style={[styles.modalBody, { color: isDark ? '#9BA1A6' : Colors.light.gray[600], textAlign: isRTL ? 'right' : 'left' }]}>{selected?.body}</Text>
              {renderCardDetail()}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// Fabrique thémée : un StyleSheet est évalué au chargement du module, où `isDark`
// n'existe pas. Le composant l'appelle via useMemo, recalculé au changement de thème.
const makeStyles = (isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: isDark ? Colors.dark.card : Colors.light.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: isDark ? Colors.dark.gray[50] : Colors.light.gray[50],
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: isDark ? Colors.dark.gray[900] : Colors.light.gray[900],
  },
  clearButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 24,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: isDark ? Colors.dark.gray[50] : Colors.light.gray[50],
    borderRadius: 24,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: isDark ? Colors.dark.gray[100] : Colors.light.gray[100],
  },
  cardUnread: {
    backgroundColor: isDark ? Colors.dark.card : Colors.light.white,
    borderColor: isDark ? Colors.dark.primary : Colors.light.primary + '33',
    shadowColor: isDark ? 'transparent' : Colors.light.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  iconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: isDark ? Colors.dark.card : Colors.light.white,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  content: {
    flex: 1,
  },
  notifTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: isDark ? Colors.dark.gray[900] : Colors.light.gray[900],
    marginBottom: 4,
  },
  notifBody: {
    fontSize: 14,
    color: isDark ? Colors.dark.gray[500] : Colors.light.gray[500],
    lineHeight: 20,
    fontWeight: '500',
    marginBottom: 8,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeText: {
    fontSize: 12,
    color: isDark ? Colors.dark.gray[400] : Colors.light.gray[400],
    fontWeight: '600',
    marginLeft: 4,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.light.primary,
    marginLeft: 8,
    marginTop: 6,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: isDark ? Colors.dark.gray[50] : Colors.light.gray[50],
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: isDark ? Colors.dark.gray[900] : Colors.light.gray[900],
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: isDark ? Colors.dark.gray[400] : Colors.light.gray[400],
    textAlign: 'center',
    lineHeight: 22,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: isDark ? Colors.dark.card : Colors.light.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '900',
    color: isDark ? Colors.dark.gray[900] : Colors.light.gray[900],
    marginRight: 12,
  },
  modalBody: {
    fontSize: 15,
    color: isDark ? Colors.dark.gray[600] : Colors.light.gray[600],
    lineHeight: 22,
    marginBottom: 20,
  },
  detailCard: {
    backgroundColor: isDark ? Colors.dark.gray[50] : Colors.light.gray[50],
    borderRadius: 20,
    padding: 20,
    gap: 12,
  },
  detailTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: isDark ? Colors.dark.gray[900] : Colors.light.gray[900],
    marginBottom: 4,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: isDark ? Colors.dark.gray[100] : Colors.light.gray[100],
  },
  detailLabel: {
    fontSize: 14,
    color: isDark ? Colors.dark.gray[500] : Colors.light.gray[500],
    fontWeight: '600',
  },
  detailValue: {
    fontSize: 14,
    color: isDark ? Colors.dark.gray[900] : Colors.light.gray[900],
    fontWeight: '800',
  },
  detailAction: {
    marginTop: 12,
    backgroundColor: Colors.light.primary,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  detailActionText: {
    color: Colors.light.white,
    fontSize: 15,
    fontWeight: '800',
  },
});
