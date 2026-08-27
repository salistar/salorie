import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, Footprints, Weight, Settings2, ChevronRight } from 'lucide-react-native';
import { Colors } from '../../constants/Colors';
import ScreenTopBar from '../../components/ScreenTopBar';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';

console.log('\x1b[35m[log-exercise.tsx] MODULE LOADED\x1b[0m');

export default function LogExerciseScreen() {
  const { colors, resolved } = useTheme();
  const { t, isRTL } = useTranslation();
  const isDark = resolved === 'dark';
  const styles = useMemo(() => makeStyles(isDark), [isDark]);

  const bg = isDark ? '#0B0F14' : Colors.light.white;
  const textPrimary = isDark ? colors.gray[900] : Colors.light.gray[900];
  const textMuted = isDark ? colors.gray[400] : Colors.light.gray[400];
  const cardBg = isDark ? '#161C23' : Colors.light.white;
  const cardBorder = isDark ? colors.gray[200] : Colors.light.gray[100];
  const backBtnBg = isDark ? '#161C23' : Colors.light.gray[50];

  console.log('\x1b[33m[LogExercise] RENDER\x1b[0m', { theme: resolved });

  const options = [
    {
      id: 'run',
      title: t('logex.run'),
      desc: t('logex.run_desc'),
      icon: <Footprints size={26} color="#FF5C5C" />,
      bg: '#FFEEED',
      onPress: () => {
        router.push({
          pathname: '/workout-details' as any,
          params: { type: 'run' },
        });
      },
    },
    {
      id: 'lifting',
      title: t('logex.lifting'),
      desc: t('logex.lifting_desc'),
      icon: <Weight size={26} color="#0EA5E9" />,
      bg: '#E0F2FE',
      onPress: () => {
        router.push({
          pathname: '/workout-details' as any,
          params: { type: 'lifting' },
        });
      },
    },
    {
      id: 'manual',
      title: t('logex.manual'),
      desc: t('logex.manual_desc'),
      icon: <Settings2 size={26} color="#F59E0B" />,
      bg: '#FFF9EB',
      onPress: () => router.push('/log-manual' as any),
    },
  ];

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.safeArea, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showBrand showNotif={false} />

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: textPrimary, textAlign: isRTL ? 'right' : 'left' }]}>
          {t('logex.title')}
        </Text>
        <Image source={require('../../assets/images/abstraits/hero-seance.jpg')} style={styles.hero} resizeMode="cover" />

        <View style={styles.optionsList}>
          {options.map((option) => (
            <TouchableOpacity
              key={option.id}
              style={[
                styles.optionCard,
                {
                  backgroundColor: cardBg,
                  borderColor: cardBorder,
                  flexDirection: isRTL ? 'row-reverse' : 'row',
                },
              ]}
              activeOpacity={0.7}
              onPress={option.onPress}
            >
              <View style={[styles.iconWrapper, { backgroundColor: option.bg }]}>{option.icon}</View>
              <View style={styles.texts}>
                <Text style={[styles.optionTitle, { color: textPrimary, textAlign: isRTL ? 'right' : 'left' }]}>
                  {option.title}
                </Text>
                <Text style={[styles.optionDesc, { color: textMuted, textAlign: isRTL ? 'right' : 'left' }]}>
                  {option.desc}
                </Text>
              </View>
              <View style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}><ChevronRight
                size={20}
                color={textMuted}
                strokeWidth={3} /></View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Fabrique thémée : un StyleSheet est évalué au chargement du module, où `isDark`
// n'existe pas. Le composant l'appelle via useMemo, recalculé au changement de thème.
const makeStyles = (isDark: boolean) => StyleSheet.create({
  safeArea: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 4, marginBottom: 16 },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { paddingHorizontal: 24, paddingBottom: 40 },
  title: { fontSize: 34, fontWeight: '900', letterSpacing: -1, marginBottom: 16, marginTop: 4 },
  hero: { width: '100%', height: 150, borderRadius: 18, marginBottom: 20 },
  optionsList: { gap: 14 },
  optionCard: {
    alignItems: 'center',
    padding: 18,
    borderRadius: 24,
    borderWidth: 1.5,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  iconWrapper: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: { flex: 1, gap: 4 },
  optionTitle: { fontSize: 17, fontWeight: '800' },
  optionDesc: { fontSize: 13, fontWeight: '500' },
});
