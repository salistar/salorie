// Photo du frigo → recettes (Gemini Vision). Identifie les ingrédients + propose des recettes.
import React, { useState, useMemo } from 'react';
import { useTokens, type Tokens } from '../../constants/tokens';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { router } from 'expo-router';
import { Camera, Image as ImageIcon, Refrigerator, Sparkles } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import PhotoStrip from '../../components/PhotoStrip';
import { PrimaryButton } from '../../components/ui/Button';
import { aiVision } from '../../lib/aiProxy';
import { analyzeImageUri } from '../../lib/imageAI';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { rowDir, flipForRTL } from '../../lib/rtl';
import { spacing } from '../../constants/theme';
import { useScreenGate } from '../../components/FeatureGate';

const PROMPTS: any = {
  en: "Here is a photo of a fridge or pantry. 1) List the food ingredients you see (short bullets). 2) Suggest 3 simple recipes that can be made with these ingredients, each with a name and an estimate of calories per serving. Answer in English, concise, clear format.",
  fr: "Voici une photo d'un frigo ou d'un placard. 1) Liste les ingrédients alimentaires que tu vois (puces courtes). 2) Propose 3 recettes simples réalisables avec ces ingrédients, chacune avec un nom et une estimation de calories par portion. Réponds en français, concis, format clair.",
  ar: "هذه صورة لثلاجة أو خزانة. 1) اذكر المكونات الغذائية التي تراها (نقاط قصيرة). 2) اقترح 3 وصفات بسيطة يمكن تحضيرها بهذه المكونات، لكل منها اسم وتقدير للسعرات الحرارية لكل حصة. أجب بالعربية، بإيجاز وبتنسيق واضح.",
};

const TXT: any = {
  en: { title: 'Fridge → recipes', sub: 'Snap your fridge/pantry — AI identifies the ingredients and suggests recipes.', camera: 'Camera', gallery: 'Gallery', analyzing: 'Analyzing the photo…', hint: '📸 Tip: open the fridge door, good lighting, ingredients visible.', failPrefix: 'Analysis failed', failSuffix: 'Try again with a clearer photo.', error: 'error', toMealPlan: 'Generate a meal plan' },
  fr: { title: 'Frigo → recettes', sub: "Photographie ton frigo/placard — l'IA identifie les ingrédients et propose des recettes.", camera: 'Caméra', gallery: 'Galerie', analyzing: 'Analyse de la photo…', hint: '📸 Astuce : ouvre la porte du frigo, bonne lumière, ingrédients visibles.', failPrefix: 'Analyse impossible', failSuffix: 'Réessaie avec une photo plus claire.', error: 'erreur', toMealPlan: 'Générer un plan repas' },
  ar: { title: 'الثلاجة ← وصفات', sub: 'صوّر ثلاجتك أو خزانتك — يتعرف الذكاء الاصطناعي على المكونات ويقترح وصفات.', camera: 'الكاميرا', gallery: 'المعرض', analyzing: 'جارٍ تحليل الصورة…', hint: '📸 نصيحة: افتح باب الثلاجة، إضاءة جيدة، مكونات ظاهرة.', failPrefix: 'تعذر التحليل', failSuffix: 'حاول مجدداً بصورة أوضح.', error: 'خطأ', toMealPlan: 'أنشئ خطة وجبات' },
};

