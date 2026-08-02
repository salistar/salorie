import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, Flame, Activity } from 'lucide-react-native';
import { Colors } from '../../constants/Colors';
import { useLogging } from '../../lib/LoggingContext';
import { addNutritionLog } from '../../lib/firebase';
import { useUser } from '@clerk/clerk-expo';
import ScreenTopBar from '../../components/ScreenTopBar';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { colorLog, explain } from '../../lib/LocalDataStore';
import { Stepper, InlineError } from '../../components/FormKit';
import { Input } from '../../components/ui';

console.log('\x1b[35m[log-manual.tsx] MODULE LOADED\x1b[0m');

// Photo bundlée (offline-safe) au lieu d'une image distante Unsplash.
const HERO_IMAGE = require('../../assets/images/illustrations/gain_weight.jpg');

export default function LogManualExerciseScreen() {
  const { user } = useUser();
  const { selectedDate, triggerRefresh } = useLogging();
  const { colors, resolved } = useTheme();
  const { t, isRTL, language } = useTranslation() as any;
  const kcalErr = language === 'fr' ? '⚠️ Entre un nombre de kcal valide' : language === 'ar' ? '⚠️ أدخل عدد سعرات صالحًا' : '⚠️ Enter a valid number of kcal';

  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [loading, setLoading] = useState(false);

  const isDark = resolved === 'dark';
  const styles = useMemo(() => makeStyles(isDark), [isDark]);
  const bg = isDark ? '#0B0F14' : Colors.light.white;
  const textPrimary = isDark ? colors.gray[900] : Colors.light.gray[900];
  const textMuted = isDark ? colors.gray[400] : Colors.light.gray[400];
  const textLabel = isDark ? colors.gray[700] : Colors.light.gray[700];
  const cardBg = isDark ? '#161C23' : Colors.light.gray[50];
  const cardBorder = isDark ? colors.gray[200] : Colors.light.gray[100];
  const inputBg = isDark ? '#0B0F14' : Colors.light.white;

  console.log('\x1b[33m[LogManual] RENDER\x1b[0m', { name, calories, theme: resolved });

  const handleLog = async () => {
    if (!name || !calories) return;
    const email = user?.primaryEmailAddress?.emailAddress || '';
    if (!user || !email) return;

    setLoading(true);
    explain('saisie manuelle exercice — ecriture Firestore + triggerRefresh pour update jauge en cache');
    colorLog('GREEN', '[API→Firestore] addNutritionLog manual activity REQUEST', {
      name,
      calories,
      email,
      date: selectedDate,
    });
    const t0 = Date.now();
    try {
      await addNutritionLog({
        userId: email,
        type: 'activity',
        name,
        calories: parseFloat(calories),
        protein: 0,
        carbs: 0,
        fat: 0,
        date: selectedDate,
      });
      colorLog('BLUE', '[API←Firestore] addNutritionLog manual OK', { ms: Date.now() - t0 });
      triggerRefresh();
      router.replace('/(tabs)' as any);
    } catch (error) {
      colorLog('RED', '[API←Firestore] manual FAILED', { error: (error as Error).message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showBrand showNotif={false} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <Image source={HERO_IMAGE} style={styles.hero} resizeMode="cover" />

          <Text style={[styles.title, { color: textPrimary, textAlign: isRTL ? 'right' : 'left' }]}>
            {t('manual.title')}
          </Text>
          <Text style={[styles.subtitle, { color: textMuted, textAlign: isRTL ? 'right' : 'left' }]}>
            {t('manual.subtitle')}
          </Text>

          <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <Input
              label={t('manual.what_did')}
              icon={<Activity size={20} color={textMuted} strokeWidth={2.5} />}
              placeholder={t('manual.activity_ph')}
              value={name}
              onChangeText={setName}
              autoFocus
            />

            <View style={styles.spacer} />

            <View style={[styles.row, isRTL && { flexDirection: 'row-reverse' }]}>
              <Flame size={20} color="#FF5C5C" strokeWidth={3} />
              <Text style={[styles.label, { color: textLabel, marginBottom: 0 }]}>
                {t('manual.calories_burned')}
              </Text>
            </View>
            {/* Stepper +/- (pattern FormKit) au lieu d'un simple champ texte */}
            <Stepper value={calories} onChange={setCalories} step={25} min={0} max={5000} unit="kcal"
              error={calories !== '' && (!Number(calories) || Number(calories) <= 0) ? kcalErr : undefined} />
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.logBtn, (!name || !calories || loading) && styles.disabledBtn]}
            onPress={handleLog}
            disabled={!name || !calories || loading}
          >
            {loading ? (
              <ActivityIndicator color={Colors.light.white} />
            ) : (
              <Text style={styles.logText}>{t('manual.log_activity')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Fabrique thémée : un StyleSheet est évalué au chargement du module, où `isDark`
// n'existe pas. Le composant l'appelle via useMemo, recalculé au changement de thème.
const makeStyles = (isDark: boolean) => StyleSheet.create({
  safeArea: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 4, marginBottom: 10 },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { paddingHorizontal: 24, paddingBottom: 40 },
  hero: {
    width: '100%',
    height: 160,
    borderRadius: 24,
    marginBottom: 20,
  },
  title: { fontSize: 32, fontWeight: '900', letterSpacing: -1 },
  subtitle: { fontSize: 15, fontWeight: '500', marginTop: 4, marginBottom: 24 },
  card: { borderRadius: 28, padding: 20, borderWidth: 1.5 },
  label: { fontSize: 15, fontWeight: '800', marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  inputWrapper: {
    borderRadius: 18,
    paddingHorizontal: 16,
    height: 58,
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  caloriesWrapper: { flexDirection: 'row', alignItems: 'center' },
  input: { fontSize: 16, fontWeight: '700' },
  caloriesInput: { flex: 1, fontSize: 22, color: '#FF5C5C' },
  unit: { fontSize: 15, fontWeight: '800', marginRight: 10 },
  spacer: { height: 22 },
  footer: { padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
  logBtn: {
    backgroundColor: Colors.light.primary,
    height: 60,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: isDark ? 'transparent' : Colors.light.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  disabledBtn: { backgroundColor: isDark ? Colors.dark.gray[200] : Colors.light.gray[200], shadowOpacity: 0, elevation: 0 },
  logText: { fontSize: 18, fontWeight: '800', color: Colors.light.white },
});
