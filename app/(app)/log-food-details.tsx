import React, { useState, useMemo } from 'react';
import { haptique } from '../../lib/haptique';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Flame, Beef, Wheat, Droplets, FileText } from 'lucide-react-native';
import { useLogging } from '../../lib/LoggingContext';
import { addNutritionLog } from '../../lib/firebase';
import { submitScanFeedback } from '../../lib/mlFeedback';
import { useUser } from '@clerk/clerk-expo';
import Animated, { FadeInDown } from 'react-native-reanimated';
import ScreenTopBar from '../../components/ScreenTopBar';
import { FormInput, Stepper, SubmitBar, ChipGroup } from '../../components/FormKit';
import { useNutritionData } from '../../hooks/useNutritionData';

// Repas (slot) du Diary — libellés trilingues + défaut selon l'heure.
const SLOT_LABELS: any = {
  en: { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snack', dinner: 'Dinner', label: 'Meal' },
  fr: { breakfast: 'Petit-déj', lunch: 'Déjeuner', snack: 'Snack', dinner: 'Dîner', label: 'Repas' },
  ar: { breakfast: 'فطور', lunch: 'غداء', snack: 'خفيفة', dinner: 'عشاء', label: 'الوجبة' },
};
function defaultSlot(): string {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 16) return 'lunch';
  if (h < 18) return 'snack';
  return 'dinner';
}
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { colorLog, explain } from '../../lib/LocalDataStore';
import { useTokens, Tokens } from '../../constants/tokens';

console.log('\x1b[35m[log-food-details.tsx] MODULE LOADED\x1b[0m');

