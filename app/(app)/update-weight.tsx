import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { ArrowLeft, Check, Scale } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { RulerPicker } from 'react-native-ruler-picker';
import { useUser } from '@clerk/clerk-expo';
import { saveUserToFirestore, addWeightLog } from '../../lib/firebase';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTranslation } from '../../lib/i18n';
import { useTheme } from '../../lib/ThemeContext';
import { useTokens, Tokens } from '../../constants/tokens';

const TXT: Record<string, {
  title: string;
  subtitle: string;
  updateWeight: string;
  successTitle: string;
  successMsg: string;
  errorTitle: string;
  errorMsg: string;
}> = {
  en: {
    title: 'Update Weight',
    subtitle: 'Select your current body weight in kg',
    updateWeight: 'Update Weight',
    successTitle: 'Success',
    successMsg: 'Your weight has been updated!',
    errorTitle: 'Error',
    errorMsg: 'Failed to update weight. Please try again.',
  },
  fr: {
    title: 'Mettre à jour le poids',
    subtitle: 'Sélectionnez votre poids actuel en kg',
    updateWeight: 'Mettre à jour le poids',
    successTitle: 'Succès',
    successMsg: 'Votre poids a été mis à jour !',
    errorTitle: 'Erreur',
    errorMsg: 'Échec de la mise à jour du poids. Veuillez réessayer.',
  },
  ar: {
    title: 'تحديث الوزن',
    subtitle: 'اختر وزن جسمك الحالي بالكيلوغرام',
    updateWeight: 'تحديث الوزن',
    successTitle: 'تم بنجاح',
    successMsg: 'تم تحديث وزنك!',
    errorTitle: 'خطأ',
    errorMsg: 'فشل تحديث الوزن. يرجى المحاولة مرة أخرى.',
  },
};

export default function UpdateWeightScreen() {
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const { resolved } = useTheme();
  const k = useTokens();
  const isDark = resolved === 'dark';
  const styles = useMemo(() => makeStyles(k), [k]);

  const pageBg = isDark ? '#0f1419' : k.surface;
  const cardBg = k.surfaceSunken;
  const primaryText = isDark ? '#fff' : k.text;
  const secondaryText = isDark ? '#9BA1A6' : k.textMuted;

  const { user } = useUser();
  const params = useLocalSearchParams();
  const initialWeight = parseFloat(params.currentWeight as string) || 70;
  
  const [weight, setWeight] = useState(initialWeight);
  const [loading, setLoading] = useState(false);

  const handleUpdate = async () => {
    const email = user?.primaryEmailAddress?.emailAddress || '';
    if (!user || !email) return;
    setLoading(true);

    try {
      // 1. Update user's current weight in profile
      await saveUserToFirestore({
        id: user.id,
        email,
        weight: weight,
      });

      // 2. Log historical entry for trend tracking
      await addWeightLog(email, weight);

      Alert.alert(t.successTitle, t.successMsg);
      router.back();
    } catch (error) {
      console.error('Error updating weight:', error);
      Alert.alert(t.errorTitle, t.errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.safeArea, { backgroundColor: pageBg }]}>
      <ScreenTopBar showBack showBrand={false} showNotif={false} />

      <View style={styles.titleSection}>
        <Text style={[styles.title, { color: primaryText, textAlign: isRTL ? 'right' : 'left' }]}>{t.title}</Text>
        <Text style={[styles.subtitle, { color: secondaryText, textAlign: isRTL ? 'right' : 'left' }]}>{t.subtitle}</Text>
      </View>

      <View style={styles.content}>
        <Animated.View entering={FadeInDown.duration(800)} style={styles.pickerContainer}>
          <View style={[styles.iconContainer, isDark ? { backgroundColor: cardBg } : null]}>
            <Scale size={32} color={k.accent} />
          </View>
          
          <RulerPicker
            min={30}
            max={200}
            step={0.1}
            fractionDigits={1}
            initialValue={initialWeight}
            onValueChange={(val) => setWeight(parseFloat(val))}
            unit="kg"
            width={300}
            height={150}
            indicatorColor={k.accent}
            valueTextStyle={StyleSheet.flatten([styles.rulerValueText, { color: primaryText }])}
            unitTextStyle={StyleSheet.flatten([styles.rulerUnitText, { color: secondaryText }])}
          />
        </Animated.View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.updateBtn, { flexDirection: isRTL ? 'row-reverse' : 'row' }, loading && styles.disabledBtn]}
          onPress={handleUpdate}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={k.surface} />
          ) : (
            <>
              <Check size={24} color={k.surface} strokeWidth={3} />
              <Text style={styles.updateText}>{t.updateWeight}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// Fabrique thémée : un StyleSheet est évalué au chargement du module, où `isDark`
// n'existe pas. Le composant l'appelle via useMemo, recalculé au changement de thème.
const makeStyles = (k: Tokens) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: k.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    marginBottom: 10,
  },
  backBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: k.surfaceSunken,
  },
  titleSection: {
    paddingHorizontal: 24,
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: k.text,
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 16,
    color: k.textMuted,
    fontWeight: '600',
    marginTop: 4,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 60,
  },
  pickerContainer: {
    alignItems: 'center',
    width: '100%',
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: '#F0F9FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  rulerValueText: {
    fontSize: 64,
    fontWeight: '900',
    color: k.text,
  },
  rulerUnitText: {
    fontSize: 20,
    fontWeight: '800',
    color: k.textMuted,
    marginTop: 10,
  },
  footer: {
    padding: 24,
    paddingBottom: 40,
  },
  updateBtn: {
    backgroundColor: k.accent,
    height: 64,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    shadowColor: k.isDark ? 'transparent' : k.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  disabledBtn: {
    backgroundColor: k.border,
    shadowOpacity: 0,
    elevation: 0,
  },
  updateText: {
    fontSize: 20,
    fontWeight: '800',
    color: k.surface,
  },
});
