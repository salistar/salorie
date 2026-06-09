import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, Flame } from 'lucide-react-native';
import { Colors } from '../constants/Colors';
import { useLogging } from '../lib/LoggingContext';
import { addNutritionLog } from '../lib/firebase';
import { useUser } from '@clerk/clerk-expo';
import ScreenTopBar from '../components/ScreenTopBar';
import { useTheme } from '../lib/ThemeContext';
import { useTranslation } from '../lib/i18n';
import { colorLog, explain } from '../lib/LocalDataStore';

console.log('\x1b[35m[log-manual.tsx] MODULE LOADED\x1b[0m');

// Photo representative: personne en mouvement libre, utilisee en hero card
const HERO_IMAGE = 'https://images.unsplash.com/photo-1538805060514-97d9cc17730c?w=800&q=70';

export default function LogManualExerciseScreen() {
  const { user } = useUser();
  const { selectedDate, triggerRefresh } = useLogging();
  const { colors, resolved } = useTheme();
  const { t, isRTL } = useTranslation();

  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [loading, setLoading] = useState(false);

  const isDark = resolved === 'dark';
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
          <Image source={{ uri: HERO_IMAGE }} style={styles.hero} resizeMode="cover" />

          <Text style={[styles.title, { color: textPrimary, textAlign: isRTL ? 'right' : 'left' }]}>
            {t('manual.title')}
          </Text>
          <Text style={[styles.subtitle, { color: textMuted, textAlign: isRTL ? 'right' : 'left' }]}>
            {t('manual.subtitle')}
          </Text>

          <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <Text style={[styles.label, { color: textLabel, textAlign: isRTL ? 'right' : 'left' }]}>
              {t('manual.what_did')}
            </Text>
            <View style={[styles.inputWrapper, { backgroundColor: inputBg, borderColor: cardBorder }]}>
              <TextInput
                style={[styles.input, { color: textPrimary, textAlign: isRTL ? 'right' : 'left' }]}
                placeholder={t('manual.activity_ph')}
                placeholderTextColor={textMuted}
                value={name}
                onChangeText={setName}
                autoFocus
              />
            </View>

            <View style={styles.spacer} />

            <View style={[styles.row, isRTL && { flexDirection: 'row-reverse' }]}>
              <Flame size={20} color="#FF5C5C" strokeWidth={3} />
              <Text style={[styles.label, { color: textLabel, marginBottom: 0 }]}>
                {t('manual.calories_burned')}
              </Text>
            </View>
            <View
              style={[
                styles.inputWrapper,
                styles.caloriesWrapper,
                { backgroundColor: inputBg, borderColor: '#FFEEED' },
                isRTL && { flexDirection: 'row-reverse' },
              ]}
            >
              <TextInput
                style={[styles.input, styles.caloriesInput, { textAlign: isRTL ? 'right' : 'left' }]}
                placeholder="0"
                placeholderTextColor={textMuted}
                keyboardType="numeric"
                value={calories}
                onChangeText={setCalories}
              />
              <Text style={[styles.unit, { color: textMuted }]}>kcal</Text>
              <Flame size={24} color="#FF5C5C" opacity={0.3} strokeWidth={2.5} />
            </View>
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

const styles = StyleSheet.create({
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
    shadowColor: Colors.light.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  disabledBtn: { backgroundColor: Colors.light.gray[200], shadowOpacity: 0, elevation: 0 },
  logText: { fontSize: 18, fontWeight: '800', color: Colors.light.white },
});
