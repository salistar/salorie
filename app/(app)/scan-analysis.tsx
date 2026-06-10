import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Image,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { ArrowLeft, Check, Circle, Flame, Beef, Wheat, Droplets, Scale, FileText } from 'lucide-react-native';
import { Colors } from '../../constants/Colors';
import Animated, {
  FadeInDown,
  FadeIn,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  useSharedValue,
} from 'react-native-reanimated';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ScreenTopBar from '../../components/ScreenTopBar';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { useLogging } from '../../lib/LoggingContext';
import { colorLog, explain } from '../../lib/LocalDataStore';
import { geminiShim } from '../../lib/aiProxy';

const PENDING_SCAN_KEY = 'pending_scan_v1';

// LOG AU CHARGEMENT DU MODULE (hors composant) — prouve que le fichier a
// bien ete evalue par le bundler.
console.log('\x1b[35m[scan-analysis.tsx] MODULE LOADED\x1b[0m');

// Gemini runs server-side via the backend /ai proxy — no key in the client.
// Marker stays truthy so the existing "key present?" guards keep passing.
const GEMINI_API_KEY = 'proxied';
const genAI = geminiShim;
console.log(
  '\x1b[35m[scan-analysis.tsx] GEMINI_API_KEY present?\x1b[0m',
  !!GEMINI_API_KEY,
  '\x1b[35mchars=\x1b[0m',
  GEMINI_API_KEY.length
);

// Meme astuce que FileSystem : en Expo Go le vrai chemin disque contient
// des % litteraux (`/ExperienceData/%40idriss.kriouile%2Fsalorie/`), et
// expo-router decode une fois les params. Pour que <Image> trouve le fichier
// on re-encode les % en %25.
function toDisplayUri(uri: string): string {
  if (!uri) return uri;
  if (uri.includes('%25')) return uri;
  return uri.split('%').join('%25');
}

// Map langue app → instruction Gemini pour que le nom + description soient
// renvoyes dans la langue du user.
function languageInstruction(lang: 'en' | 'fr' | 'ar'): string {
  if (lang === 'fr') return 'Respond in FRENCH (français). All text fields in the JSON must be in French.';
  if (lang === 'ar') return 'Respond in ARABIC (العربية). All text fields in the JSON must be in Arabic.';
  return 'Respond in ENGLISH. All text fields in the JSON must be in English.';
}

