import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Sentry from '@sentry/react-native';
import { 
  Sparkles, 
  Flame, 
  Zap, 
  Droplets,
  CheckCircle,
  ArrowRight 
} from 'lucide-react-native';
import { generateNutritionalPlan, NutritionalPlan } from '../../lib/AiModel';
import { stashPendingOnboarding } from '../../lib/onboardingSave';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation, Language } from '../../lib/i18n';
import { useTheme } from '../../lib/ThemeContext';
import ScreenTopBar from '../../components/ScreenTopBar';
import { useTokens, Tokens } from '../../constants/tokens';

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
  const { language, setLanguage, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const { resolved } = useTheme();
  const k = useTokens();
  const isDark = resolved === 'dark';
  const styles = useMemo(() => makeStyles(k), [k]);
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

  // On DÉPOSE le profil + plan, puis on passe au paywall — qui validera réellement
  // l'onboarding (Firestore + flags) juste avant d'entrer dans l'app.
  //
  // Pourquoi ne plus écrire le flag ICI : le garde de `app/_layout.tsx` renvoie vers
  // `/(tabs)` dès que le statut passe à `onboarded`. Le flag posé avant le paywall
  // ferait éjecter l'utilisateur de l'écran de vente en une frame. Tant qu'on reste
  // `not-onboarded` dans le groupe `(onboarding)`, le garde ne touche à rien.
  // Voir lib/onboardingSave.ts. Si le paywall n'a rien à vendre, il s'efface et
  // enchaîne tout seul → parcours identique à avant.
  const finishOnboarding = async (destination: string) => {
    if (saving) return;
    setSaving(true);
    try {
      const ps = pendingSave.current;
      if (ps) await stashPendingOnboarding(ps);
    } catch (e) { console.warn('[Onboarding] stash failed', e); }
    router.push({
      pathname: '/(onboarding)/premium' as any,
      params: { next: destination, kcal: String(plan?.dailyCalories ?? '') },
    });
  };

  useEffect(() => {
    const processData = async () => {
      // Le profil arrive en JSON dans un parametre de route. `JSON.parse` etait
      // appele sans garde : un parametre absent ou tronque (lien profond, reprise
      // apres kill d'Android, navigation inattendue) jetait, et le catch general
      // se contentait de couper le chargement. L'ecran affichait alors « Ton plan »
      // avec une coche verte et des valeurs vides — un faux succes dont on ne peut
      // pas repartir. On renvoie plutot l'utilisateur saisir son profil.
      let userProfile: any;
      try {
        userProfile = JSON.parse(String(params.data ?? ''));
        if (!userProfile || typeof userProfile !== 'object') throw new Error('profil vide');
      } catch (e) {
        Sentry.captureException(e, {
          tags: { ecran: 'onboarding-results', cause: 'profil-illisible' },
          // Jamais le contenu : il porte poids, objectif et donnees de sante.
          extra: { longueurParametre: String(params.data ?? '').length },
        });
        router.replace('/(onboarding)' as any);
        return;
      }

      try {
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
        // Panne SILENCIEUSE au pire endroit possible : l'utilisateur sort du
        // chargement sur un ecran de resultats sans plan, pendant l'onboarding.
        // Le `console.error` seul ne quitte pas le telephone — on ne saurait
        // jamais qu'un nouvel utilisateur s'est arrete la.
        console.error('Error generating plan:', error);
        Sentry.captureException(error, { tags: { ecran: 'onboarding-results' } });
        setLoading(false);
      }
    };

    processData();
  }, [params.data]);

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: k.surface }]}>
        <Image
          source={require('../../assets/images/illustrations/generating.jpg')}
          style={{ width: 180, height: 180, borderRadius: 90, marginBottom: 20 }}
        />
        <Sparkles size={40} color={k.accent} style={styles.aiIcon} />
        <Text style={[styles.loadingTitle, { color: k.text }]}>{t.generating}</Text>
        <View style={styles.stepsList}>
          {steps.map((step, index) => (
            <View key={index} style={[styles.stepItem, { flexDirection: isRTL ? 'row-reverse' : 'row', backgroundColor: k.surfaceSunken }]}>
              {step.status === 'completed' ? (
                <CheckCircle size={24} color={k.accent} />
              ) : step.status === 'loading' ? (
                <ActivityIndicator size="small" color={k.accent} />
              ) : (
                <View style={styles.pendingDot} />
              )}
              <Text style={[
                styles.stepLabel,
                { color: k.textMuted, textAlign: isRTL ? 'right' : 'left' },
                step.status === 'completed' && styles.stepLabelCompleted,
                step.status === 'loading' && (isDark ? { color: k.onAccent, fontWeight: '700' as const } : styles.stepLabelActive)
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
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.container, { backgroundColor: isDark ? '#0f1419' : 'transparent' }]}>
      <ScreenTopBar showNotif={false} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Image
            source={require('../../assets/images/illustrations/plan.jpg')}
            style={styles.heroImage}
          />
          <CheckCircle size={48} color={k.accent} style={{ marginTop: 12 }} />
          <Text style={[styles.title, { color: k.text }]}>{t.yourPlan}</Text>
          <Text style={[styles.subtitle, { color: k.textMuted }]}>{t.planSubtitle}</Text>
        </View>

        <View style={[styles.card, { backgroundColor: k.surface }]}>
          <View style={[styles.caloriesRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Flame size={32} color={k.accent} />
            <View>
              <Text style={[styles.label, { color: k.textMuted, textAlign: isRTL ? 'right' : 'left' }]}>{t.dailyCalories}</Text>
              <Text style={[styles.value, { color: k.text, textAlign: isRTL ? 'right' : 'left' }]}>{plan?.dailyCalories} kcal</Text>
            </View>
          </View>

          <View style={styles.macrosRow}>
            <View style={styles.macroItem}>
              <Text style={[styles.macroLabel, { color: k.textMuted }]}>{t.protein}</Text>
              <Text style={styles.macroValue}>{plan?.proteins}g</Text>
            </View>
            <View style={styles.macroItem}>
              <Text style={[styles.macroLabel, { color: k.textMuted }]}>{t.carbs}</Text>
              <Text style={styles.macroValue}>{plan?.carbs}g</Text>
            </View>
            <View style={styles.macroItem}>
              <Text style={[styles.macroLabel, { color: k.textMuted }]}>{t.fats}</Text>
              <Text style={styles.macroValue}>{plan?.fats}g</Text>
            </View>
          </View>
        </View>

        <View style={[styles.card, { marginTop: 16, backgroundColor: k.surface }]}>
          <View style={[styles.caloriesRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Droplets size={32} color={k.info} />
            <View>
              <Text style={[styles.label, { color: k.textMuted, textAlign: isRTL ? 'right' : 'left' }]}>{t.waterIntake}</Text>
              <Text style={[styles.value, { color: k.text, textAlign: isRTL ? 'right' : 'left' }]}>{plan?.waterIntake} {t.liters}</Text>
            </View>
          </View>
        </View>

        <View style={styles.adviceSection}>
          <Text style={[styles.sectionTitle, { color: k.text, textAlign: isRTL ? 'right' : 'left' }]}>{t.aiAdvice}</Text>
          {plan?.advice.map((item, index) => (
            <View key={index} style={[styles.adviceItem, { flexDirection: isRTL ? 'row-reverse' : 'row', backgroundColor: k.surface }]}>
              <Zap size={20} color={k.warning} />
              <Text style={[styles.adviceText, { color: k.textMuted, textAlign: isRTL ? 'right' : 'left' }]}>{item}</Text>
            </View>
          ))}
        </View>

      </ScrollView>

      <View style={[styles.bottomBar, { backgroundColor: k.surfaceSunken }]}>
        {/* AHA MOMENT : CTA principal vers le logging du premier repas. */}
        <TouchableOpacity disabled={saving} style={[styles.finishButton, { flexDirection: isRTL ? 'row-reverse' : 'row', opacity: saving ? 0.7 : 1 }]} onPress={() => finishOnboarding('/food-database')}>
          <Text style={styles.finishButtonText}>{t.logFirstMeal}</Text>
          <View style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}><ArrowRight size={24} color={k.surface} /></View>
        </TouchableOpacity>
        {/* Secondaire : continuer plus tard, direct au tableau de bord. */}
        <TouchableOpacity disabled={saving} style={styles.laterButton} onPress={() => finishOnboarding('/(tabs)')}>
          <Text style={[styles.laterButtonText, { color: k.textMuted }]}>{t.later}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// Fabrique thémée : un StyleSheet est évalué au chargement du module, où `isDark`
// n'existe pas. Le composant l'appelle via useMemo, recalculé au changement de thème.
const makeStyles = (k: Tokens) => StyleSheet.create({
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
    borderColor: k.border,
  },
  langPillActive: {
    backgroundColor: k.accent,
    borderColor: k.accent,
  },
  langPillText: {
    fontSize: 14,
    fontWeight: '700',
  },
  langPillTextActive: {
    color: k.onAccent,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: k.surface,
    padding: 24,
  },
  loadingTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: k.text,
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
    backgroundColor: k.surfaceSunken,
    borderRadius: 16,
  },
  stepLabel: {
    fontSize: 16,
    color: k.textMuted,
    fontWeight: '500',
  },
  stepLabelActive: {
    color: k.text,
    fontWeight: '700',
  },
  stepLabelCompleted: {
    color: k.accent,
    fontWeight: '600',
  },
  pendingDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: k.border,
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
    color: k.text,
    marginTop: 16,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: k.textMuted,
    marginTop: 8,
    textAlign: 'center',
  },
  card: {
    backgroundColor: k.surface,
    borderRadius: 24,
    padding: 24,
    shadowColor: k.shadow,
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
    color: k.textMuted,
  },
  value: {
    fontSize: 24,
    fontWeight: '800',
    color: k.text,
  },
  macrosRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: k.border,
  },
  macroItem: {
    alignItems: 'center',
  },
  macroLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: k.textMuted,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  macroValue: {
    fontSize: 18,
    fontWeight: '700',
    color: k.accent,
  },
  adviceSection: {
    marginTop: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: k.text,
    marginBottom: 16,
  },
  adviceItem: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
    backgroundColor: k.surface,
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  adviceText: {
    flex: 1,
    fontSize: 14,
    color: k.textMuted,
    lineHeight: 20,
  },
  bottomBar: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    paddingTop: 12,
    backgroundColor: k.surfaceSunken,
  },
  finishButton: {
    backgroundColor: k.accent,
    height: 64,
    borderRadius: 32,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    shadowColor: k.isDark ? 'transparent' : k.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  finishButtonText: {
    color: k.surface,
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
