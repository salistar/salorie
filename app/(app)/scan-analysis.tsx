import React, { useState, useEffect, useMemo } from 'react';
import { useEspaceBasSimple } from '../../lib/espaceBas';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Image,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Share,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Check, Circle, Flame, Beef, Wheat, Droplets, Scale, FileText, Share2 } from 'lucide-react-native';
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
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ScreenTopBar from '../../components/ScreenTopBar';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { useLogging } from '../../lib/LoggingContext';
import { colorLog, explain } from '../../lib/LocalDataStore';
import { geminiShim, aiVisionLocal } from '../../lib/aiProxy';
import { sendFeedback } from '../../lib/feedback';
import { classifyOnDevice, localMacroForLabel } from '../../lib/onDeviceVision';
import { computeHealthScore, VERDICT_TXT, HealthScore } from '../../lib/healthScore';
import { translate } from '../../lib/translator';
import { CheckCircle2, AlertTriangle } from 'lucide-react-native';
import { useUser } from '@clerk/clerk-expo';
import { useNutritionData } from '../../hooks/useNutritionData';
import { scoreFood, FoodScore } from '../../lib/objective/scoring';
import { buildObjectiveContext } from '../../lib/objective/buildContext';
import { useScreenGate } from '../../components/FeatureGate';
import { macroTexte } from '../../lib/macroFormat';

const PENDING_SCAN_KEY = 'pending_scan_v1';

// Libellés Qualités / Risques (note santé) — trilingue local.
const QR_LABELS: any = {
  en: { qualities: 'Strengths', risks: 'Watch out', note: 'Health note' },
  fr: { qualities: 'Qualités', risks: 'Risques', note: 'Note santé' },
  ar: { qualities: 'الإيجابيات', risks: 'تنبيهات', note: 'تقييم صحي' },
};

// Ramène les macros à 100 g pour calculer une note santé comparable.
function per100(data: any) {
  const q = data?.unit === 'g' && data?.quantity > 0 ? data.quantity : 100;
  const f = 100 / q;
  return {
    kcal: (Number(data?.calories) || 0) * f,
    protein: (Number(data?.protein) || 0) * f,
    carbs: (Number(data?.carbs) || 0) * f,
    fat: (Number(data?.fat) || 0) * f,
  };
}

// Heuristique on-device (pas d'IA) : qualités + risques à partir des macros/100g.
function heuristicQualRisk(p: { kcal: number; protein: number; carbs: number; fat: number }, lang: string) {
  const T: any = {
    fr: { prot: 'Bonne source de protéines', lowfat: 'Pauvre en matières grasses', moderate: 'Apport énergétique modéré',
          hifat: 'Riche en matières grasses', hicarb: 'Riche en glucides', hical: 'Densité calorique élevée', watch: 'À consommer avec modération' },
    en: { prot: 'Good source of protein', lowfat: 'Low in fat', moderate: 'Moderate energy',
          hifat: 'High in fat', hicarb: 'High in carbs', hical: 'High calorie density', watch: 'Best in moderation' },
    ar: { prot: 'مصدر جيد للبروتين', lowfat: 'قليل الدهون', moderate: 'طاقة معتدلة',
          hifat: 'غني بالدهون', hicarb: 'غني بالكربوهيدرات', hical: 'كثافة سعرات عالية', watch: 'يُفضّل باعتدال' },
  };
  const x = T[lang] || T.en;
  const Q: string[] = [], R: string[] = [];
  if (p.protein >= 10) Q.push(x.prot);
  if (p.fat <= 3) Q.push(x.lowfat);
  if (p.fat >= 17) R.push(x.hifat);
  if (p.carbs >= 40) R.push(x.hicarb);
  if (p.kcal >= 300) R.push(x.hical);
  if (!Q.length) Q.push(x.moderate);
  if (!R.length) R.push(x.watch);
  return { qualities: Q, risks: R };
}

// Traduit les champs texte du résultat dans la langue de l'app — utilisé pour
// Mobile (label TFLite anglais) et Backend (llava/llama répondent souvent en
// anglais). Gemini, lui, localise déjà → pas appelé pour ce tier.
async function localizeFields(data: any, lang: 'en' | 'fr' | 'ar'): Promise<void> {
  if (lang === 'en') return;
  try {
    const jobs: Promise<any>[] = [];
    if (data.name) jobs.push(translate(String(data.name), lang).then((t) => { data.name = t; }));
    if (data.description) jobs.push(translate(String(data.description), lang).then((t) => { data.description = t; }));
    if (data.serving) jobs.push(translate(String(data.serving), lang).then((t) => { data.serving = t; }));
    if (Array.isArray(data.qualities)) jobs.push(Promise.all(data.qualities.map((q: string) => translate(String(q), lang))).then((a) => { data.qualities = a; }));
    if (Array.isArray(data.risks)) jobs.push(Promise.all(data.risks.map((r: string) => translate(String(r), lang))).then((a) => { data.risks = a; }));
    await Promise.race([Promise.all(jobs), new Promise((res) => setTimeout(res, 9000))]);
  } catch {}
}

// Normalise une valeur IA (string "a; b" ou array) en tableau de strings courts.
function toList(v: any): string[] {
  if (Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean).slice(0, 4);
  if (typeof v === 'string') return v.split(/[;\n•]+/).map((s) => s.trim()).filter(Boolean).slice(0, 4);
  return [];
}

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
  if (lang === 'fr') return 'IMPORTANT: Tu DOIS répondre EN FRANÇAIS uniquement. TOUS les champs texte du JSON (name, description, serving, qualities, risks) DOIVENT être rédigés en français. N\'utilise AUCUN mot anglais.';
  if (lang === 'ar') return 'هام: يجب أن تجيب بالعربية فقط. كل الحقول النصية في JSON (name, description, serving, qualities, risks) يجب أن تكون بالعربية. لا تستخدم أي كلمة إنجليزية.';
  return 'IMPORTANT: Respond in ENGLISH only. All text fields in the JSON (name, description, serving, qualities, risks) must be in English.';
}

