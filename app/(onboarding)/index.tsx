import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  TextInput,
  Image,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Easing,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Ruler,
  Weight,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react-native';
import { useUser } from '@clerk/clerk-expo';
import { Colors } from '../../constants/Colors';
import { useTranslation } from '../../lib/i18n';
import { useTheme } from '../../lib/ThemeContext';
import { Stepper } from '../../components/FormKit';
import ScreenTopBar from '../../components/ScreenTopBar';

// i18n LOCAL — toutes les chaînes auparavant codées en dur (placeholders,
// labels d'unités, boutons) passent ici. Rien d'anglais ne reste en FR/AR.
const TXT: Record<string, {
  next: string;
  finish: string;
  day: string;
  month: string;
  year: string;
  height: string;
  weight: string;
  cm: string;
  kg: string;
  yearsInvalid: string;
  heightInvalid: string;
  weightInvalid: string;
  birthHint: string;
}> = {
  en: {
    next: 'Next',
    finish: 'Finish',
    day: 'Day',
    month: 'Month',
    year: 'Year',
    height: 'Height',
    weight: 'Weight',
    cm: 'cm',
    kg: 'kg',
    yearsInvalid: 'Enter a valid birth date',
    heightInvalid: 'Height must be 120–220 cm',
    weightInvalid: 'Weight must be 30–250 kg',
    birthHint: 'DD / MM / YYYY',
  },
  fr: {
    next: 'Suivant',
    finish: 'Terminer',
    day: 'Jour',
    month: 'Mois',
    year: 'Année',
    height: 'Taille',
    weight: 'Poids',
    cm: 'cm',
    kg: 'kg',
    yearsInvalid: 'Entrez une date de naissance valide',
    heightInvalid: 'La taille doit être 120–220 cm',
    weightInvalid: 'Le poids doit être 30–250 kg',
    birthHint: 'JJ / MM / AAAA',
  },
  ar: {
    next: 'التالي',
    finish: 'إنهاء',
    day: 'يوم',
    month: 'شهر',
    year: 'سنة',
    height: 'الطول',
    weight: 'الوزن',
    cm: 'سم',
    kg: 'كغ',
    yearsInvalid: 'أدخل تاريخ ميلاد صحيح',
    heightInvalid: 'يجب أن يكون الطول بين 120 و220 سم',
    weightInvalid: 'يجب أن يكون الوزن بين 30 و250 كغ',
    birthHint: 'يوم / شهر / سنة',
  },
};

