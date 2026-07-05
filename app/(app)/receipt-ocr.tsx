// OCR ticket de caisse — photo → texte (MLKit, on-device) → aliments extraits (IA).
import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Image as ImageIcon, Receipt } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { aiGenerate } from '../../lib/aiProxy';
import { useTranslation } from '../../lib/i18n';
import { useTheme } from '../../lib/ThemeContext';

const GREEN = '#2E8B57';

const TXT: any = {
  en: { title: 'Receipt scan', sub: 'Snap your receipt → the food items you bought, extracted automatically (on-device OCR).', photo: 'Photo', gallery: 'Gallery', loading: 'OCR + extraction…', no_text: 'No text detected. Try again with a sharper photo.', fail: 'Could not read it', error: 'error' },
  fr: { title: 'Ticket de caisse', sub: 'Photographie ton ticket → les aliments achetés, extraits automatiquement (OCR on-device).', photo: 'Photo', gallery: 'Galerie', loading: 'OCR + extraction…', no_text: 'Aucun texte détecté. Réessaie avec une photo plus nette.', fail: 'Lecture impossible', error: 'erreur' },
  ar: { title: 'إيصال الشراء', sub: 'صوّر إيصالك ← الأطعمة المشتراة تُستخرج تلقائياً (OCR على الجهاز).', photo: 'صورة', gallery: 'المعرض', loading: 'قراءة واستخراج…', no_text: 'لم يتم اكتشاف نص. أعد المحاولة بصورة أوضح.', fail: 'تعذّرت القراءة', error: 'خطأ' },
};

export default function ReceiptOcrScreen() {
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

  const [uri, setUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');

  const run = async (cam: boolean) => {
    try {
      const res = cam ? await ImagePicker.launchCameraAsync({ quality: 0.6 }) : await ImagePicker.launchImageLibraryAsync({ quality: 0.6 });
      if (res.canceled || !res.assets?.[0]?.uri) return;
      setUri(res.assets[0].uri); setResult(''); setLoading(true);
      const TextRecognition = (await import('@react-native-ml-kit/text-recognition')).default;
      const ocr = await TextRecognition.recognize(res.assets[0].uri);
      const raw = (ocr?.text || '').slice(0, 4000);
      if (!raw.trim()) { setResult(t.no_text); return; }
      const aiTxt = await aiGenerate(`Voici le texte OCR d'un ticket de caisse :\n${raw}\n\nExtrais uniquement les PRODUITS ALIMENTAIRES (ignore le total, la TVA, l'enseigne). Pour chacun : nom + prix si visible. Liste à puces, en français. Termine par une estimation du nombre d'aliments.`);
      setResult(aiTxt.trim());
    } catch (e: any) { setResult(`${t.fail} (${e?.message || t.error}).`); } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.head}><Receipt size={24} color={GREEN} /><Text style={[styles.title, { color: text }]}>{t.title}</Text></View>
        <Text style={[styles.sub, { color: sub }, align]}>{t.sub}</Text>
        <View style={styles.btnRow}>
          <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={() => run(true)} disabled={loading}><Camera size={20} color="#fff" /><Text style={styles.btnPrimaryTxt}>{t.photo}</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => run(false)} disabled={loading}><ImageIcon size={20} color={GREEN} /><Text style={styles.btnGhostTxt}>{t.gallery}</Text></TouchableOpacity>
        </View>
        {uri && <Image source={{ uri }} style={styles.preview} resizeMode="cover" />}
        {loading && <View style={styles.center}><ActivityIndicator color={GREEN} /><Text style={[styles.loadingTxt, { color: sub }]}>{t.loading}</Text></View>}
        {!!result && <View style={[styles.card, { backgroundColor: card }]}><Text style={[styles.cardTxt, { color: cardTxtColor }, align]}>{result}</Text></View>}
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
  btnPrimary: { backgroundColor: GREEN }, btnPrimaryTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  btnGhost: { backgroundColor: '#EAF4EE' }, btnGhostTxt: { color: GREEN, fontWeight: '800', fontSize: 15 },
  preview: { width: '100%', height: 200, borderRadius: 18, marginBottom: 16 },
  center: { alignItems: 'center', paddingVertical: 24 }, loadingTxt: { color: '#64748B', marginTop: 10, fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 18, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  cardTxt: { fontSize: 14.5, color: '#1F2937', lineHeight: 22 },
});
