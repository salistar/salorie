import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, SafeAreaView, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowRight, Flame, Droplets, Activity } from 'lucide-react-native';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/Colors';
import { useTranslation } from '../lib/i18n';
import { useTheme } from '../lib/ThemeContext';
import ScreenTopBar from '../components/ScreenTopBar';

export default function WelcomeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { resolved } = useTheme();
  const textColor = resolved === 'dark' ? '#fff' : Colors.light.gray[900];
  const subTextColor = resolved === 'dark' ? '#aaa' : Colors.light.gray[500];

  const handleGetStarted = async () => {
    await AsyncStorage.setItem('welcome_seen', 'true');
    router.replace('/(auth)/sign-up' as any);
  };

  const handleSignIn = async () => {
    await AsyncStorage.setItem('welcome_seen', 'true');
    router.replace('/(auth)/sign-in' as any);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Top bar with brand + language + theme + notif buttons */}
      <ScreenTopBar showNotif={false} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeIn.duration(600)} style={styles.heroWrap}>
          <Image
            source={require('../assets/images/illustrations/welcome.jpg')}
            style={styles.heroImage}
            resizeMode="cover"
          />
        </Animated.View>

        <Animated.Text entering={FadeIn.delay(100).duration(600)} style={[styles.brandName, { color: Colors.light.primary }]}>
          Salorie
        </Animated.Text>

        <Animated.Text entering={FadeInDown.delay(200).duration(600)} style={[styles.title, { color: textColor }]}>
          {t('welcome.title')}
        </Animated.Text>

        <Animated.Text entering={FadeInDown.delay(300).duration(600)} style={[styles.subtitle, { color: subTextColor }]}>
          {t('welcome.subtitle')}
        </Animated.Text>

        <View style={styles.features}>
          <Animated.View entering={FadeInDown.delay(400).duration(600)} style={styles.feature}>
            <View style={[styles.featureIcon, { backgroundColor: '#FEF3E0' }]}>
              <Flame size={22} color="#f59e0b" />
            </View>
            <Text style={[styles.featureText, { color: textColor }]}>{t('welcome.feature_calories')}</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(500).duration(600)} style={styles.feature}>
            <View style={[styles.featureIcon, { backgroundColor: '#E0F2FE' }]}>
              <Droplets size={22} color="#0EA5E9" />
            </View>
            <Text style={[styles.featureText, { color: textColor }]}>{t('welcome.feature_water')}</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(600).duration(600)} style={styles.feature}>
            <View style={[styles.featureIcon, { backgroundColor: '#ebf5ee' }]}>
              <Activity size={22} color={Colors.light.primary} />
            </View>
            <Text style={[styles.featureText, { color: textColor }]}>{t('welcome.feature_activity')}</Text>
          </Animated.View>
        </View>
      </ScrollView>

      <Animated.View entering={FadeInDown.delay(800).duration(600)} style={styles.bottomBar}>
        <TouchableOpacity style={styles.primaryBtn} onPress={handleGetStarted} activeOpacity={0.85}>
          <Text style={styles.primaryBtnText}>{t('welcome.get_started')}</Text>
          <ArrowRight size={22} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryBtn} onPress={handleSignIn}>
          <Text style={[styles.secondaryBtnText, { color: subTextColor }]}>
            {t('welcome.have_account')} <Text style={{ color: Colors.light.primary, fontWeight: '800' }}>{t('welcome.sign_in')}</Text>
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
    borderColor: Colors.light.white,
    shadowColor: Colors.light.primary,
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
    shadowColor: Colors.light.primary,
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
