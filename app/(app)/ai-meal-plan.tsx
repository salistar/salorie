// Plan repas IA — génère un plan du jour selon objectif + budget + ingrédients dispo.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { Sparkles, ChefHat } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { aiGenerate } from '../../lib/aiProxy';
import { getUserFromFirestore } from '../../lib/firebase';

const GREEN = '#2E8B57';

export default function AiMealPlanScreen() {
  const { user } = useUser();
  const [goal, setGoal] = useState('maintain');
  const [cals, setCals] = useState(2000);
  const [budget, setBudget] = useState('');
  const [fridge, setFridge] = useState('');
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState('');

  useEffect(() => { (async () => { try { const e = user?.primaryEmailAddress?.emailAddress; if (e) { const p: any = await getUserFromFirestore(e, user?.id); if (p?.goal) setGoal(p.goal); if (p?.nutritionalPlan?.dailyCalories) setCals(Number(p.nutritionalPlan.dailyCalories)); } } catch {} })(); }, []);

  const run = async () => {
    setPlan(''); setLoading(true);
    try {
      const g = goal === 'lose' ? 'perte de poids' : goal === 'gain' ? 'prise de muscle' : 'maintien';
      const text = await aiGenerate(`Génère un plan de repas pour UNE journée. Objectif : ${g}, ~${cals} kcal/jour.${budget.trim() ? ` Budget max : ${budget}€.` : ''}${fridge.trim() ? ` Privilégie ces ingrédients dispo : ${fridge}.` : ''} Donne : petit-déjeuner, déjeuner, collation, dîner — chacun avec les aliments et une estimation calories. Total à la fin. Réponds en français, concis.`);
      setPlan(text.trim());
    } catch (e: any) { setPlan(`Génération impossible (${e?.message || 'erreur'}).`); } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.head}><Sparkles size={24} color={GREEN} /><Text style={styles.title}>Plan repas IA</Text></View>
        <Text style={styles.sub}>Objectif {goal} · ~{cals} kcal. Ajoute budget et ingrédients (optionnel).</Text>

        <Text style={styles.label}>Budget (€, optionnel)</Text>
        <TextInput style={styles.input} keyboardType="numeric" placeholder="ex. 8" value={budget} onChangeText={setBudget} />
        <Text style={styles.label}>Ingrédients dispo (optionnel)</Text>
        <TextInput style={[styles.input, { height: 70 }]} multiline placeholder="ex. poulet, riz, brocoli, œufs…" value={fridge} onChangeText={setFridge} />

        <TouchableOpacity style={styles.btn} onPress={run} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <><ChefHat size={20} color="#fff" /><Text style={styles.btnTxt}>Générer mon plan</Text></>}
        </TouchableOpacity>

        {loading && <Text style={styles.loadingTxt}>Génération du plan…</Text>}
        {!!plan && <View style={styles.card}><Text style={styles.cardTxt}>{plan}</Text></View>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F7F9' },
  body: { padding: 20, paddingBottom: 100 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  title: { fontSize: 26, fontWeight: '900', color: '#0F172A', letterSpacing: -0.5 },
  sub: { fontSize: 14, color: '#64748B', marginBottom: 18, lineHeight: 20 },
  label: { fontSize: 13, fontWeight: '700', color: '#64748B', marginBottom: 8, marginTop: 6 },
  input: { backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: '#0F172A', marginBottom: 12, textAlignVertical: 'top' },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: GREEN, borderRadius: 14, paddingVertical: 15, marginTop: 4 },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  loadingTxt: { color: '#64748B', textAlign: 'center', marginTop: 16, fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 18, marginTop: 18, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  cardTxt: { fontSize: 14.5, color: '#1F2937', lineHeight: 22 },
});
