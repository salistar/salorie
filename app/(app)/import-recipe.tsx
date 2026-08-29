// Import recette depuis une URL — récupère la page + extrait recette & nutrition (IA).
import React, { useState, useMemo } from 'react';
import { useTokens, type Tokens } from '../../constants/tokens';
import {
  Image,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link2, Download } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { FormInput } from '../../components/FormKit';
import { aiGenerate } from '../../lib/aiProxy';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { rowDir, txtAlign } from '../../lib/rtl';
import { useScreenGate } from '../../components/FeatureGate';

const AI_LANG: any = { en: 'English', fr: 'French', ar: 'Arabic' };

const TXT: any = {
  en: { title: 'Import a recipe', sub: 'Paste a recipe URL (blog, cooking site) → ingredients + nutrition.', importBtn: 'Import', loading: 'Fetching + analyzing the page…', failPrefix: 'Import failed', failSuffix: 'Check the URL or try again.', timeout: 'timed out', error: 'error' },
  fr: { title: 'Importer une recette', sub: "Colle l'URL d'une recette (blog, site cuisine) → ingrédients + nutrition.", importBtn: 'Importer', loading: 'Récupération + analyse de la page…', failPrefix: 'Import impossible', failSuffix: "Vérifie l'URL ou réessaie.", timeout: 'délai dépassé', error: 'erreur' },
  ar: { title: 'استيراد وصفة', sub: 'الصق رابط وصفة (مدونة، موقع طبخ) ← مكونات + قيم غذائية.', importBtn: 'استيراد', loading: 'جارٍ جلب الصفحة وتحليلها…', failPrefix: 'تعذر الاستيراد', failSuffix: 'تحقق من الرابط أو حاول مجدداً.', timeout: 'انتهت المهلة', error: 'خطأ' },
};

export default function ImportRecipeScreen() {
  const k = useTokens();
  const styles = useMemo(() => makeStyles(k), [k]);
  const { resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';
  // L'accent vient du theme : le couple clair/sombre fige
  // n'ouvrait que deux des six palettes.
  const accent = k.accent;
  const tok = useTokens();
  const bg = tok.bg;
  const card = tok.surface;
  const text = tok.text;
  const sub = tok.textMuted;
  const align: any = { textAlign: txtAlign(isRTL) };

  const __gate = useScreenGate('import-recipe');

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
      const text = await aiGenerate(`Here is the HTML of a recipe page. Extract and return concisely in ${AI_LANG[language] || 'English'}: 1) the recipe NAME, 2) the INGREDIENTS (bullet list), 3) the STEPS (short summary), 4) a NUTRITION ESTIMATE per serving (calories, protein, carbs, fat). HTML:\n${html}`);
      setResult(text.trim());
    } catch (e: any) {
      setResult(`${t.failPrefix} (${e?.name === 'AbortError' ? t.timeout : e?.message || t.error}). ${t.failSuffix}`);
    } finally { setLoading(false); }
  };

  if (!__gate.ok) return __gate.node;

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Image source={require('../../assets/images/illustrations/healthy_food.jpg')} style={{ width: '100%', height: 110, borderRadius: 18, marginBottom: 14 }} resizeMode="cover" />
        <View style={[styles.head, { flexDirection: rowDir(isRTL) }]}><Link2 size={24} color={accent} /><Text style={[styles.title, { color: text }]}>{t.title}</Text></View>
        <Text style={[styles.sub, { color: sub }, align]}>{t.sub}</Text>

        <FormInput label="https://…" placeholder="https://…" autoCapitalize="none" keyboardType="url" value={url} onChangeText={setUrl} onSubmitEditing={run} returnKeyType="go" />
        <TouchableOpacity style={[styles.btn, { backgroundColor: accent, flexDirection: rowDir(isRTL) }]} onPress={run} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <><Download size={20} color="#fff" /><Text style={[styles.btnTxt, align]}>{t.importBtn}</Text></>}
        </TouchableOpacity>

        {loading && <Text style={[styles.loadingTxt, { color: sub }]}>{t.loading}</Text>}
        {!!result && <View style={[styles.card, { backgroundColor: card, borderWidth: 1, borderColor: isDark ? '#283241' : 'transparent' }, isDark && { shadowColor: 'transparent', elevation: 0 }]}><Text style={[styles.cardTxt, { color: k.text }, align]}>{result}</Text></View>}
      </ScrollView>
    </SafeAreaView>
  );
}

// Fabrique thémée : ce StyleSheet lisait des jetons alors qu'il était
// évalué UNE FOIS à l'importation, avant que le thème n'existe. Les
// couleurs y étaient donc figées sur la palette par défaut, à vie.
const makeStyles = (k: Tokens) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F7F9' },
  body: { padding: 20, paddingBottom: 100 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  title: { fontSize: 24, fontWeight: '900', color: '#0F172A', letterSpacing: -0.5 },
  sub: { fontSize: 14, color: '#64748B', marginBottom: 18, lineHeight: 20 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: k.accent, borderRadius: 14, paddingVertical: 15 },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  loadingTxt: { color: '#64748B', textAlign: 'center', marginTop: 16, fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 18, marginTop: 18, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  cardTxt: { fontSize: 14.5, color: '#1F2937', lineHeight: 22 },
});