export default function OnboardingScreen() {
  const router = useRouter();
  const { user } = useUser();
  const { t, language, isRTL } = useTranslation() as any;
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  const styles = useMemo(() => makeStyles(isDark), [isDark]);
  const tx = TXT[language as string] || TXT.en;
  const [currentStep, setCurrentStep] = useState(0);

  // Palette theme-aware (accent toujours = Colors.light.primary).
  const C = {
    bg: isDark ? '#0f1419' : '#F8FAFC',
    card: isDark ? Colors.dark.card : Colors.light.white,
    border: isDark ? '#2d3543' : Colors.light.gray[200],
    title: isDark ? '#fff' : Colors.light.gray[800],
    sub: isDark ? '#9BA1A6' : Colors.light.gray[500],
    text: isDark ? '#fff' : Colors.light.gray[800],
    accent: isDark ? Colors.dark.primary : Colors.light.primary,
    backBtn: isDark ? Colors.dark.gray[100] : Colors.light.gray[200],
    backIcon: isDark ? '#9BA1A6' : Colors.light.gray[600],
  };

  const STEPS = [
    { id: 'gender', title: t('onboarding.step1_title') },
    { id: 'goal', title: t('onboarding.step2_title') },
    { id: 'workout', title: t('onboarding.step3_title') },
    { id: 'birthdate', title: t('onboarding.step4_title') },
    { id: 'metrics', title: t('onboarding.step5_title') },
  ];

  // Form State — clés INCHANGÉES (consommées par le calcul du plan).
  // Valeurs par défaut intelligentes pré-remplies pour réduire la friction.
  const [gender, setGender] = useState('');
  const [goal, setGoal] = useState('');
  const [workout, setWorkout] = useState('3-4');          // défaut "3-4/sem"
  const [birthdate, setBirthdate] = useState({ day: '', month: '', year: '' });
  const [height, setHeight] = useState('170');             // cm (un seul champ)
  const [weight, setWeight] = useState('70');              // kg

  // ── VALIDATION PAR ÉTAPE ──────────────────────────────────────────
  const birthValid = (() => {
    const d = parseInt(birthdate.day, 10);
    const m = parseInt(birthdate.month, 10);
    const y = parseInt(birthdate.year, 10);
    if (!d || !m || !y) return false;
    if (d < 1 || d > 31) return false;
    if (m < 1 || m > 12) return false;
    if (y < 1940 || y > 2012) return false;  // année plausible
    return true;
  })();
  const heightNum = parseInt(height, 10);
  const weightNum = parseFloat(weight);
  const heightValid = heightNum >= 120 && heightNum <= 220;
  const weightValid = weightNum >= 30 && weightNum <= 250;

  const isStepValid = (step: number): boolean => {
    switch (step) {
      case 0: return !!gender;            // genre requis
      case 1: return !!goal;              // objectif requis
      case 2: return !!workout;           // fréquence requise
      case 3: return birthValid;          // date plausible
      case 4: return heightValid && weightValid; // métriques valides
      default: return true;
    }
  };
  const canProceed = isStepValid(currentStep);

  // ── TRANSITIONS ENTRE ÉTAPES ──────────────────────────────────────
  // `stepAnim` va de 0 (hors écran) à 1 (en place). On l'anime à chaque changement
  // d'étape ; `dirRef` mémorise le sens pour glisser dans la bonne direction.
  // useNativeDriver: true → l'animation tourne sur le thread UI, elle reste fluide
  // même pendant le calcul du plan.
  const stepAnim = useRef(new Animated.Value(1)).current;
  const dirRef = useRef(1); // 1 = on avance, -1 = on recule
  useEffect(() => {
    stepAnim.setValue(0);
    Animated.timing(stepAnim, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [currentStep, stepAnim]);

  const stepStyle = {
    opacity: stepAnim,
    transform: [{
      translateX: stepAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [28 * dirRef.current * (isRTL ? -1 : 1), 0],
      }),
    }],
  };

  const nextStep = () => {
    if (!canProceed) return;
    dirRef.current = 1;
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      completeOnboarding();
    }
  };

  const prevStep = () => {
    dirRef.current = -1;
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  };

  const completeOnboarding = async () => {
    const data = {
      onboarded: true,
      gender,
      goal,
      workoutFrequency: workout,
      birthdate: `${birthdate.year}-${birthdate.month}-${birthdate.day}`,
      height: parseInt(height, 10),  // cm (nombre) — heightCm() le lit tel quel
      weight: parseFloat(weight),
    };

    try {
      router.push({
        pathname: '/(onboarding)/results' as any,
        params: { data: JSON.stringify(data) },
      });
    } catch (error) {
      console.error('Error completing onboarding:', error);
      alert('Failed to save data. Please try again.');
    }
  };

  const renderProgressBar = () => (
    <View style={styles.progressContainer}>
      {STEPS.map((_, index) => (
        <View
          key={index}
          style={[
            styles.progressSegment,
            { backgroundColor: index <= currentStep ? C.accent : (isDark ? Colors.dark.gray[100] : Colors.light.gray[200]) },
          ]}
        />
      ))}
    </View>
  );

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <View style={styles.stepContainer}>
            <Text style={[styles.stepTitle, { color: C.title }]}>{t('onboarding.step1_title')}</Text>
            <View style={styles.optionsRow}>
              <TouchableOpacity
                style={[styles.imageOptionBox, { backgroundColor: C.card, borderColor: C.border }, gender === 'male' && { borderColor: C.accent, backgroundColor: C.accent }]}
                onPress={() => setGender('male')}
              >
                <Image
                  source={require('../../assets/images/illustrations/male.jpg')}
                  style={styles.genderImage}
                />
                <Text style={[styles.optionLabel, { color: C.text }, gender === 'male' && styles.textWhite]}>{t('onboarding.male')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.imageOptionBox, { backgroundColor: C.card, borderColor: C.border }, gender === 'female' && { borderColor: C.accent, backgroundColor: C.accent }]}
                onPress={() => setGender('female')}
              >
                <Image
                  source={require('../../assets/images/illustrations/female.jpg')}
                  style={styles.genderImage}
                />
                <Text style={[styles.optionLabel, { color: C.text }, gender === 'female' && styles.textWhite]}>{t('onboarding.female')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      case 1:
        return (
          <View style={styles.stepContainer}>
            <Text style={[styles.stepTitle, { color: C.title }]}>{t('onboarding.step2_title')}</Text>
            {[
              { id: 'lose', label: t('onboarding.lose'), img: require('../../assets/images/illustrations/lose_weight.jpg') },
              { id: 'maintain', label: t('onboarding.maintain'), img: require('../../assets/images/illustrations/healthy_food.jpg') },
              { id: 'gain', label: t('onboarding.gain'), img: require('../../assets/images/illustrations/gain_weight.jpg') },
            ].map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.imageListOption, { backgroundColor: C.card, borderColor: C.border }, goal === item.id && { borderColor: C.accent, backgroundColor: C.accent }]}
                onPress={() => setGoal(item.id)}
              >
                <Image source={item.img} style={styles.listImage} />
                <Text style={[styles.listOptionLabel, { color: C.text }, goal === item.id && styles.textWhite]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        );
      case 2:
        return (
          <View style={styles.stepContainer}>
            <Text style={[styles.stepTitle, { color: C.title }]}>{t('onboarding.step3_title')}</Text>
            {[
              { id: '2-3', label: '2-3 / 7', img: require('../../assets/images/illustrations/running.jpg') },
              { id: '3-4', label: '3-4 / 7', img: require('../../assets/images/illustrations/workout.jpg') },
              { id: '5-6', label: '5-6 / 7', img: require('../../assets/images/illustrations/weightlifting.jpg') },
            ].map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.imageListOption, { backgroundColor: C.card, borderColor: C.border }, workout === item.id && { borderColor: C.accent, backgroundColor: C.accent }]}
                onPress={() => setWorkout(item.id)}
              >
                <Image source={item.img} style={styles.listImage} />
                <Text style={[styles.listOptionLabel, { color: C.text }, workout === item.id && styles.textWhite]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        );
      case 3:
        return (
          <View style={styles.stepContainer}>
            <Text style={[styles.stepTitle, { color: C.title }]}>{t('onboarding.step4_title')}</Text>
            <Image
              source={require('../../assets/images/illustrations/birthdate.jpg')}
              style={styles.stepHeroImage}
            />
            <View style={styles.dateRow}>
              <TextInput
                style={[styles.dateInput, { backgroundColor: C.card, color: C.text }]}
                placeholder={tx.day}
                placeholderTextColor={C.sub}
                keyboardType="number-pad"
                maxLength={2}
                value={birthdate.day}
                onChangeText={(text) => setBirthdate({ ...birthdate, day: text })}
              />
              <TextInput
                style={[styles.dateInput, { backgroundColor: C.card, color: C.text }]}
                placeholder={tx.month}
                placeholderTextColor={C.sub}
                keyboardType="number-pad"
                maxLength={2}
                value={birthdate.month}
                onChangeText={(text) => setBirthdate({ ...birthdate, month: text })}
              />
              <TextInput
                style={[styles.dateInput, { flex: 1.5, backgroundColor: C.card, color: C.text }]}
                placeholder={tx.year}
                placeholderTextColor={C.sub}
                keyboardType="number-pad"
                maxLength={4}
                value={birthdate.year}
                onChangeText={(text) => setBirthdate({ ...birthdate, year: text })}
              />
            </View>
            {!birthValid && (birthdate.day || birthdate.month || birthdate.year)
              ? <Text style={styles.errorText}>{tx.yearsInvalid}</Text>
              : <Text style={[styles.hintText, { color: C.sub }]}>{tx.birthHint}</Text>}
          </View>
        );
      case 4:
        return (
          <View style={styles.stepContainer}>
            <Text style={[styles.stepTitle, { color: C.title }]}>{t('onboarding.step5_title')}</Text>
            <Image
              source={require('../../assets/images/illustrations/measure.jpg')}
              style={styles.stepHeroImage}
            />
            <View style={styles.metricsContainer}>
              {/* Taille — un seul champ en CM via le Stepper de FormKit */}
              <View style={styles.metricHeader}>
                <Ruler size={20} color={C.accent} />
                <Text style={[styles.metricsLabel, { color: C.sub }]}>{tx.height}</Text>
              </View>
              <Stepper
                value={height}
                onChange={setHeight}
                step={1}
                min={120}
                max={220}
                unit={tx.cm}
                error={!heightValid && height ? tx.heightInvalid : undefined}
              />

              {/* Poids — kg via le Stepper de FormKit */}
              <View style={[styles.metricHeader, { marginTop: 8 }]}>
                <Weight size={20} color={C.accent} />
                <Text style={[styles.metricsLabel, { color: C.sub }]}>{tx.weight}</Text>
              </View>
              <Stepper
                value={weight}
                onChange={setWeight}
                step={1}
                min={30}
                max={250}
                unit={tx.kg}
                error={!weightValid && weight ? tx.weightInvalid : undefined}
              />
            </View>
          </View>
        );
      default:
        return null;
    }
  };

  const isLast = currentStep === STEPS.length - 1;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.bg }]}>
      <ScreenTopBar showNotif={false} />

      {renderProgressBar()}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Animated.View style={stepStyle}>
          {renderStep()}
        </Animated.View>
      </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.footer}>
        {currentStep > 0 && (
          <TouchableOpacity style={[styles.backButton, { backgroundColor: C.backBtn }]} onPress={prevStep}>
            <ArrowLeft size={22} color={C.backIcon} />
          </TouchableOpacity>
        )}
        {/* Bouton "Suivant" harmonisé sur SubmitBar (h.56, radius 18). */}
        <TouchableOpacity
          style={[styles.nextButton, { backgroundColor: C.accent }, !canProceed && styles.buttonDisabled]}
          onPress={nextStep}
          disabled={!canProceed}
        >
          <Text style={styles.nextButtonText}>
            {isLast ? tx.finish : tx.next}
          </Text>
          <ArrowRight size={22} color="#fff" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// Fabrique thémée : un StyleSheet est évalué au chargement du module, où `isDark`
