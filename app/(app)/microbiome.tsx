// Microbiote — questionnaire santé intestinale → recommandations IA. Analyse labo = à venir.
import React, { useState } from 'react';
import { useEspaceBasSimple } from '../../lib/espaceBas';
import { useTokens } from '../../constants/tokens';
import { Image, View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Activity, Sparkles } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { useScreenGate } from '../../components/FeatureGate';
import EmptyState from '../../components/ui/EmptyState';
import { aiGenerate } from '../../lib/aiProxy';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { rowDir, txtAlign } from '../../lib/rtl';
import { type } from '../../constants/theme';

const GREEN = '#2E8B57';
const AI_LANG: any = { en: 'English', fr: 'French', ar: 'Arabic' };

const TXT: any = {
  en: { title: 'Microbiome', sub: 'Gut-health questionnaire → personalized tips. (Real lab analysis coming soon.)', btn: 'Get my recommendations', failPrefix: 'Analysis failed', error: 'error', disclaimer: 'Indicative questionnaire, not a diagnosis.', q: { transit: 'Your transit', bloat: 'Bloating', ferment: 'Fermented foods (yogurt, kefir…)', fiber: 'Fiber (fruits, vegetables, grains)', stress: 'Stress level' }, opts: { 'Régulier': 'Regular', 'Irrégulier': 'Irregular', 'Constipation': 'Constipation', 'Diarrhée': 'Diarrhea', 'Jamais': 'Never', 'Parfois': 'Sometimes', 'Souvent': 'Often', 'Quotidien': 'Daily', 'Peu': 'Little', 'Moyen': 'Medium', 'Beaucoup': 'A lot', 'Faible': 'Low', 'Élevé': 'High' } },
  fr: { title: 'Microbiote', sub: 'Questionnaire santé intestinale → reco personnalisées. (Analyse labo réelle à venir.)', btn: 'Obtenir mes recommandations', failPrefix: 'Analyse impossible', error: 'erreur', disclaimer: 'Questionnaire indicatif, pas un diagnostic.', q: { transit: 'Ton transit', bloat: 'Ballonnements', ferment: 'Aliments fermentés (yaourt, kéfir…)', fiber: 'Fibres (fruits, légumes, céréales)', stress: 'Niveau de stress' }, opts: { 'Régulier': 'Régulier', 'Irrégulier': 'Irrégulier', 'Constipation': 'Constipation', 'Diarrhée': 'Diarrhée', 'Jamais': 'Jamais', 'Parfois': 'Parfois', 'Souvent': 'Souvent', 'Quotidien': 'Quotidien', 'Peu': 'Peu', 'Moyen': 'Moyen', 'Beaucoup': 'Beaucoup', 'Faible': 'Faible', 'Élevé': 'Élevé' } },
  ar: { title: 'الميكروبيوم', sub: 'استبيان صحة الأمعاء ← توصيات مخصصة. (تحليل مخبري حقيقي قريباً.)', btn: 'احصل على توصياتي', failPrefix: 'تعذر التحليل', error: 'خطأ', disclaimer: 'استبيان إرشادي، وليس تشخيصاً.', q: { transit: 'حركة أمعائك', bloat: 'الانتفاخ', ferment: 'أطعمة مخمّرة (زبادي، كفير…)', fiber: 'الألياف (فواكه، خضار، حبوب)', stress: 'مستوى التوتر' }, opts: { 'Régulier': 'منتظم', 'Irrégulier': 'غير منتظم', 'Constipation': 'إمساك', 'Diarrhée': 'إسهال', 'Jamais': 'أبداً', 'Parfois': 'أحياناً', 'Souvent': 'غالباً', 'Quotidien': 'يومياً', 'Peu': 'قليل', 'Moyen': 'متوسط', 'Beaucoup': 'كثير', 'Faible': 'منخفض', 'Élevé': 'مرتفع' } },
};