export default function FridgeRecipesScreen() {
  const k = useTokens();
  const styles = useMemo(() => makeStyles(k), [k]);
  const { resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';
  const tok = useTokens();
  const bg = tok.bg;
  const card = tok.surface;
  const text = tok.text;
  const sub = tok.textMuted;
  // L'accent vient du theme : le couple clair/sombre fige
  // n'ouvrait que deux des six palettes.
  const accent = k.accent;
  const align: any = { textAlign: isRTL ? 'right' : 'left' };

  const __gate = useScreenGate('fridge-recipes');

  const [uri, setUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');

  const run = async (fromCamera: boolean) => {
    try {
      const res = fromCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.4, base64: true })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.4, base64: true });
      if (res.canceled || !res.assets?.[0]?.uri) return;
      setUri(res.assets[0].uri);
      // VITESSE : resize 1000px q0.6 avant upload (factorisé dans lib/imageAI).
      setResult('');
      setLoading(true);
      const text = await analyzeImageUri(PROMPTS[language] || PROMPTS.en, res.assets[0].uri, { maxWidth: 1000, compress: 0.6 });
      setResult(text.trim());
    } catch (e: any) {
      setResult(`${t.failPrefix} (${e?.message || t.error}). ${t.failSuffix}`);
    } finally { setLoading(false); }
  };

  if (!__gate.ok) return __gate.node;

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={[styles.head, { flexDirection: rowDir(isRTL) }]}><Refrigerator size={24} color={accent} style={flipForRTL(isRTL)} /><Text style={[styles.title, { color: text }, align]}>{t.title}</Text></View>
        <Text style={[styles.sub, { color: sub }, align]}>{t.sub}</Text>
        <PhotoStrip category="food" />

        <View style={[styles.btnRow, { flexDirection: rowDir(isRTL) }]}>
          <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={() => run(true)} disabled={loading}>
            <Camera size={20} color={k.onAccent} /><Text style={styles.btnPrimaryTxt}>{t.camera}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnGhost, isDark && { backgroundColor: '#1e3a2f' }]} onPress={() => run(false)} disabled={loading}>
            <ImageIcon size={20} color={accent} /><Text style={[styles.btnGhostTxt, isDark && { color: accent }]}>{t.gallery}</Text>
          </TouchableOpacity>
        </View>

        {uri && <Image source={{ uri }} style={styles.preview} resizeMode="cover" />}
        {loading && <View style={styles.center}><ActivityIndicator color={accent} /><Text style={[styles.loadingTxt, { color: sub }]}>{t.analyzing}</Text></View>}
        {!!result && <View style={[styles.resultCard, { backgroundColor: card, borderWidth: 1, borderColor: isDark ? k.border : 'transparent' }, isDark && { shadowOpacity: 0, elevation: 0 }]}><Text style={[styles.resultTxt, { color: k.text }, align]}>{result}</Text></View>}
        {/* FEATURE #103 : passe le résultat (ingrédients + recettes) au générateur de plan repas
            via le champ « ingrédients dispo » existant. Tronqué pour rester un param URL raisonnable. */}
        {!!result && !loading && (
          <View style={styles.mealPlanBtn}>
            <PrimaryButton
              title={t.toMealPlan}
              icon={<Sparkles size={18} color={k.onAccent} />}
              onPress={() => router.push({ pathname: '/ai-meal-plan', params: { ingredients: result.slice(0, 1500) } } as any)}
            />
          </View>
        )}
        {!uri && !loading && <Text style={[styles.hint, { color: sub }]}>{t.hint}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

// Fabrique thémée : ce StyleSheet lisait des jetons alors qu'il était
// évalué UNE FOIS à l'importation, avant que le thème n'existe. Les
// couleurs y étaient donc figées sur la palette par défaut, à vie.
const makeStyles = (k: Tokens) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: k.surfaceSunken },
  body: { padding: 20, paddingBottom: 100 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  title: { fontSize: 26, fontWeight: '900', color: k.text, letterSpacing: -0.5 },
  sub: { fontSize: 14, color: k.textMuted, lineHeight: 20, marginBottom: 20 },
  btnRow: { flexDirection: 'row', gap: 12, marginBottom: 18 },
  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: spacing.lg, minHeight: 52, borderRadius: 16 },
  btnPrimary: { backgroundColor: k.accent },
  btnPrimaryTxt: { color: k.onAccent, fontWeight: '800', fontSize: 15 },
  btnGhost: { backgroundColor: k.accentSoft },
  btnGhostTxt: { color: k.accent, fontWeight: '800', fontSize: 15 },
  preview: { width: '100%', height: 200, borderRadius: 18, marginBottom: 16 },
  center: { alignItems: 'center', paddingVertical: 24 },
  loadingTxt: { color: k.textMuted, marginTop: 10, fontWeight: '600' },
  resultCard: { backgroundColor: k.surface, borderRadius: 18, padding: 18, shadowColor: k.shadow, shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  resultTxt: { fontSize: 14.5, color: k.text, lineHeight: 22 },
  hint: { fontSize: 13, color: k.textFaint, textAlign: 'center', marginTop: 24, lineHeight: 18 },
  mealPlanBtn: { marginTop: 14 },
});
