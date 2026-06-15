// Mode resto — photo du menu → meilleur choix selon ton objectif (Gemini Vision).
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Camera, Image as ImageIcon, UtensilsCrossed } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import PhotoStrip from '../../components/PhotoStrip';
import { aiVision } from '../../lib/aiProxy';
import { getUserFromFirestore } from '../../lib/firebase';
import { useTranslation } from '../../lib/i18n';
import { useTheme } from '../../lib/ThemeContext';

const GREEN = '#2E8B57';

const TXT: any = {
  en: { title: 'Restaurant mode', sub: 'Snap the menu → the best picks for your goal', menu_photo: 'Menu photo', gallery: 'Gallery', loading: 'Reading the menu…', hint: '🍽️ Tip: frame the menu well, text readable.', fail: 'Analysis failed', error: 'error' },
  fr: { title: 'Mode resto', sub: 'Photographie le menu → les meilleurs choix selon ton objectif', menu_photo: 'Photo du menu', gallery: 'Galerie', loading: 'Lecture du menu…', hint: '🍽️ Astuce : cadre bien le menu, texte lisible.', fail: 'Analyse impossible', error: 'erreur' },
  ar: { title: 'وضع المطعم', sub: 'صوّر القائمة ← أفضل الاختيارات حسب هدفك', menu_photo: 'صورة القائمة', gallery: 'المعرض', loading: 'جارٍ قراءة القائمة…', hint: '🍽️ نصيحة: صوّر القائمة جيداً بنص واضح.', fail: 'تعذّر التحليل', error: 'خطأ' },
};

export default function RestaurantModeScreen() {
  const { user } = useUser();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  const bg = isDark ? '#0f172a' : '#F4F7F9';
  const card = isDark ? '#1e293b' : '#ffffff';
  const text = isDark ? '#f1f5f9' : '#0F172A';
  const sub = isDark ? '#94a3b8' : '#64748B';
  const cardTxtColor = isDark ? '#e2e8f0' : '#1F2937';
  const align: any = { textAlign: isRTL ? 'right' : 'left' };

  const [goal, setGoal] = useState('maintain');
  const [uri, setUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');

  useEffect(() => { (async () => { try { const e = user?.primaryEmailAddress?.emailAddress; if (e) { const p: any = await getUserFromFirestore(e, user?.id); if (p?.goal) setGoal(p.goal); } } catch {} })(); }, []);

  const run = async (cam: boolean) => {
    try {
      const res = cam ? await ImagePicker.launchCameraAsync({ quality: 0.4, base64: true }) : await ImagePicker.launchImageLibraryAsync({ quality: 0.4, base64: true });
      if (res.canceled || !res.assets?.[0]?.uri) return;
      setUri(res.assets[0].uri);
      // VITESSE : resize 1000px q0.6 avant upload (photo brute = 5-15 Mo -> ~200 Ko).
      const manip = await ImageManipulator.manipulateAsync(res.assets[0].uri, [{ resize: { width: 1000 } }], { base64: true, compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }); setResult(''); setLoading(true);
      const goalTxt = goal === 'lose' ? 'perdre du poids' : goal === 'gain' ? 'prendre du muscle' : 'maintenir mon poids';
      const aiTxt = await aiVision(`Voici la photo d'un menu de restaurant. Mon objectif : ${goalTxt}. Recommande les 2-3 MEILLEURS plats du menu pour cet objectif (nom exact du menu + pourquoi, + estimation calories). Puis cite 1 plat à éviter. Réponds en français, concis.`, manip.base64 as string, 'image/jpeg');
      setResult(aiTxt.trim());
    } catch (e: any) { setResult(`${t.fail} (${e?.message || t.error}).`); } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.head}><UtensilsCrossed size={24} color={GREEN} /><Text style={[styles.title, { color: text }]}>{t.title}</Text></View>
        <PhotoStrip category="food" />
        <Text style={[styles.sub, { color: sub }, align]}>{t.sub} ({goal}).</Text>
        <View style={styles.btnRow}>
          <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={() => run(true)} disabled={loading}><Camera size={20} color="#fff" /><Text style={styles.btnPrimaryTxt}>{t.menu_photo}</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => run(false)} disabled={loading}><ImageIcon size={20} color={GREEN} /><Text style={styles.btnGhostTxt}>{t.gallery}</Text></TouchableOpacity>
        </View>
        {uri && <Image source={{ uri }} style={styles.preview} resizeMode="cover" />}
        {loading && <View style={styles.center}><ActivityIndicator color={GREEN} /><Text style={[styles.loadingTxt, { color: sub }]}>{t.loading}</Text></View>}
        {!!result && <View style={[styles.card, { backgroundColor: card }]}><Text style={[styles.cardTxt, { color: cardTxtColor }, align]}>{result}</Text></View>}
        {!!result && (
          <Text style={[styles.source, { color: sub }, align]}>
            {language === 'fr'
              ? '⛅ Source : IA · Gemini — l’analyse de menu n’a pas de modèle on-device ; les autres scans privilégient on-device puis backend.'
              : language === 'ar'
                ? '⛅ المصدر: ذكاء · Gemini — تحليل القائمة لا يملك نموذجًا على الجهاز.'
                : '⛅ Source: AI · Gemini — menu analysis has no on-device model; other scans prefer on-device then backend.'}
          </Text>
        )}
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
  btnPrimary: { backgroundColor: GREEN }, btnPrimaryTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  btnGhost: { backgroundColor: '#EAF4EE' }, btnGhostTxt: { color: GREEN, fontWeight: '800', fontSize: 14 },
  preview: { width: '100%', height: 200, borderRadius: 18, marginBottom: 16 },
  center: { alignItems: 'center', paddingVertical: 24 }, loadingTxt: { color: '#64748B', marginTop: 10, fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 18, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  cardTxt: { fontSize: 14.5, color: '#1F2937', lineHeight: 22 },
  source: { fontSize: 11.5, fontWeight: '600', marginTop: 10, lineHeight: 17, fontStyle: 'italic' },
  hint: { fontSize: 13, color: '#94A3B8', textAlign: 'center', marginTop: 24 },
});
