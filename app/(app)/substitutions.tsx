// Substitutions instantanées — remplace un aliment par une alternative plus saine (IA).
import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Replace, Search } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { aiGenerate } from '../../lib/aiProxy';

const GREEN = '#2E8B57';
const SUGGESTIONS = ['Soda', 'Chips', 'Pâtes blanches', 'Mayonnaise', 'Pain blanc', 'Crème dessert'];

export default function SubstitutionsScreen() {
  const [food, setFood] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');

  const ask = async (q: string) => {
    const item = q.trim();
    if (!item || loading) return;
    setFood(item); setResult(''); setLoading(true);
    try {
      const text = await aiGenerate(`Donne 3 alternatives plus saines et/ou moins caloriques à "${item}". Pour chaque alternative : le nom, pourquoi c'est mieux (1 phrase courte), et l'économie de calories approximative. Réponds en français, concis, format liste.`);
      setResult(text.trim());
    } catch (e: any) {
      setResult(`Suggestion impossible (${e?.message || 'erreur'}).`);
    } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.head}><Replace size={24} color={GREEN} /><Text style={styles.title}>Substitutions</Text></View>
        <Text style={styles.sub}>Tape un aliment → des alternatives plus saines, en direct.</Text>

        <View style={styles.searchRow}>
          <Search size={20} color="#94A3B8" />
          <TextInput style={styles.input} placeholder="Ex : Soda, chips, mayonnaise…" value={food} onChangeText={setFood} onSubmitEditing={() => ask(food)} returnKeyType="search" />
          <TouchableOpacity style={styles.go} onPress={() => ask(food)}><Text style={styles.goTxt}>OK</Text></TouchableOpacity>
        </View>

        <View style={styles.chips}>
          {SUGGESTIONS.map((s) => (
            <TouchableOpacity key={s} style={styles.chip} onPress={() => ask(s)}><Text style={styles.chipTxt}>{s}</Text></TouchableOpacity>
          ))}
        </View>

        {loading && <View style={styles.center}><ActivityIndicator color={GREEN} /><Text style={styles.loadingTxt}>Recherche d'alternatives…</Text></View>}
        {!!result && <View style={styles.resultCard}><Text style={styles.resultTxt}>{result}</Text></View>}
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
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 4, marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  input: { flex: 1, fontSize: 15, color: '#0F172A', paddingVertical: 12 },
  go: { backgroundColor: GREEN, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8 },
  goTxt: { color: '#fff', fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  chip: { backgroundColor: '#EAF4EE', borderRadius: 14, paddingVertical: 8, paddingHorizontal: 14 },
  chipTxt: { color: GREEN, fontWeight: '700', fontSize: 13 },
  center: { alignItems: 'center', paddingVertical: 24 },
  loadingTxt: { color: '#64748B', marginTop: 10, fontWeight: '600' },
  resultCard: { backgroundColor: '#fff', borderRadius: 18, padding: 18, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  resultTxt: { fontSize: 14.5, color: '#1F2937', lineHeight: 22 },
});