export default function ScanAnalysisScreen() {
  const params = useLocalSearchParams();
  const imageUri = params.imageUri as string;
  const displayUri = toDisplayUri(imageUri);
  // Modèle choisi par l'utilisateur (item « 3 modèles ») : 'device' | 'backend' | 'gemini'.
  // Absent → cascade automatique (on-device → Gemini).
  const forceModel = (params.forceModel as string) || '';

  const { scanImageBase64, setScanImageBase64 } = useLogging();

  const espaceBas = useEspaceBasSimple();
  const { colors, resolved } = useTheme();
  const { t, language, isRTL } = useTranslation();

  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [isFinished, setIsFinished] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  // Tier de la cascade vision qui a fourni le résultat : on-device / IA (Gemini).
  const [source, setSource] = useState<'device' | 'backend' | 'ai' | null>(null);
  const [scanPredicted, setScanPredicted] = useState<string | null>(null);
  const [scanScore, setScanScore] = useState(0);
  // Base64 de l'image scannée, conservé pour l'active-learning (le cache global
  // est vidé pendant l'analyse) → sert au POST /ml/feedback si l'user corrige.
  const [scanBase64, setScanBase64] = useState<string | null>(null);
  // ───── Correction utilisateur (active-learning) ─────
  const [correcting, setCorrecting] = useState(false);   // champ de saisie ouvert ?
  const [correctText, setCorrectText] = useState('');     // nom correct saisi
  const [correctSending, setCorrectSending] = useState(false);
  const [correctDone, setCorrectDone] = useState(false);  // confirmation affichée
  const [correctError, setCorrectError] = useState<string | null>(null);
  // Envoie la correction au backend (POST /ml/feedback) → dataset d'active-learning.
  const submitCorrection = async () => {
    const label = correctText.trim();
    if (!label || !scanBase64) { setCorrecting(false); return; }
    setCorrectSending(true); setCorrectError(null);
    try {
      await sendFeedback(scanBase64, aiResult?.name || '', label, source || 'device');
      setCorrectDone(true); setCorrecting(false);
    } catch {
      setCorrectError(language === 'fr' ? 'Envoi échoué, réessaie.' : language === 'ar' ? 'فشل الإرسال، حاول مجددًا' : 'Failed, retry.');
    } finally {
      setCorrectSending(false);
    }
  };
  // Verdict objectif (calculé localement via scoreFood, AUCUN appel Gemini).
  // null si l'objectif n'est pas disponible → la carte n'est pas affichée.
  const [objScore, setObjScore] = useState<FoodScore | null>(null);

  // Macros + grammes D'ORIGINE de l'estimation — base pour l'ajustement de portion.
  const [baseScan, setBaseScan] = useState<{ calories: number; protein: number; carbs: number; fat: number; quantity: number } | null>(null);

  const { user } = useUser();
  const today = new Date().toISOString().slice(0, 10);
  const { goals, consumed } = useNutritionData(today);

  const __gate = useScreenGate('food-recognition');

  const isDark = resolved === 'dark';
  const styles = useMemo(() => makeStyles(isDark), [isDark]);

  // #199 — petite animation d'apparition (fade géré par FadeIn + scale-in ici)
  // du bloc verdict/résultat dès que l'analyse se termine. Piloté par une shared
  // value (même pattern que AnimatedLoadingBar) → 100% déclaratif, aucun re-render.
  const verdictScale = useSharedValue(0.94);
  useEffect(() => {
    if (isFinished && aiResult) {
      verdictScale.value = withTiming(1, { duration: 320 });
    } else {
      verdictScale.value = 0.94;
    }
  }, [isFinished, aiResult]);
  const verdictAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: verdictScale.value }],
  }));

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

  // ───── VERDICT OBJECTIF (local, sans IA) ─────
  // Dès que l'aliment est reconnu, on score sa portion vs l'objectif du jour
  // via scoreFood (port fidèle du backend). Si l'objectif est indisponible
  // (pas d'utilisateur ou contexte vide) on ne montre AUCUNE carte (pas d'erreur).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!aiResult) { setObjScore(null); return; }
        const email = user?.primaryEmailAddress?.emailAddress || '';
        if (!email && !user?.id) { setObjScore(null); return; }
        const ctx = await buildObjectiveContext(email, user?.id, today, { goals, consumed });
        // Objectif inexploitable (aucune cible calorique connue) → pas de carte.
        if (!ctx || (ctx.dailyKcalTarget <= 0 && ctx.remainingKcal <= 0)) {
          if (!cancelled) setObjScore(null);
          return;
        }
        const candidate = {
          name: String(aiResult.name || ''),
          kcal: Number(aiResult.calories) || 0,
          protein: Number(aiResult.protein) || 0,
          carbs: Number(aiResult.carbs) || 0,
          fat: Number(aiResult.fat) || 0,
        };
        const verdict = scoreFood(candidate, ctx);
        if (!cancelled) setObjScore(verdict);
      } catch {
        if (!cancelled) setObjScore(null);
      }
    })();
    return () => { cancelled = true; };
  }, [aiResult, user?.id, goals, consumed]);

  // Capture la base (macros + grammes estimés) UNE seule fois, au 1er résultat —
  // référence pour recalculer les macros quand l'utilisateur ajuste la portion.
  useEffect(() => {
    if (aiResult && !baseScan) {
      setBaseScan({
        calories: Number(aiResult.calories) || 0,
        protein: Number(aiResult.protein) || 0,
        carbs: Number(aiResult.carbs) || 0,
        fat: Number(aiResult.fat) || 0,
        quantity: Number(aiResult.quantity) || 100,
      });
    }
  }, [aiResult, baseScan]);

  // Ajuste la portion (grammes/ml) → recalcule proportionnellement les macros depuis
  // la base. La note santé (densité /100 g) reste inchangée ; le verdict objectif et le
  // budget du jour se recalculent via leurs effets (dépendance sur aiResult).
  const adjustPortion = (newQty: number) => {
    if (!aiResult || !baseScan || !(baseScan.quantity > 0)) return;
    const q = Math.max(1, Math.round(newQty));
    const r = q / baseScan.quantity;
    try { Haptics.selectionAsync(); } catch {}
    setAiResult({
      ...aiResult,
      quantity: q,
      calories: Math.round(baseScan.calories * r),
      protein: +(baseScan.protein * r).toFixed(1),
      carbs: +(baseScan.carbs * r).toFixed(1),
      fat: +(baseScan.fat * r).toFixed(1),
      serving: `${q} ${aiResult.unit}`,
    });
  };

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

      // GEMINI_API_KEY vaut la constante 'proxied' (cf. ligne ~121) : le mobile n'embarque
      // AUCUNE clé — les appels passent par le backend, qui détient la vraie. Cette garde
      // ne peut donc jamais se déclencher ; son message parlait d'une variable
      // EXPO_PUBLIC_GEMINI_API_KEY qui n'existe plus, ce qui a failli me faire embarquer
      // une clé dans l'APK (extractible) pour « réparer » un problème inexistant.
      if (!GEMINI_API_KEY) {
        colorLog('RED', '[ScanAnalysis] ABORT — proxy IA non configuré');
        setError(t('scan.error_no_key'));
        return;
      }

      setCurrentStep(0);
      setCompletedSteps([]);

      // ───── CASCADE VISION — TIER 1 : ON-DEVICE (TFLite, hors-ligne, gratuit) ─────
      // On classe la photo sur le téléphone. Si confiance OK ET macros trouvées dans
      // la base locale (502 aliments) → résultat instantané SANS appel cloud. Sinon
      // on garde le label comme INDICE pour Gemini (tier 3) → meilleure précision.
      // Finalise un résultat (note santé + qualités/risques on-device) et termine.
      let onDevicePred: string | null = null; let onDeviceScore = 0;
      const finishWith = async (data: any, src: 'device' | 'backend' | 'ai') => {
        // Retour haptique de succès dès qu'un aliment est reconnu (perçu premium).
        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
        const p100 = per100(data);
        data.health = computeHealthScore(p100);
        const heur = heuristicQualRisk(p100, language);
        data.qualities = toList(data.qualities); if (!data.qualities.length) data.qualities = heur.qualities;
        data.risks = toList(data.risks); if (!data.risks.length) data.risks = heur.risks;
        if (!data.description) data.description = '';
        // Mobile : le label TFLite est en anglais → on traduit le NOM dans la langue de l'app
        // (qualités/risques viennent déjà de l'heuristique localisée).
        if (src === 'device' && language !== 'en' && data.name) {
          try { data.name = await translate(String(data.name), language as any); } catch {}
        }
        setSource(src);
        setAiResult(data);
        setCompletedSteps([1, 2, 3]);
        setCurrentStep(2);
        setTimeout(() => setIsFinished(true), 400);
      };

      // ───── TIER 1 ON-DEVICE (TFLite) — court-circuit UNIQUEMENT si TRÈS confiant ─────
      // Le classifieur embarqué se trompe souvent (boissons, plats marocains/MENA) :
      // on ne garde son résultat que s'il est très sûr ET que les macros locales
      // existent. Sinon (et pour Backend/Gemini forcés) on passe à la VISION CLOUD,
      // bien plus précise. On NE transmet PAS le label on-device au cloud (peu fiable
      // → risque d'induire l'IA en erreur).
      if (forceModel !== 'gemini' && forceModel !== 'backend') {
        try {
          const preds = await Promise.race([
            classifyOnDevice(imageUri),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
          ]);
          const top = (preds as any)?.[0];
          if (top) {
            onDevicePred = String(top.label || ''); onDeviceScore = Number(top.score) || 0;
            // active learning : MÉMORISER la prédiction on-device DÈS qu'elle existe (avant le test
            // de confiance) -> survit au repli cloud de la cascade. La collecte se fait au SAVE
            // (log-food-details) avec le label final = vraie correction même si le backend a corrigé.
            setScanPredicted(onDevicePred); setScanScore(onDeviceScore);
            const macro = localMacroForLabel(top.label);
            colorLog('CYAN', '[ScanAnalysis] TIER1 on-device', { label: top.label, score: Math.round(top.score * 100) + '%', forceModel });
            // MOBILE forcé = 100% ON-DEVICE : on rend TOUJOURS le résultat local,
            // JAMAIS de bascule cloud (exigence utilisateur).
            if (forceModel === 'device') {
              const m = (macro && macro.kcal > 0) ? macro : { name: top.label.replace(/_/g, ' ') || 'Aliment', kcal: 0, protein: 0, carbs: 0, fat: 0 };
              explain('Modèle MOBILE (TFLite on-device) — aucun appel cloud, jamais');
              finishWith({ name: m.name, description: '', calories: Math.round(m.kcal), protein: m.protein, carbs: m.carbs, fat: m.fat, quantity: 100, unit: 'g', serving: '100 g' }, 'device');
              return;
            }
            // Cascade auto (aucun modèle forcé) : on-device si confiant, sinon cloud.
            if (top.score >= 0.85 && macro && macro.kcal > 0) {
              explain('Cascade auto : on-device confiant (≥85%), aucun appel cloud');
              finishWith({ name: macro.name, description: '', calories: Math.round(macro.kcal), protein: macro.protein, carbs: macro.carbs, fat: macro.fat, quantity: 100, unit: 'g', serving: '100 g' }, 'device');
              return;
            }
          } else if (forceModel === 'device') {
            // Rien reconnu mais Mobile forcé → résultat local minimal (jamais cloud).
            finishWith({ name: 'Aliment', description: '', calories: 0, protein: 0, carbs: 0, fat: 0, quantity: 100, unit: 'g', serving: '100 g' }, 'device');
            return;
          }
        } catch (e) {
          colorLog('YELLOW', '[ScanAnalysis] on-device indisponible', { e: String(e) });
          if (forceModel === 'device') {
            finishWith({ name: 'Aliment', description: '', calories: 0, protein: 0, carbs: 0, fat: 0, quantity: 100, unit: 'g', serving: '100 g' }, 'device');
            return;
          }
        }
      }
      // → VISION CLOUD. Cascade auto (forceModel '') ET mode 'backend' → backend d'abord ;
      //   seul le mode Gemini FORCÉ part direct sur 'ai'. Le fallback backend→Gemini
      //   (dernier recours) n'a lieu qu'en cascade auto (voir plus bas).
      const cloudSource: 'backend' | 'ai' = forceModel === 'gemini' ? 'ai' : 'backend';
      setSource(cloudSource);

      let base64 = scanImageBase64;
      if (base64) {
        explain('base64 deja en memoire (LoggingContext) — pas de relecture disque');
        colorLog('CYAN', '[ScanAnalysis] image base64 (cache)', { chars: base64.length });
      } else {
        // VITESSE : on REDIMENSIONNE la photo (1024px, q0.6) AVANT l'upload — une
        // photo 12MP fait 5-15 Mo en base64 (lenteur 4G + 413) vs ~200 Ko ici.
        try {
          // Backend (Cloudflare llava) reçoit l'image en tableau d'octets → un 1024px
          // donne un payload énorme et lent. On réduit à 512px pour ce tier → ~3× plus rapide.
          const w = cloudSource === 'backend' ? 512 : 1024;
          const manip = await ImageManipulator.manipulateAsync(
            imageUri, [{ resize: { width: w } }],
            { base64: true, compress: 0.6, format: ImageManipulator.SaveFormat.JPEG },
          );
          if (manip.base64) {
            base64 = manip.base64;
            colorLog('CYAN', '[ScanAnalysis] image redimensionnée 1024px', { chars: base64.length });
          }
        } catch (e) {
          colorLog('YELLOW', '[ScanAnalysis] resize échoué — lecture brute en fallback', { e: String(e) });
        }
      }
      if (!base64) {
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
            chars: base64?.length,
            ms: Date.now() - t0Read,
          });
        } catch (e) {
          colorLog('RED', '[API←FileSystem] readAsStringAsync FAILED', { error: (e as Error).message });
          setError(t('scan.error_read'));
          return;
        }
      }
      setScanImageBase64(null);
      if (!base64) {
        setError(t('scan.error_read'));
        return;
      }
      // Non-null à partir d'ici (le garde ci-dessus a court-circuité sinon).
      const b64: string = base64;
      setScanBase64(b64);   // conservé pour la correction (active-learning) même si le cache global est vidé

      const approxKB = Math.round((b64.length * 0.75) / 1024);
      colorLog('CYAN', '[ScanAnalysis] image prete', { base64Chars: base64.length, approxSizeKB: approxKB });

      const modelName = process.env.EXPO_PUBLIC_GEMINI_VISION_MODEL || 'gemini-2.5-flash-lite';
      explain(`vision: ${modelName} | source: ${cloudSource} | langue: ${language}`);

      setCompletedSteps([1]);
      setCurrentStep(1);

      // Prompt enrichi : on demande aussi une description detaillee + quantite
      // precise en g ou ml (pour liquides). Sortie localisee dans la langue de l app.
      const langInstr = languageInstruction(language);
      const prompt = `You are a precise food & drink recognition expert. Analyze the food OR DRINK in this image.

${langInstr}

Be especially accurate for INTERNATIONAL, MOROCCAN and MENA-region dishes and drinks. Examples you must recognize correctly:
- Moroccan/MENA dishes: tajine, couscous, harira, rfissa, pastilla/bastilla, tangia, msemen, baghrir, harcha, zaalouk, bissara, chebakia, briouates, kebab, shawarma, falafel, hummus, mloukhia, koshari, mansaf, maqluba.
- Drinks: black coffee (café noir / espresso), Moroccan mint tea (atay / thé à la menthe), café au lait, fresh orange juice, avocado smoothie, leben/raïb.
- If it is clearly a simple BEVERAGE (e.g. a cup of dark liquid = coffee/tea), classify it as the DRINK, never as a meat/dessert dish.
Look carefully at color, container (cup/glass/plate/bowl) and texture before deciding.

Return STRICT JSON with these keys:
{
  "name": "short dish name (2-5 words)",
  "description": "detailed description of the food (2-4 sentences): visible ingredients, cooking style, texture",
  "qualities": ["2-3 short health BENEFITS of this food (e.g. 'High in protein', 'Rich in fiber')"],
  "risks": ["2-3 short health RISKS / cautions (e.g. 'High in saturated fat', 'High in added sugar', 'Salty')"],
  "calories": 123,
  "protein": 12.3,
  "carbs": 45,
  "fat": 8.5,
  "quantity": 250,
  "unit": "g",
  "serving": "human-readable serving e.g. '1 bowl (250g)' or '1 bottle (500ml)'",
  "portionConfidence": "low | medium | high",
  "portionBasis": "short reason for the weight estimate (<=6 words), e.g. 'standard dinner plate', '250ml glass', 'two visible pieces'"
}

Rules:
- "unit" MUST be exactly "g" for solids or "ml" for liquids. No other unit.
- PORTION WEIGHT IS CRITICAL — every macro is derived from it. Estimate the TOTAL grams/ml as accurately as you can using visible REFERENCE CUES: plate / bowl / cup / glass size, a fork / spoon / hand for scale, food height and how much of the container it fills. Prefer a realistic SPECIFIC number (e.g. 180, 310) over round defaults like 100 or 250 unless the portion truly is that.
- "calories", "protein", "carbs", "fat" MUST correspond to that exact "quantity" (the whole visible portion) — NOT per 100 g.
- "portionConfidence": "high" if the reference cues are clear, "medium" if only partly visible, "low" if you had to guess.
- "portionBasis": the main visual cue you used for the weight (<=6 words).
- "qualities" and "risks" are ARRAYS of 2-3 SHORT strings each (max ~5 words). Always give at least one of each.
- Output ONLY the JSON. No markdown, no code fences, no commentary.

${langInstr}`;

      const t0 = Date.now();
      // Appel d'un tier de vision (backend = modèle serveur vocab ouvert ; ai = Gemini).
      const callVision = async (src: 'backend' | 'ai'): Promise<string> => {
        if (src === 'backend') {
          colorLog('GREEN', '[API→Backend] /ml/vision REQUEST (modèle serveur, vocabulaire ouvert)', { lang: language, approxKB, promptChars: prompt.length });
          return await aiVisionLocal(prompt, b64, 'image/jpeg');
        }
        colorLog('GREEN', '[API→Gemini] vision REQUEST', { model: modelName, lang: language, approxKB, promptChars: prompt.length });
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent([prompt, { inlineData: { data: b64, mimeType: 'image/jpeg' } }]);
        return (await result.response).text();
      };
      // Parse ROBUSTE : certains modèles entourent le JSON de prose → on extrait le 1er objet.
      const parseVision = (raw: string) => {
        const tt = raw.replace(/```json/g, '').replace(/```/g, '').trim();
        const m = tt.match(/\{[\s\S]*\}/);
        return JSON.parse(m ? m[0] : tt);
      };
      // GARDE-FOU CASCADE : une réponse "lisible mais vague" (nom générique, pas de macros)
      // ne doit PAS être acceptée — on bascule alors sur Gemini (bien plus précis) pour ne
      // pas afficher un faux résultat (ex : un plat MENA non reconnu par le tier backend).
      const isWeakResult = (d: any): boolean => {
        if (!d) return true;
        const name = String(d?.name || '').trim().toLowerCase();
        if (!name || name.length < 3) return true;
        const generic = ['food', 'dish', 'meal', 'plate', 'snack', 'aliment', 'plat', 'repas', 'nourriture', 'unknown', 'inconnu', 'unidentified', 'طعام', 'وجبة', 'أكل', 'غير معروف'];
        if (generic.some((g) => name === g || name === g + 's' || name.includes(g))) return true;
        const kcal = Number(d?.calories) || 0;
        if (kcal <= 0) return true; // pas de macros fiables → on ne fait pas confiance
        return false;
      };
      let data: any;
      try {
        const raw = await callVision(cloudSource);
        colorLog('BLUE', '[API←Vision] returned', { ms: Date.now() - t0, source: cloudSource, chars: raw.length, preview: raw.slice(0, 200) });
        data = parseVision(raw);
        // Cascade auto : si le backend répond mais reste vague/générique → Gemini (précision).
        if (forceModel === '' && cloudSource === 'backend' && isWeakResult(data)) {
          colorLog('YELLOW', '[Cascade] backend vague/générique → Gemini (garde-fou précision)', { name: data?.name, kcal: data?.calories });
          explain('Garde-fou : réponse backend trop générique → Gemini (dernier recours)');
          // RÉSILIENCE : si Gemini est indisponible (clé invalide → 500, timeout…), on GARDE le
          // résultat backend au lieu d'échouer durement. Cas typique : café noir peu reconnu.
          const backendData = data;
          try {
            setSource('ai');
            const rawG = await callVision('ai');
            colorLog('BLUE', '[API←Vision] returned (Gemini garde-fou)', { ms: Date.now() - t0, chars: rawG.length });
            data = parseVision(rawG);
          } catch (gErr) {
            colorLog('YELLOW', '[Cascade] Gemini indisponible → repli sur le résultat backend', { error: String((gErr as Error).message).slice(0, 120) });
            explain('Gemini indisponible → on garde le résultat backend (pas d\'échec dur)');
            setSource('backend');
            data = backendData;
          }
        }
      } catch (visErr) {
        // CASCADE auto UNIQUEMENT (forceModel '') : backend KO/illisible → Gemini, dernier recours.
        if (forceModel === '' && cloudSource === 'backend') {
          colorLog('YELLOW', '[Cascade] backend échoué/illisible → Gemini (dernier recours)', { error: String((visErr as Error).message).slice(0, 120) });
          explain('Cascade : on-device peu sûr → backend KO → Gemini (dernier recours)');
          setSource('ai');
          const raw2 = await callVision('ai');
          colorLog('BLUE', '[API←Vision] returned (Gemini fallback)', { ms: Date.now() - t0, chars: raw2.length });
          data = parseVision(raw2);
        } else {
          colorLog('RED', '[API←Vision] FAILED', { ms: Date.now() - t0, source: cloudSource, error: String((visErr as Error).message) });
          throw visErr;
        }
      }

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
      // Confiance + base de l'estimation de portion (nouveaux champs) — défaut prudent.
      data.portionConfidence = ['low', 'medium', 'high'].includes(String(data.portionConfidence || '').toLowerCase())
        ? String(data.portionConfidence).toLowerCase() : 'low';
      data.portionBasis = typeof data.portionBasis === 'string' ? data.portionBasis.trim().slice(0, 60) : '';
      // Note santé ON-DEVICE à partir des macros/100g (déterministe, hors-ligne).
      const p100ai = per100(data);
      data.health = computeHealthScore(p100ai);
      // Qualités / risques : ceux de Gemini si présents, sinon repli heuristique on-device.
      const heur = heuristicQualRisk(p100ai, language);
      data.qualities = toList(data.qualities); if (!data.qualities.length) data.qualities = heur.qualities;
      data.risks = toList(data.risks); if (!data.risks.length) data.risks = heur.risks;

      // BACKEND (llava/llama) répond souvent en anglais → on traduit dans la langue
      // de l'app. Gemini localise déjà → on ne traduit pas (évite tout re-mangling).
      if (cloudSource === 'backend' && language !== 'en') {
        await localizeFields(data, language as any);
      }

      explain('JSON parse + normalisation OK — macros + description + note santé + qualités/risques');
      colorLog('CYAN', '[ScanAnalysis] macros detectees', {
        name: data.name,
        qty: `${data.quantity} ${data.unit}`,
        kcal: data.calories,
        descChars: (data.description || '').length,
      });
      setAiResult(data);

      setCompletedSteps([1, 2]);
      setCurrentStep(2);

      // #199 — retour haptique de succès dès que le verdict cloud est prêt
      // (le tier on-device le fait déjà dans finishWith → parité entre les tiers).
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}

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

  // GROWTH #100 — carte de scan partageable : résumé texte (nom + kcal + verdict)
  // via l'API Share native. Purement additif — ne touche ni au scan ni au verdict.
  const handleShare = async () => {
    if (!aiResult) return;
    try {
      const kcal = Math.round(Number(aiResult.calories) || 0);
      const kcalLine = language === 'fr'
        ? `${kcal} kcal`
        : language === 'ar'
        ? `${kcal} سعرة`
        : `${kcal} kcal`;
      // Verdict lisible : note santé on-device si dispo, sinon verdict objectif.
      let verdictLine = '';
      if (aiResult.health) {
        const vTxt = (VERDICT_TXT[language] || VERDICT_TXT.en)[aiResult.health.verdict as keyof typeof VERDICT_TXT.en];
        verdictLine = `${aiResult.health.grade} · ${vTxt} (${aiResult.health.score}/100)`;
      } else if (objScore) {
        verdictLine = objScore.verdict === 'great'
          ? t('scan.objective_great')
          : objScore.verdict === 'ok'
          ? t('scan.objective_ok')
          : t('scan.objective_avoid');
      }
      const parts = [String(aiResult.name || ''), kcalLine];
      if (verdictLine) parts.push(verdictLine);
      const tag = language === 'fr' ? 'Scanné avec Salorie' : language === 'ar' ? 'تم المسح عبر Salorie' : 'Scanned with Salorie';
      const message = `${parts.join(' — ')}\n${tag}`;
      explain('user clique Partager — partage du résumé texte (nom + kcal + verdict) via Share natif');
      await Share.share({ message });
    } catch {}
  };

  const handleContinue = () => {
    if (!aiResult) return;
    // On replie qualités + risques DANS la description (visible à l'étape de log).
    const ql = QR_LABELS[language] || QR_LABELS.en;
    const parts: string[] = [];
    if (aiResult.description) parts.push(aiResult.description);
    if (aiResult.qualities?.length) parts.push(`✅ ${ql.qualities}: ${aiResult.qualities.join(' · ')}`);
    if (aiResult.risks?.length) parts.push(`⚠️ ${ql.risks}: ${aiResult.risks.join(' · ')}`);
    const fullDesc = parts.join('\n\n');

    explain('user clique Continue — navigation vers log-food-details avec macros + description (qualités/risques) + quantite');
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
        portionConfidence: String(aiResult.portionConfidence || ''),
        portionBasis: String(aiResult.portionBasis || ''),
        description: fullDesc,
        imageUri: displayUri,
        // active learning : prédiction on-device + tier -> capturés au SAVE avec le label final
        scanPredicted: scanPredicted ?? '',
        scanScore: String(scanScore),
        scanTier: source ?? '',
        // Note santé → persistée sur le repas loggé.
        ...(aiResult.health ? {
          healthGrade: aiResult.health.grade,
          healthScore: String(aiResult.health.score),
          healthVerdict: (VERDICT_TXT[language] || VERDICT_TXT.en)[aiResult.health.verdict as keyof typeof VERDICT_TXT.en],
          healthColor: aiResult.health.color,
        } : {}),
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

  if (!__gate.ok) return __gate.node;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showBrand showNotif={false} />

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: espaceBas }]} showsVerticalScrollIndicator={false}>
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
                      isActive && { backgroundColor: activeBg, borderColor: isDark ? Colors.dark.primary : Colors.light.primary },
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
                        <ActivityIndicator size="small" color={isDark ? Colors.dark.primary : Colors.light.primary} />
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
              style={[styles.resultCard, { backgroundColor: cardBg, borderColor: cardBorder }, verdictAnimStyle]}
            >
              <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8 }, isRTL && { flexDirection: 'row-reverse' }]}>
                <Text style={[styles.resultLabel, { color: textSecondary }]}>
                  {t('scan.detected_name')}
                </Text>
                {source && (() => {
                  const cfg = source === 'device'
                    ? { bg: '#EAF4EE', fg: '#2E8B57', label: language === 'fr' ? "Sur l'appareil" : language === 'ar' ? 'على الجهاز' : 'On-device' }
                    : source === 'backend'
                    ? { bg: 'rgba(99,102,241,0.12)', fg: '#6366F1', label: language === 'fr' ? 'Backend' : language === 'ar' ? 'الخادم' : 'Backend' }
                    : { bg: 'rgba(14,165,233,0.12)', fg: '#0EA5E9', label: language === 'fr' ? 'IA · Gemini' : language === 'ar' ? 'ذكاء · Gemini' : 'AI · Gemini' };
                  return (
                    <View style={{ backgroundColor: cfg.bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
                      <Text style={{ fontSize: 9, fontWeight: '800', color: cfg.fg, textTransform: 'uppercase', letterSpacing: 0.3 }}>{cfg.label}</Text>
                    </View>
                  );
                })()}
              </View>
              <Text style={[styles.resultName, { color: textPrimary, textAlign: isRTL ? 'right' : 'left' }]}>
                {aiResult.name}
              </Text>

              {/* Portion ajustable (grammes auto) — −/valeur/+, macros + verdict recalculés en direct */}
              {(() => {
                const baseQ = (baseScan?.quantity || Number(aiResult.quantity)) || 100;
                const step = Math.max(5, Math.round(baseQ * 0.1));
                const conf = String(aiResult.portionConfidence || 'low');
                const confCfg = conf === 'high'
                  ? { c: '#2E8B57', l: language === 'fr' ? 'confiance élevée' : language === 'ar' ? 'ثقة عالية' : 'high confidence' }
                  : conf === 'medium'
                  ? { c: '#D97706', l: language === 'fr' ? 'confiance moyenne' : language === 'ar' ? 'ثقة متوسطة' : 'medium confidence' }
                  : { c: '#DC2626', l: language === 'fr' ? 'à vérifier' : language === 'ar' ? 'يُنصح بالمراجعة' : 'please check' };
                return (
                  <View style={styles.portionBox}>
                    <View style={[styles.portionRow, isRTL && { flexDirection: 'row-reverse' }]}>
                      <TouchableOpacity onPress={() => adjustPortion(Number(aiResult.quantity) - step)} style={styles.stepBtn} activeOpacity={0.7}>
                        <Text style={styles.stepBtnTxt}>−</Text>
                      </TouchableOpacity>
                      <View style={styles.portionCenter}>
                        <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 6 }, isRTL && { flexDirection: 'row-reverse' }]}>
                          <Scale size={15} color={isDark ? Colors.dark.primary : Colors.light.primary} strokeWidth={2.5} />
                          <Text style={[styles.portionValue, { color: textPrimary }]}>≈ {aiResult.quantity} {aiResult.unit}</Text>
                        </View>
                        <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }, isRTL && { flexDirection: 'row-reverse' }]}>
                          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: confCfg.c }} />
                          <Text style={[styles.portionConf, { color: textMuted }]} numberOfLines={1}>
                            {confCfg.l}{aiResult.portionBasis ? ` · ${aiResult.portionBasis}` : ''}
                          </Text>
                        </View>
                      </View>
                      <TouchableOpacity onPress={() => adjustPortion(Number(aiResult.quantity) + step)} style={styles.stepBtn} activeOpacity={0.7}>
                        <Text style={styles.stepBtnTxt}>＋</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={[styles.portionHint, { color: textMuted, textAlign: isRTL ? 'right' : 'left' }]}>
                      {language === 'fr' ? 'Ajuste la portion → calories & verdict se recalculent.' : language === 'ar' ? 'عدّل الحصة ← يُعاد حساب السعرات والتقييم.' : 'Adjust the portion → calories & verdict recalculate.'}
                    </Text>
                  </View>
                );
              })()}

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

              {/* Note santé (calculée on-device) — grade A→E + verdict */}
              {aiResult.health && (
                <View style={[styles.healthBadge, { backgroundColor: aiResult.health.color + '1A', borderColor: aiResult.health.color }, isRTL && { flexDirection: 'row-reverse' }]}>
                  <View style={[styles.healthGrade, { backgroundColor: aiResult.health.color }]}>
                    <Text style={styles.healthGradeTxt}>{aiResult.health.grade}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.healthVerdict, { color: aiResult.health.color, textAlign: isRTL ? 'right' : 'left' }]}>
                      {(VERDICT_TXT[language] || VERDICT_TXT.en)[aiResult.health.verdict as keyof typeof VERDICT_TXT.en]}
                    </Text>
                    <Text style={[styles.healthSub, { color: textMuted, textAlign: isRTL ? 'right' : 'left' }]}>
                      {(QR_LABELS[language] || QR_LABELS.en).note} · {aiResult.health.score}/100{aiResult.health.approx ? ' ~' : ''} · {language === 'fr' ? "sur l'appareil" : language === 'ar' ? 'على الجهاز' : 'on-device'}
                    </Text>
                  </View>
                </View>
              )}

              {/* GROWTH #100 — bouton Partager : résumé texte (nom + kcal + verdict)
                  via l'API Share native. Placé près du verdict. */}
              <TouchableOpacity
                onPress={handleShare}
                style={[styles.shareBtn, { borderColor: cardBorder }, isRTL && { flexDirection: 'row-reverse' }]}
                activeOpacity={0.85}
              >
                <Share2 size={16} color={isDark ? Colors.dark.primary : Colors.light.primary} strokeWidth={2.5} />
                <Text style={[styles.shareBtnTxt, { color: isDark ? Colors.dark.primary : Colors.light.primary }]}>
                  {language === 'fr' ? 'Partager' : language === 'ar' ? 'مشاركة' : 'Share'}
                </Text>
              </TouchableOpacity>

              {/* Verdict objectif (calculé on-device via scoreFood, AUCUN appel IA) */}
              {objScore && (() => {
                const cfg = objScore.verdict === 'great'
                  ? { color: '#2E8B57', icon: '✅', title: t('scan.objective_great') }
                  : objScore.verdict === 'ok'
                  ? { color: '#D97706', icon: '⚠️', title: t('scan.objective_ok') }
                  : { color: '#DC2626', icon: '🚫', title: t('scan.objective_avoid') };
                return (
                  <View style={[styles.objCard, { backgroundColor: cfg.color + '1A', borderColor: cfg.color }]}>
                    <View style={[styles.objHead, isRTL && { flexDirection: 'row-reverse' }]}>
                      <Text style={styles.objIcon}>{cfg.icon}</Text>
                      <Text style={[styles.objTitle, { color: cfg.color, textAlign: isRTL ? 'right' : 'left' }]}>
                        {cfg.title}
                      </Text>
                    </View>
                    {objScore.reasons?.length ? (
                      <View style={styles.objReasons}>
                        {objScore.reasons.map((reason: string, i: number) => (
                          <Text
                            key={'obj' + i}
                            style={[styles.objReason, { color: textPrimary, textAlign: isRTL ? 'right' : 'left' }]}
                          >
                            • {reason}
                          </Text>
                        ))}
                      </View>
                    ) : null}
                  </View>
                );
              })()}

              {/* #93 — Contexte budget calorique du jour : dérivé de goals/consumed
                  (hook useNutritionData, déjà en scope) vs kcal de l'aliment scanné.
                  AUCUN appel réseau ; s'affiche dès qu'une cible calorique existe. */}
              {(() => {
                const target = Number(goals?.calories) || 0;
                if (target <= 0) return null;
                const eaten = Number(consumed?.calories) || 0;
                const remaining = Math.max(0, Math.round(target - eaten));
                const foodKcal = Math.round(Number(aiResult?.calories) || 0);
                const fits = foodKcal <= remaining;
                const color = fits ? '#2E8B57' : '#DC2626';
                const verdictTxt = fits
                  ? (language === 'fr' ? 'ça rentre' : language === 'ar' ? 'يدخل ضمن هدفك' : 'it fits')
                  : (language === 'fr' ? 'ça dépasse' : language === 'ar' ? 'يتجاوز هدفك' : 'over budget');
                const lead = language === 'fr'
                  ? `Il te reste ${remaining} kcal aujourd'hui`
                  : language === 'ar'
                  ? `تبقّى لك ${remaining} سعرة اليوم`
                  : `You have ${remaining} kcal left today`;
                return (
                  <View style={[styles.budgetLine, { backgroundColor: color + '14', borderColor: color + '55' }, isRTL && { flexDirection: 'row-reverse' }]}>
                    <Text style={styles.budgetIcon}>{fits ? '👍' : '⚠️'}</Text>
                    <Text style={[styles.budgetText, { color: textPrimary, textAlign: isRTL ? 'right' : 'left' }]}>
                      {lead} — <Text style={{ color, fontWeight: '800' }}>{verdictTxt}</Text>
                    </Text>
                  </View>
                );
              })()}

              {/* Correction utilisateur → active-learning (POST /ml/feedback) */}
              {!correctDone ? (
                correcting ? (
                  <View style={[styles.correctBox, isRTL && { flexDirection: 'row-reverse' }]}>
                    <TextInput
                      value={correctText}
                      onChangeText={setCorrectText}
                      placeholder={language === 'fr' ? 'Nom correct…' : language === 'ar' ? 'الاسم الصحيح…' : 'Correct name…'}
                      placeholderTextColor={textMuted}
                      style={[styles.correctInput, { color: textPrimary, borderColor: cardBorder, textAlign: isRTL ? 'right' : 'left' }]}
                    />
                    <TouchableOpacity onPress={submitCorrection} disabled={correctSending || !correctText.trim()} style={[styles.correctSend, { opacity: correctSending || !correctText.trim() ? 0.5 : 1 }]}>
                      <Text style={styles.correctSendTxt}>{correctSending ? '…' : (language === 'fr' ? 'Envoyer' : language === 'ar' ? 'إرسال' : 'Send')}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => setCorrecting(true)} style={styles.correctLink}>
                    <Text style={[styles.correctLinkTxt, { color: textMuted }]}>
                      {language === 'fr' ? '❌ Pas ça ? Corriger' : language === 'ar' ? '❌ ليس هذا؟ صحّح' : '❌ Not it? Correct it'}
                    </Text>
                  </TouchableOpacity>
                )
              ) : (
                <Text style={[styles.correctDoneTxt, { color: '#2E8B57' }]}>
                  {language === 'fr' ? '✓ Merci, ça améliorera la reco !' : language === 'ar' ? '✓ شكرًا، سيحسّن هذا التعرّف!' : '✓ Thanks, this improves recognition!'}
                </Text>
              )}
              {correctError ? (
                <Text style={[styles.correctDoneTxt, { color: '#DC2626' }]}>{correctError}</Text>
              ) : null}

              {/* Qualités (vert) & Risques (ambre) */}
              {(aiResult.qualities?.length || aiResult.risks?.length) ? (
                <View style={styles.qrWrap}>
                  {aiResult.qualities?.length ? (
                    <View style={styles.qrBlock}>
                      <View style={[styles.qrHead, isRTL && { flexDirection: 'row-reverse' }]}>
                        <CheckCircle2 size={14} color="#2E8B57" strokeWidth={2.5} />
                        <Text style={[styles.qrTitle, { color: '#2E8B57' }]}>{(QR_LABELS[language] || QR_LABELS.en).qualities}</Text>
                      </View>
                      {aiResult.qualities.map((q: string, i: number) => (
                        <Text key={'q' + i} style={[styles.qrItem, { color: textPrimary, textAlign: isRTL ? 'right' : 'left' }]}>• {q}</Text>
                      ))}
                    </View>
                  ) : null}
                  {aiResult.risks?.length ? (
                    <View style={styles.qrBlock}>
                      <View style={[styles.qrHead, isRTL && { flexDirection: 'row-reverse' }]}>
                        <AlertTriangle size={14} color="#D97706" strokeWidth={2.5} />
                        <Text style={[styles.qrTitle, { color: '#D97706' }]}>{(QR_LABELS[language] || QR_LABELS.en).risks}</Text>
                      </View>
                      {aiResult.risks.map((r: string, i: number) => (
                        <Text key={'r' + i} style={[styles.qrItem, { color: textPrimary, textAlign: isRTL ? 'right' : 'left' }]}>• {r}</Text>
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}

              {/* Macros grid */}
              <View style={styles.macrosGrid}>
                <MacroTile
                  icon={<Flame size={18} color={isDark ? Colors.dark.primary : Colors.light.primary} />}
                  label={t('scan.calories_short')}
                  value={macroTexte(aiResult.calories)}
                  unit="kcal"
                  tileBg={isDark ? '#1F2833' : Colors.light.white}
                  border={cardBorder}
                  textPrimary={textPrimary}
                  textMuted={textMuted}
                />
                <MacroTile
                  icon={<Beef size={18} color="#FF5C5C" />}
                  label={t('scan.protein_short')}
                  value={macroTexte(aiResult.protein)}
                  unit="g"
                  tileBg={isDark ? '#1F2833' : Colors.light.white}
                  border={cardBorder}
                  textPrimary={textPrimary}
                  textMuted={textMuted}
                />
                <MacroTile
                  icon={<Wheat size={18} color="#F59E0B" />}
                  label={t('scan.carbs_short')}
                  value={macroTexte(aiResult.carbs)}
                  unit="g"
                  tileBg={isDark ? '#1F2833' : Colors.light.white}
                  border={cardBorder}
                  textPrimary={textPrimary}
                  textMuted={textMuted}
                />
                <MacroTile
                  icon={<Droplets size={18} color="#0EA5E9" />}
                  label={t('scan.fat_short')}
                  value={macroTexte(aiResult.fat)}
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
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  const styles = useMemo(() => makeStyles(isDark), [isDark]);
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
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  const styles = useMemo(() => makeStyles(isDark), [isDark]);
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

// Fabrique thémée : un StyleSheet est évalué au chargement du module, où `isDark`
// n'existe pas. Le composant l'appelle via useMemo, recalculé au changement de thème.
const makeStyles = (isDark: boolean) => StyleSheet.create({
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
    shadowColor: isDark ? 'transparent' : Colors.light.primary,
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
  // Portion ajustable (grammes auto)
  portionBox: {
    marginTop: 6, marginBottom: 6, padding: 10,
    borderRadius: 16, borderWidth: 1, borderColor: 'rgba(46,139,87,0.25)',
    backgroundColor: 'rgba(46,139,87,0.06)',
  },
  portionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  portionCenter: { flex: 1, alignItems: 'center' },
  portionValue: { fontSize: 20, fontWeight: '900', letterSpacing: -0.4 },
  portionConf: { fontSize: 11.5, fontWeight: '600' },
  portionHint: { fontSize: 11, fontWeight: '600', marginTop: 8, opacity: 0.9 },
  stepBtn: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#2E8B57',
  },
  stepBtnTxt: { color: '#fff', fontSize: 24, fontWeight: '900', lineHeight: 26 },
  descBlock: { gap: 6, marginTop: 4 },
  descHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  descLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  descText: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  healthBadge: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1.5, padding: 12, marginTop: 4 },
  healthGrade: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  healthGradeTxt: { color: '#fff', fontSize: 22, fontWeight: '900' },
  healthVerdict: { fontSize: 16, fontWeight: '800' },
  healthSub: { fontSize: 11, fontWeight: '600', marginTop: 1 },
  objCard: { borderRadius: 16, borderWidth: 1.5, padding: 12, gap: 6, marginTop: 4 },
  objHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  objIcon: { fontSize: 18 },
  objTitle: { flex: 1, fontSize: 15, fontWeight: '800' },
  objReasons: { gap: 2 },
  objReason: { fontSize: 12.5, lineHeight: 17, fontWeight: '500' },
  budgetLine: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, marginTop: 4 },
  shareBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, borderWidth: 1.5, paddingVertical: 10, marginTop: 4 },
  shareBtnTxt: { fontSize: 14, fontWeight: '800' },
  budgetIcon: { fontSize: 16 },
  budgetText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  correctLink: { alignSelf: 'center', paddingVertical: 8, marginTop: 6 },
  correctLinkTxt: { fontSize: 12.5, fontWeight: '600', textDecorationLine: 'underline' },
  correctBox: { flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' },
  correctInput: { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14 },
  correctSend: { backgroundColor: '#2E8B57', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  correctSendTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
  correctDoneTxt: { fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: 8 },
  qrWrap: { flexDirection: 'row', gap: 12, marginTop: 4 },
  qrBlock: { flex: 1, gap: 3 },
  qrHead: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 },
  qrTitle: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  qrItem: { fontSize: 12.5, lineHeight: 17, fontWeight: '500' },
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
    shadowColor: isDark ? 'transparent' : Colors.light.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  disabledBtn: {
    backgroundColor: isDark ? Colors.dark.gray[200] : Colors.light.gray[200],
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
