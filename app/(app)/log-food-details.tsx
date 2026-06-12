import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  SafeAreaView,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Flame, Beef, Wheat, Droplets, FileText } from 'lucide-react-native';
import { Colors } from '../../constants/Colors';
import { useLogging } from '../../lib/LoggingContext';
import { addNutritionLog } from '../../lib/firebase';
import { useUser } from '@clerk/clerk-expo';
import Animated, { FadeInDown } from 'react-native-reanimated';
import ScreenTopBar from '../../components/ScreenTopBar';
import { FormInput, Stepper, SubmitBar } from '../../components/FormKit';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { colorLog, explain } from '../../lib/LocalDataStore';

console.log('\x1b[35m[log-food-details.tsx] MODULE LOADED\x1b[0m');

export default function LogFoodDetailsScreen() {
  const { user } = useUser();
  const { selectedDate, triggerRefresh } = useLogging();
  const params = useLocalSearchParams();
  const { colors, resolved } = useTheme();
  const { t, isRTL } = useTranslation();

  const isDark = resolved === 'dark';

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
  const [loading, setLoading] = useState(false);

  const [baseData] = useState({
    calories: parseFloat(params.calories as string),
    protein: parseFloat(params.protein as string) || 0,
    carbs: parseFloat(params.carbs as string) || 0,
    fat: parseFloat(params.fat as string) || 0,
    quantity: initialQuantity,
  });

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
      await addNutritionLog({
        userId: email,
        type: 'meal',
        name: name,
        calories: parseFloat(calories),
        protein: parseFloat(protein) || 0,
        carbs: parseFloat(carbs) || 0,
        fat: parseFloat(fat) || 0,
        serving: `${quantity} ${unit}`,
        date: selectedDate,
      } as any);
      colorLog('BLUE', '[API←Firestore] addNutritionLog OK', { ms: Date.now() - t0 });
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
  const bg = isDark ? '#0B0F14' : Colors.light.white;
  const textPrimary = isDark ? colors.gray[900] : Colors.light.gray[900];
  const textSecondary = isDark ? colors.gray[500] : Colors.light.gray[500];
  const textMuted = isDark ? colors.gray[400] : Colors.light.gray[400];
  const cardBg = isDark ? '#161C23' : Colors.light.gray[50];
  const cardBorder = isDark ? colors.gray[200] : Colors.light.gray[100];
  const inputBorder = isDark ? colors.gray[200] : Colors.light.gray[100];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: bg }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScreenTopBar showBack title={t('logfood.title')} showBrand={false} showNotif={false} />

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Captured image preview */}
          {displayUri ? (
            <Animated.View entering={FadeInDown.duration(600)} style={styles.imageContainer}>
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

            <Stepper
              value={quantity}
              onChange={updateQuantity}
              step={/^(g|ml)/i.test(unit.trim()) ? 10 : 1}
              unit={unit}
            />

            <FormInput
              label={t('logfood.unit_ph')}
              value={unit}
              onChangeText={setUnit}
              placeholder={t('logfood.unit_ph')}
            />
          </Animated.View>

          {/* Description card (from AI) */}
          {description ? (
            <Animated.View
              entering={FadeInDown.delay(80).duration(600)}
              style={[styles.descCard, { backgroundColor: cardBg, borderColor: cardBorder }]}
            >
              <View style={[styles.descCardHeader, isRTL && { flexDirection: 'row-reverse' }]}>
                <FileText size={18} color={Colors.light.primary} />
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
              <Flame size={24} color={Colors.light.primary} />
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
          <View style={styles.macrosContainer}>
            <Animated.View
              entering={FadeInDown.delay(200).duration(600)}
              style={[styles.macroCard, { backgroundColor: isDark ? '#1F2833' : Colors.light.white, borderColor: cardBorder }]}
            >
              <View style={[styles.macroIcon, { backgroundColor: '#FFEEED' }]}>
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
              style={[styles.macroCard, { backgroundColor: isDark ? '#1F2833' : Colors.light.white, borderColor: cardBorder }]}
            >
              <View style={[styles.macroIcon, { backgroundColor: '#FFF9EB' }]}>
                <Wheat size={20} color="#F59E0B" />
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
              style={[styles.macroCard, { backgroundColor: isDark ? '#1F2833' : Colors.light.white, borderColor: cardBorder }]}
            >
              <View style={[styles.macroIcon, { backgroundColor: '#E0F2FE' }]}>
                <Droplets size={20} color="#0EA5E9" />
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

        <SubmitBar label={t('logfood.log_btn')} onPress={handleLog} loading={loading} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
    shadowColor: '#000',
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
});
