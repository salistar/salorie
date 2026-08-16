// Mode resto — photo du menu → meilleurs choix selon ton objectif.
// Chemin principal : backend objectif-aware (/menu/analyze, llama-3.2 + scoreFood)
// qui renvoie des plats SCORÉS (verdict + raisons). Gemini Vision reste en FALLBACK
// uniquement si l'endpoint backend échoue ou ne lit aucun plat.
import React, { useEffect, useState } from 'react';
import { useEspaceBasSimple } from '../../lib/espaceBas';
import { useTokens } from '../../constants/tokens';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Image as ImageIcon, UtensilsCrossed, Star, CheckCircle2, AlertTriangle } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import PhotoStrip from '../../components/PhotoStrip';
import { analyzeImageUri, prepareImageBase64 } from '../../lib/imageAI';
import { getUserFromFirestore } from '../../lib/firebase';
import { analyzeMenu } from '../../lib/objective/api';
import { buildObjectiveContext } from '../../lib/objective/buildContext';
import { useNutritionData } from '../../hooks/useNutritionData';
import { useTranslation } from '../../lib/i18n';
import { useTheme } from '../../lib/ThemeContext';
import { Card } from '../../components/ui';
import { radius, spacing, elevation } from '../../constants/theme';
import { useScreenGate } from '../../components/FeatureGate';

const GREEN = '#2E8B57';

const TXT: any = {
  en: { title: 'Restaurant mode', sub: 'Snap the menu → the best picks for your goal', menu_photo: 'Menu photo', gallery: 'Gallery', loading: 'Reading the menu…', hint: '🍽️ Tip: frame the menu well, text readable.', fail: 'Analysis failed', error: 'error', forYourGoal: 'For your goal', noDishes: "Couldn't read any dish from this menu.", great: 'Great pick', ok: 'Decent', avoid: 'Avoid', kcal: 'kcal', fitsBudget: 'fits your {n} kcal left', overBudget: 'over by {n} kcal', budgetDone: "you're already at your calorie limit" },
  fr: { title: 'Mode resto', sub: 'Photographie le menu → les meilleurs choix selon ton objectif', menu_photo: 'Photo du menu', gallery: 'Galerie', loading: 'Lecture du menu…', hint: '🍽️ Astuce : cadre bien le menu, texte lisible.', fail: 'Analyse impossible', error: 'erreur', forYourGoal: 'Pour ton objectif', noDishes: "Aucun plat n'a pu être lu sur ce menu.", great: 'Excellent choix', ok: 'Correct', avoid: 'À éviter', kcal: 'kcal', fitsBudget: 'rentre dans tes {n} kcal restantes', overBudget: 'dépasse de {n} kcal', budgetDone: 'tu as déjà atteint ta limite de calories' },
  ar: { title: 'وضع المطعم', sub: 'صوّر القائمة ← أفضل الاختيارات حسب هدفك', menu_photo: 'صورة القائمة', gallery: 'المعرض', loading: 'جارٍ قراءة القائمة…', hint: '🍽️ نصيحة: صوّر القائمة جيداً بنص واضح.', fail: 'تعذّر التحليل', error: 'خطأ', forYourGoal: 'لهدفك', noDishes: 'تعذّرت قراءة أي طبق من هذه القائمة.', great: 'اختيار ممتاز', ok: 'مقبول', avoid: 'يُفضّل تجنّبه', kcal: 'سعرة', fitsBudget: 'يدخل ضمن {n} سعرة متبقية لك', overBudget: 'يتجاوز بـ {n} سعرة', budgetDone: 'لقد بلغت حدّ السعرات الخاص بك' },
};

type Verdict = 'great' | 'ok' | 'avoid';
interface Reco { name: string; kcal: number; protein: number; carbs: number; fat: number; fit: number; verdict: Verdict; reasons: string[]; }

