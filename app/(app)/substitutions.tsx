// Substitutions instantanées — remplace un aliment par une alternative plus saine (IA).
// NUTRITION #164 (additif) : quand l'objectif du jour est dérivable (goal + conditions
// médicales via buildObjectiveContext), on PRIORISE les substitutions selon cet objectif
// — moins de sel (hypertension), moins de sucre (diabète), moins de calories (perte).
// On oriente le prompt IA pour renvoyer les alternatives du meilleur au moins bon pour la
// priorité active, et on affiche un petit badge « meilleur choix » indiquant cette priorité.
import React, { useEffect, useMemo, useState } from 'react';
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
import { Replace, Sparkles } from 'lucide-react-native';
import { useUser } from '@clerk/clerk-expo';
import ScreenTopBar from '../../components/ScreenTopBar';
import { FormCard, FormInput, SubmitBar } from '../../components/FormKit';
import { aiGenerate } from '../../lib/aiProxy';
import { useTranslation } from '../../lib/i18n';
import { useTheme } from '../../lib/ThemeContext';
import { useNutritionData } from '../../hooks/useNutritionData';
import { buildObjectiveContext } from '../../lib/objective/buildContext';
import type { ObjectiveContext } from '../../lib/objective/scoring';
import { spacing } from '../../constants/theme';
import { useScreenGate } from '../../components/FeatureGate';


const TXT: any = {
  en: { title: 'Substitutions', sub: 'Type a food → healthier alternatives, instantly.', placeholder: 'E.g. soda, chips, mayonnaise…', ok: 'OK', loading: 'Searching for alternatives…', fail: 'Suggestion failed', error: 'error', suggestions: ['Soda', 'Chips', 'White pasta', 'Mayonnaise', 'White bread', 'Dessert cream'], bestFor: 'Best choice', prio: { salt: 'less salt', sugar: 'less sugar', calories: 'fewer calories' }, prioNote: 'Alternatives ranked for your goal:' },
  fr: { title: 'Substitutions', sub: 'Tape un aliment → des alternatives plus saines, en direct.', placeholder: 'Ex : Soda, chips, mayonnaise…', ok: 'OK', loading: "Recherche d'alternatives…", fail: 'Suggestion impossible', error: 'erreur', suggestions: ['Soda', 'Chips', 'Pâtes blanches', 'Mayonnaise', 'Pain blanc', 'Crème dessert'], bestFor: 'Meilleur choix', prio: { salt: 'moins de sel', sugar: 'moins de sucre', calories: 'moins de calories' }, prioNote: 'Alternatives classées pour ton objectif :' },
  ar: { title: 'البدائل', sub: 'اكتب طعاماً ← بدائل أكثر صحة، فوراً.', placeholder: 'مثال: مشروب غازي، شيبس، مايونيز…', ok: 'موافق', loading: 'جارٍ البحث عن بدائل…', fail: 'تعذّر الاقتراح', error: 'خطأ', suggestions: ['مشروب غازي', 'شيبس', 'معكرونة بيضاء', 'مايونيز', 'خبز أبيض', 'كريمة الحلوى'], bestFor: 'الخيار الأفضل', prio: { salt: 'أقل ملحاً', sugar: 'أقل سكراً', calories: 'سعرات أقل' }, prioNote: 'بدائل مرتّبة حسب هدفك:' },
};

