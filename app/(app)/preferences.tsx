import React, { useState, useEffect, useMemo } from 'react';
import { useEspaceBasSimple } from '../../lib/espaceBas';
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
  Camera,
  CheckCircle2
} from 'lucide-react-native';
import { Colors } from '../../constants/Colors';
import ScreenTopBar from '../../components/ScreenTopBar';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme, ThemeMode } from '../../lib/ThemeContext';
import { useTranslation, Language, getLanguageName } from '../../lib/i18n';
import { getMLConsent, setMLConsent } from '../../lib/alConsent';
import { getDietPrefs, setDietPrefs, DietPref } from '../../lib/dietPrefs';
import { Utensils } from 'lucide-react-native';

export default function PreferencesScreen() {
  const { user } = useUser();
  const espaceBas = useEspaceBasSimple();
  const { mode: theme, setMode: setTheme, colors, resolved } = useTheme();
  const tPrimary = resolved === 'dark' ? '#fff' : Colors.light.gray[900];
  const tMuted = resolved === 'dark' ? '#9BA1A6' : Colors.light.gray[500];
  const isDark = resolved === 'dark';
  const styles = useMemo(() => makeStyles(isDark), [isDark]);
  const cardBg = isDark ? '#161C23' : Colors.light.gray[50];
  const titleCol = isDark ? '#f1f5f9' : Colors.light.gray[900];
  const iconWrap = isDark ? '#0f1419' : Colors.light.white;
  const { language, setLanguage, t, isRTL } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [mlConsent, setMlConsentState] = useState(false);
  const [diet, setDiet] = useState<DietPref>({ halal: false, vegetarian: false, keto: false, glutenFree: false, lowFodmap: false, conditions: [] });

  // Régime alimentaire (local, par défaut tout désactivé).
  const DIET_TXT = {
    en: { section: 'Diet', desc: 'Constraints applied to AI meal plans.', halal: 'Halal', vegetarian: 'Vegetarian', keto: 'Keto', glutenFree: 'Gluten-free', lowFodmap: 'Low-FODMAP' },
    fr: { section: 'Régime alimentaire', desc: 'Contraintes appliquées aux plans de repas IA.', halal: 'Halal', vegetarian: 'Végétarien', keto: 'Keto', glutenFree: 'Sans gluten', lowFodmap: 'Low-FODMAP' },
    ar: { section: 'النظام الغذائي', desc: 'قيود تُطبَّق على خطط الوجبات بالذكاء الاصطناعي.', halal: 'حلال', vegetarian: 'نباتي', keto: 'كيتو', glutenFree: 'خالٍ من الغلوتين', lowFodmap: 'قليل الفودماب' },
  } as const;
  const DT = (DIET_TXT as any)[language] ?? DIET_TXT.en;

  // Clés booléennes togglables (les `conditions` médicales string[] ont leur
  // propre écran d'onboarding, cf. TODO dans lib/dietPrefs.ts).
  type DietBoolKey = 'halal' | 'vegetarian' | 'keto' | 'glutenFree' | 'lowFodmap';
  const toggleDiet = (key: DietBoolKey, val: boolean) => {
    const next = { ...diet, [key]: val };
    setDiet(next);
    setDietPrefs(next);
  };

  // Conditions médicales (multi-select). Les valeurs DOIVENT correspondre
  // exactement aux clés lues par le moteur objectif (lib/objective/scoring.ts).
  const CONDITIONS: { key: string; labelKey: any }[] = [
    { key: 'diabetes', labelKey: 'health_cond.diabetes' },
    { key: 'hypertension', labelKey: 'health_cond.hypertension' },
    { key: 'high_cholesterol', labelKey: 'health_cond.high_cholesterol' },
    { key: 'celiac', labelKey: 'health_cond.celiac' },
    { key: 'kidney', labelKey: 'health_cond.kidney' },
    { key: 'gout', labelKey: 'health_cond.gout' },
    { key: 'ibs', labelKey: 'health_cond.ibs' },
    { key: 'pregnancy', labelKey: 'health_cond.pregnancy' },
  ];
  const toggleCondition = (key: string) => {
    const has = diet.conditions.includes(key);
    const conditions = has
      ? diet.conditions.filter((c) => c !== key)
      : [...diet.conditions, key];
    const next = { ...diet, conditions };
    setDiet(next);
    setDietPrefs(next);
  };

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

  // Consentement active-learning (local, opt-in, par défaut OFF).
  useEffect(() => {
    getMLConsent().then(setMlConsentState).catch(() => {});
  }, []);

  // Préférences de régime alimentaire (local).
  useEffect(() => {
    getDietPrefs().then(setDiet).catch(() => {});
  }, []);

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
          <Icon size={24} color={isSelected ? Colors.light.white : isDark ? Colors.dark.gray[400] : Colors.light.gray[400]} />
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
          <ActivityIndicator size="large" color={isDark ? Colors.dark.primary : Colors.light.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: espaceBas }]}>
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

          <Animated.View entering={FadeInDown.delay(200).duration(600)} style={[styles.notificationCard, { backgroundColor: cardBg }]}>
            <View style={[styles.notifIconWrapper, { backgroundColor: iconWrap }]}>
              <Bell size={20} color={notifications ? Colors.light.primary : isDark ? Colors.dark.gray[400] : Colors.light.gray[400]} />
            </View>
            <View style={styles.notifTextContent}>
              <Text style={[styles.notifTitle, { color: titleCol }]}>{t('prefs.push_notifs')}</Text>
              <Text style={styles.notifDesc}>{t('prefs.push_desc')}</Text>
            </View>
            <Switch
              value={notifications}
              onValueChange={(val) => {
                setNotifications(val);
                updatePreference('notificationsEnabled', val);
              }}
              trackColor={{ false: isDark ? Colors.dark.gray[200] : Colors.light.gray[200], true: isDark ? Colors.dark.primary : Colors.light.primary }}
              thumbColor={isDark ? Colors.dark.white : Colors.light.white}
            />
          </Animated.View>

          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: tPrimary }]}>
              {language === 'fr' ? 'Confidentialité' : language === 'ar' ? 'الخصوصية' : 'Privacy'}
            </Text>
          </View>
          <Animated.View entering={FadeInDown.delay(250).duration(600)} style={[styles.notificationCard, { backgroundColor: cardBg }]}>
            <View style={[styles.notifIconWrapper, { backgroundColor: iconWrap }]}>
              <Camera size={20} color={mlConsent ? Colors.light.primary : isDark ? Colors.dark.gray[400] : Colors.light.gray[400]} />
            </View>
            <View style={styles.notifTextContent}>
              <Text style={[styles.notifTitle, { color: titleCol }]}>
                {language === 'fr'
                  ? 'Aider à améliorer la reconnaissance'
                  : language === 'ar'
                  ? 'المساعدة في تحسين التعرّف'
                  : 'Help improve recognition'}
              </Text>
              <Text style={styles.notifDesc}>
                {language === 'fr'
                  ? 'Partager mes photos de plats (anonymisées) pour entraîner le modèle. Désactivé par défaut.'
                  : language === 'ar'
                  ? 'مشاركة صور أطباقي (مجهّلة الهوية) لتدريب النموذج. معطّل افتراضيًا.'
                  : 'Share my meal photos (anonymized) to train the model. Off by default.'}
              </Text>
            </View>
            <Switch
              value={mlConsent}
              onValueChange={(val) => {
                setMlConsentState(val);
                setMLConsent(val);
              }}
              trackColor={{ false: isDark ? Colors.dark.gray[200] : Colors.light.gray[200], true: isDark ? Colors.dark.primary : Colors.light.primary }}
              thumbColor={isDark ? Colors.dark.white : Colors.light.white}
            />
          </Animated.View>

          <View style={[styles.sectionHeader, { marginTop: 40 }]}>
            <Text style={[styles.sectionTitle, { color: tPrimary }]}>{DT.section}</Text>
            <Text style={[styles.sectionDesc, { color: tMuted }]}>{DT.desc}</Text>
          </View>
          {([
            { key: 'halal', label: DT.halal },
            { key: 'vegetarian', label: DT.vegetarian },
            { key: 'keto', label: DT.keto },
            { key: 'glutenFree', label: DT.glutenFree },
            { key: 'lowFodmap', label: DT.lowFodmap },
          ] as { key: DietBoolKey; label: string }[]).map((row, idx) => {
            const on = diet[row.key];
            return (
              <Animated.View
                key={row.key}
                entering={FadeInDown.delay(300 + idx * 50).duration(600)}
                style={[styles.notificationCard, { marginBottom: 10, backgroundColor: cardBg }]}
              >
                <View style={[styles.notifIconWrapper, { backgroundColor: iconWrap }]}>
                  <Utensils size={20} color={on ? Colors.light.primary : isDark ? Colors.dark.gray[400] : Colors.light.gray[400]} />
                </View>
                <View style={styles.notifTextContent}>
                  <Text style={[styles.notifTitle, { color: titleCol }]}>{row.label}</Text>
                </View>
                <Switch
                  value={on}
                  onValueChange={(val) => toggleDiet(row.key, val)}
                  trackColor={{ false: isDark ? Colors.dark.gray[200] : Colors.light.gray[200], true: isDark ? Colors.dark.primary : Colors.light.primary }}
                  thumbColor={isDark ? Colors.dark.white : Colors.light.white}
                />
              </Animated.View>
            );
          })}

          {/* Conditions médicales — multi-select (chips) alimentant scoreFood. */}
          <View style={[styles.sectionHeader, { marginTop: 40 }]}>
            <Text style={[styles.sectionTitle, { color: tPrimary, textAlign: isRTL ? 'right' : 'left' }]}>
              {t('health_cond.section')}
            </Text>
            <Text style={[styles.sectionDesc, { color: tMuted, textAlign: isRTL ? 'right' : 'left' }]}>
              {t('health_cond.desc')}
            </Text>
          </View>

          <View style={[styles.chipsWrap, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            {CONDITIONS.map((c) => {
              const on = diet.conditions.includes(c.key);
              return (
                <TouchableOpacity
                  key={c.key}
                  activeOpacity={0.8}
                  onPress={() => toggleCondition(c.key)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: on
                        ? Colors.light.primary
                        : resolved === 'dark'
                        ? '#1c2430'
                        : Colors.light.gray[50],
                      borderColor: on ? Colors.light.primary : isDark ? Colors.dark.gray[200] : Colors.light.gray[200],
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: on ? Colors.light.white : tPrimary },
                    ]}
                  >
                    {t(c.labelKey)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.disclaimer, { color: tMuted, textAlign: isRTL ? 'right' : 'left' }]}>
            {t('health_cond.disclaimer')}
          </Text>
        </ScrollView>
      )}
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
    color: isDark ? Colors.dark.gray[900] : Colors.light.gray[900],
    marginBottom: 4,
  },
  sectionDesc: {
    fontSize: 14,
    color: isDark ? Colors.dark.gray[400] : Colors.light.gray[400],
    fontWeight: '500',
  },
  themeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 40,
  },
  themeCard: {
    width: (width - 48 - 24) / 3,
    backgroundColor: isDark ? Colors.dark.gray[50] : Colors.light.gray[50],
    borderRadius: 24,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  themeCardSelected: {
    backgroundColor: isDark ? Colors.dark.card : Colors.light.white,
    borderColor: isDark ? Colors.dark.primary : Colors.light.primary,
    shadowColor: isDark ? 'transparent' : Colors.light.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  themeIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: isDark ? Colors.dark.gray[100] : Colors.light.gray[100],
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  themeLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: isDark ? Colors.dark.gray[400] : Colors.light.gray[400],
  },
  themeLabelSelected: {
    color: isDark ? Colors.dark.primary : Colors.light.primary,
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
    borderColor: isDark ? Colors.dark.white : Colors.light.white,
  },
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? Colors.dark.gray[50] : Colors.light.gray[50],
    padding: 20,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: isDark ? Colors.dark.gray[100] : Colors.light.gray[100],
  },
  notifIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: isDark ? Colors.dark.card : Colors.light.white,
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
    color: isDark ? Colors.dark.gray[900] : Colors.light.gray[900],
  },
  notifDesc: {
    fontSize: 12,
    color: isDark ? Colors.dark.gray[400] : Colors.light.gray[400],
    fontWeight: '500',
    marginTop: 2,
  },
  chipsWrap: {
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '700',
  },
  disclaimer: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 18,
    marginBottom: 8,
  },
});
