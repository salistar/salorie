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
import { BellRing, Trash2, Award, Trophy } from 'lucide-react-native';
import { useEffect } from 'react';

const { width } = Dimensions.get('window');

export default function ProfileScreen() {
  const { user } = useUser();
  const { signOut } = useAuth();
  const { t } = useTranslation();
  const { resolved } = useTheme();
  const bgColor = resolved === 'dark' ? '#000000' : 'transparent';

  useEffect(() => {
    console.log('[ProfileScreen] mounted — user:', user?.primaryEmailAddress?.emailAddress);
  }, []);

  const handleUpgrade = () => {
    console.log('[ProfileScreen] handleUpgrade pressed');
    PurchasesService.showPaywall();
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
      Alert.alert('✅', t('profile.logs_sent') || 'Logs envoyés au support. Merci !');
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
      <ChevronRight size={18} color={Colors.light.gray[300]} />
    </TouchableOpacity>
  );

  // Tuile compacte (allègement : grille 2 colonnes au lieu de lignes empilées).
  const GridTile = ({ icon: Icon, label, color, onPress }: any) => (
    <TouchableOpacity style={styles.gridTile} activeOpacity={0.85} onPress={onPress}>
      <View style={[styles.gridIcon, { backgroundColor: color + '15' }]}>
        <Icon size={22} color={color} />
      </View>
      <Text style={styles.gridLabel} numberOfLines={2}>{label}</Text>
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
          <Image 
            source={{ uri: user?.imageUrl }} 
            style={styles.avatar} 
          />
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{user?.fullName || t('profile.health_explorer')}</Text>
            <Text style={styles.userEmail}>{user?.primaryEmailAddress?.emailAddress}</Text>
          </View>
        </Animated.View>

        {/* Subscription Upsell */}
        <Animated.View entering={FadeInDown.delay(100).duration(600)}>
          <TouchableOpacity style={styles.trialCard} onPress={handleUpgrade}>
            <View style={styles.trialContent}>
              <View style={styles.trialTextWrapper}>
                <View style={styles.trialBadge}>
                  <Crown size={12} color="#F59E0B" fill="#F59E0B" />
                  <Text style={styles.trialBadgeText}>{t('profile.premium_plan')}</Text>
                </View>
                <Text style={styles.trialTitle}>{t('profile.start_trial')}</Text>
                <Text style={styles.trialSubtitle}>{t('profile.trial_desc')}</Text>
              </View>
              <View style={styles.trialButton}>
                <Text style={styles.trialButtonText}>{t('profile.start')}</Text>
                <ArrowRight size={16} color={Colors.light.white} />
              </View>
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* Account Section */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: resolved === 'dark' ? '#fff' : undefined }]}>{t('profile.account')}</Text>
        </View>
        <Animated.View entering={FadeInDown.delay(200).duration(600)} style={styles.grid}>
          <GridTile icon={User} label={t('profile.personal_details')} color={Colors.light.primary} onPress={() => router.push('/personal-details' as any)} />
          <GridTile icon={Bell} label={t('prefs.notifications')} color={Colors.light.primary} onPress={() => router.push('/notifications' as any)} />
          <GridTile icon={Settings} label={t('profile.preferences')} color="#6366F1" onPress={() => router.push('/preferences' as any)} />
          <GridTile icon={CreditCard} label={t('profile.upgrade')} color="#EC4899" onPress={handleUpgrade} />
        </Animated.View>

        {/* Sport & médailles */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: resolved === 'dark' ? '#fff' : undefined }]}>Sport & médailles</Text>
        </View>
        <Animated.View entering={FadeInDown.delay(250).duration(600)} style={styles.grid}>
          <GridTile icon={Award} label="Mes médailles" color="#F59E0B" onPress={() => router.push('/medals' as any)} />
          <GridTile icon={Trophy} label="Achievements" color="#8B5CF6" onPress={() => router.push('/social' as any)} />
          <GridTile icon={Trophy} label="Courses virtuelles" color={Colors.light.primary} onPress={() => router.push('/races' as any)} />
          <GridTile icon={FileText} label="Agenda sport" color="#0EA5E9" onPress={() => router.push('/sport-agenda' as any)} />
        </Animated.View>

        {/* Support Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('profile.support')}</Text>
        </View>
        <Animated.View entering={FadeInDown.delay(300).duration(600)} style={styles.grid}>
          <GridTile icon={Lightbulb} label={t('profile.feature_requests')} color="#10B981" onPress={() => router.push('/feature-requests' as any)} />
          <GridTile icon={MessagesSquare} label={t('profile.contact_us')} color="#3B82F6" onPress={() => router.push('/contact' as any)} />
          <GridTile icon={FileText} label="Envoyer les logs" color="#64748B" onPress={sendLogs} />
          <GridTile icon={FileText} label={t('profile.terms')} color={Colors.light.gray[500]} onPress={() => router.push('/terms' as any)} />
          <GridTile icon={Shield} label={t('profile.privacy')} color={Colors.light.gray[500]} onPress={() => router.push('/privacy' as any)} />
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

            <TouchableOpacity style={[styles.logoutBtn, { backgroundColor: Colors.light.primaryLight, marginBottom: 12 }]} onPress={handleSeedData}>
              <Text style={[styles.logoutText, { color: Colors.light.primary }]}>🌱 {t('common.seed_btn')}</Text>
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
          <LogOut size={20} color={Colors.light.error} />
          <Text style={styles.logoutText}>{t('profile.logout')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
    color: Colors.light.gray[900],
    letterSpacing: -1,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.gray[900],
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
    color: Colors.light.gray[400],
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  optionsCard: {
    backgroundColor: Colors.light.white,
    borderRadius: 32,
    paddingVertical: 10,
    marginBottom: 24,
    borderWidth: 1.5,
    borderColor: Colors.light.gray[50],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  // Grille compacte (allègement Profile) — 2 colonnes
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 16 },
  gridTile: {
    width: '48%', alignItems: 'center', backgroundColor: Colors.light.white,
    borderRadius: 20, paddingVertical: 18, paddingHorizontal: 8, marginBottom: 12,
    borderWidth: 1.5, borderColor: Colors.light.gray[50],
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  gridIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  gridLabel: { fontSize: 13, fontWeight: '700', color: Colors.light.gray[900], marginTop: 10, textAlign: 'center' },
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
    color: Colors.light.gray[900],
  },
  menuSubtext: {
    fontSize: 12,
    color: Colors.light.gray[400],
    fontWeight: '500',
    marginTop: 2,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.light.gray[50],
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
    color: Colors.light.error,
  },
});
