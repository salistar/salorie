import React, { useEffect, useState, useRef } from 'react';
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
import { useTheme } from '../../lib/ThemeContext';
import ScreenTopBar from '../../components/ScreenTopBar';

const TXT: Record<string, {
  generating: string;
  yourPlan: string;
  planSubtitle: string;
  dailyCalories: string;
  protein: string;
  carbs: string;
  fats: string;
  waterIntake: string;
  liters: string;
  aiAdvice: string;
  goToDashboard: string;
  logFirstMeal: string;
  later: string;
  step1: string;
  step2: string;
  step3: string;
  step4: string;
}> = {
  en: {
    generating: 'Generating Your Plan',
    yourPlan: 'Your AI-Generated Plan',
    planSubtitle: 'Based on your unique profile and goals',
    dailyCalories: 'Daily Calories',
    protein: 'Protein',
    carbs: 'Carbs',
    fats: 'Fats',
    waterIntake: 'Daily Water Intake',
    liters: 'Liters',
    aiAdvice: 'AI Expert Advice',
    goToDashboard: 'Go to Dashboard',
    logFirstMeal: 'Log my first meal',
    later: 'Later',
    step1: 'Analyzing your profile',
    step2: 'Calculating nutritional needs',
    step3: 'Syncing with cloud',
    step4: 'Finalizing your plan',
  },
  fr: {
    generating: 'Génération de votre plan',
    yourPlan: 'Votre plan généré par IA',
    planSubtitle: 'Basé sur votre profil et vos objectifs uniques',
    dailyCalories: 'Calories quotidiennes',
    protein: 'Protéines',
    carbs: 'Glucides',
    fats: 'Lipides',
    waterIntake: 'Eau quotidienne',
    liters: 'Litres',
    aiAdvice: 'Conseils d\'expert IA',
    goToDashboard: 'Aller au tableau de bord',
    logFirstMeal: 'Logger mon premier repas',
    later: 'Plus tard',
    step1: 'Analyse de votre profil',
    step2: 'Calcul des besoins nutritionnels',
    step3: 'Synchronisation avec le cloud',
    step4: 'Finalisation de votre plan',
  },
  ar: {
    generating: 'جارٍ إنشاء خطتك',
    yourPlan: 'خطتك المُنشأة بالذكاء الاصطناعي',
    planSubtitle: 'بناءً على ملفك الشخصي وأهدافك الفريدة',
    dailyCalories: 'السعرات اليومية',
    protein: 'البروتين',
    carbs: 'الكربوهيدرات',
    fats: 'الدهون',
    waterIntake: 'استهلاك الماء اليومي',
    liters: 'لتر',
    aiAdvice: 'نصائح خبير الذكاء الاصطناعي',
    goToDashboard: 'الذهاب إلى لوحة التحكم',
    logFirstMeal: 'سجّل وجبتي الأولى',
    later: 'لاحقًا',
    step1: 'تحليل ملفك الشخصي',
    step2: 'حساب احتياجاتك الغذائية',
    step3: 'المزامنة مع السحابة',
    step4: 'وضع اللمسات الأخيرة على خطتك',
  },
};

