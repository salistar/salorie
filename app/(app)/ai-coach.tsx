// Coach IA CONTEXTUEL — utilise le proxy /ai (Gemini serveur) en lui passant le
// contexte réel de l'utilisateur (objectif, calories/macros du jour, tendance poids).
// Conseils auto au chargement + question libre. 100% via backend (clé Gemini serveur).
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, ActivityIndicator, TextInput } from 'react-native';
import { Sparkles, Send, RefreshCw } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { aiGenerate } from '../../lib/aiProxy';
import { useNutritionData } from '../../hooks/useNutritionData';
import { auth } from '../../lib/firebaseAuth';
import { getUserFromFirestore } from '../../lib/firebase';
import { mlWeightForecast } from '../../lib/mlApi';

const GREEN = '#2E8B57';

type Msg = { role: 'coach' | 'user'; text: string };

async function buildContext(goals: any, consumed: any): Promise<string> {
  let goal = 'maintien', forecast = '';
  try {
    const email = auth.currentUser?.email || (auth.currentUser as any)?.uid || '';
    const p: any = email ? await getUserFromFirestore(email).catch(() => null) : null;
    if (p?.goal) goal = p.goal;
    const wf = await mlWeightForecast().catch(() => null);
    if (wf?.ok) forecast = `Tendance poids: ${wf.trendKgPerWeek} kg/sem${wf.plateau ? ' (plateau détecté)' : ''}.`;
  } catch {}
  return [
    `Objectif: ${goal}.`,
    `Aujourd'hui: ${Math.round(consumed.calories)}/${goals.calories} kcal, ${Math.round(consumed.protein)}/${goals.protein} g protéines, ${Math.round((consumed.water || 0) / 1000 * 10) / 10}/${(goals.water / 1000)} L eau.`,
    forecast,
  ].filter(Boolean).join(' ');
}

export default function AiCoachScreen() {
  const data: any = useNutritionData();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const scroll = useRef<ScrollView>(null);

  const ask = async (question: string, isAuto = false) => {
    if (loading) return;
    setLoading(true);
    if (!isAuto) setMsgs((m) => [...m, { role: 'user', text: question }]);
    try {
      const ctx = await buildContext(data?.goals || {}, data?.consumed || {});
      const prompt = isAuto
        ? `Tu es un coach nutrition & sport bienveillant. Contexte de l'utilisateur: ${ctx} Donne 3 conseils personnalisés, courts et actionnables pour aujourd'hui. Réponds en français, format liste à puces.`
        : `Tu es un coach nutrition & sport. Contexte: ${ctx} Question de l'utilisateur: "${question}". Réponds en français, court et actionnable.`;
      const text = await aiGenerate(prompt);
      setMsgs((m) => [...m, { role: 'coach', text: text.trim() }]);
    } catch (e: any) {
      setMsgs((m) => [...m, { role: 'coach', text: `Coach indisponible (${e?.message || 'erreur'}).` }]);
    } finally {
      setLoading(false);
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  useEffect(() => { ask('', true); }, []); // conseils contextuels auto

  const send = () => { const t = q.trim(); if (!t) return; setQ(''); ask(t); };

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenTopBar showBack showBrand showNotif={false} />
      <View style={styles.head}>
        <Sparkles size={22} color={GREEN} />
        <Text style={styles.title}>Coach IA</Text>
        <TouchableOpacity onPress={() => ask('', true)} style={{ marginLeft: 'auto' }} hitSlop={10}><RefreshCw size={18} color="#94A3B8" /></TouchableOpacity>
      </View>
      <ScrollView ref={scroll} contentContainerStyle={styles.body}>
        {msgs.map((m, i) => (
          <View key={i} style={[styles.bubble, m.role === 'user' ? styles.user : styles.coach]}>
            <Text style={[styles.bubbleTxt, m.role === 'user' && { color: '#fff' }]}>{m.text}</Text>
          </View>
        ))}
        {loading && <View style={[styles.bubble, styles.coach]}><ActivityIndicator color={GREEN} /></View>}
      </ScrollView>
      <View style={styles.inputRow}>
        <TextInput style={styles.input} placeholder="Pose une question à ton coach…" value={q} onChangeText={setQ} onSubmitEditing={send} returnKeyType="send" />
        <TouchableOpacity style={styles.sendBtn} onPress={send} disabled={loading}><Send size={20} color="#fff" /></TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 8 },
  title: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  body: { padding: 16, gap: 10 },
  bubble: { maxWidth: '88%', borderRadius: 16, padding: 13 },
  coach: { backgroundColor: '#fff', alignSelf: 'flex-start', borderWidth: 1, borderColor: '#EEF2F6' },
  user: { backgroundColor: GREEN, alignSelf: 'flex-end' },
  bubbleTxt: { fontSize: 14, lineHeight: 20, color: '#1F2937' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderTopWidth: 1, borderTopColor: '#EEF2F6', backgroundColor: '#fff' },
  input: { flex: 1, backgroundColor: '#F1F5F9', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14 },
  sendBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center' },
});
