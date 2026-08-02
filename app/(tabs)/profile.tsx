import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, Image, Dimensions, Linking } from 'react-native';
import { useUser, useAuth } from '@clerk/clerk-expo';
import { router } from 'expo-router';
import { 
  User, 
  Settings, 
  Crown, 
  Bell, 
  Shield, 
  FileText, 
  MessagesSquare, 
  Lightbulb, 
  LogOut, 
  ChevronRight,
  CreditCard,
  Heart,
  Activity,
  ArrowRight
} from 'lucide-react-native';
import { Colors } from '../../constants/Colors';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { PurchasesService } from '../../lib/PurchasesService';
import { seedDemoData } from '../../scripts/seed-data';
import { Alert } from 'react-native';
import { useTranslation } from '../../lib/i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ScreenTopBar from '../../components/ScreenTopBar';
import { useTheme } from '../../lib/ThemeContext';
import { triggerSeededNotifications, syncAllUserData, clearAllLocalData } from '../../lib/LocalDataStore';
import { BellRing, Trash2, Award, Trophy, Camera, Flame, Sparkles, Users, HeartPulse } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useEffect, useMemo } from 'react';

const { width } = Dimensions.get('window');

export default function ProfileScreen() {
  const { user } = useUser();
  const { signOut } = useAuth();
  const { t, language } = useTranslation() as any;
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  const styles = useMemo(() => makeStyles(isDark), [isDark]);
  const bgColor = isDark ? '#0f1419' : 'transparent';
  // Inline trilingual labels for items not yet in the shared i18n file.
  const PSTR: any = {
    en: { sport_medals: 'Sport & medals', my_medals: 'My medals', achievements: 'Achievements', send_logs: 'Send logs', nutrients: 'Daily nutrients', streaks: 'My streaks', avatar: 'My avatar', family: 'My family', vitals: 'Glucose & blood pressure', referral: 'Referral', doctor_report: 'Doctor report (PDF)' },
    fr: { sport_medals: 'Sport & médailles', my_medals: 'Mes médailles', achievements: 'Succès', send_logs: 'Envoyer les logs', nutrients: 'Nutriments du jour', streaks: 'Mes séries', avatar: 'Mon avatar', family: 'Ma famille', vitals: 'Glycémie & tension', referral: 'Parrainage', doctor_report: 'Rapport médecin (PDF)' },
    ar: { sport_medals: 'الرياضة والأوسمة', my_medals: 'أوسمتي', achievements: 'الإنجازات', send_logs: 'إرسال السجلات', nutrients: 'عناصر اليوم الغذائية', streaks: 'سلاسلي', avatar: 'بطلي', family: 'عائلتي', vitals: 'سكر الدم والضغط', referral: 'الإحالة', doctor_report: 'تقرير للطبيب (PDF)' },
  };
  const P_ = (k: string) => (PSTR[String(language)] || PSTR.en)[k] || PSTR.en[k] || k;

  useEffect(() => {
    console.log('[ProfileScreen] mounted — user:', user?.primaryEmailAddress?.emailAddress);
  }, []);

  // Avant : `PurchasesService.showPaywall()` → `PurchasesUI.presentPaywall`, qui exige
  // une clé RevenueCat de production ET un paywall configuré côté dashboard. Sans ça,
  // l'appui ne produisait RIEN — bouton mort. On envoie désormais sur notre propre écran,
  // qui se referme tout seul s'il n'y a aucune offre à vendre.
  const handleUpgrade = () => {
    router.push('/(app)/upgrade' as any);
  };

  // Photo de profil : galerie → recadrage carré → upload Clerk (backend d'auth),
  // user.imageUrl se met à jour partout automatiquement.
  const changeAvatar = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.85, allowsEditing: true, aspect: [1, 1] });
      if (r.canceled || !r.assets?.[0]?.uri) return;
      const manip = await ImageManipulator.manipulateAsync(r.assets[0].uri, [{ resize: { width: 400 } }], { base64: true, format: ImageManipulator.SaveFormat.JPEG });
      await user?.setProfileImage({ file: `data:image/jpeg;base64,${manip.base64}` } as any);
      // Sans reload, user.imageUrl local reste l'ancienne URL → la nouvelle photo
      // ne s'affichait pas avant un redémarrage de l'app.
      await user?.reload();
      Alert.alert('✅', 'Photo de profil mise à jour / Profile photo updated');
    } catch {
      Alert.alert('⚠️', 'Échec de la mise à jour — réessaie.');
    }
  };

  // Envoie les diagnostics (device + 50 derniers logs d'erreur) au support —
  // visibles dans le back-office web (page Feedback, via contact_messages).
  const sendLogs = async () => {
    const email = user?.primaryEmailAddress?.emailAddress || '';
    if (!email) return;
    try {
      const { buildDiagnostics } = require('../../lib/logBuffer');
      const { db, emailToDocId } = require('../../lib/firebase');
      const { collection, addDoc, serverTimestamp } = require('firebase/firestore');
      await addDoc(collection(db, 'users', emailToDocId(email), 'contact_messages'), {
        email, subject: '[LOGS] Diagnostic app', message: buildDiagnostics(), createdAt: serverTimestamp(),
      });
      Alert.alert('✅', 'Logs envoyés au support / Logs sent. Merci !');
    } catch {
      Alert.alert('⚠️', 'Envoi impossible — réessaie plus tard.');
    }
  };

  const handleLogout = async () => {
    console.log('[ProfileScreen] handleLogout pressed');
    Alert.alert(
      t('profile.logout'),
      t('profile.logout_confirm'),
      [
        { text: t('profile.cancel'), style: 'cancel' },
        {
          text: t('profile.logout'),
          style: 'destructive',
          onPress: async () => {
            // Clear welcome_seen so welcome screen shows again on next login
            await AsyncStorage.removeItem('welcome_seen');
            // Clear onboarded cache for this user
            if (user?.id) {
              await AsyncStorage.removeItem(`onboarded_${user.id}`);
            }
            console.log('\x1b[32m[API→Clerk] signOut REQUEST\x1b[0m');
            await signOut();
            console.log('\x1b[34m[API←Clerk] signOut OK\x1b[0m');
            router.replace('/welcome' as any);
          }
        }
      ]
    );
  };

  const handleTriggerNotifications = async () => {
    console.log('[ProfileScreen] handleTriggerNotifications pressed');
    const email = user?.primaryEmailAddress?.emailAddress || '';
    if (!email) return;
    try {
      const count = await triggerSeededNotifications(email);
      console.log('[ProfileScreen] triggered', count, 'notifications');
      Alert.alert(
        t('common.success'),
        count > 0
          ? `${count} notifications will arrive in the next ${count * 2}s.`
          : 'No notifications to trigger.'
      );
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || 'Failed to trigger notifications');
    }
  };

  const handleSeedData = async () => {
    console.log('[ProfileScreen] handleSeedData pressed');
    if (!user) return;
    const email = user?.primaryEmailAddress?.emailAddress || '';
    if (!email) {
      Alert.alert(t('common.error'), 'No email on account');
      return;
    }
    Alert.alert(
      t('common.seed_title'),
      t('common.seed_desc'),
      [
        { text: t('profile.cancel'), style: 'cancel' },
        {
          text: t('common.seed'),
          onPress: async () => {
            try {
              console.log('[ProfileScreen] seeding demo data for', email);
              const count = await seedDemoData(email);
              // Refresh local cache so Analytics + Home reflect the new data
              try {
                await syncAllUserData(email);
                console.log('[ProfileScreen] cache resynced after seed');
              } catch (err) {
                console.warn('[ProfileScreen] resync failed', err);
              }
              Alert.alert(t('common.success'), `${count} logs over 10 days!`);
            } catch (e: any) {
              console.warn('[ProfileScreen] seed failed:', e?.message);
              Alert.alert(t('common.error'), e.message || 'Seed failed');
            }
          }
        }
      ]
    );
  };

  const handleClearCache = async () => {
    console.log('\x1b[33m[ProfileScreen] handleClearCache pressed — user requested full cache wipe\x1b[0m');
    const email = user?.primaryEmailAddress?.emailAddress || '';
    if (!email) {
      Alert.alert(t('common.error'), 'No email on account');
      return;
    }
    Alert.alert(
      '🗑️ Clear Cache',
      'This will delete ALL local phone data (profile, logs, weight, notifications, insights). On next home open, data will be re-fetched from Firestore in 3 languages. Continue?',
      [
        { text: t('profile.cancel'), style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('\x1b[33m[ProfileScreen] clearing all local data for\x1b[0m', email);
              const removed = await clearAllLocalData(email);
              console.log('\x1b[33m[ProfileScreen] cache cleared —\x1b[0m', removed, '\x1b[33mkeys removed\x1b[0m');
              Alert.alert(t('common.success'), `${removed} cache keys deleted. Open Home to re-sync.`);
            } catch (e: any) {
              console.warn('[ProfileScreen] clear cache failed:', e?.message);
              Alert.alert(t('common.error'), e?.message || 'Failed to clear cache');
            }
          }
        }
      ]
    );
  };

  const SettingItem = ({ icon: Icon, label, subtext, color, onPress }: any) => (
    <TouchableOpacity style={styles.menuItem} onPress={onPress}>
      <View style={[styles.iconWrapper, { backgroundColor: color + '15' }]}>
        <Icon size={20} color={color} />
      </View>
      <View style={styles.menuTextContent}>
        <Text style={styles.menuLabel}>{label}</Text>
        {subtext && <Text style={styles.menuSubtext}>{subtext}</Text>}
      </View>
      <ChevronRight size={18} color={isDark ? Colors.dark.gray[300] : Colors.light.gray[300]} />
    </TouchableOpacity>
  );

  // Tuile compacte (allègement : grille 2 colonnes au lieu de lignes empilées).
  const GridTile = ({ icon: Icon, label, color, onPress }: any) => (
    <TouchableOpacity
      style={[styles.gridTile, isDark && { backgroundColor: '#161C23', borderColor: 'rgba(255,255,255,0.08)' }]}
      activeOpacity={0.85}
      onPress={onPress}
    >
      <View style={[styles.gridIcon, { backgroundColor: color + (isDark ? '26' : '15') }]}>
        <Icon size={22} color={color} />
      </View>
      <Text style={[styles.gridLabel, isDark && { color: '#f1f5f9' }]} numberOfLines={2}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <ScreenTopBar />
        <View style={styles.header}>
          <Text style={[styles.title, { color: resolved === 'dark' ? '#fff' : Colors.light.gray[900] }]}>
            {t('profile.title')}
          </Text>
        </View>
        <Image
          source={require('../../assets/images/illustrations/profile_cover.jpg')}
          style={{ width: '100%', height: 140, borderRadius: 20, marginBottom: 16 }}
        />

        {/* User Identity Card */}
        <Animated.View entering={FadeInDown.duration(600)} style={styles.userCard}>
          <TouchableOpacity onPress={changeAvatar} activeOpacity={0.8}>
            <Image
              source={{ uri: user?.imageUrl }}
              style={styles.avatar}
            />
            <View style={{ position: 'absolute', bottom: -2, right: -2, backgroundColor: Colors.light.primary, borderRadius: 12, padding: 5, borderWidth: 2, borderColor: '#fff' }}>
              <Camera size={12} color="#fff" />
            </View>
          </TouchableOpacity>
          <View style={styles.userInfo}>
            <Text style={styles.userName} numberOfLines={1}>{user?.fullName || t('profile.health_explorer')}</Text>
            <Text style={styles.userEmail} numberOfLines={1}>{user?.primaryEmailAddress?.emailAddress}</Text>
          </View>
        </Animated.View>

        {/* Subscription Upsell */}
        <Animated.View entering={FadeInDown.delay(100).duration(600)}>
          <TouchableOpacity
            style={[
              styles.trialCard,
              resolved === 'dark' && { backgroundColor: 'rgba(245,158,11,0.10)', borderColor: 'rgba(245,158,11,0.32)' },
            ]}
            onPress={handleUpgrade}
            accessibilityRole="button"
            accessibilityLabel={`${t('profile.start_trial')} — ${t('profile.trial_desc')}`}
          >
            <View style={styles.trialContent}>
              <View style={styles.trialTextWrapper}>
                <View style={[styles.trialBadge, resolved === 'dark' && { backgroundColor: 'rgba(245,158,11,0.18)' }]}>
                  <Crown size={12} color="#F59E0B" fill="#F59E0B" />
                  <Text style={[styles.trialBadgeText, resolved === 'dark' && { color: '#FCD34D' }]}>{t('profile.premium_plan')}</Text>
                </View>
                <Text style={[styles.trialTitle, resolved === 'dark' && { color: '#FCD34D' }]}>{t('profile.start_trial')}</Text>
                <Text style={[styles.trialSubtitle, resolved === 'dark' && { color: '#E5B769' }]}>{t('profile.trial_desc')}</Text>
              </View>
              <View style={styles.trialButton}>
                <Text style={styles.trialButtonText}>{t('profile.start')}</Text>
                <ArrowRight size={16} color={Colors.light.white} />
              </View>
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* Sport & médailles — d'abord (pattern « You » des leaders : trophées avant réglages) */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: resolved === 'dark' ? '#fff' : undefined }]}>{P_('sport_medals')}</Text>
        </View>
        <Animated.View entering={FadeInDown.delay(200).duration(600)} style={styles.grid}>
          {/* Courses + agenda vivent dans l'onglet Défis (pas de doublon ici) */}
          <GridTile icon={Award} label={P_('my_medals')} color="#F59E0B" onPress={() => router.push('/medals' as any)} />
          <GridTile icon={Trophy} label={P_('achievements')} color="#8B5CF6" onPress={() => router.push('/social' as any)} />
          <GridTile icon={Flame} label={P_('streaks')} color="#EF4444" onPress={() => router.push('/streaks' as any)} />
          <GridTile icon={Sparkles} label={P_('avatar')} color={isDark ? Colors.dark.primary : Colors.light.primary} onPress={() => router.push('/avatar' as any)} />
        </Animated.View>

        {/* Account Section */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: resolved === 'dark' ? '#fff' : undefined }]}>{t('profile.account')}</Text>
        </View>
        <Animated.View entering={FadeInDown.delay(250).duration(600)} style={styles.grid}>
          <GridTile icon={User} label={t('profile.personal_details')} color={isDark ? Colors.dark.primary : Colors.light.primary} onPress={() => router.push('/personal-details' as any)} />
          <GridTile icon={Users} label={P_('family')} color="#0EA5E9" onPress={() => router.push('/family' as any)} />
          <GridTile icon={Users} label={P_('referral')} color="#14B8A6" onPress={() => router.push('/referral' as any)} />
          <GridTile icon={Heart} label={P_('nutrients')} color="#10B981" onPress={() => router.push('/nutrients' as any)} />
          <GridTile icon={Activity} label={P_('vitals')} color="#F43F5E" onPress={() => router.push('/vitals' as any)} />
          <GridTile icon={HeartPulse} label={P_('doctor_report')} color="#0891B2" onPress={() => router.push('/health-export' as any)} />
          <GridTile icon={Bell} label={t('prefs.notifications')} color={isDark ? Colors.dark.primary : Colors.light.primary} onPress={() => router.push('/notifications' as any)} />
          <GridTile icon={Settings} label={t('profile.preferences')} color="#6366F1" onPress={() => router.push('/preferences' as any)} />
          <GridTile icon={CreditCard} label={t('profile.upgrade')} color="#EC4899" onPress={handleUpgrade} />
        </Animated.View>

        {/* Support Section */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: resolved === 'dark' ? '#fff' : undefined }]}>{t('profile.support')}</Text>
        </View>
        <Animated.View entering={FadeInDown.delay(300).duration(600)} style={styles.grid}>
          <GridTile icon={Lightbulb} label={t('profile.feature_requests')} color="#10B981" onPress={() => router.push('/feature-requests' as any)} />
          <GridTile icon={MessagesSquare} label={t('profile.contact_us')} color="#3B82F6" onPress={() => router.push('/contact' as any)} />
          <GridTile icon={FileText} label={P_('send_logs')} color="#64748B" onPress={sendLogs} />
          <GridTile icon={FileText} label={t('profile.terms')} color={isDark ? Colors.dark.gray[500] : Colors.light.gray[500]} onPress={() => router.push('/terms' as any)} />
          <GridTile icon={Shield} label={t('profile.privacy')} color={isDark ? Colors.dark.gray[500] : Colors.light.gray[500]} onPress={() => router.push('/privacy' as any)} />
        </Animated.View>

        {/* Developer-only tools — hidden in production builds */}
        {__DEV__ && (
          <>
            <TouchableOpacity
              style={[styles.logoutBtn, { backgroundColor: '#EEF2FF', borderColor: '#C7D2FE', marginBottom: 12 }]}
              onPress={handleTriggerNotifications}
            >
              <BellRing size={20} color="#4338CA" />
              <Text style={[styles.logoutText, { color: '#4338CA' }]}>
                🔔 Trigger 10 Notifications
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.logoutBtn, { backgroundColor: isDark ? Colors.dark.primaryLight : Colors.light.primaryLight, marginBottom: 12 }]} onPress={handleSeedData}>
              <Text style={[styles.logoutText, { color: isDark ? Colors.dark.primary : Colors.light.primary }]}>🌱 {t('common.seed_btn')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.logoutBtn, { backgroundColor: '#FEF3C7', borderColor: '#FCD34D', marginBottom: 12 }]}
              onPress={handleClearCache}
            >
              <Trash2 size={20} color="#92400E" />
              <Text style={[styles.logoutText, { color: '#92400E' }]}>🗑️ Clear Cache</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <LogOut size={20} color={isDark ? Colors.dark.error : Colors.light.error} />
          <Text style={styles.logoutText}>{t('profile.logout')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// Fabrique thémée : un StyleSheet est évalué au chargement du module, où `isDark`
// n'existe pas. Le composant l'appelle via useMemo, recalculé au changement de thème.
const makeStyles = (isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 140,
  },
  header: {
    marginTop: 20,
    marginBottom: 24,
  },
  title: {
    fontSize: 36,
    fontWeight: '900',
    color: isDark ? Colors.dark.gray[900] : Colors.light.gray[900],
    letterSpacing: -1,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? Colors.dark.gray[900] : Colors.light.gray[900],
    padding: 20,
    borderRadius: 32,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  userInfo: {
    marginLeft: 16,
    flex: 1,
  },
  userName: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.light.white,
  },
  userEmail: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
    marginTop: 2,
  },
  trialCard: {
    backgroundColor: '#FFFBEB',
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#FEF3C7',
    marginBottom: 32,
  },
  trialContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  trialTextWrapper: {
    flex: 1,
  },
  trialBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 8,
    gap: 4,
  },
  trialBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#92400E',
    textTransform: 'uppercase',
  },
  trialTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#92400E',
    marginBottom: 2,
  },
  trialSubtitle: {
    fontSize: 13,
    color: '#B45309',
    fontWeight: '600',
    opacity: 0.8,
  },
  trialButton: {
    backgroundColor: '#D97706',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    gap: 6,
  },
  trialButtonText: {
    color: Colors.light.white,
    fontSize: 14,
    fontWeight: '700',
  },
  sectionHeader: {
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: isDark ? Colors.dark.gray[400] : Colors.light.gray[400],
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  optionsCard: {
    backgroundColor: isDark ? Colors.dark.card : Colors.light.white,
    borderRadius: 32,
    paddingVertical: 10,
    marginBottom: 24,
    borderWidth: 1.5,
    borderColor: isDark ? Colors.dark.gray[50] : Colors.light.gray[50],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  // Grille compacte (allègement Profile) — 2 colonnes
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 16 },
  gridTile: {
    width: '48%', alignItems: 'center', backgroundColor: isDark ? Colors.dark.card : Colors.light.white,
    borderRadius: 20, paddingVertical: 18, paddingHorizontal: 8, marginBottom: 12,
    borderWidth: 1.5, borderColor: isDark ? Colors.dark.gray[50] : Colors.light.gray[50],
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  gridIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  gridLabel: { fontSize: 13, fontWeight: '700', color: isDark ? Colors.dark.gray[900] : Colors.light.gray[900], marginTop: 10, textAlign: 'center' },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingHorizontal: 20,
  },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuTextContent: {
    flex: 1,
    marginLeft: 16,
  },
  menuLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: isDark ? Colors.dark.gray[900] : Colors.light.gray[900],
  },
  menuSubtext: {
    fontSize: 12,
    color: isDark ? Colors.dark.gray[400] : Colors.light.gray[400],
    fontWeight: '500',
    marginTop: 2,
  },
  separator: {
    height: 1,
    backgroundColor: isDark ? Colors.dark.gray[50] : Colors.light.gray[50],
    marginHorizontal: 20,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
    marginTop: 16,
    backgroundColor: '#FEE2E2',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '800',
    color: isDark ? Colors.dark.error : Colors.light.error,
  },
});
