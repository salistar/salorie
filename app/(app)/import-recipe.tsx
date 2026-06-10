// Import recette depuis une URL — récupère la page + extrait recette & nutrition (IA).
import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Link2, Download } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { aiGenerate } from '../../lib/aiProxy';

const GREEN = '#2E8B57';

export default function ImportRecipeScreen() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');

  const run = async () => {
    let u = url.trim();
    if (!u) return;
    if (!/^https?:\/\//.test(u)) u = 'https://' + u;
    setResult(''); setLoading(true);
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (Salorie)' }, signal: ctrl.signal });
      clearTimeout(to);
      let html = await res.text();
      // Nettoyage léger + troncature (les LLM gèrent bien le HTML brut tronqué).
      html = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').slice(0, 9000);
      const text = await aiGenerate(`Voici le HTML d'une page de recette. Extrais et renvoie en français, concis : 1) le NOM de la recette, 2) les INGRÉDIENTS (liste à puces), 3) les ÉTAPES (résumé court), 4) une ESTIMATION NUTRITIONNELLE par portion (calories, protéines, glucides, lipides). HTML:\n${html}`);
      setResult(text.trim());
    } catch (e: any) {
      setResult(`Import impossible (${e?.name === 'AbortError' ? 'délai dépassé' : e?.message || 'erreur'}). Vérifie l'URL ou réessaie.`);
    } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.head}><Link2 size={24} color={GREEN} /><Text style={styles.title}>Importer une recette</Text></View>
        <Text style={styles.sub}>Colle l'URL d'une recette (blog, site cuisine) → ingrédients + nutrition.</Text>

        <View style={styles.row}>
          <TextInput style={styles.input} placeholder="https://…" autoCapitalize="none" keyboardType="url" value={url} onChangeText={setUrl} onSubmitEditing={run} returnKeyType="go" />
        </View>
        <TouchableOpacity style={styles.btn} onPress={run} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <><Download size={20} color="#fff" /><Text style={styles.btnTxt}>Importer</Text></>}
        </TouchableOpacity>

        {loading && <Text style={styles.loadingTxt}>Récupération + analyse de la page…</Text>}
        {!!result && <View style={styles.card}><Text style={styles.cardTxt}>{result}</Text></View>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F7F9' },
  body: { padding: 20, paddingBottom: 100 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  title: { fontSize: 24, fontWeight: '900', color: '#0F172A', letterSpacing: -0.5 },
  sub: { fontSize: 14, color: '#64748B', marginBottom: 18, lineHeight: 20 },
  row: { marginBottom: 12 },
  input: { backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 15, fontSize: 15, color: '#0F172A' },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: GREEN, borderRadius: 14, paddingVertical: 15 },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  loadingTxt: { color: '#64748B', textAlign: 'center', marginTop: 16, fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 18, marginTop: 18, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  cardTxt: { fontSize: 14.5, color: '#1F2937', lineHeight: 22 },
});
