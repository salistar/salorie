import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ScrollView,
  SafeAreaView,
  TextInput,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { 
  User, 
  Target, 
  Activity, 
  Calendar, 
  Ruler, 
  Weight,
  ArrowRight,
  ArrowLeft
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useUser } from '@clerk/clerk-expo';
import { saveUserToFirestore } from '../../lib/firebase';
import { Colors } from '../../constants/Colors';
import { useTranslation, Language } from '../../lib/i18n';
import ScreenTopBar from '../../components/ScreenTopBar';

const { width } = Dimensions.get('window');

export default function OnboardingScreen() {
  const router = useRouter();
  const { user } = useUser();
  const { t, language, setLanguage } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);

  const STEPS = [
    { id: 'gender', title: t('onboarding.step1_title') },
    { id: 'goal', title: t('onboarding.step2_title') },
    { id: 'workout', title: t('onboarding.step3_title') },
    { id: 'birthdate', title: t('onboarding.step4_title') },
    { id: 'metrics', title: t('onboarding.step5_title') },
  ];

  // Form State
  const [gender, setGender] = useState('');
  const [goal, setGoal] = useState('');
  const [workout, setWorkout] = useState('');
  const [birthdate, setBirthdate] = useState({ day: '', month: '', year: '' });
  const [height, setHeight] = useState({ feet: '', inches: '' });
  const [weight, setWeight] = useState('');

  const nextStep = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      completeOnboarding();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const completeOnboarding = async () => {
    const data = {
      onboarded: true,
      gender,
      goal,
      workoutFrequency: workout,
      birthdate: `${birthdate.year}-${birthdate.month}-${birthdate.day}`,
      height: { feet: parseInt(height.feet), inches: parseInt(height.inches) },
      weight: parseFloat(weight),
    };

    try {
      // Navigate to results screen with data
      router.push({
        pathname: '/(onboarding)/results' as any,
        params: { data: JSON.stringify(data) }
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
            index <= currentStep ? styles.progressActive : styles.progressInactive,
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
            <Text style={styles.stepTitle}>{t('onboarding.step1_title')}</Text>
            <View style={styles.optionsRow}>
              <TouchableOpacity
                style={[styles.imageOptionBox, gender === 'male' && styles.optionSelected]}
                onPress={() => setGender('male')}
              >
                <Image
                  source={require('../../assets/images/illustrations/male.jpg')}
                  style={styles.genderImage}
                />
                <Text style={[styles.optionLabel, gender === 'male' && styles.textWhite]}>{t('onboarding.male')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.imageOptionBox, gender === 'female' && styles.optionSelected]}
                onPress={() => setGender('female')}
              >
                <Image
                  source={require('../../assets/images/illustrations/female.jpg')}
                  style={styles.genderImage}
                />
                <Text style={[styles.optionLabel, gender === 'female' && styles.textWhite]}>{t('onboarding.female')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      case 1:
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>{t('onboarding.step2_title')}</Text>
            {[
              { id: 'lose', label: t('onboarding.lose'), img: require('../../assets/images/illustrations/lose_weight.jpg') },
              { id: 'maintain', label: t('onboarding.maintain'), img: require('../../assets/images/illustrations/healthy_food.jpg') },
              { id: 'gain', label: t('onboarding.gain'), img: require('../../assets/images/illustrations/gain_weight.jpg') },
            ].map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.imageListOption, goal === item.id && styles.listOptionSelected]}
                onPress={() => setGoal(item.id)}
              >
                <Image source={item.img} style={styles.listImage} />
                <Text style={[styles.listOptionLabel, goal === item.id && styles.textWhite]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        );
      case 2:
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>{t('onboarding.step3_title')}</Text>
            {[
              { id: '2-3', label: '2-3 / 7', img: require('../../assets/images/illustrations/running.jpg') },
              { id: '3-4', label: '3-4 / 7', img: require('../../assets/images/illustrations/workout.jpg') },
              { id: '5-6', label: '5-6 / 7', img: require('../../assets/images/illustrations/weightlifting.jpg') },
            ].map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.imageListOption, workout === item.id && styles.listOptionSelected]}
                onPress={() => setWorkout(item.id)}
              >
                <Image source={item.img} style={styles.listImage} />
                <Text style={[styles.listOptionLabel, workout === item.id && styles.textWhite]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        );
      case 3:
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>{t('onboarding.step4_title')}</Text>
            <Image
              source={require('../../assets/images/illustrations/birthdate.jpg')}
              style={styles.stepHeroImage}
            />
            <View style={styles.dateRow}>
              <TextInput
                style={styles.dateInput}
                placeholder="Day"
                keyboardType="number-pad"
                maxLength={2}
                value={birthdate.day}
                onChangeText={(text) => setBirthdate({ ...birthdate, day: text })}
              />
              <TextInput
                style={styles.dateInput}
                placeholder="Month"
                keyboardType="number-pad"
                maxLength={2}
                value={birthdate.month}
                onChangeText={(text) => setBirthdate({ ...birthdate, month: text })}
              />
              <TextInput
                style={[styles.dateInput, { flex: 1.5 }]}
                placeholder="Year"
                keyboardType="number-pad"
                maxLength={4}
                value={birthdate.year}
                onChangeText={(text) => setBirthdate({ ...birthdate, year: text })}
              />
            </View>
          </View>
        );
      case 4:
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>{t('onboarding.step5_title')}</Text>
            <Image
              source={require('../../assets/images/illustrations/measure.jpg')}
              style={styles.stepHeroImage}
            />
            <View style={styles.metricsContainer}>
              <Text style={styles.metricsLabel}>Height</Text>
              <View style={styles.metricsRow}>
                <Ruler size={24} color={Colors.light.primary} />
                <TextInput
                  style={styles.metricsInput}
                  placeholder="Feet"
                  keyboardType="number-pad"
                  value={height.feet}
                  onChangeText={(text) => setHeight({ ...height, feet: text })}
                />
                <TextInput
                  style={styles.metricsInput}
                  placeholder="Inches"
                  keyboardType="number-pad"
                  value={height.inches}
                  onChangeText={(text) => setHeight({ ...height, inches: text })}
                />
              </View>

              <Text style={[styles.metricsLabel, { marginTop: 24 }]}>Weight (kg)</Text>
              <View style={styles.metricsRow}>
                <Weight size={24} color={Colors.light.primary} />
                <TextInput
                  style={[styles.metricsInput, { flex: 1 }]}
                  placeholder="kg"
                  keyboardType="decimal-pad"
                  value={weight}
                  onChangeText={setWeight}
                />
              </View>
            </View>
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScreenTopBar showNotif={false} />

      {renderProgressBar()}

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {renderStep()}
      </ScrollView>

      <View style={styles.footer}>
        {currentStep > 0 && (
          <TouchableOpacity style={styles.backButton} onPress={prevStep}>
            <ArrowLeft size={24} color={Colors.light.gray[600]} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.nextButton, (!gender && currentStep === 0) && styles.buttonDisabled]}
          onPress={nextStep}
          disabled={!gender && currentStep === 0}
        >
          <Text style={styles.nextButtonText}>
            {currentStep === STEPS.length - 1 ? t('onboarding.finish') : t('onboarding.next')}
          </Text>
          <ArrowRight size={24} color={Colors.light.white} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  langPickerRow: {
    flexDirection: 'row',
    gap: 8,
  },
  langPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: Colors.light.gray[200],
  },
  langPillActive: {
    backgroundColor: Colors.light.primary,
    borderColor: Colors.light.primary,
  },
  langPillText: {
    fontSize: 14,
    fontWeight: '700',
  },
  langPillTextActive: {
    color: '#fff',
  },
  imageOptionBox: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: Colors.light.white,
    borderRadius: 24,
    padding: 12,
    borderWidth: 2,
    borderColor: Colors.light.gray[200],
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
    backgroundColor: Colors.light.white,
    borderRadius: 20,
    padding: 12,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: Colors.light.gray[200],
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
  progressActive: {
    backgroundColor: Colors.light.primary,
  },
  progressInactive: {
    backgroundColor: Colors.light.gray[200],
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
    color: Colors.light.gray[800],
    marginBottom: 40,
    textAlign: 'center',
  },
  optionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  optionBox: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: Colors.light.white,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  optionSelected: {
    borderColor: Colors.light.primary,
    backgroundColor: Colors.light.primary,
  },
  optionLabel: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: '700',
    color: Colors.light.gray[800],
  },
  listOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 24,
    backgroundColor: Colors.light.white,
    borderRadius: 24,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  listOptionSelected: {
    backgroundColor: Colors.light.primary,
    borderColor: Colors.light.primary,
  },
  listOptionLabel: {
    marginLeft: 16,
    fontSize: 18,
    fontWeight: '600',
    color: Colors.light.gray[800],
  },
  dateRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dateInput: {
    flex: 1,
    backgroundColor: Colors.light.white,
    borderRadius: 16,
    height: 64,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
    color: Colors.light.gray[800],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  metricsContainer: {
    paddingTop: 10,
  },
  metricsLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.gray[500],
    marginBottom: 12,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.white,
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 64,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  metricsInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: Colors.light.gray[800],
  },
  footer: {
    padding: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  backButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.light.gray[200],
    justifyContent: 'center',
    alignItems: 'center',
  },
  nextButton: {
    flex: 1,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.light.primary,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    shadowColor: Colors.light.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 5,
  },
  nextButtonText: {
    color: Colors.light.white,
    fontSize: 18,
    fontWeight: '700',
  },
  buttonDisabled: {
    backgroundColor: Colors.light.gray[300],
    shadowOpacity: 0,
    elevation: 0,
  },
  textWhite: {
    color: Colors.light.white,
  },
});
