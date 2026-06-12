// Photo du frigo → recettes (Gemini Vision). Identifie les ingrédients + propose des recettes.
import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Camera, Image as ImageIcon, Refrigerator } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { aiVision } from '../../lib/aiProxy';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';

const GREEN = '#2E8B57';
const PROMPT = "Voici une photo d'un frigo ou d'un placard. 1) Liste les ingrédients alimentaires que tu vois (puces courtes). 2) Propose 3 recettes simples réalisables avec ces ingrédients, chacune avec un nom et une estimation de calories par portion. Réponds en français, concis, format clair.";

const TXT: any = {
  en: { title: 'Fridge → recipes', sub: 'Snap your fridge/pantry — AI identifies the ingredients and suggests recipes.', camera: 'Camera', gallery: 'Gallery', analyzing: 'Analyzing the photo…', hint: '📸 Tip: open the fridge door, good lighting, ingredients visible.', failPrefix: 'Analysis failed', failSuffix: 'Try again with a clearer photo.', error: 'error' },
  fr: { title: 'Frigo → recettes', sub: "Photographie ton frigo/placard — l'IA identifie les ingrédients et propose des recettes.", camera: 'Caméra', gallery: 'Galerie', analyzing: 'Analyse de la photo…', hint: '📸 Astuce : ouvre la porte du frigo, bonne lumière, ingrédients visibles.', failPrefix: 'Analyse impossible', failSuffix: 'Réessaie avec une photo plus claire.', error: 'erreur' },
  ar: { title: 'الثلاجة ← وصفات', sub: 'صوّر ثلاجتك أو خزانتك — يتعرف الذكاء الاصطناعي على المكونات ويقترح وصفات.', camera: 'الكاميرا', gallery: 'المعرض', analyzing: 'جارٍ تحليل الصورة…', hint: '📸 نصيحة: افتح باب الثلاجة، إضاءة جيدة، مكونات ظاهرة.', failPrefix: 'تعذر التحليل', failSuffix: 'حاول مجدداً بصورة أوضح.', error: 'خطأ' },
};

export default function FridgeRecipesScreen() {
  const { resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';
  const bg = isDark ? '#0f172a' : '#F4F7F9';
  const card = isDark ? '#1e293b' : '#ffffff';
  const text = isDark ? '#f1f5f9' : '#0F172A';
  const sub = isDark ? '#94a3b8' : '#64748B';
  const align: any = { textAlign: isRTL ? 'right' : 'left' };

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
      // VITESSE : resize 1000px q0.6 avant upload (photo brute = 5-15 Mo -> ~200 Ko).
      const manip = await ImageManipulator.manipulateAsync(res.assets[0].uri, [{ resize: { width: 1000 } }], { base64: true, compress: 0.6, format: ImageManipulator.SaveFormat.JPEG });
      setResult('');
      setLoading(true);
      const text = await aiVision(PROMPT, manip.base64 as string, 'image/jpeg');
      setResult(text.trim());
    } catch (e: any) {
      setResult(`${t.failPrefix} (${e?.message || t.error}). ${t.failSuffix}`);
    } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.head}><Refrigerator size={24} color={GREEN} /><Text style={[styles.title, { color: text }]}>{t.title}</Text></View>
        <Text style={[styles.sub, { color: sub }, align]}>{t.sub}</Text>

        <View style={styles.btnRow}>
          <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={() => run(true)} disabled={loading}>
            <Camera size={20} color="#fff" /><Text style={styles.btnPrimaryTxt}>{t.camera}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnGhost, isDark && { backgroundColor: '#1e3a2f' }]} onPress={() => run(false)} disabled={loading}>
            <ImageIcon size={20} color={GREEN} /><Text style={styles.btnGhostTxt}>{t.gallery}</Text>
          </TouchableOpacity>
        </View>

        {uri && <Image source={{ uri }} style={styles.preview} resizeMode="cover" />}
        {loading && <View style={styles.center}><ActivityIndicator color={GREEN} /><Text style={[styles.loadingTxt, { color: sub }]}>{t.analyzing}</Text></View>}
        {!!result && <View style={[styles.resultCard, { backgroundColor: card }]}><Text style={[styles.resultTxt, { color: isDark ? '#e2e8f0' : '#1F2937' }, align]}>{result}</Text></View>}
        {!uri && !loading && <Text style={[styles.hint, { color: sub }]}>{t.hint}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F7F9' },
  body: { padding: 20, paddingBottom: 100 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  title: { fontSize: 26, fontWeight: '900', color: '#0F172A', letterSpacing: -0.5 },
  sub: { fontSize: 14, color: '#64748B', lineHeight: 20, marginBottom: 20 },
  btnRow: { flexDirection: 'row', gap: 12, marginBottom: 18 },
  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, borderRadius: 16 },
  btnPrimary: { backgroundColor: GREEN },
  btnPrimaryTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  btnGhost: { backgroundColor: '#EAF4EE' },
  btnGhostTxt: { color: GREEN, fontWeight: '800', fontSize: 15 },
  preview: { width: '100%', height: 200, borderRadius: 18, marginBottom: 16 },
  center: { alignItems: 'center', paddingVertical: 24 },
  loadingTxt: { color: '#64748B', marginTop: 10, fontWeight: '600' },
  resultCard: { backgroundColor: '#fff', borderRadius: 18, padding: 18, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  resultTxt: { fontSize: 14.5, color: '#1F2937', lineHeight: 22 },
  hint: { fontSize: 13, color: '#94A3B8', textAlign: 'center', marginTop: 24, lineHeight: 18 },
});
