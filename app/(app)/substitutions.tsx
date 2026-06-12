// Substitutions instantanées — remplace un aliment par une alternative plus saine (IA).
import React, { useState } from 'react';
import { Image, View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Replace } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { FormCard, FormInput, SubmitBar } from '../../components/FormKit';
import { aiGenerate } from '../../lib/aiProxy';
import { useTranslation } from '../../lib/i18n';
import { useTheme } from '../../lib/ThemeContext';

const GREEN = '#2E8B57';

const TXT: any = {
  en: { title: 'Substitutions', sub: 'Type a food → healthier alternatives, instantly.', placeholder: 'E.g. soda, chips, mayonnaise…', ok: 'OK', loading: 'Searching for alternatives…', fail: 'Suggestion failed', error: 'error', suggestions: ['Soda', 'Chips', 'White pasta', 'Mayonnaise', 'White bread', 'Dessert cream'] },
  fr: { title: 'Substitutions', sub: 'Tape un aliment → des alternatives plus saines, en direct.', placeholder: 'Ex : Soda, chips, mayonnaise…', ok: 'OK', loading: "Recherche d'alternatives…", fail: 'Suggestion impossible', error: 'erreur', suggestions: ['Soda', 'Chips', 'Pâtes blanches', 'Mayonnaise', 'Pain blanc', 'Crème dessert'] },
  ar: { title: 'البدائل', sub: 'اكتب طعاماً ← بدائل أكثر صحة، فوراً.', placeholder: 'مثال: مشروب غازي، شيبس، مايونيز…', ok: 'موافق', loading: 'جارٍ البحث عن بدائل…', fail: 'تعذّر الاقتراح', error: 'خطأ', suggestions: ['مشروب غازي', 'شيبس', 'معكرونة بيضاء', 'مايونيز', 'خبز أبيض', 'كريمة الحلوى'] },
};

export default function SubstitutionsScreen() {
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  const bg = isDark ? '#0f172a' : '#F4F7F9';
  const card = isDark ? '#1e293b' : '#ffffff';
  const text = isDark ? '#f1f5f9' : '#0F172A';
  const sub = isDark ? '#94a3b8' : '#64748B';
  const resultTxtColor = isDark ? '#e2e8f0' : '#1F2937';
  const align: any = { textAlign: isRTL ? 'right' : 'left' };

  const [food, setFood] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');

  const ask = async (q: string) => {
    const item = q.trim();
    if (!item || loading) return;
    setFood(item); setResult(''); setLoading(true);
    try {
      const aiTxt = await aiGenerate(`Donne 3 alternatives plus saines et/ou moins caloriques à "${item}". Pour chaque alternative : le nom, pourquoi c'est mieux (1 phrase courte), et l'économie de calories approximative. Réponds en français, concis, format liste.`);
      setResult(aiTxt.trim());
    } catch (e: any) {
      setResult(`${t.fail} (${e?.message || t.error}).`);
    } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Image source={require('../../assets/images/illustrations/loading_bg.jpg')} style={{ width: '100%', height: 110, borderRadius: 18, marginBottom: 14 }} resizeMode="cover" />
        <View style={styles.head}><Replace size={24} color={GREEN} /><Text style={[styles.title, { color: text }]}>{t.title}</Text></View>
        <Text style={[styles.sub, { color: sub }, align]}>{t.sub}</Text>

        <FormCard>
          <FormInput
            placeholder={t.placeholder}
            value={food}
            onChangeText={setFood}
            onSubmitEditing={() => ask(food)}
            returnKeyType="search"
          />
        </FormCard>
        <View style={{ marginHorizontal: -20, marginTop: -8, marginBottom: -6 }}>
          <SubmitBar label={t.ok} onPress={() => ask(food)} disabled={loading} />
        </View>

        <View style={styles.chips}>
          {t.suggestions.map((sg: string) => (
            <TouchableOpacity key={sg} style={styles.chip} onPress={() => ask(sg)}><Text style={styles.chipTxt}>{sg}</Text></TouchableOpacity>
          ))}
        </View>

        {loading && <View style={styles.center}><ActivityIndicator color={GREEN} /><Text style={[styles.loadingTxt, { color: sub }]}>{t.loading}</Text></View>}
        {!!result && <View style={[styles.resultCard, { backgroundColor: card }]}><Text style={[styles.resultTxt, { color: resultTxtColor }, align]}>{result}</Text></View>}
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
