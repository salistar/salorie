import React, { useMemo } from 'react';
import { flipAuto } from '../../lib/rtl';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowRight, Flame, Droplets, Activity } from 'lucide-react-native';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../../constants/Colors';
import { useTranslation } from '../../lib/i18n';
import { useTheme } from '../../lib/ThemeContext';
import ScreenTopBar from '../../components/ScreenTopBar';

export default function WelcomeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { resolved, colors } = useTheme();
  const isDark = resolved === 'dark';
  const styles = useMemo(() => makeStyles(isDark), [isDark]);
  const textColor = isDark ? colors.gray[900] : Colors.light.gray[900];
  const subTextColor = isDark ? colors.gray[500] : Colors.light.gray[500];
  // FIX dark : les cartes « features » étaient figées en rgba(255,255,255,.85) alors
  // que leur texte passe en blanc → blanc sur blanc, illisible sur le TOUT PREMIER
  // écran de l'app. On dérive désormais surface/bordure/accent du thème.
  const cardBg = isDark ? colors.card : 'rgba(255,255,255,0.85)';
  const cardBorder = isDark ? colors.gray[200] : Colors.light.white;
  const accent = isDark ? colors.primary : Colors.light.primary;

  const handleGetStarted = async () => {
    await AsyncStorage.setItem('welcome_seen', 'true');
    router.replace('/(auth)/sign-up' as any);
  };

  const handleSignIn = async () => {
    await AsyncStorage.setItem('welcome_seen', 'true');
    router.replace('/(auth)/sign-in' as any);
  };

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.container}>
      {/* Top bar with brand + language + theme + notif buttons */}
      <ScreenTopBar showNotif={false} />

      {/* `flex: 1` : le defilement prend la hauteur restante et les boutons se
          posent dessous. (La coupure des trois arguments ne venait PAS d'ici mais
          de la place que `(app)/_layout.tsx` reservait a une barre d'onglets
          absente avant connexion — corrige la.) */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeIn.duration(600)} style={[styles.heroWrap, { borderColor: cardBorder, shadowColor: accent }]}>
          <Image
            source={require('../../assets/images/illustrations/welcome.jpg')}
            style={styles.heroImage}
            resizeMode="cover"
          />
        </Animated.View>

        <Animated.Text entering={FadeIn.delay(100).duration(600)} style={[styles.brandName, { color: accent }]}>
          Salorie
        </Animated.Text>

        <Animated.Text entering={FadeInDown.delay(200).duration(600)} style={[styles.title, { color: textColor }]}>
          {t('welcome.title')}
        </Animated.Text>

        <Animated.Text entering={FadeInDown.delay(300).duration(600)} style={[styles.subtitle, { color: subTextColor }]}>
          {t('welcome.subtitle')}
        </Animated.Text>

        <View style={styles.features}>
          <Animated.View entering={FadeInDown.delay(400).duration(600)} style={[styles.feature, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <View style={[styles.featureIcon, { backgroundColor: isDark ? 'rgba(245,158,11,0.18)' : '#FEF3E0' }]}>
              <Flame size={22} color="#f59e0b" />
            </View>
            <Text style={[styles.featureText, { color: textColor }]}>{t('welcome.feature_calories')}</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(500).duration(600)} style={[styles.feature, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <View style={[styles.featureIcon, { backgroundColor: isDark ? 'rgba(14,165,233,0.18)' : '#E0F2FE' }]}>
              <Droplets size={22} color="#0EA5E9" />
            </View>
            <Text style={[styles.featureText, { color: textColor }]}>{t('welcome.feature_water')}</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(600).duration(600)} style={[styles.feature, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <View style={[styles.featureIcon, { backgroundColor: isDark ? 'rgba(74,222,128,0.18)' : '#ebf5ee' }]}>
              <Activity size={22} color={accent} />
            </View>
            <Text style={[styles.featureText, { color: textColor }]}>{t('welcome.feature_activity')}</Text>
          </Animated.View>
        </View>
      </ScrollView>

      <Animated.View entering={FadeInDown.delay(800).duration(600)} style={styles.bottomBar}>
        <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: accent, shadowColor: accent }]} onPress={handleGetStarted} activeOpacity={0.85}>
          <Text style={styles.primaryBtnText}>{t('welcome.get_started')}</Text>
          <View style={flipAuto()}><ArrowRight size={22} color="#fff" /></View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryBtn} onPress={handleSignIn}>
          <Text style={[styles.secondaryBtnText, { color: subTextColor }]}>
            {t('welcome.have_account')} <Text style={{ color: accent, fontWeight: '800' }}>{t('welcome.sign_in')}</Text>
          </Text>
        </TouchableOpacity>
      </Animated.View>
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
    paddingHorizontal: 24,
    paddingBottom: 20,
    alignItems: 'center',
  },
  heroWrap: {
    width: 140,
    height: 140,
    borderRadius: 70,
    overflow: 'hidden',
    marginTop: 12,
    marginBottom: 16,
    borderWidth: 4,
    shadowColor: isDark ? 'transparent' : Colors.light.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 8,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  brandName: {
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: -1,
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  features: {
    width: '100%',
    gap: 10,
  },
  feature: {
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(255,255,255,0.85)',
    padding: 14,
    borderRadius: 18,
  },
  featureIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  bottomBar: {
    paddingHorizontal: 24,
    paddingBottom: 20,
    paddingTop: 10,
    gap: 12,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.light.primary,
    height: 56,
    borderRadius: 28,
    shadowColor: isDark ? 'transparent' : Colors.light.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
  secondaryBtn: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  secondaryBtnText: {
    fontSize: 14,
  },
});
