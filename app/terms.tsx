import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { ChevronLeft, Scale, ShieldCheck, ScrollText } from 'lucide-react-native';
import { Colors } from '../constants/Colors';
import ScreenTopBar from '../components/ScreenTopBar';
import { useTheme } from '../lib/ThemeContext';
import { useTranslation } from '../lib/i18n';
import Animated, { FadeInDown } from 'react-native-reanimated';

export default function TermsScreen() {
  const { resolved } = useTheme();
  const { language } = useTranslation() as any;
  const isDark = resolved === 'dark';
  const ttl = language === 'fr' ? 'Conditions' : language === 'ar' ? 'الشروط' : 'Terms of Service';
  const hero = language === 'fr' ? 'Notre engagement' : language === 'ar' ? 'التزامنا' : 'Our Commitment';
  const bg = isDark ? '#0f1419' : '#fff';
  const tPrimary = isDark ? '#fff' : Colors.light.gray[900];
  const tMuted = isDark ? '#9BA1A6' : Colors.light.gray[500];
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <ScreenTopBar showBack title={ttl} showBrand={false} showNotif={false} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(600)}>
          <View style={styles.iconHero}>
            <ScrollText size={64} color={Colors.light.primary} />
          </View>
          <Text style={[styles.title, { color: tPrimary }]}>{hero}</Text>
          <Text style={[styles.date, { color: tMuted }]}>Last Updated: April 15, 2026</Text>

          <Text style={[styles.paragraph, { color: tMuted }]}>
            Welcome to Salorie. By using our app, you agree to the following terms. We aim to provide the best health tracking experience possible while maintaining a professional standard.
          </Text>

          <Text style={[styles.subTitle, { color: tPrimary }]}>1. Data Usage</Text>
          <Text style={[styles.paragraph, { color: tMuted }]}>
            You own your data. We use your logs and profile information solely to provide personalized AI insights and nutritional tracking. We do not sell your personal health data to third parties.
          </Text>

          <Text style={[styles.subTitle, { color: tPrimary }]}>2. Health Disclaimer</Text>
          <Text style={[styles.paragraph, { color: tMuted }]}>
            Salorie is a tracking tool, not a medical advisor. AI insights and nutritional plans are generated based on general logic and should be reviewed by a certified healthcare professional before making significant lifestyle changes.
          </Text>

          <Text style={[styles.subTitle, { color: tPrimary }]}>3. AI Accuracy</Text>
          <Text style={[styles.paragraph, { color: tMuted }]}>
            While we use advanced models like Gemini-1.5-flash, AI insights can occasionally be inaccurate. Always use your best judgment.
          </Text>
        </Animated.View>
      </ScrollView>
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
  content: {
    padding: 24,
    paddingBottom: 40,
  },
  iconHero: {
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: Colors.light.gray[900],
    textAlign: 'center',
  },
  date: {
    fontSize: 14,
    color: Colors.light.gray[400],
    textAlign: 'center',
    marginBottom: 32,
    fontWeight: '600',
  },
  subTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.light.gray[800],
    marginTop: 24,
    marginBottom: 10,
  },
  paragraph: {
    fontSize: 16,
    color: Colors.light.gray[500],
    lineHeight: 24,
    fontWeight: '500',
  },
});