export default function ScanAnalysisScreen() {
  const params = useLocalSearchParams();
  const imageUri = params.imageUri as string;
  const displayUri = toDisplayUri(imageUri);

  const { scanImageBase64, setScanImageBase64 } = useLogging();
  const { colors, resolved } = useTheme();
  const { t, language, isRTL } = useTranslation();

  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [isFinished, setIsFinished] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const isDark = resolved === 'dark';

  console.log(
    '\x1b[33m[ScanAnalysis] RENDER — imageUri:\x1b[0m',
    imageUri,
    '\x1b[33m| lang:\x1b[0m',
    language,
    '\x1b[33m| theme:\x1b[0m',
    resolved,
    '\x1b[33m| hasCachedBase64:\x1b[0m',
    !!scanImageBase64,
    '\x1b[33m| GEMINI_KEY_SET:\x1b[0m',
    !!GEMINI_API_KEY
  );

  const steps = [
    { id: 1, text: t('scan.step1') },
    { id: 2, text: t('scan.step2') },
    { id: 3, text: t('scan.step3') },
  ];

  useEffect(() => {
    console.log('\x1b[33m[ScanAnalysis] useEffect : declenchement analyzeImage()\x1b[0m');
    analyzeImage();
  }, []);

  const analyzeImage = async () => {
    const tStart = Date.now();
    try {
      console.log('\x1b[33m[ScanAnalysis] ===== DEBUT analyse de l image =====\x1b[0m');
      console.log('\x1b[33m[ScanAnalysis] imageUri recu:\x1b[0m', imageUri);
      if (!imageUri) {
        setError(t('scan.error_no_image'));
        console.log('\x1b[31m[ScanAnalysis] ABORT : imageUri vide\x1b[0m');
        return;
      }
      try {
        await AsyncStorage.removeItem(PENDING_SCAN_KEY);
        colorLog('RED', '[API→AsyncStorage] pending_scan CLEAR');
      } catch {}

      if (!GEMINI_API_KEY) {
        colorLog('RED', '[ScanAnalysis] ABORT — EXPO_PUBLIC_GEMINI_API_KEY est vide');
        setError(t('scan.error_no_key'));
        return;
      }

      setCurrentStep(0);
      setCompletedSteps([]);

      let base64 = scanImageBase64;
      if (base64) {
        explain('base64 deja en memoire (LoggingContext) — pas de relecture disque');
        colorLog('CYAN', '[ScanAnalysis] image base64 (cache)', { chars: base64.length });
      } else {
        explain('on lit l image depuis le filesystem (pas de base64 en memoire)');
        const t0Read = Date.now();
        const tryRead = async (uri: string) => {
          colorLog('RED', '[API→FileSystem] readAsStringAsync REQUEST', { imageUri: uri });
          return await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
        };
        const variants: string[] = [imageUri];
        const reencoded = imageUri.split('%').join('%25');
        if (reencoded !== imageUri) variants.push(reencoded);
        try {
          const fullyDecoded = decodeURIComponent(imageUri);
          if (fullyDecoded !== imageUri && !variants.includes(fullyDecoded)) variants.push(fullyDecoded);
        } catch {}

        let readOk = false;
        let lastErr: any = null;
        try {
          for (let i = 0; i < variants.length; i++) {
            const v = variants[i];
            try {
              colorLog('YELLOW', `[ScanAnalysis] tentative ${i + 1}/${variants.length}`, { uri: v });
              base64 = await tryRead(v);
              readOk = true;
              colorLog('YELLOW', `[ScanAnalysis] tentative ${i + 1} OK`);
              break;
            } catch (err) {
              lastErr = err;
              colorLog('YELLOW', `[ScanAnalysis] tentative ${i + 1} echec`, {
                error: (err as Error).message?.slice(0, 100),
              });
            }
          }
          if (!readOk) throw lastErr;
          colorLog('RED', '[API←FileSystem] readAsStringAsync OK', {
            chars: base64.length,
            ms: Date.now() - t0Read,
          });
        } catch (e) {
          colorLog('RED', '[API←FileSystem] readAsStringAsync FAILED', { error: (e as Error).message });
          setError(t('scan.error_read'));
          return;
        }
      }
      setScanImageBase64(null);

      const approxKB = Math.round((base64.length * 0.75) / 1024);
      colorLog('CYAN', '[ScanAnalysis] image prete', { base64Chars: base64.length, approxSizeKB: approxKB });

      const modelName = process.env.EXPO_PUBLIC_GEMINI_VISION_MODEL || 'gemini-2.5-flash';
      explain(`modele vision: ${modelName} | langue de sortie: ${language}`);
      const model = genAI.getGenerativeModel({ model: modelName });

      setCompletedSteps([1]);
      setCurrentStep(1);

      // Prompt enrichi : on demande aussi une description detaillee + quantite
      // precise en g ou ml (pour liquides). Sortie localisee dans la langue de l app.
      const langInstr = languageInstruction(language);
      const prompt = `Analyze the food in this image in detail.

${langInstr}

Return STRICT JSON with these keys:
{
  "name": "short dish name (2-5 words)",
  "description": "detailed description of the food (2-4 sentences): visible ingredients, cooking style, texture, notable health properties",
  "calories": 123,
  "protein": 12.3,
  "carbs": 45,
  "fat": 8.5,
  "quantity": 250,
  "unit": "g",
  "serving": "human-readable serving e.g. '1 bowl (250g)' or '1 bottle (500ml)'"
}

Rules:
- "unit" MUST be exactly "g" for solids or "ml" for liquids. No other unit.
- "quantity" is a NUMBER (no unit), matching "unit" — realistic portion as visible.
- All text ("name", "description", "serving") must be in the requested language.
- Output ONLY the JSON. No markdown, no code fences, no commentary.`;

      colorLog('GREEN', '[API→Gemini] scan-analysis (vision) REQUEST', {
        model: modelName,
        lang: language,
        imageBase64Chars: base64.length,
        approxKB,
        promptChars: prompt.length,
      });
      const t0 = Date.now();
      let result;
      try {
        result = await model.generateContent([
          prompt,
          { inlineData: { data: base64, mimeType: 'image/jpeg' } },
        ]);
      } catch (geminiErr) {
        const fullMsg = (geminiErr as Error).message || '';
        colorLog('RED', '[API←Gemini] generateContent FAILED', { ms: Date.now() - t0, error: fullMsg });
        console.log('\x1b[31m━━━━━━━━ GEMINI FULL ERROR START ━━━━━━━━\x1b[0m');
        console.log(fullMsg);
        console.log('\x1b[31m━━━━━━━━ GEMINI FULL ERROR END ━━━━━━━━\x1b[0m');
        throw geminiErr;
      }
      colorLog('BLUE', '[API←Gemini] generateContent returned', { ms: Date.now() - t0 });

      const response = await result.response;
      let text = response.text();
      explain('reponse brute Gemini recue — preview 300 chars');
      colorLog('BLUE', '[API←Gemini] scan-analysis RESPONSE', {
        ms: Date.now() - t0,
        chars: text.length,
        preview: text.slice(0, 300),
      });

      text = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const data = JSON.parse(text);

      // Normalisation defensive : si Gemini oublie unit/quantity on reconstruit
      if (!data.unit || (data.unit !== 'g' && data.unit !== 'ml')) {
        data.unit = 'g';
        explain('unit manquante ou invalide — fallback sur "g"');
      }
      if (typeof data.quantity !== 'number' || !isFinite(data.quantity) || data.quantity <= 0) {
        data.quantity = 100;
        explain('quantity manquante — fallback sur 100');
      }
      if (!data.serving) {
        data.serving = `${data.quantity} ${data.unit}`;
      }
      if (!data.description) {
        data.description = '';
      }

      explain('JSON parse + normalisation OK — macros + description + quantite pretes');
      colorLog('CYAN', '[ScanAnalysis] macros detectees', {
        name: data.name,
        qty: `${data.quantity} ${data.unit}`,
        kcal: data.calories,
        descChars: (data.description || '').length,
      });
      setAiResult(data);

      setCompletedSteps([1, 2]);
      setCurrentStep(2);

      setTimeout(() => {
        setCompletedSteps([1, 2, 3]);
        setIsFinished(true);
      }, 800);
    } catch (err) {
      colorLog('RED', '[ScanAnalysis] ECHEC analyse Gemini', {
        error: (err as Error).message,
        stack: (err as Error).stack?.split('\n').slice(0, 3).join(' | '),
        totalMs: Date.now() - tStart,
      });
      setError(`${t('scan.error_analyze')}: ${(err as Error).message}`);
    } finally {
      console.log(`\x1b[33m[ScanAnalysis] ===== FIN analyse (total ${Date.now() - tStart}ms) =====\x1b[0m`);
    }
  };

  const handleContinue = () => {
    if (!aiResult) return;
    explain('user clique Continue — navigation vers log-food-details avec macros + description + quantite');
    colorLog('YELLOW', '[ScanAnalysis] → log-food-details', {
      name: aiResult.name,
      qty: `${aiResult.quantity} ${aiResult.unit}`,
      kcal: aiResult.calories,
    });

    router.push({
      pathname: '/log-food-details' as any,
      params: {
        name: aiResult.name,
        calories: String(aiResult.calories),
        protein: String(aiResult.protein),
        carbs: String(aiResult.carbs),
        fat: String(aiResult.fat),
        serving: aiResult.serving || `${aiResult.quantity} ${aiResult.unit}`,
        quantity: String(aiResult.quantity),
        unit: aiResult.unit,
        description: aiResult.description || '',
        imageUri: displayUri,
      },
    });
  };

  // ----- Theme-aware styles -----
  const bg = isDark ? '#0B0F14' : Colors.light.white;
  const textPrimary = isDark ? colors.gray[900] : Colors.light.gray[900];
  const textSecondary = isDark ? colors.gray[500] : Colors.light.gray[500];
  const textMuted = isDark ? colors.gray[400] : Colors.light.gray[400];
  const cardBg = isDark ? '#161C23' : Colors.light.gray[50];
  const cardBorder = isDark ? colors.gray[200] : Colors.light.gray[100];
  const activeBg = isDark ? '#1F2833' : Colors.light.white;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: bg }]}>
      <ScreenTopBar showBrand showNotif={false} />

      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: cardBg }]}
          onPress={() => router.back()}
        >
          <ArrowLeft
            size={24}
            color={textPrimary}
            strokeWidth={2.5}
            style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
          />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.titleSection, isRTL && { alignItems: 'flex-end' }]}>
          <Text style={[styles.headerTitle, { color: textPrimary, textAlign: isRTL ? 'right' : 'left' }]}>
            {t('scan.title')}
          </Text>
        </View>

        <View style={styles.content}>
          {/* Image Display */}
          <Animated.View
            entering={FadeInDown.duration(800)}
            style={[styles.imageContainer, { backgroundColor: cardBg, borderColor: cardBg }]}
          >
            <Image source={{ uri: displayUri }} style={styles.image} />
            {!isFinished && (
              <View style={styles.scanOverlay}>
                <AnimatedLoadingBar />
              </View>
            )}
          </Animated.View>

          {/* Steps (hidden once finished — replaced by result card) */}
          {!isFinished && (
            <View style={styles.stepsContainer}>
              {steps.map((step, index) => {
                const isActive = index === currentStep && !isFinished;
                const isCompleted = completedSteps.includes(step.id);

                return (
                  <Animated.View
                    key={step.id}
                    entering={FadeInDown.delay(index * 200).duration(600)}
                    style={[
                      styles.stepRow,
                      { backgroundColor: cardBg, borderColor: 'transparent' },
                      isActive && { backgroundColor: activeBg, borderColor: Colors.light.primary },
                      isRTL && { flexDirection: 'row-reverse' },
                    ]}
                  >
                    <View
                      style={[
                        styles.statusIcon,
                        { backgroundColor: isDark ? colors.gray[100] : Colors.light.gray[100] },
                        isCompleted && { backgroundColor: Colors.light.primary },
                        isActive && { backgroundColor: 'transparent' },
                      ]}
                    >
                      {isCompleted ? (
                        <Check size={16} color={Colors.light.white} strokeWidth={3} />
                      ) : isActive ? (
                        <ActivityIndicator size="small" color={Colors.light.primary} />
                      ) : (
                        <Circle size={16} color={textMuted} />
                      )}
                    </View>
                    <Text
                      style={[
                        styles.stepText,
                        { color: textMuted, textAlign: isRTL ? 'right' : 'left' },
                        (isCompleted || isActive) && { color: textPrimary, fontWeight: '700' },
                      ]}
                    >
                      {step.text}
                    </Text>
                  </Animated.View>
                );
              })}
              {error && <Text style={styles.errorText}>{error}</Text>}
            </View>
          )}

          {/* Result card (shown once finished) */}
          {isFinished && aiResult && (
            <Animated.View
              entering={FadeIn.duration(500)}
              style={[styles.resultCard, { backgroundColor: cardBg, borderColor: cardBorder }]}
            >
              <Text style={[styles.resultLabel, { color: textSecondary, textAlign: isRTL ? 'right' : 'left' }]}>
                {t('scan.detected_name')}
              </Text>
              <Text style={[styles.resultName, { color: textPrimary, textAlign: isRTL ? 'right' : 'left' }]}>
                {aiResult.name}
              </Text>

              {/* Quantity pill */}
              <View style={[styles.qtyRow, isRTL && { flexDirection: 'row-reverse' }]}>
                <View style={[styles.qtyPill, { backgroundColor: Colors.light.primaryLight || '#E6F7EE' }]}>
                  <Scale size={14} color={Colors.light.primary} strokeWidth={2.5} />
                  <Text style={[styles.qtyText, { color: Colors.light.primary }]}>
                    {t('scan.quantity')}: {aiResult.quantity} {aiResult.unit}
                  </Text>
                </View>
              </View>

              {/* Description */}
              {aiResult.description ? (
                <View style={styles.descBlock}>
                  <View style={[styles.descHeader, isRTL && { flexDirection: 'row-reverse' }]}>
                    <FileText size={14} color={textSecondary} strokeWidth={2.5} />
                    <Text style={[styles.descLabel, { color: textSecondary }]}>{t('scan.description')}</Text>
                  </View>
                  <Text
                    style={[
                      styles.descText,
                      { color: textPrimary, textAlign: isRTL ? 'right' : 'left' },
                    ]}
                  >
                    {aiResult.description}
                  </Text>
                </View>
              ) : null}

              {/* Macros grid */}
              <View style={styles.macrosGrid}>
                <MacroTile
                  icon={<Flame size={18} color={Colors.light.primary} />}
                  label={t('scan.calories_short')}
                  value={`${aiResult.calories}`}
                  unit="kcal"
                  tileBg={isDark ? '#1F2833' : Colors.light.white}
                  border={cardBorder}
                  textPrimary={textPrimary}
                  textMuted={textMuted}
                />
                <MacroTile
                  icon={<Beef size={18} color="#FF5C5C" />}
                  label={t('scan.protein_short')}
                  value={`${aiResult.protein}`}
                  unit="g"
                  tileBg={isDark ? '#1F2833' : Colors.light.white}
                  border={cardBorder}
                  textPrimary={textPrimary}
                  textMuted={textMuted}
                />
                <MacroTile
                  icon={<Wheat size={18} color="#F59E0B" />}
                  label={t('scan.carbs_short')}
                  value={`${aiResult.carbs}`}
                  unit="g"
                  tileBg={isDark ? '#1F2833' : Colors.light.white}
                  border={cardBorder}
                  textPrimary={textPrimary}
                  textMuted={textMuted}
                />
                <MacroTile
                  icon={<Droplets size={18} color="#0EA5E9" />}
                  label={t('scan.fat_short')}
                  value={`${aiResult.fat}`}
                  unit="g"
                  tileBg={isDark ? '#1F2833' : Colors.light.white}
                  border={cardBorder}
                  textPrimary={textPrimary}
                  textMuted={textMuted}
                />
              </View>
            </Animated.View>
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.continueBtn, !isFinished && styles.disabledBtn]}
          onPress={handleContinue}
          disabled={!isFinished}
        >
          <Text style={styles.continueText}>{t('scan.continue')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function MacroTile({
  icon,
  label,
  value,
  unit,
  tileBg,
  border,
  textPrimary,
  textMuted,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  tileBg: string;
  border: string;
  textPrimary: string;
  textMuted: string;
}) {
  return (
    <View style={[styles.macroTile, { backgroundColor: tileBg, borderColor: border }]}>
      {icon}
      <Text style={[styles.macroLabel, { color: textMuted }]}>{label}</Text>
      <View style={styles.macroValueRow}>
        <Text style={[styles.macroValue, { color: textPrimary }]}>{value}</Text>
        <Text style={[styles.macroUnit, { color: textMuted }]}>{unit}</Text>
      </View>
    </View>
  );
}

function AnimatedLoadingBar() {
  const translateY = useSharedValue(0);

  useEffect(() => {
    translateY.value = withRepeat(
      withSequence(withTiming(280, { duration: 2000 }), withTiming(0, { duration: 2000 })),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={[styles.scanLine, animatedStyle]} />;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingTop: 4,
    marginBottom: 6,
  },
  titleSection: {
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -1,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingBottom: 20,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  imageContainer: {
    width: 260,
    height: 260,
    borderRadius: 32,
    overflow: 'hidden',
    marginBottom: 28,
    borderWidth: 4,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  image: { width: '100%', height: '100%' },
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(41, 143, 80, 0.05)',
  },
  scanLine: {
    height: 4,
    width: '100%',
    backgroundColor: Colors.light.primary,
    opacity: 0.8,
    shadowColor: Colors.light.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 5,
  },
  stepsContainer: { width: '100%', gap: 12 },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 18,
    gap: 14,
    borderWidth: 1.5,
  },
  statusIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { fontSize: 15, fontWeight: '600', flex: 1 },

  // Result card
  resultCard: {
    width: '100%',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    gap: 12,
  },
  resultLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  resultName: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  qtyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  qtyText: { fontSize: 13, fontWeight: '800' },
  descBlock: { gap: 6, marginTop: 4 },
  descHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  descLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  descText: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  macrosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
  },
  macroTile: {
    flexBasis: '47%',
    flexGrow: 1,
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    alignItems: 'center',
    gap: 4,
  },
  macroLabel: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  macroValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  macroValue: { fontSize: 20, fontWeight: '900' },
  macroUnit: { fontSize: 11, fontWeight: '700' },

  footer: { padding: 24, paddingBottom: 30 },
  continueBtn: {
    backgroundColor: Colors.light.primary,
    height: 60,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
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
  continueText: { fontSize: 17, fontWeight: '800', color: Colors.light.white },
  errorText: {
    color: '#FF5C5C',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 10,
  },
});
