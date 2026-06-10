// Mode resto — photo du menu → meilleur choix selon ton objectif (Gemini Vision).
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Image as ImageIcon, UtensilsCrossed } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { aiVision } from '../../lib/aiProxy';
import { getUserFromFirestore } from '../../lib/firebase';

const GREEN = '#2E8B57';

export default function RestaurantModeScreen() {
  const { user } = useUser();
  const [goal, setGoal] = useState('maintain');
  const [uri, setUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');

  useEffect(() => { (async () => { try { const e = user?.primaryEmailAddress?.emailAddress; if (e) { const p: any = await getUserFromFirestore(e, user?.id); if (p?.goal) setGoal(p.goal); } } catch {} })(); }, []);

  const run = async (cam: boolean) => {
    try {
      const res = cam ? await ImagePicker.launchCameraAsync({ quality: 0.4, base64: true }) : await ImagePicker.launchImageLibraryAsync({ quality: 0.4, base64: true });
      if (res.canceled || !res.assets?.[0]?.base64) return;
      setUri(res.assets[0].uri); setResult(''); setLoading(true);
      const goalTxt = goal === 'lose' ? 'perdre du poids' : goal === 'gain' ? 'prendre du muscle' : 'maintenir mon poids';
      const text = await aiVision(`Voici la photo d'un menu de restaurant. Mon objectif : ${goalTxt}. Recommande les 2-3 MEILLEURS plats du menu pour cet objectif (nom exact du menu + pourquoi, + estimation calories). Puis cite 1 plat à éviter. Réponds en français, concis.`, res.assets[0].base64, 'image/jpeg');
      setResult(text.trim());
    } catch (e: any) { setResult(`Analyse impossible (${e?.message || 'erreur'}).`); } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.head}><UtensilsCrossed size={24} color={GREEN} /><Text style={styles.title}>Mode resto</Text></View>
        <Text style={styles.sub}>Photographie le menu → les meilleurs choix selon ton objectif ({goal}).</Text>
        <View style={styles.btnRow}>
          <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={() => run(true)} disabled={loading}><Camera size={20} color="#fff" /><Text style={styles.btnPrimaryTxt}>Photo du menu</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => run(false)} disabled={loading}><ImageIcon size={20} color={GREEN} /><Text style={styles.btnGhostTxt}>Galerie</Text></TouchableOpacity>
        </View>
        {uri && <Image source={{ uri }} style={styles.preview} resizeMode="cover" />}
        {loading && <View style={styles.center}><ActivityIndicator color={GREEN} /><Text style={styles.loadingTxt}>Lecture du menu…</Text></View>}
        {!!result && <View style={styles.card}><Text style={styles.cardTxt}>{result}</Text></View>}
        {!uri && !loading && <Text style={styles.hint}>🍽️ Astuce : cadre bien le menu, texte lisible.</Text>}
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
  hint: { fontSize: 13, color: '#94A3B8', textAlign: 'center', marginTop: 24 },
});