export default function SubstitutionsScreen() {
  const k = useTokens();
  const styles = useMemo(() => makeStyles(k), [k]);
  const { user } = useUser();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  // Accent thémé : k.accent est le vert CLAIR ; en sombre on utilise le token
  // dark officiel (contraste correct sur fond sombre).
  // L'accent vient du theme : le couple clair/sombre fige
  // n'ouvrait que deux des six palettes.
  const accent = k.accent;
  const tok = useTokens();
  const bg = tok.bg;
  const card = tok.surface;
  const text = tok.text;
  const sub = tok.textMuted;
  const resultTxtColor = isDark ? '#e2e8f0' : '#1F2937';
  const align: any = { textAlign: isRTL ? 'right' : 'left' };

  const __gate = useScreenGate('substitutions');

  const [food, setFood] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');

  // --- NUTRITION #164 : contexte d'objectif du jour (best-effort, défauts sûrs). ---
  // Dérivé exactement comme healthy-recipes.tsx (buildObjectiveContext + useNutritionData).
  const today = new Date().toISOString().slice(0, 10);
  const { goals, consumed } = useNutritionData(today) as any;
  const [ctx, setCtx] = useState<ObjectiveContext | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const email = user?.primaryEmailAddress?.emailAddress || '';
        const built = await buildObjectiveContext(email, user?.id, today, { goals, consumed });
        if (alive) setCtx(built);
      } catch {
        /* défauts sûrs : ctx reste null → priorité neutre */
      }
    })();
    return () => { alive = false; };
  }, [user?.id, user?.primaryEmailAddress?.emailAddress, goals, consumed, today]);

  // Axe de priorité déduit de l'objectif : sel (hypertension) > sucre (diabète) >
  // calories (perte de poids). null = tri neutre (aucun contexte objectif exploitable).
  const priority: 'salt' | 'sugar' | 'calories' | null = useMemo(() => {
    if (!ctx) return null;
    const cond = ctx.conditions || [];
    if (cond.includes('hypertension')) return 'salt';
    if (cond.includes('diabetes')) return 'sugar';
    if (ctx.goal === 'lose') return 'calories';
    return null;
  }, [ctx]);

  // Consigne d'objectif ajoutée au prompt : demande à l'IA de CLASSER les alternatives
  // du meilleur au moins bon selon la priorité active (moins de sel/sucre/calories).
  const priorityPromptFr = useMemo(() => {
    switch (priority) {
      case 'salt':
        return " L'utilisateur suit un objectif « moins de sel » (tension). Classe les alternatives de la meilleure (moins salée) à la moins bonne, la 1re étant le meilleur choix.";
      case 'sugar':
        return " L'utilisateur suit un objectif « moins de sucre » (glycémie). Classe les alternatives de la meilleure (moins sucrée) à la moins bonne, la 1re étant le meilleur choix.";
      case 'calories':
        return " L'utilisateur vise une perte de poids : privilégie « moins de calories ». Classe les alternatives de la meilleure (moins calorique) à la moins bonne, la 1re étant le meilleur choix.";
      default:
        return '';
    }
  }, [priority]);

  const ask = async (q: string) => {
    const item = q.trim();
    if (!item || loading) return;
    setFood(item); setResult(''); setLoading(true);
    try {
      const aiTxt = await aiGenerate(`Donne 3 alternatives plus saines et/ou moins caloriques à "${item}". Pour chaque alternative : le nom, pourquoi c'est mieux (1 phrase courte), et l'économie de calories approximative. Réponds en français, concis, format liste.${priorityPromptFr}`);
      setResult(aiTxt.trim());
    } catch (e: any) {
      setResult(`${t.fail} (${e?.message || t.error}).`);
    } finally { setLoading(false); }
  };

  if (!__gate.ok) return __gate.node;

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Image source={require('../../assets/images/illustrations/loading_bg.jpg')} style={{ width: '100%', height: 110, borderRadius: 18, marginBottom: 14 }} resizeMode="cover" />
        <View style={styles.head}><Replace size={24} color={accent} /><Text style={[styles.title, { color: text }]}>{t.title}</Text></View>
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
        <View style={{ paddingTop: spacing.sm, paddingBottom: spacing.xs }}>
          <SubmitBar label={t.ok} onPress={() => ask(food)} disabled={loading} />
        </View>

        <View style={styles.chips}>
          {t.suggestions.map((sg: string) => (
            <TouchableOpacity key={sg} style={styles.chip} onPress={() => ask(sg)}><Text style={styles.chipTxt}>{sg}</Text></TouchableOpacity>
          ))}
        </View>

        {loading && <View style={styles.center}><ActivityIndicator color={accent} /><Text style={[styles.loadingTxt, { color: sub }]}>{t.loading}</Text></View>}
        {!!result && (
          <View style={[styles.resultCard, { backgroundColor: card }]}>
            {!!priority && (
              <View style={[styles.prioRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <Text style={[styles.prioNote, { color: sub }, align]}>{t.prioNote}</Text>
                <View style={styles.bestBadge}>
                  <Sparkles size={12} color="#fff" />
                  <Text style={styles.bestBadgeTxt}>{`${t.bestFor} · ${t.prio[priority]}`}</Text>
                </View>
              </View>
            )}
            <Text style={[styles.resultTxt, { color: resultTxtColor }, align]}>{result}</Text>
          </View>
        )}
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
  title: { fontSize: 26, fontWeight: '900', color: '#0F172A', letterSpacing: -0.5 },
  sub: { fontSize: 14, color: '#64748B', lineHeight: 20, marginBottom: 20 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 4, marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  input: { flex: 1, fontSize: 15, color: '#0F172A', paddingVertical: 12 },
  go: { backgroundColor: k.accent, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8 },
  goTxt: { color: '#fff', fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: 20 },
  chip: { backgroundColor: '#EAF4EE', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  chipTxt: { color: k.accent, fontWeight: '700', fontSize: 14 },
  center: { alignItems: 'center', paddingVertical: 24 },
  loadingTxt: { color: '#64748B', marginTop: 10, fontWeight: '600' },
  resultCard: { backgroundColor: '#fff', borderRadius: 18, padding: 18, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  resultTxt: { fontSize: 14.5, color: '#1F2937', lineHeight: 22 },
  prioRow: { alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  prioNote: { fontSize: 12.5, fontWeight: '600', flexShrink: 1 },
  bestBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: k.accent, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  bestBadgeTxt: { color: '#fff', fontWeight: '800', fontSize: 11.5 },
});
