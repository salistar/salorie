import React, { useState, useMemo } from 'react';
import { a11y } from '../../lib/a11y';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeft, Plus, Minus, Droplet } from 'lucide-react-native';
import { Colors } from '../../constants/Colors';
import { useLogging } from '../../lib/LoggingContext';
import { addNutritionLog } from '../../lib/firebase';
import { useUser } from '@clerk/clerk-expo';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import ScreenTopBar from '../../components/ScreenTopBar';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { colorLog, explain } from '../../lib/LocalDataStore';

const { width } = Dimensions.get('window');
console.log('\x1b[35m[add-water.tsx] MODULE LOADED\x1b[0m');

const EMPTY_GLASS = require('../../assets/images/empty_glass.png');
const HALF_GLASS = require('../../assets/images/half_glass.png');
const FULL_GLASS = require('../../assets/images/full_glass.png');

export default function AddWaterScreen() {
  const { user } = useUser();
  const { selectedDate, triggerRefresh } = useLogging();
  const { colors, resolved } = useTheme();
  const { t, isRTL } = useTranslation();
  const [ml, setMl] = useState(0);
  const [loading, setLoading] = useState(false);

  const isDark = resolved === 'dark';
  const styles = useMemo(() => makeStyles(isDark), [isDark]);
  const bg = isDark ? '#0B0F14' : Colors.light.white;
  const textPrimary = isDark ? colors.gray[900] : Colors.light.gray[900];
  const textMuted = isDark ? colors.gray[400] : Colors.light.gray[400];
  const cardBg = isDark ? '#161C23' : Colors.light.gray[50];

  const increment = 125;
  const maxMl = 1000;

  console.log('\x1b[33m[AddWater] RENDER\x1b[0m', { ml, theme: resolved });

  const handleAdd = () => ml < maxMl && setMl((p) => p + increment);
  const handleRemove = () => ml >= increment && setMl((p) => p - increment);

  const handleLog = async () => {
    const email = user?.primaryEmailAddress?.emailAddress || '';
    if (!user || !email || ml === 0) return;
    setLoading(true);
    explain('utilisateur enregistre eau — sauvegarde Firestore + triggerRefresh pour update jauge');
    colorLog('GREEN', '[API→Firestore] addNutritionLog water REQUEST', {
      ml,
      email,
      date: selectedDate,
    });
    const t0 = Date.now();
    try {
      await addNutritionLog({
        userId: email,
        type: 'water',
        name: 'Water Intake',
        calories: ml,
        protein: 0,
        carbs: 0,
        fat: 0,
        date: selectedDate,
      });
      colorLog('BLUE', '[API←Firestore] addNutritionLog water OK', { ms: Date.now() - t0 });
      triggerRefresh();
      router.replace('/(tabs)' as any);
    } catch (error) {
      colorLog('RED', '[API←Firestore] water FAILED', { error: (error as Error).message });
    } finally {
      setLoading(false);
    }
  };

  const renderGlasses = () => {
    if (ml === 0) {
      return (
        <Animated.Image
          entering={FadeIn.duration(400)}
          source={EMPTY_GLASS}
          style={styles.mainGlass}
          resizeMode="contain"
        />
      );
    }
    const fullCount = Math.floor(ml / 250);
    const hasHalf = ml % 250 >= 125;
    const glasses: any[] = [];
    for (let i = 0; i < fullCount; i++) {
      glasses.push(
        <Image key={`full-${i}`} source={FULL_GLASS} style={styles.glassThumbnail} resizeMode="contain" />
      );
    }
    if (hasHalf) {
      glasses.push(
        <Image key="half" source={HALF_GLASS} style={styles.glassThumbnail} resizeMode="contain" />
      );
    }
    return (
      <View style={styles.glassesWrapper}>
        <View style={styles.glassesGrid}>{glasses}</View>
      </View>
    );
  };

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.safeArea, { backgroundColor: bg }]}>
      <ScreenTopBar showBack title={t('water.title')} showBrand={false} showNotif={false} />

      <View style={styles.content}>
        <View style={styles.displayArea}>{renderGlasses()}</View>

        <Animated.View entering={FadeInDown.delay(200)} style={styles.controlsContainer}>
          <Text style={[styles.amountLabel, { color: textMuted }]}>{t('water.total')}</Text>
          <View style={[styles.counterRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('retirer')}
              style={[
                styles.controlBtn,
                { backgroundColor: colors.primaryLight },
                ml === 0 && { backgroundColor: cardBg },
              ]}
              onPress={handleRemove}
              disabled={ml === 0}
            >
              <Minus size={30} color={ml === 0 ? textMuted : colors.primary} strokeWidth={3} />
            </TouchableOpacity>

            <View style={styles.amountWrapper}>
              <Text style={[styles.amountValue, { color: textPrimary }]}>{ml}</Text>
              <Text style={[styles.amountUnit, { color: textMuted }]}>ml</Text>
            </View>

            <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('ajouter')}
              style={[
                styles.controlBtn,
                { backgroundColor: colors.primaryLight },
                ml === maxMl && { backgroundColor: cardBg },
              ]}
              onPress={handleAdd}
              disabled={ml === maxMl}
            >
              <Plus size={30} color={ml === maxMl ? textMuted : colors.primary} strokeWidth={3} />
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.logBtn,
            { backgroundColor: colors.primary },
            isDark && { shadowOpacity: 0, elevation: 0 },
            (ml === 0 || loading) && styles.disabledBtn,
          ]}
          onPress={handleLog}
          disabled={ml === 0 || loading}
        >
          {loading ? (
            <ActivityIndicator color={Colors.light.white} />
          ) : (
            <>
              <Droplet size={22} color={Colors.light.white} strokeWidth={3} />
              <Text style={styles.logText}>{t('water.log')}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// Fabrique thémée : un StyleSheet est évalué au chargement du module, où `isDark`
// n'existe pas. Le composant l'appelle via useMemo, recalculé au changement de thème.
const makeStyles = (isDark: boolean) => StyleSheet.create({
  safeArea: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  headerTitle: { fontSize: 20, fontWeight: '800' },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  displayArea: { height: 300, alignItems: 'center', justifyContent: 'center', width: '100%' },
  mainGlass: { width: width * 0.6, height: width * 0.6 },
  glassesWrapper: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', maxWidth: width * 0.8 },
  glassesGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  glassThumbnail: { width: width * 0.35, height: width * 0.35 },
  controlsContainer: { alignItems: 'center', marginTop: 30 },
  amountLabel: {
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 16,
  },
  counterRow: { flexDirection: 'row', alignItems: 'center', gap: 26 },
  controlBtn: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  amountWrapper: { alignItems: 'center', minWidth: 100 },
  amountValue: { fontSize: 54, fontWeight: '900', letterSpacing: -2 },
  amountUnit: { fontSize: 16, fontWeight: '700', marginTop: -8 },
  footer: { padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
  logBtn: {
    backgroundColor: Colors.light.primary,
    height: 60,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: isDark ? 'transparent' : Colors.light.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  disabledBtn: { backgroundColor: isDark ? Colors.dark.gray[200] : Colors.light.gray[200], shadowOpacity: 0, elevation: 0 },
  logText: { fontSize: 18, fontWeight: '800', color: Colors.light.white },
});
