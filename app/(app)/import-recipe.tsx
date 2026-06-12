// Import recette depuis une URL — récupère la page + extrait recette & nutrition (IA).
import React, { useState } from 'react';
import { Image, View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Link2, Download } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { FormInput } from '../../components/FormKit';
import { aiGenerate } from '../../lib/aiProxy';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';

const GREEN = '#2E8B57';

const TXT: any = {
  en: { title: 'Import a recipe', sub: 'Paste a recipe URL (blog, cooking site) → ingredients + nutrition.', importBtn: 'Import', loading: 'Fetching + analyzing the page…', failPrefix: 'Import failed', failSuffix: 'Check the URL or try again.', timeout: 'timed out', error: 'error' },
  fr: { title: 'Importer une recette', sub: "Colle l'URL d'une recette (blog, site cuisine) → ingrédients + nutrition.", importBtn: 'Importer', loading: 'Récupération + analyse de la page…', failPrefix: 'Import impossible', failSuffix: "Vérifie l'URL ou réessaie.", timeout: 'délai dépassé', error: 'erreur' },
  ar: { title: 'استيراد وصفة', sub: 'الصق رابط وصفة (مدونة، موقع طبخ) ← مكونات + قيم غذائية.', importBtn: 'استيراد', loading: 'جارٍ جلب الصفحة وتحليلها…', failPrefix: 'تعذر الاستيراد', failSuffix: 'تحقق من الرابط أو حاول مجدداً.', timeout: 'انتهت المهلة', error: 'خطأ' },
};

export default function ImportRecipeScreen() {
  const { resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';
  const bg = isDark ? '#0f172a' : '#F4F7F9';
  const card = isDark ? '#1e293b' : '#ffffff';
  const text = isDark ? '#f1f5f9' : '#0F172A';
  const sub = isDark ? '#94a3b8' : '#64748B';
  const align: any = { textAlign: isRTL ? 'right' : 'left' };

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
      setResult(`${t.failPrefix} (${e?.name === 'AbortError' ? t.timeout : e?.message || t.error}). ${t.failSuffix}`);
    } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Image source={require('../../assets/images/illustrations/healthy_food.jpg')} style={{ width: '100%', height: 110, borderRadius: 18, marginBottom: 14 }} resizeMode="cover" />
        <View style={styles.head}><Link2 size={24} color={GREEN} /><Text style={[styles.title, { color: text }]}>{t.title}</Text></View>
        <Text style={[styles.sub, { color: sub }, align]}>{t.sub}</Text>

        <FormInput label="https://…" placeholder="https://…" autoCapitalize="none" keyboardType="url" value={url} onChangeText={setUrl} onSubmitEditing={run} returnKeyType="go" />
        <TouchableOpacity style={styles.btn} onPress={run} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <><Download size={20} color="#fff" /><Text style={styles.btnTxt}>{t.importBtn}</Text></>}
        </TouchableOpacity>

        {loading && <Text style={[styles.loadingTxt, { color: sub }]}>{t.loading}</Text>}
        {!!result && <View style={[styles.card, { backgroundColor: card }]}><Text style={[styles.cardTxt, { color: isDark ? '#e2e8f0' : '#1F2937' }, align]}>{result}</Text></View>}
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
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: GREEN, borderRadius: 14, paddingVertical: 15 },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  loadingTxt: { color: '#64748B', textAlign: 'center', marginTop: 16, fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 18, marginTop: 18, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  cardTxt: { fontSize: 14.5, color: '#1F2937', lineHeight: 22 },
});