export default function LogFoodDetailsScreen() {
  const { user } = useUser();
  const { selectedDate, triggerRefresh } = useLogging();
  const params = useLocalSearchParams();
  const { colors, resolved } = useTheme();
  const k = useTokens();
  const { t, isRTL, language } = useTranslation() as any;
  const sl = SLOT_LABELS[language] || SLOT_LABELS.en;

  const isDark = resolved === 'dark';
  const styles = useMemo(() => makeStyles(k), [k]);

  // Helper : parse "250 g" / "1 cup" → { quantity, unit }
  const parseServing = (servingStr: string) => {
    const match = (servingStr || '').match(/^(\d*\.?\d+)\s*(.*)$/);
    if (match) {
      return { quantity: parseFloat(match[1]), unit: match[2] || '' };
    }
    return { quantity: 1, unit: servingStr || '' };
  };

  // Priorite aux champs explicites envoyes par scan-analysis (quantity, unit),
  // sinon on tombe sur le parse du champ "serving" historique.
  const rawQuantity = params.quantity as string | undefined;
  const rawUnit = params.unit as string | undefined;
  const parsed = parseServing(params.serving as string);
  const initialQuantity = rawQuantity ? parseFloat(rawQuantity) : parsed.quantity;
  const initialUnit = rawUnit || parsed.unit || 'g';

  // Image URI — scan-analysis envoie deja displayUri (re-encode en %25).
  // On gere aussi le cas ou l URI arrive decodee par expo-router.
  const rawImageUri = params.imageUri as string | undefined;
  const displayUri = rawImageUri
    ? rawImageUri.includes('%25')
      ? rawImageUri
      : rawImageUri.split('%').join('%25')
    : null;

  console.log('\x1b[35m[log-food-details] RENDER — params:\x1b[0m', {
    name: params.name,
    quantity: rawQuantity,
    unit: rawUnit,
    hasDescription: !!params.description,
    hasImage: !!rawImageUri,
    theme: resolved,
  });

  const [name, setName] = useState(params.name as string);
  const [quantity, setQuantity] = useState(initialQuantity.toString());
  const [unit, setUnit] = useState(initialUnit);
  const [calories, setCalories] = useState(params.calories as string);
  const [protein, setProtein] = useState(params.protein as string);
  const [carbs, setCarbs] = useState(params.carbs as string);
  const [fat, setFat] = useState(params.fat as string);
  const [description, setDescription] = useState((params.description as string) || '');
  const [slot, setSlot] = useState<string>(defaultSlot());
  const [loading, setLoading] = useState(false);

  const [baseData] = useState({
    calories: parseFloat(params.calories as string),
    protein: parseFloat(params.protein as string) || 0,
    carbs: parseFloat(params.carbs as string) || 0,
    fat: parseFloat(params.fat as string) || 0,
    quantity: initialQuantity,
  });

  // FEATURE #93 — contexte budget du jour (goals/consumed déjà dérivables ici).
  // On lit le budget calorique du jour sélectionné puis on compare à l'aliment
  // en cours de saisie pour dire s'il rentre ou dépasse. Purement informatif.
  const { goals, consumed, loading: budgetLoading } = useNutritionData(selectedDate);
  const foodKcal = Math.max(0, Math.round(parseFloat(calories) || 0));
  const remainingKcal = Math.round((goals.calories || 0) - (consumed.calories || 0));
  const fits = foodKcal <= Math.max(0, remainingKcal);
  const budgetContext =
    !budgetLoading && (goals.calories || 0) > 0
      ? language === 'fr'
        ? `Il te reste ${remainingKcal} kcal aujourd'hui — cet aliment (${foodKcal} kcal) ${fits ? 'rentre' : 'dépasse'}.`
        : language === 'ar'
        ? `تبقّى لك ${remainingKcal} سعرة اليوم — هذا الطعام (${foodKcal} سعرة) ${fits ? 'يدخل ضمن الحدّ' : 'يتجاوز الحدّ'}.`
        : `You have ${remainingKcal} kcal left today — this food (${foodKcal} kcal) ${fits ? 'fits' : 'goes over'}.`
      : null;

  const handleLog = async () => {
    const email = user?.primaryEmailAddress?.emailAddress || '';
    if (!user || !email) return;
    setLoading(true);

    explain('user appuie sur Log Food — on sauvegarde le repas scanne dans Firestore');
    colorLog('GREEN', '[API→Firestore] addNutritionLog REQUEST', {
      name,
      qty: `${quantity} ${unit}`,
      calories: parseFloat(calories),
    });
    const t0 = Date.now();
    try {
      // Persiste AUSSI la description (ingrédients + qualités/risques) et la note
      // santé (grade) venues du scan → visibles ensuite dans diary/activité.
      const payload: any = {
        userId: email,
        type: 'meal',
        name: name,
        calories: parseFloat(calories),
        protein: parseFloat(protein) || 0,
        carbs: parseFloat(carbs) || 0,
        fat: parseFloat(fat) || 0,
        serving: `${quantity} ${unit}`,
        slot,
        date: selectedDate,
      };
      if (description && description.trim()) payload.description = description.trim();
      const g = params.healthGrade as string | undefined;
      if (g) {
        payload.note = {
          grade: g,
          score: Number(params.healthScore) || 0,
          verdict: (params.healthVerdict as string) || '',
          ...(params.healthColor ? { color: params.healthColor as string } : {}),
        };
      }
      await addNutritionLog(payload);
      // L'ecran de scan confirmait deja par une vibration ; l'enregistrement d'un
      // repas, lui, ne disait rien. C'est pourtant le geste le plus repete de l'app.
      haptique.succes();
      colorLog('BLUE', '[API←Firestore] addNutritionLog OK', { ms: Date.now() - t0 });
      // ACTIVE LEARNING : on capture le label FINAL (édité par l'utilisateur = vraie correction)
      // + l'image + ce que le on-device avait prédit -> dataset "or" pour ré-entraîner.
      try {
        submitScanFeedback({
          imageUri: rawImageUri || '',
          predicted: (params.scanPredicted as string) || null,
          predictedScore: Number(params.scanScore) || 0,
          finalName: name,
          tier: (params.scanTier as string) || 'unknown',
          // VRAIE correction = l'utilisateur a modifié le nom proposé (indépendant de la langue).
          userEdited: name !== ((params.name as string) || ''),
          language,
        });
      } catch {}
      // Mémorise l'aliment pour le re-logger en 1 tap (Récents).
      try {
        const { addRecentFood } = require('../../lib/recentFoods');
        await addRecentFood(email, { name, calories: parseFloat(calories) || 0, protein: parseFloat(protein) || 0, carbs: parseFloat(carbs) || 0, fat: parseFloat(fat) || 0, serving: `${quantity} ${unit}` });
      } catch {}
      triggerRefresh();
      router.replace('/(tabs)' as any);
    } catch (error) {
      colorLog('RED', '[API←Firestore] addNutritionLog FAILED', {
        error: (error as Error).message,
      });
    } finally {
      setLoading(false);
    }
  };

  // Scale macros with quantity changes
  const updateQuantity = (text: string) => {
    setQuantity(text);
    const val = parseFloat(text);
    if (!isNaN(val) && val > 0 && baseData.quantity > 0) {
      const ratio = val / baseData.quantity;
      setCalories((baseData.calories * ratio).toFixed(1));
      setProtein((baseData.protein * ratio).toFixed(1));
      setCarbs((baseData.carbs * ratio).toFixed(1));
      setFat((baseData.fat * ratio).toFixed(1));
    }
  };

  // ----- Theme-aware palette -----
  const accent = colors.primary;
  const bg = k.surface;
  const textPrimary = isDark ? colors.gray[900] : k.text;
  const textSecondary = isDark ? colors.gray[500] : k.textMuted;
  const textMuted = isDark ? colors.gray[400] : k.textMuted;
  const cardBg = k.surfaceSunken;
  const cardBorder = isDark ? colors.gray[200] : k.border;
  const inputBorder = isDark ? colors.gray[200] : k.border;
  const hintColor = isDark ? '#7E858E' : '#9AA0A6';

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.safeArea, { backgroundColor: bg }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScreenTopBar showBack title={t('logfood.title')} showBrand={false} showNotif={false} />

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Captured image preview */}
          {displayUri ? (
            <Animated.View entering={FadeInDown.duration(600)} style={[styles.imageContainer, isDark && { shadowColor: 'transparent', elevation: 0 }]}>
              <Image
                source={{ uri: displayUri }}
                style={styles.image}
                resizeMode="cover"
                onError={(e) =>
                  console.log(
                    '\x1b[31m[log-food-details] Image ERROR:\x1b[0m',
                    e.nativeEvent?.error,
                    'uri:',
                    displayUri
                  )
                }
                onLoad={() => console.log('\x1b[32m[log-food-details] Image LOADED OK\x1b[0m')}
              />
            </Animated.View>
          ) : null}

          <Animated.View entering={FadeInDown.duration(600)}>
            <FormInput
              label={t('logfood.food_name')}
              value={name}
              onChangeText={setName}
              multiline
              placeholder={t('logfood.food_name_ph')}
            />
            {/* Invite à corriger (uniquement après un scan) -> améliore le signal d'active learning */}
            {params.scanTier ? (
              <Text style={{ color: hintColor, fontSize: 12, marginTop: -6, marginBottom: 10, paddingHorizontal: 4, textAlign: isRTL ? 'right' : 'left' }}>
                {language === 'fr'
                  ? "Pas le bon plat ? Corrigez le nom ci-dessus — ça améliore la reconnaissance."
                  : language === 'ar'
                  ? "ليس الطبق الصحيح؟ صحّح الاسم أعلاه لتحسين التعرّف."
                  : 'Wrong dish? Fix the name above — it improves recognition.'}
              </Text>
            ) : null}

            <Stepper
              value={quantity}
              onChange={updateQuantity}
              step={/^(g|ml)/i.test(unit.trim()) ? 10 : 1}
              unit={unit}
            />

            {/* Portions rapides — multiplie la portion de base (pas de calcul de grammes) */}
            <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', flexWrap: 'wrap', gap: 8, marginTop: -4, marginBottom: 14 }}>
              {[{ k: '½', m: 0.5 }, { k: '×1', m: 1 }, { k: '×2', m: 2 }, { k: '×3', m: 3 }].map((q) => {
                const active = Math.abs((parseFloat(quantity) || 0) - baseData.quantity * q.m) < 0.01;
                return (
                  <TouchableOpacity key={q.k} onPress={() => updateQuantity(String(+(baseData.quantity * q.m).toFixed(2)))}
                    style={{ paddingHorizontal: 18, paddingVertical: 9, borderRadius: 999, borderWidth: 1.5, backgroundColor: active ? accent : 'transparent', borderColor: active ? accent : inputBorder }}>
                    <Text style={{ fontWeight: '800', fontSize: 14, color: active ? k.onAccent : textSecondary }}>{q.k}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <FormInput
              label={t('logfood.unit_ph')}
              value={unit}
              onChangeText={setUnit}
              placeholder={t('logfood.unit_ph')}
            />

            {/* Repas (slot) du Diary — pré-rempli selon l'heure, modifiable */}
            <ChipGroup
              label={sl.label}
              value={slot}
              onChange={setSlot}
              options={[
                { value: 'breakfast', label: sl.breakfast },
                { value: 'lunch', label: sl.lunch },
                { value: 'snack', label: sl.snack },
                { value: 'dinner', label: sl.dinner },
              ]}
            />
          </Animated.View>

          {/* Description card (from AI) */}
          {description ? (
            <Animated.View
              entering={FadeInDown.delay(80).duration(600)}
              style={[styles.descCard, { backgroundColor: cardBg, borderColor: cardBorder }]}
            >
              <View style={[styles.descCardHeader, isRTL && { flexDirection: 'row-reverse' }]}>
                <FileText size={18} color={accent} />
                <Text style={[styles.descCardTitle, { color: textSecondary }]}>
                  {t('logfood.description')}
                </Text>
              </View>
              <TextInput
                style={[
                  styles.descInput,
                  { color: textPrimary, textAlign: isRTL ? 'right' : 'left' },
                ]}
                value={description}
                onChangeText={setDescription}
                multiline
                placeholder={t('logfood.description')}
                placeholderTextColor={textMuted}
              />
            </Animated.View>
          ) : null}

          {/* Main Calories Card */}
          <Animated.View
            entering={FadeInDown.delay(100).duration(600)}
            style={[styles.caloriesCard, { backgroundColor: cardBg, borderColor: cardBorder }]}
          >
            <View style={[styles.cardHeader, isRTL && { flexDirection: 'row-reverse' }]}>
              <Flame size={24} color={accent} />
              <Text style={[styles.cardTitle, { color: textSecondary }]}>{t('logfood.calories')}</Text>
            </View>
            <View style={[styles.mainInputWrapper, isRTL && { flexDirection: 'row-reverse' }]}>
              <TextInput
                style={[styles.mainInput, { color: textPrimary }]}
                value={calories}
                onChangeText={setCalories}
                keyboardType="numeric"
                selectTextOnFocus
              />
              <Text style={[styles.unit, { color: textMuted }]}>kcal</Text>
            </View>
          </Animated.View>

          {/* Macros Grid */}
          <View style={[styles.macrosContainer, isRTL && { flexDirection: 'row-reverse' }]}>
            <Animated.View
              entering={FadeInDown.delay(200).duration(600)}
              style={[styles.macroCard, { backgroundColor: k.surface, borderColor: cardBorder }]}
            >
              <View style={[styles.macroIcon, { backgroundColor: k.dangerSoft }]}>
                <Beef size={20} color="#FF5C5C" />
              </View>
              <Text style={[styles.macroLabel, { color: textMuted }]}>{t('logfood.protein')}</Text>
              <View style={styles.macroInputRow}>
                <TextInput
                  style={[styles.macroInput, { color: textPrimary }]}
                  value={protein}
                  onChangeText={setProtein}
                  keyboardType="numeric"
                />
                <Text style={[styles.macroUnit, { color: textMuted }]}>g</Text>
              </View>
            </Animated.View>

            <Animated.View
              entering={FadeInDown.delay(300).duration(600)}
              style={[styles.macroCard, { backgroundColor: k.surface, borderColor: cardBorder }]}
            >
              <View style={[styles.macroIcon, { backgroundColor: k.warningSoft }]}>
                <Wheat size={20} color={k.warning} />
              </View>
              <Text style={[styles.macroLabel, { color: textMuted }]}>{t('logfood.carbs')}</Text>
              <View style={styles.macroInputRow}>
                <TextInput
                  style={[styles.macroInput, { color: textPrimary }]}
                  value={carbs}
                  onChangeText={setCarbs}
                  keyboardType="numeric"
                />
                <Text style={[styles.macroUnit, { color: textMuted }]}>g</Text>
              </View>
            </Animated.View>

            <Animated.View
              entering={FadeInDown.delay(400).duration(600)}
              style={[styles.macroCard, { backgroundColor: k.surface, borderColor: cardBorder }]}
            >
              <View style={[styles.macroIcon, { backgroundColor: k.infoSoft }]}>
                <Droplets size={20} color={k.info} />
              </View>
              <Text style={[styles.macroLabel, { color: textMuted }]}>{t('logfood.fat')}</Text>
              <View style={styles.macroInputRow}>
                <TextInput
                  style={[styles.macroInput, { color: textPrimary }]}
                  value={fat}
                  onChangeText={setFat}
                  keyboardType="numeric"
                />
                <Text style={[styles.macroUnit, { color: textMuted }]}>g</Text>
              </View>
            </Animated.View>
          </View>
        </ScrollView>

        {/* FEATURE #93 — ligne de contexte budget, juste au-dessus du bouton d'ajout */}
        {budgetContext ? (
          <View
            style={[
              styles.budgetContextRow,
              {
                backgroundColor: fits
                  ? (isDark ? '#12241A' : '#ECFDF5')
                  : (isDark ? '#2A1518' : '#FEF2F2'),
                borderColor: fits ? k.accent : k.danger,
              },
            ]}
          >
            <Flame size={15} color={fits ? k.success : k.danger} />
            <Text
              style={[
                styles.budgetContextText,
                { color: textSecondary, textAlign: isRTL ? 'right' : 'left' },
              ]}
            >
              {budgetContext}
            </Text>
          </View>
        ) : null}

        <SubmitBar label={t('logfood.log_btn')} onPress={handleLog} loading={loading} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Fabrique thémée : un StyleSheet est évalué au chargement du module, où `isDark`
// n'existe pas. Le composant l'appelle via useMemo, recalculé au changement de thème.
const makeStyles = (k: Tokens) => StyleSheet.create({
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 4,
    marginBottom: 10,
  },
  headerTitle: { fontSize: 20, fontWeight: '800' },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: 24, paddingBottom: 32 },
  imageContainer: {
    width: '100%',
    height: 200,
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 20,
    backgroundColor: '#00000010',
    shadowColor: k.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 6,
  },
  image: { width: '100%', height: '100%' },
  descCard: {
    borderRadius: 22,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    gap: 8,
  },
  descCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  descCardTitle: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  descInput: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    padding: 0,
    minHeight: 60,
  },
  caloriesCard: {
    borderRadius: 26,
    padding: 22,
    marginBottom: 16,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  mainInputWrapper: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  mainInput: { fontSize: 50, fontWeight: '900', padding: 0 },
  unit: { fontSize: 20, fontWeight: '800' },
  macrosContainer: { flexDirection: 'row', gap: 10 },
  macroCard: {
    flex: 1,
    borderRadius: 22,
    padding: 14,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  macroIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  macroLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  macroInputRow: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  macroInput: { fontSize: 18, fontWeight: '800', padding: 0, textAlign: 'center' },
  macroUnit: { fontSize: 13, fontWeight: '700' },
  budgetContextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  budgetContextText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
});