// n'existe pas. Le composant l'appelle via useMemo, recalculé au changement de thème.
const makeStyles = (isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
  },
  imageOptionBox: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 24,
    padding: 12,
    borderWidth: 2,
    gap: 12,
  },
  genderImage: {
    width: '100%',
    height: 160,
    borderRadius: 16,
  },
  imageListOption: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    padding: 12,
    marginBottom: 12,
    borderWidth: 2,
    gap: 16,
  },
  listImage: {
    width: 70,
    height: 70,
    borderRadius: 14,
  },
  stepHeroImage: {
    width: '100%',
    height: 180,
    borderRadius: 20,
    marginBottom: 20,
  },
  progressContainer: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingTop: 20,
    gap: 8,
  },
  progressSegment: {
    flex: 1,
    height: 6,
    borderRadius: 3,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  stepContainer: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 40,
    textAlign: 'center',
  },
  optionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  optionLabel: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: '700',
  },
  listOptionLabel: {
    marginLeft: 16,
    fontSize: 18,
    fontWeight: '600',
  },
  dateRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dateInput: {
    flex: 1,
    borderRadius: 16,
    height: 64,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  errorText: {
    color: '#e11d48',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 12,
    textAlign: 'center',
  },
  hintText: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 12,
    textAlign: 'center',
  },
  metricsContainer: {
    paddingTop: 10,
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  metricsLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    padding: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  backButton: {
    width: 56,
    height: 56,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nextButton: {
    flex: 1,
    height: 56,
    borderRadius: 18,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    shadowColor: isDark ? 'transparent' : Colors.light.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  nextButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
  },
  buttonDisabled: {
    backgroundColor: '#CBD5E1',
    shadowOpacity: 0,
    elevation: 0,
  },
  textWhite: {
    color: '#fff',
  },
});