export default function ResultsScreen() {
  const router = useRouter();
  const { user } = useUser();
  const { language, setLanguage, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  const params = useLocalSearchParams();

  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<NutritionalPlan | null>(null);

  const [steps, setSteps] = useState([
    { label: t.step1, status: 'loading' }, // loading, completed
    { label: t.step2, status: 'pending' }, // pending, loading, completed
    { label: t.step3, status: 'pending' },
    { label: t.step4, status: 'pending' },
  ]);

  // Données prêtes à sauvegarder UNIQUEMENT quand l'utilisateur appuie sur "Finish".
  const pendingSave = useRef<{ profile: any; plan: any } | null>(null);
  const [saving, setSaving] = useState(false);

  // C'EST ICI qu'on valide réellement l'onboarding : sauvegarde Firestore +
  // flag local, PUIS navigation. Tant que l'utilisateur n'a pas appuyé, RIEN
  // n'est en base. Les deux CTA (logger un repas / plus tard) partagent ce flux
  // pour préserver la migration/sauvegarde Firestore.
  const finishOnboarding = async (destination: string) => {
    if (saving) return;
    setSaving(true);
    try {
      const ps = pendingSave.current;
      const email = user?.primaryEmailAddress?.emailAddress || '';
      if (user && email && ps) {
        await saveUserToFirestore({ id: user.id, email, ...ps.profile, nutritionalPlan: ps.plan, onboarded: true });
        await AsyncStorage.setItem(`onboarded_${email.toLowerCase()}`, 'true');
        await AsyncStorage.setItem('last_session_onboarded', 'true');
      }
    } catch (e) { console.warn('[Onboarding] finish save failed', e); }
    router.replace(destination as any);
  };

  useEffect(() => {
    const processData = async () => {
      try {
        const userProfile = JSON.parse(params.data as string);
        
        // 1. Start Analysis (dummy wait) — chargement raccourci (~1,2s total).
        await new Promise(resolve => setTimeout(resolve, 500));
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

        // 3. Plan calculé : on CACHE seulement en local (affichage). On NE
        //    sauvegarde PAS onboarded:true ici — sinon un utilisateur qui atteint
        //    cet écran mais n'appuie PAS sur "Finish" serait marqué onboardé et
        //    enregistré en base. La sauvegarde Firestore se fait sur "Finish".
        await new Promise(resolve => setTimeout(resolve, 350));
        await AsyncStorage.setItem('user_nutritional_plan', JSON.stringify(aiPlan));
        pendingSave.current = { profile: userProfile, plan: aiPlan };
        setSteps(prev => prev.map((s, i) => i === 2 ? { ...s, status: 'completed' } : i === 3 ? { ...s, status: 'loading' } : s));

        // 4. Finish
        await new Promise(resolve => setTimeout(resolve, 350));
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
      <View style={[styles.loadingContainer, { backgroundColor: isDark ? '#000' : Colors.light.white }]}>
        <Image
          source={require('../../assets/images/illustrations/generating.jpg')}
          style={{ width: 180, height: 180, borderRadius: 90, marginBottom: 20 }}
        />
        <Sparkles size={40} color={Colors.light.primary} style={styles.aiIcon} />
        <Text style={[styles.loadingTitle, { color: isDark ? '#fff' : Colors.light.gray[800] }]}>{t.generating}</Text>
        <View style={styles.stepsList}>
          {steps.map((step, index) => (
            <View key={index} style={[styles.stepItem, { flexDirection: isRTL ? 'row-reverse' : 'row', backgroundColor: isDark ? Colors.dark.card : Colors.light.gray[50] }]}>
              {step.status === 'completed' ? (
                <CheckCircle size={24} color={Colors.light.primary} />
              ) : step.status === 'loading' ? (
                <ActivityIndicator size="small" color={Colors.light.primary} />
              ) : (
                <View style={styles.pendingDot} />
              )}
              <Text style={[
                styles.stepLabel,
                { color: isDark ? '#9BA1A6' : Colors.light.gray[500], textAlign: isRTL ? 'right' : 'left' },
                step.status === 'completed' && styles.stepLabelCompleted,
                step.status === 'loading' && (isDark ? { color: '#fff', fontWeight: '700' as const } : styles.stepLabelActive)
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
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? '#000' : 'transparent' }]}>
      <ScreenTopBar showNotif={false} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Image
            source={require('../../assets/images/illustrations/plan.jpg')}
            style={styles.heroImage}
          />
          <CheckCircle size={48} color={Colors.light.primary} style={{ marginTop: 12 }} />
          <Text style={[styles.title, { color: isDark ? '#fff' : Colors.light.gray[800] }]}>{t.yourPlan}</Text>
          <Text style={[styles.subtitle, { color: isDark ? '#9BA1A6' : Colors.light.gray[500] }]}>{t.planSubtitle}</Text>
        </View>

        <View style={[styles.card, { backgroundColor: isDark ? Colors.dark.card : '#fff' }]}>
          <View style={[styles.caloriesRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Flame size={32} color={Colors.light.primary} />
            <View>
              <Text style={[styles.label, { color: isDark ? '#9BA1A6' : Colors.light.gray[500], textAlign: isRTL ? 'right' : 'left' }]}>{t.dailyCalories}</Text>
              <Text style={[styles.value, { color: isDark ? '#fff' : Colors.light.gray[800], textAlign: isRTL ? 'right' : 'left' }]}>{plan?.dailyCalories} kcal</Text>
            </View>
          </View>

          <View style={styles.macrosRow}>
            <View style={styles.macroItem}>
              <Text style={[styles.macroLabel, { color: isDark ? '#9BA1A6' : Colors.light.gray[400] }]}>{t.protein}</Text>
              <Text style={styles.macroValue}>{plan?.proteins}g</Text>
            </View>
            <View style={styles.macroItem}>
              <Text style={[styles.macroLabel, { color: isDark ? '#9BA1A6' : Colors.light.gray[400] }]}>{t.carbs}</Text>
              <Text style={styles.macroValue}>{plan?.carbs}g</Text>
            </View>
            <View style={styles.macroItem}>
              <Text style={[styles.macroLabel, { color: isDark ? '#9BA1A6' : Colors.light.gray[400] }]}>{t.fats}</Text>
              <Text style={styles.macroValue}>{plan?.fats}g</Text>
            </View>
          </View>
        </View>

        <View style={[styles.card, { marginTop: 16, backgroundColor: isDark ? Colors.dark.card : '#fff' }]}>
          <View style={[styles.caloriesRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Droplets size={32} color="#0EA5E9" />
            <View>
              <Text style={[styles.label, { color: isDark ? '#9BA1A6' : Colors.light.gray[500], textAlign: isRTL ? 'right' : 'left' }]}>{t.waterIntake}</Text>
              <Text style={[styles.value, { color: isDark ? '#fff' : Colors.light.gray[800], textAlign: isRTL ? 'right' : 'left' }]}>{plan?.waterIntake} {t.liters}</Text>
            </View>
          </View>
        </View>

        <View style={styles.adviceSection}>
          <Text style={[styles.sectionTitle, { color: isDark ? '#fff' : Colors.light.gray[800], textAlign: isRTL ? 'right' : 'left' }]}>{t.aiAdvice}</Text>
          {plan?.advice.map((item, index) => (
            <View key={index} style={[styles.adviceItem, { flexDirection: isRTL ? 'row-reverse' : 'row', backgroundColor: isDark ? Colors.dark.card : '#fff' }]}>
              <Zap size={20} color={Colors.light.secondary} />
              <Text style={[styles.adviceText, { color: isDark ? '#9BA1A6' : Colors.light.gray[700], textAlign: isRTL ? 'right' : 'left' }]}>{item}</Text>
            </View>
          ))}
        </View>

      </ScrollView>

      <View style={[styles.bottomBar, { backgroundColor: isDark ? Colors.dark.card : Colors.light.gray[50] }]}>
        {/* AHA MOMENT : CTA principal vers le logging du premier repas. */}
        <TouchableOpacity disabled={saving} style={[styles.finishButton, { flexDirection: isRTL ? 'row-reverse' : 'row', opacity: saving ? 0.7 : 1 }]} onPress={() => finishOnboarding('/food-database')}>
          <Text style={styles.finishButtonText}>{t.logFirstMeal}</Text>
          <ArrowRight size={24} color={Colors.light.white} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
        </TouchableOpacity>
        {/* Secondaire : continuer plus tard, direct au tableau de bord. */}
        <TouchableOpacity disabled={saving} style={styles.laterButton} onPress={() => finishOnboarding('/(tabs)')}>
          <Text style={[styles.laterButtonText, { color: isDark ? '#9BA1A6' : Colors.light.gray[500] }]}>{t.later}</Text>
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
  },
  finishButtonText: {
    color: Colors.light.white,
    fontSize: 18,
    fontWeight: '700',
  },
  laterButton: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  laterButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