export default function RestaurantModeScreen() {
  const { user } = useUser();
  const espaceBas = useEspaceBasSimple();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  // Accent thémé : GREEN est le vert CLAIR ; en sombre on utilise le token
  // dark officiel (contraste correct sur fond sombre).
  const accent = isDark ? '#4ade80' : GREEN;
  const tok = useTokens();
  const bg = tok.bg;
  const card = tok.surface;
  const text = tok.text;
  const sub = tok.textMuted;
  const cardTxtColor = isDark ? '#e2e8f0' : '#1F2937';
  const align: any = { textAlign: isRTL ? 'right' : 'left' };

  const __gate = useScreenGate('restaurant-mode');

  const [goal, setGoal] = useState('maintain');
  const [uri, setUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [recos, setRecos] = useState<Reco[] | null>(null);
  const [usedGemini, setUsedGemini] = useState(false);

  // Budget restant du jour (alimente l'objective context pour le scoring backend).
  const today = new Date().toISOString().slice(0, 10);
  const { goals, consumed } = useNutritionData(today) as any;
  // Budget calorique restant du jour : remaining = max(0, objectif - consommé).
  const remaining = Math.max(0, Math.round((Number(goals?.calories) || 0) - (Number(consumed?.calories) || 0)));

  useEffect(() => { (async () => { try { const e = user?.primaryEmailAddress?.emailAddress; if (e) { const p: any = await getUserFromFirestore(e, user?.id); if (p?.goal) setGoal(p.goal); } } catch {} })(); }, []);

  const verdictRank = (v: Verdict) => (v === 'great' ? 0 : v === 'ok' ? 1 : 2);

  const run = async (cam: boolean) => {
    let imgUri: string | null = null;
    try {
      const res = cam ? await ImagePicker.launchCameraAsync({ quality: 0.4, base64: true }) : await ImagePicker.launchImageLibraryAsync({ quality: 0.4, base64: true });
      if (res.canceled || !res.assets?.[0]?.uri) return;
      imgUri = res.assets[0].uri;
      setUri(imgUri);
      setResult(''); setRecos(null); setUsedGemini(false); setLoading(true);

      // VITESSE : resize 1000px q0.6 avant upload (photo brute = 5-15 Mo -> ~200 Ko).
      const imageBase64 = await prepareImageBase64(imgUri, 1000, 0.6);

      // 1) NOUVEAU CHEMIN : backend objectif-aware (llama-3.2 + scoreFood).
      try {
        const email = user?.primaryEmailAddress?.emailAddress || '';
        const objective = await buildObjectiveContext(email, user?.id, today, { goals, consumed });
        const analysis = await analyzeMenu(imageBase64, objective);
        const recommended = (analysis?.recommended || []) as Reco[];
        if (recommended.length) {
          // Trie great → ok → avoid puis par fit décroissant ; garde le top 3.
          const top = [...recommended]
            .sort((a, b) => verdictRank(a.verdict) - verdictRank(b.verdict) || b.fit - a.fit)
            .slice(0, 3);
          setRecos(top);
          return;
        }
        // Plats lus mais aucun recommandé (tous bloqués) → message dédié, pas de Gemini.
        if ((analysis?.items?.length ?? 0) > 0) { setRecos([]); return; }
        throw new Error('empty'); // rien lu → on tente Gemini en repli.
      } catch {
        // 2) FALLBACK Gemini (uniquement si le nouvel endpoint échoue / ne lit rien).
        const goalTxt = goal === 'lose' ? 'perdre du poids' : goal === 'gain' ? 'prendre du muscle' : 'maintenir mon poids';
        const aiTxt = await analyzeImageUri(`Voici la photo d'un menu de restaurant. Mon objectif : ${goalTxt}. Recommande les 2-3 MEILLEURS plats du menu pour cet objectif (nom exact du menu + pourquoi, + estimation calories). Puis cite 1 plat à éviter. Réponds en français, concis.`, imgUri, { maxWidth: 1000, compress: 0.6 });
        setUsedGemini(true);
        setResult(aiTxt.trim());
      }
    } catch (e: any) { setResult(`${t.fail} (${e?.message || t.error}).`); } finally { setLoading(false); }
  };

  if (!__gate.ok) return __gate.node;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: espaceBas }]}>
        <View style={styles.head}><UtensilsCrossed size={24} color={accent} /><Text style={[styles.title, { color: text }]}>{t.title}</Text></View>
        <PhotoStrip category="food" />
        <Text style={[styles.sub, { color: sub }, align]}>{t.sub} ({goal}).</Text>
        <View style={styles.btnRow}>
          <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={() => run(true)} disabled={loading}><Camera size={20} color="#fff" /><Text style={styles.btnPrimaryTxt}>{t.menu_photo}</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => run(false)} disabled={loading}><ImageIcon size={20} color={accent} /><Text style={styles.btnGhostTxt}>{t.gallery}</Text></TouchableOpacity>
        </View>
        {uri && <Image source={{ uri }} style={styles.preview} resizeMode="cover" />}
        {loading && <View style={styles.center}><ActivityIndicator color={accent} /><Text style={[styles.loadingTxt, { color: sub }]}>{t.loading}</Text></View>}

        {/* NOUVEAU : recommandations objectif-aware (backend llama-3.2 + scoreFood). */}
        {recos && recos.length > 0 && (
          <>
            <Text style={[styles.forGoal, { color: text }, align]}>{`✨ ${t.forYourGoal} (${goal})`}</Text>
            {recos.map((r, i) => {
              const vColor = r.verdict === 'great' ? accent : r.verdict === 'ok' ? '#D97706' : '#DC2626';
              const VIcon = r.verdict === 'great' ? CheckCircle2 : r.verdict === 'ok' ? Star : AlertTriangle;
              const vLabel = r.verdict === 'great' ? t.great : r.verdict === 'ok' ? t.ok : t.avoid;
              return (
                <Card key={`${r.name}-${i}`} variant="raised" padded={false} style={[styles.recoCard, { borderLeftColor: vColor }]}>
                  <View style={[styles.recoHead, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    <Text style={[styles.recoName, { color: text }, align]} numberOfLines={2}>{r.name}</Text>
                    <View style={[styles.badge, { backgroundColor: vColor + '22', flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                      <VIcon size={13} color={vColor} />
                      <Text style={[styles.badgeTxt, { color: vColor }]}>{vLabel} · {Math.round(r.fit)}</Text>
                    </View>
                  </View>
                  <Text style={[styles.recoMacros, { color: sub }, align]}>
                    {`${Math.round(r.kcal)} ${t.kcal} · P ${Math.round(r.protein)} · C ${Math.round(r.carbs)} · F ${Math.round(r.fat)}`}
                  </Text>
                  {(() => {
                    // Contexte budget : ce plat rentre-t-il dans les kcal restantes du jour ?
                    const fits = Math.round(r.kcal) <= remaining;
                    const over = Math.round(r.kcal) - remaining;
                    const bColor = remaining <= 0 ? '#DC2626' : fits ? accent : '#D97706';
                    const label = remaining <= 0
                      ? t.budgetDone
                      : fits
                        ? t.fitsBudget.replace('{n}', String(remaining))
                        : t.overBudget.replace('{n}', String(over));
                    return (
                      <Text style={[styles.recoBudget, { color: bColor }, align]}>
                        {`${fits && remaining > 0 ? '✅' : '⚠️'} ${label}`}
                      </Text>
                    );
                  })()}
                  {r.reasons?.slice(0, 3).map((reason, j) => (
                    <Text key={j} style={[styles.recoReason, { color: cardTxtColor }, align]}>• {reason}</Text>
                  ))}
                </Card>
              );
            })}
            <Text style={[styles.source, { color: sub }, align]}>
              {language === 'fr'
                ? '🍃 Source : IA backend Salorie (llama-3.2) — plats scorés selon ton objectif du jour.'
                : language === 'ar'
                  ? '🍃 المصدر: ذكاء Salorie الخلفي (llama-3.2) — الأطباق مُقيّمة حسب هدف يومك.'
                  : '🍃 Source: Salorie backend AI (llama-3.2) — dishes scored for your daily goal.'}
            </Text>
          </>
        )}
        {recos && recos.length === 0 && (
          <View style={[styles.card, { backgroundColor: card }]}><Text style={[styles.cardTxt, { color: cardTxtColor }, align]}>{t.noDishes}</Text></View>
        )}

        {!!result && <View style={[styles.card, { backgroundColor: card }]}><Text style={[styles.cardTxt, { color: cardTxtColor }, align]}>{result}</Text></View>}
        {!!result && usedGemini && (
          <Text style={[styles.source, { color: sub }, align]}>
            {language === 'fr'
              ? '⛅ Source : IA · Gemini (repli) — l’analyse backend n’a rien pu lire ; les autres scans privilégient on-device puis backend.'
              : language === 'ar'
                ? '⛅ المصدر: ذكاء · Gemini (احتياطي) — تعذّر على الخادم القراءة.'
                : '⛅ Source: AI · Gemini (fallback) — backend could not read the menu; other scans prefer on-device then backend.'}
          </Text>
        )}
        {!uri && !loading && <Text style={[styles.hint, { color: sub }]}>{t.hint}</Text>}
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
  source: { fontSize: 11.5, fontWeight: '600', marginTop: 10, lineHeight: 17, fontStyle: 'italic' },
  hint: { fontSize: 13, color: '#94A3B8', textAlign: 'center', marginTop: 24 },
  forGoal: { fontSize: 16, fontWeight: '800', marginBottom: 12, letterSpacing: -0.3 },
  // Card raised fournit le fond thémé + elevation.sm + radius.lg via tokens ; on n'ajoute
  // ici que la bordure-verdict (couleur bindée inline) et l'espacement en tokens.
  recoCard: { borderRadius: radius.lg, padding: spacing.md + spacing.xs / 2, marginBottom: spacing.md, borderLeftWidth: 4, ...elevation.sm },
  recoHead: { alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 },
  recoName: { flex: 1, fontSize: 15.5, fontWeight: '800' },
  badge: { alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  badgeTxt: { fontSize: 11.5, fontWeight: '800' },
  recoMacros: { fontSize: 12.5, fontWeight: '600', marginBottom: 6 },
  recoBudget: { fontSize: 12.5, fontWeight: '800', marginBottom: 6 },
  recoReason: { fontSize: 13, lineHeight: 19 },
});
