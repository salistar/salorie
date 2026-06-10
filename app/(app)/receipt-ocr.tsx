// OCR ticket de caisse — photo → texte (MLKit, on-device) → aliments extraits (IA).
import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Image as ImageIcon, Receipt } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { aiGenerate } from '../../lib/aiProxy';

const GREEN = '#2E8B57';

export default function ReceiptOcrScreen() {
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
      if (!raw.trim()) { setResult('Aucun texte détecté. Réessaie avec une photo plus nette.'); return; }
      const text = await aiGenerate(`Voici le texte OCR d'un ticket de caisse :\n${raw}\n\nExtrais uniquement les PRODUITS ALIMENTAIRES (ignore le total, la TVA, l'enseigne). Pour chacun : nom + prix si visible. Liste à puces, en français. Termine par une estimation du nombre d'aliments.`);
      setResult(text.trim());
    } catch (e: any) { setResult(`Lecture impossible (${e?.message || 'erreur'}).`); } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.head}><Receipt size={24} color={GREEN} /><Text style={styles.title}>Ticket de caisse</Text></View>
        <Text style={styles.sub}>Photographie ton ticket → les aliments achetés, extraits automatiquement (OCR on-device).</Text>
        <View style={styles.btnRow}>
          <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={() => run(true)} disabled={loading}><Camera size={20} color="#fff" /><Text style={styles.btnPrimaryTxt}>Photo</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => run(false)} disabled={loading}><ImageIcon size={20} color={GREEN} /><Text style={styles.btnGhostTxt}>Galerie</Text></TouchableOpacity>
        </View>
        {uri && <Image source={{ uri }} style={styles.preview} resizeMode="cover" />}
        {loading && <View style={styles.center}><ActivityIndicator color={GREEN} /><Text style={styles.loadingTxt}>OCR + extraction…</Text></View>}
        {!!result && <View style={styles.card}><Text style={styles.cardTxt}>{result}</Text></View>}
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
