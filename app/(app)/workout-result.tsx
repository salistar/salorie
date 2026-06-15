import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  SafeAreaView, 
  Dimensions,
  Platform,
  ActivityIndicator
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Flame, Check, ArrowLeft } from 'lucide-react-native';
import { Colors } from '../../constants/Colors';
import ScreenTopBar from '../../components/ScreenTopBar';
import { useLogging } from '../../lib/LoggingContext';
import { addNutritionLog } from '../../lib/firebase';
import { useUser } from '@clerk/clerk-expo';
import Animated, { FadeInUp, ZoomIn } from 'react-native-reanimated';
import { useTranslation } from '../../lib/i18n';
import { useTheme } from '../../lib/ThemeContext';

const TXT: Record<string, any> = {
  en: { burned: 'Your workout burned', logWorkout: 'Log Workout', great: 'Great session!', kcal: 'kcal', min: 'min', dur: 'Duration', intensity: 'Intensity', saved: 'It will be added to your activity' },
  fr: { burned: 'Calories brûlées', logWorkout: 'Enregistrer', great: 'Belle séance !', kcal: 'kcal', min: 'min', dur: 'Durée', intensity: 'Intensité', saved: 'Sera ajouté à ton activité' },
  ar: { burned: 'تمرينك أحرق', logWorkout: 'تسجيل التمرين', great: 'حصة رائعة!', kcal: 'سعرة', min: 'د', dur: 'المدة', intensity: 'الشدة', saved: 'ستُضاف إلى نشاطك' },
};

const { width } = Dimensions.get('window');

export default function WorkoutResultScreen() {
  const { user } = useUser();
  const { selectedDate, triggerRefresh } = useLogging();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  const params = useLocalSearchParams();
  const { calories, name, duration } = params;

  const [loading, setLoading] = useState(false);

  const handleLog = async () => {
    const email = user?.primaryEmailAddress?.emailAddress || '';
    if (!user || !email) return;
    setLoading(true);

    try {
      await addNutritionLog({
        userId: email,
        type: 'activity',
        name: (name as string).split(' (')[0] || 'Workout',
        calories: parseFloat(calories as string),
        protein: 0,
        carbs: 0,
        fat: 0,
        date: selectedDate,
        intensity: (name as string).match(/\((.*?)\)/)?.[1] || 'Medium',
        duration: parseInt(duration as string),
      });
      triggerRefresh();
      router.replace('/(tabs)' as any);
    } catch (error) {
      console.error('Error logging activity:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: isDark ? '#000' : Colors.light.white }]}>
      <ScreenTopBar showBack showBrand={false} showNotif={false} />

      <View style={styles.content}>
        <Animated.View
          entering={ZoomIn.duration(600).springify()}
          style={styles.fireWrapper}
        >
          <View style={styles.fireCircle}>
            <Flame size={80} color="#FF5C5C" strokeWidth={2.5} />
          </View>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(300).duration(600)} style={{ alignItems: 'center', alignSelf: 'stretch' }}>
          <Text style={[styles.great, { color: isDark ? '#fff' : Colors.light.gray[900] }]}>{t.great}</Text>
          <Text style={[styles.subtitle, { color: isDark ? '#9BA1A6' : Colors.light.gray[500] }]}>{t.burned}</Text>
          <Text style={[styles.calories, { color: isDark ? '#fff' : Colors.light.gray[900] }]}>{calories}<Text style={styles.calUnit}> {t.kcal}</Text></Text>

          {/* Rangée de stats designée */}
          <View style={[styles.statsRow, { backgroundColor: isDark ? '#161C23' : Colors.light.gray[50] }]}>
            <View style={styles.stat}>
              <Text style={[styles.statVal, { color: isDark ? '#fff' : Colors.light.gray[900] }]}>{duration}</Text>
              <Text style={[styles.statLbl, { color: isDark ? '#9BA1A6' : Colors.light.gray[400] }]}>{t.dur} ({t.min})</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: isDark ? '#283241' : Colors.light.gray[100] }]} />
            <View style={styles.stat}>
              <Text style={[styles.statVal, { color: isDark ? '#fff' : Colors.light.gray[900] }]} numberOfLines={1}>{String(name).match(/\((.*?)\)/)?.[1] || '—'}</Text>
              <Text style={[styles.statLbl, { color: isDark ? '#9BA1A6' : Colors.light.gray[400] }]}>{t.intensity}</Text>
            </View>
          </View>

          <Text style={[styles.info, { color: isDark ? '#9BA1A6' : Colors.light.gray[400] }]} numberOfLines={1}>{String(name).split(' (')[0]}</Text>
          <Text style={[styles.savedHint, { color: Colors.light.primary }]}>{t.saved}</Text>
        </Animated.View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.logBtn, { flexDirection: isRTL ? 'row-reverse' : 'row' }, loading && styles.disabledBtn]}
          onPress={handleLog}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={Colors.light.white} />
          ) : (
            <>
              <Check size={24} color={Colors.light.white} strokeWidth={3} />
              <Text style={styles.logText}>{t.logWorkout}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.light.white,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  backBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.gray[50],
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  fireWrapper: {
    marginBottom: 40,
  },
  fireCircle: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#FFEEED',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF5C5C',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 5,
  },
  subtitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.light.gray[500],
    textAlign: 'center',
    marginBottom: 12,
  },
  great: { fontSize: 26, fontWeight: '900', textAlign: 'center', letterSpacing: -0.5, marginBottom: 6 },
  calories: {
    fontSize: 72,
    fontWeight: '900',
    color: Colors.light.gray[900],
    textAlign: 'center',
    letterSpacing: -2,
  },
  calUnit: { fontSize: 24, fontWeight: '800' },
  statsRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', borderRadius: 22, paddingVertical: 18, paddingHorizontal: 12, marginTop: 24, marginBottom: 4 },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  statVal: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  statLbl: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  statDivider: { width: 1, height: 36 },
  savedHint: { fontSize: 13, fontWeight: '700', textAlign: 'center', marginTop: 10 },
  info: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.gray[400],
    textAlign: 'center',
    marginTop: 16,
  },
  footer: {
    padding: 32,
    paddingBottom: Platform.OS === 'ios' ? 48 : 32,
  },
  logBtn: {
    backgroundColor: Colors.light.primary,
    height: 64,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    shadowColor: Colors.light.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  disabledBtn: {
    backgroundColor: Colors.light.gray[200],
    shadowOpacity: 0,
    elevation: 0,
  },
  logText: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.light.white,
  },
});
