// Microbiote — questionnaire santé intestinale → recommandations IA. Analyse labo = à venir.
import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Activity, Sparkles } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { aiGenerate } from '../../lib/aiProxy';

const GREEN = '#2E8B57';
const Q = [
  { k: 'transit', q: 'Ton transit', opts: ['Régulier', 'Irrégulier', 'Constipation', 'Diarrhée'] },
  { k: 'bloat', q: 'Ballonnements', opts: ['Jamais', 'Parfois', 'Souvent'] },
  { k: 'ferment', q: 'Aliments fermentés (yaourt, kéfir…)', opts: ['Jamais', 'Parfois', 'Quotidien'] },
  { k: 'fiber', q: 'Fibres (fruits, légumes, céréales)', opts: ['Peu', 'Moyen', 'Beaucoup'] },
  { k: 'stress', q: 'Niveau de stress', opts: ['Faible', 'Moyen', 'Élevé'] },
];

export default function MicrobiomeScreen() {
  const [ans, setAns] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [reco, setReco] = useState('');

  const analyze = async () => {
    setReco(''); setLoading(true);
    try {
      const profile = Q.map((x) => `${x.q}: ${ans[x.k] || 'NR'}`).join(' · ');
      const text = await aiGenerate(`Profil intestinal d'un utilisateur : ${profile}. Donne des recommandations personnalisées pour améliorer son microbiote (aliments à privilégier, habitudes, prébiotiques/probiotiques). Reste prudent (pas de diagnostic médical). Français, concis, format liste.`);
      setReco(text.trim());
    } catch (e: any) { setReco(`Analyse impossible (${e?.message || 'erreur'}).`); } finally { setLoading(false); }
  };

  const done = Object.keys(ans).length >= 3;

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.head}><Activity size={24} color={GREEN} /><Text style={styles.title}>Microbiote</Text></View>
        <Text style={styles.sub}>Questionnaire santé intestinale → reco personnalisées. (Analyse labo réelle à venir.)</Text>

        {Q.map((x) => (
          <View key={x.k} style={styles.qBlock}>
            <Text style={styles.qTxt}>{x.q}</Text>
            <View style={styles.opts}>
              {x.opts.map((o) => (
                <TouchableOpacity key={o} style={[styles.opt, ans[x.k] === o && styles.optActive]} onPress={() => setAns((a) => ({ ...a, [x.k]: o }))}>
                  <Text style={[styles.optTxt, ans[x.k] === o && { color: '#fff' }]}>{o}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        <TouchableOpacity style={[styles.btn, !done && { opacity: 0.5 }]} onPress={analyze} disabled={!done || loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <><Sparkles size={20} color="#fff" /><Text style={styles.btnTxt}>Obtenir mes recommandations</Text></>}
        </TouchableOpacity>

        {!!reco && <View style={styles.card}><Text style={styles.cardTxt}>{reco}</Text></View>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F7F9' },
  body: { padding: 20, paddingBottom: 100 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  title: { fontSize: 26, fontWeight: '900', color: '#0F172A', letterSpacing: -0.5 },
  sub: { fontSize: 14, color: '#64748B', marginBottom: 20, lineHeight: 20 },
  qBlock: { marginBottom: 16 },
  qTxt: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 10 },
  opts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  opt: { backgroundColor: '#fff', borderRadius: 12, paddingVertical: 9, paddingHorizontal: 14 },
  optActive: { backgroundColor: GREEN },
  optTxt: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: GREEN, borderRadius: 14, paddingVertical: 15, marginTop: 8 },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 18, marginTop: 18, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  cardTxt: { fontSize: 14.5, color: '#1F2937', lineHeight: 22 },
});
