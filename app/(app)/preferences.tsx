import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  ScrollView,
  Dimensions
} from 'react-native';

const { width } = Dimensions.get('window');
import { router } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { 
  ChevronLeft, 
  Sun, 
  Moon, 
  Smartphone,
  Bell,
  CheckCircle2
} from 'lucide-react-native';
import { Colors } from '../../constants/Colors';
import ScreenTopBar from '../../components/ScreenTopBar';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme, ThemeMode } from '../../lib/ThemeContext';
import { useTranslation, Language, getLanguageName } from '../../lib/i18n';

export default function PreferencesScreen() {
  const { user } = useUser();
  const { mode: theme, setMode: setTheme, colors, resolved } = useTheme();
  const tPrimary = resolved === 'dark' ? '#fff' : Colors.light.gray[900];
  const tMuted = resolved === 'dark' ? '#9BA1A6' : Colors.light.gray[500];
  const { language, setLanguage, t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState(true);

  useEffect(() => {
    const fetchPrefs = async () => {
      if (!user) {
        setLoading(false);
        return;
      }
      try {
        const userDoc = await getDoc(doc(db, 'users', user.id));
        if (userDoc.exists()) {
          const data = userDoc.data();
          const prefs = data.preferences || {};
          if (prefs.theme && prefs.theme !== theme) {
            setTheme(prefs.theme as ThemeMode);
          }
          if (prefs.language && prefs.language !== language) {
            setLanguage(prefs.language as Language);
          }
          setNotifications(prefs.notificationsEnabled ?? true);
        }
      } catch (error) {
        console.warn('Error fetching prefs:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchPrefs();
  }, [user]);

  const updatePreference = async (key: string, value: any) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.id), {
        [`preferences.${key}`]: value
      });
    } catch (error) {
      console.error('Error updating preference:', error);
    }
  };

  const ThemeCard = ({ type, label, icon: Icon }: any) => {
    const isSelected = theme === type;
    return (
      <TouchableOpacity
        style={[styles.themeCard, isSelected && styles.themeCardSelected]}
        onPress={() => {
          setTheme(type as ThemeMode);
          updatePreference('theme', type);
        }}
      >
        <View style={[styles.themeIconWrapper, isSelected && { backgroundColor: Colors.light.primary }]}>
          <Icon size={24} color={isSelected ? Colors.light.white : Colors.light.gray[400]} />
        </View>
        <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.themeLabel, isSelected && styles.themeLabelSelected]}>{label}</Text>
        {isSelected && (
          <View style={styles.selectedBadge}>
            <CheckCircle2 size={12} color={Colors.light.white} />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: resolved === 'dark' ? '#0f1419' : Colors.light.white }]}>
      <ScreenTopBar showBack title={t('prefs.title')} showBrand={false} showNotif={false} />

      {loading ? (
        <View style={styles.loadingWrapper}>
          <ActivityIndicator size="large" color={Colors.light.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: tPrimary }]}>{t('prefs.appearance')}</Text>
            <Text style={[styles.sectionDesc, { color: tMuted }]}>{t('prefs.appearance_desc')}</Text>
          </View>

          <View style={styles.themeRow}>
            <ThemeCard type="light" label={t('prefs.light')} icon={Sun} />
            <ThemeCard type="dark" label={t('prefs.dark')} icon={Moon} />
            <ThemeCard type="system" label={t('prefs.system')} icon={Smartphone} />
          </View>

          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: tPrimary }]}>{t('prefs.language')}</Text>
            <Text style={[styles.sectionDesc, { color: tMuted }]}>{t('prefs.language_desc')}</Text>
          </View>

          <View style={styles.themeRow}>
            {(['en', 'fr', 'ar'] as Language[]).map((lang) => (
              <TouchableOpacity
                key={lang}
                style={[styles.themeCard, language === lang && styles.themeCardSelected]}
                onPress={() => {
                  setLanguage(lang);
                  updatePreference('language', lang);
                }}
              >
                <Text style={[styles.themeLabel, language === lang && styles.themeLabelSelected, { fontSize: 20 }]}>
                  {lang === 'en' ? '🇬🇧' : lang === 'fr' ? '🇫🇷' : '🇸🇦'}
                </Text>
                <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.themeLabel, language === lang && styles.themeLabelSelected]}>
                  {getLanguageName(lang)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: tPrimary }]}>{t('prefs.notifications')}</Text>
          </View>

          <Animated.View entering={FadeInDown.delay(200).duration(600)} style={styles.notificationCard}>
            <View style={styles.notifIconWrapper}>
              <Bell size={20} color={notifications ? Colors.light.primary : Colors.light.gray[400]} />
            </View>
            <View style={styles.notifTextContent}>
              <Text style={styles.notifTitle}>{t('prefs.push_notifs')}</Text>
              <Text style={styles.notifDesc}>{t('prefs.push_desc')}</Text>
            </View>
            <Switch
              value={notifications}
              onValueChange={(val) => {
                setNotifications(val);
                updatePreference('notificationsEnabled', val);
              }}
              trackColor={{ false: Colors.light.gray[200], true: Colors.light.primary }}
              thumbColor={Colors.light.white}
            />
          </Animated.View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.white,
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
    backgroundColor: Colors.light.gray[50],
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.light.gray[900],
  },
  loadingWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 24,
  },
  sectionHeader: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: Colors.light.gray[900],
    marginBottom: 4,
  },
  sectionDesc: {
    fontSize: 14,
    color: Colors.light.gray[400],
    fontWeight: '500',
  },
  themeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 40,
  },
  themeCard: {
    width: (width - 48 - 24) / 3,
    backgroundColor: Colors.light.gray[50],
    borderRadius: 24,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  themeCardSelected: {
    backgroundColor: Colors.light.white,
    borderColor: Colors.light.primary,
    shadowColor: Colors.light.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  themeIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: Colors.light.gray[100],
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  themeLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.light.gray[400],
  },
  themeLabelSelected: {
    color: Colors.light.primary,
  },
  selectedBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: Colors.light.primary,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.light.white,
  },
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.gray[50],
    padding: 20,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: Colors.light.gray[100],
  },
  notifIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.light.white,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  notifTextContent: {
    flex: 1,
  },
  notifTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.light.gray[900],
  },
  notifDesc: {
    fontSize: 12,
    color: Colors.light.gray[400],
    fontWeight: '500',
    marginTop: 2,
  },
});