const Q = [
  { k: 'transit', q: 'Ton transit', opts: ['Régulier', 'Irrégulier', 'Constipation', 'Diarrhée'] },
  { k: 'bloat', q: 'Ballonnements', opts: ['Jamais', 'Parfois', 'Souvent'] },
  { k: 'ferment', q: 'Aliments fermentés (yaourt, kéfir…)', opts: ['Jamais', 'Parfois', 'Quotidien'] },
  { k: 'fiber', q: 'Fibres (fruits, légumes, céréales)', opts: ['Peu', 'Moyen', 'Beaucoup'] },
  { k: 'stress', q: 'Niveau de stress', opts: ['Faible', 'Moyen', 'Élevé'] },
];

export default function MicrobiomeScreen() {
  const __gate = useScreenGate('microbiome');
  const { resolved } = useTheme();
  const espaceBas = useEspaceBasSimple();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';
  const accent = isDark ? '#4ade80' : GREEN;
  const tok = useTokens();
  const bg = tok.bg;
  const card = tok.surface;
  const text = tok.text;
  const sub = tok.textMuted;
  const align: any = { textAlign: txtAlign(isRTL) };

  const [ans, setAns] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [reco, setReco] = useState('');

  const analyze = async () => {
    setReco(''); setLoading(true);
    try {
      const profile = Q.map((x) => `${x.q}: ${ans[x.k] || 'NR'}`).join(' · ');
      const text = await aiGenerate(`User's gut profile: ${profile}. Give personalized recommendations to improve their microbiome (foods to favor, habits, prebiotics/probiotics). Stay cautious (no medical diagnosis). Answer in ${AI_LANG[language] || 'English'}, concise, list format.`);
      setReco(text.trim());
    } catch (e: any) { setReco(`${t.failPrefix} (${e?.message || t.error}).`); } finally { setLoading(false); }
  };

  const done = Object.keys(ans).length >= 3;

  if (!__gate.ok) return __gate.node;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: espaceBas }]}>
        <Image source={require('../../assets/images/illustrations/loading_bg.jpg')} style={{ width: '100%', height: 110, borderRadius: 18, marginBottom: 14 }} resizeMode="cover" />
        <View style={[styles.head, { flexDirection: rowDir(isRTL) }]}><Activity size={24} color={accent} /><Text style={[styles.title, { color: text }]}>{t.title}</Text></View>
        <Text style={[styles.sub, { color: sub }, align]}>{t.sub}</Text>

        {Q.map((x) => (
          <View key={x.k} style={styles.qBlock}>
            <Text style={[styles.qTxt, { color: text }, align]}>{t.q[x.k] || x.q}</Text>
            <View style={[styles.opts, { flexDirection: rowDir(isRTL) }]}>
              {x.opts.map((o) => (
                <TouchableOpacity key={o} style={[styles.opt, { backgroundColor: card }, ans[x.k] === o && { backgroundColor: accent }]} onPress={() => setAns((a) => ({ ...a, [x.k]: o }))}>
                  <Text style={[styles.optTxt, { color: sub }, ans[x.k] === o && { color: '#fff' }]}>{t.opts[o] || o}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        <TouchableOpacity style={[styles.btn, { backgroundColor: accent }, !done && { opacity: 0.5 }]} onPress={analyze} disabled={!done || loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <><Sparkles size={20} color="#fff" /><Text style={styles.btnTxt}>{t.btn}</Text></>}
        </TouchableOpacity>

        {!done && (
          <View style={{ marginTop: 18 }}>
            <EmptyState icon={<Activity size={24} color={accent} />} title="Complete at least 3 answers" />
          </View>
        )}

        {!!reco && <View style={[styles.card, { backgroundColor: card, borderWidth: 1, borderColor: isDark ? '#283241' : 'transparent' }, isDark && { shadowColor: 'transparent', elevation: 0 }]}><Text style={[styles.cardTxt, { color: isDark ? '#e2e8f0' : '#1F2937' }, align]}>{reco}</Text></View>}

        <Text style={[type.micro, styles.disclaimer, { color: sub }, align]}>{t.disclaimer}</Text>
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
  optTxt: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: GREEN, borderRadius: 14, paddingVertical: 15, marginTop: 8 },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 18, marginTop: 18, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  cardTxt: { fontSize: 14.5, color: '#1F2937', lineHeight: 22 },
  disclaimer: { marginTop: 20, opacity: 0.7, lineHeight: 16 },
});
