import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { 
  Sparkles, 
  Flame, 
  Zap, 
  Droplets,
  CheckCircle,
  ArrowRight 
} from 'lucide-react-native';
import { generateNutritionalPlan, NutritionalPlan } from '../../lib/AiModel';
import { saveUserToFirestore } from '../../lib/firebase';
import { useUser } from '@clerk/clerk-expo';
import { Colors } from '../../constants/Colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation, Language } from '../../lib/i18n';
import ScreenTopBar from '../../components/ScreenTopBar';

export default function ResultsScreen() {
  const router = useRouter();
  const { user } = useUser();
  const { language, setLanguage } = useTranslation();
  const params = useLocalSearchParams();
  
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<NutritionalPlan | null>(null);
  
  const [steps, setSteps] = useState([
    { label: 'Analyzing your profile', status: 'loading' }, // loading, completed
    { label: 'Calculating nutritional needs', status: 'pending' }, // pending, loading, completed
    { label: 'Syncing with cloud', status: 'pending' },
    { label: 'Finalizing your plan', status: 'pending' },
  ]);

  useEffect(() => {
    const processData = async () => {
      try {
        const userProfile = JSON.parse(params.data as string);
        
        // 1. Start Analysis (dummy wait)
        await new Promise(resolve => setTimeout(resolve, 1500));
        setSteps(prev => prev.map((s, i) => i === 0 ? { ...s, status: 'completed' } : i === 1 ? { ...s, status: 'loading' } : s));

        // 2. AI Generation (with fallback if quota exceeded)
        let aiPlan: NutritionalPlan;
        try {
          aiPlan = await generateNutritionalPlan(userProfile);
        } catch (aiError) {
          console.warn('AI generation failed, using fallback plan:', aiError);
          // Fallback: calculate basic plan without AI
          const weight = userProfile.weight || 70;
          const goalMultiplier = userProfile.goal === 'lose' ? 0.8 : userProfile.goal === 'gain' ? 1.2 : 1;
          const baseCal = Math.round(weight * 30 * goalMultiplier);
          aiPlan = {
            dailyCalories: baseCal,
            proteins: Math.round(weight * 1.8),
            carbs: Math.round(baseCal * 0.45 / 4),
            fats: Math.round(baseCal * 0.25 / 9),
            waterIntake: weight > 80 ? 3.5 : weight > 60 ? 3 : 2.5,
            advice: [
              'Start tracking your meals consistently',
              'Drink water before each meal',
              'AI plan will update when quota resets'
            ],
          };
        }
        setPlan(aiPlan);
        setSteps(prev => prev.map((s, i) => i === 1 ? { ...s, status: 'completed' } : i === 2 ? { ...s, status: 'loading' } : s));

        // 3. Save ALL user data + plan to Firebase
        await new Promise(resolve => setTimeout(resolve, 1000));
        const email = user?.primaryEmailAddress?.emailAddress || '';
        if (user && email) {
          await saveUserToFirestore({
            id: user.id,
            email,
            ...userProfile,
            nutritionalPlan: aiPlan,
            onboarded: true,
          });
        }
        await AsyncStorage.setItem('user_nutritional_plan', JSON.stringify(aiPlan));
        if (email) {
          await AsyncStorage.setItem(`onboarded_${email.toLowerCase()}`, 'true');
        }
        setSteps(prev => prev.map((s, i) => i === 2 ? { ...s, status: 'completed' } : i === 3 ? { ...s, status: 'loading' } : s));

        // 4. Finish
        await new Promise(resolve => setTimeout(resolve, 1000));
        setSteps(prev => prev.map((s, i) => i === 3 ? { ...s, status: 'completed' } : s));

        setLoading(false);
      } catch (error) {
        console.error('Error generating plan:', error);
        setLoading(false);
      }
    };

    processData();
  }, [params.data]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Image
          source={require('../../assets/images/illustrations/generating.jpg')}
          style={{ width: 180, height: 180, borderRadius: 90, marginBottom: 20 }}
        />
        <Sparkles size={40} color={Colors.light.primary} style={styles.aiIcon} />
        <Text style={styles.loadingTitle}>Generating Your Plan</Text>
        <View style={styles.stepsList}>
          {steps.map((step, index) => (
            <View key={index} style={styles.stepItem}>
              {step.status === 'completed' ? (
                <CheckCircle size={24} color={Colors.light.primary} />
              ) : step.status === 'loading' ? (
                <ActivityIndicator size="small" color={Colors.light.primary} />
              ) : (
                <View style={styles.pendingDot} />
              )}
              <Text style={[
                styles.stepLabel, 
                step.status === 'completed' && styles.stepLabelCompleted,
                step.status === 'loading' && styles.stepLabelActive
              ]}>
                {step.label}
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScreenTopBar showNotif={false} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Image
            source={require('../../assets/images/illustrations/plan.jpg')}
            style={styles.heroImage}
          />
          <CheckCircle size={48} color={Colors.light.primary} style={{ marginTop: 12 }} />
          <Text style={styles.title}>Your AI-Generated Plan</Text>
          <Text style={styles.subtitle}>Based on your unique profile and goals</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.caloriesRow}>
            <Flame size={32} color={Colors.light.primary} />
            <View>
              <Text style={styles.label}>Daily Calories</Text>
              <Text style={styles.value}>{plan?.dailyCalories} kcal</Text>
            </View>
          </View>

          <View style={styles.macrosRow}>
            <View style={styles.macroItem}>
              <Text style={styles.macroLabel}>Protein</Text>
              <Text style={styles.macroValue}>{plan?.proteins}g</Text>
            </View>
            <View style={styles.macroItem}>
              <Text style={styles.macroLabel}>Carbs</Text>
              <Text style={styles.macroValue}>{plan?.carbs}g</Text>
            </View>
            <View style={styles.macroItem}>
              <Text style={styles.macroLabel}>Fats</Text>
              <Text style={styles.macroValue}>{plan?.fats}g</Text>
            </View>
          </View>
        </View>

        <View style={[styles.card, { marginTop: 16 }]}>
          <View style={styles.caloriesRow}>
            <Droplets size={32} color="#0EA5E9" />
            <View>
              <Text style={styles.label}>Daily Water Intake</Text>
              <Text style={styles.value}>{plan?.waterIntake} Liters</Text>
            </View>
          </View>
        </View>

        <View style={styles.adviceSection}>
          <Text style={styles.sectionTitle}>AI Expert Advice</Text>
          {plan?.advice.map((item, index) => (
            <View key={index} style={styles.adviceItem}>
              <Zap size={20} color={Colors.light.secondary} />
              <Text style={styles.adviceText}>{item}</Text>
            </View>
          ))}
        </View>

      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.finishButton} onPress={() => router.replace('/(tabs)' as any)}>
          <Text style={styles.finishButtonText}>Go to Dashboard</Text>
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
    paddingBottom: 4,
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.light.white,
    padding: 24,
  },
  loadingTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.light.gray[800],
    marginBottom: 32,
  },
  stepsList: {
    width: '100%',
    paddingHorizontal: 20,
    gap: 20,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    backgroundColor: Colors.light.gray[50],
    borderRadius: 16,
  },
  stepLabel: {
    fontSize: 16,
    color: Colors.light.gray[500],
    fontWeight: '500',
  },
  stepLabelActive: {
    color: Colors.light.gray[800],
    fontWeight: '700',
  },
  stepLabelCompleted: {
    color: Colors.light.primary,
    fontWeight: '600',
  },
  pendingDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.light.gray[200],
  },
  aiIcon: {
    marginBottom: 20,
  },
  scrollContent: {
    padding: 24,
    paddingTop: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  heroImage: {
    width: '100%',
    height: 160,
    borderRadius: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.light.gray[800],
    marginTop: 16,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: Colors.light.gray[500],
    marginTop: 8,
    textAlign: 'center',
  },
  card: {
    backgroundColor: Colors.light.white,
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  caloriesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.gray[500],
  },
  value: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.light.gray[800],
  },
  macrosRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: Colors.light.gray[100],
  },
  macroItem: {
    alignItems: 'center',
  },
  macroLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.light.gray[400],
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  macroValue: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.light.primary,
  },
  adviceSection: {
    marginTop: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.light.gray[800],
    marginBottom: 16,
  },
  adviceItem: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
    backgroundColor: Colors.light.white,
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  adviceText: {
    flex: 1,
    fontSize: 14,
    color: Colors.light.gray[700],
    lineHeight: 20,
  },
  bottomBar: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    paddingTop: 12,
    backgroundColor: Colors.light.gray[50],
  },
  finishButton: {
    backgroundColor: Colors.light.primary,
    height: 64,
    borderRadius: 32,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    shadowColor: Colors.light.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
    marginBottom: 40,
  },
  finishButtonText: {
    color: Colors.light.white,
    fontSize: 18,
    fontWeight: '700',
  },
});
