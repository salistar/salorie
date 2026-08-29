// Carte "Insights IA" — consomme les modèles ML backend (/ml).
//  - Prévision de poids + détection de plateau (régression + EMA serveur)
//  - Recommandation de repas (scoring macro vs objectif)
// Autonome : récupère le profil, appelle les endpoints, gère loading/erreur/no-data.
// Theme-aware (light/dark) + trilingue (en/fr/ar).
import React, { useEffect, useState } from 'react';
import { useTokens } from '../constants/tokens';
import { a11y } from '../lib/a11y';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { TrendingDown, TrendingUp, Minus, Sparkles, Utensils, AlertTriangle, RefreshCw } from 'lucide-react-native';
import { auth } from '../lib/firebaseAuth';
import { getUserFromFirestore } from '../lib/firebase';
import { mlWeightForecast, mlMealReco, WeightForecast, MealReco } from '../lib/mlApi';
import { localWeightForecast, localMealReco } from '../lib/localInsights';
import { useTranslation } from '../lib/i18n';
import { useTheme } from '../lib/ThemeContext';

const GREEN = '#2E8B57';

const TXT: any = {
  en: {
    srcLocal: 'On-device', srcServer: 'Server', srcAi: 'AI',
    title: 'AI Insights', unavailable: 'Unavailable', weightForecast: 'Weight forecast',
    perWeek: 'kg/wk', losing: 'losing', gaining: 'gaining', stable: 'stable', conf: 'conf.',
    plateau: 'Plateau detected — adjust calories or activity.',
    goalIn: (w: number, d: number) => `Target ${w} kg in ~${d} days`,
    activate: 'Log your weight for a few days to enable forecasting.',
    recoMeals: 'Recommended meals', footer: 'ML models · Salorie server',
  },
  fr: {
    srcLocal: 'Sur l’appareil', srcServer: 'Serveur', srcAi: 'IA',
    title: 'Insights IA', unavailable: 'Indisponible', weightForecast: 'Prévision de poids',
    perWeek: 'kg/sem', losing: 'de perte', gaining: 'de prise', stable: 'stable', conf: 'conf.',
    plateau: 'Plateau détecté — ajuste calories ou activité.',
    goalIn: (w: number, d: number) => `Objectif ${w} kg dans ~${d} jours`,
    activate: 'Enregistre ton poids quelques jours pour activer la prévision.',
    recoMeals: 'Repas recommandés', footer: 'Modèles ML · serveur Salorie',
  },
  ar: {
    srcLocal: 'على الجهاز', srcServer: 'الخادم', srcAi: 'ذكاء',
    title: 'رؤى الذكاء الاصطناعي', unavailable: 'غير متاح', weightForecast: 'توقع الوزن',
    perWeek: 'كغ/أسبوع', losing: 'نقصان', gaining: 'زيادة', stable: 'ثابت', conf: 'ثقة',
    plateau: 'تم رصد ثبات — عدّل السعرات أو النشاط.',
    goalIn: (w: number, d: number) => `الهدف ${w} كغ خلال ~${d} يوم`,
    activate: 'سجّل وزنك لبضعة أيام لتفعيل التوقع.',
    recoMeals: 'وجبات موصى بها', footer: 'نماذج ML · خادم Salorie',
  },
};

type Props = {
  weightHistory?: any[];
  remaining?: { kcal: number; p: number; c: number; f: number };
  goal?: 'lose' | 'maintain' | 'gain';
};

function MlInsightsCard({ weightHistory, remaining: propRemaining, goal: propGoal }: Props = {}) {
  const k = useTokens();
  const { language, isRTL } = useTranslation() as any;
  const tx = TXT[language] || TXT.en;
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  // Accent thémé : GREEN est le vert CLAIR ; en sombre on utilise le token
  // dark officiel (contraste correct sur fond sombre).
  const accent = isDark ? '#4ade80' : GREEN;
  const tok = useTokens();
  const cardBg = tok.surface;
  const titleColor = tok.text;
  const blockColor = isDark ? '#cbd5e1' : '#334155';
  const trendColor = tok.text;
  const subColor = isDark ? '#94a3b8' : '#94A3B8';
  const mealNameColor = isDark ? '#e2e8f0' : '#0F172A';

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [forecast, setForecast] = useState<WeightForecast | null>(null);
  const [meals, setMeals] = useState<MealReco | null>(null);
  // Quel tier de la cascade a servi : local (on-device) → server (/ml) → ai (Gemini).
  const [source, setSource] = useState<'local' | 'server' | 'ai' | null>(null);

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const email = auth.currentUser?.email || (auth.currentUser as any)?.uid || '';
      const profile: any = email ? await getUserFromFirestore(email).catch(() => null) : null;
      const plan = profile?.nutritionalPlan || profile || {};
      const goal = propGoal || ((profile?.goal === 'lose' || profile?.goal === 'gain') ? profile.goal : 'maintain');
      const remaining = propRemaining || {
        kcal: Number(plan.dailyCalories || profile?.dailyCalories || 2000),
        p: Number(plan.protein || profile?.protein || 120),
        c: Number(plan.carbs || profile?.carbs || 200),
        f: Number(plan.fat || profile?.fat || 60),
      };
      const history = weightHistory || profile?.weightHistory || profile?.weight_history || [];
      const targetWeight = Number(profile?.targetWeight || plan?.targetWeight) || undefined;

      // ───── CASCADE : 1) LOCAL (on-device, gratuit, hors-ligne) ─────
      let wf: WeightForecast | null = localWeightForecast(history, targetWeight);
      let mr: MealReco | null = localMealReco(remaining, goal as any, 3);
      let src: 'local' | 'server' | 'ai' = 'local';

      // ───── 2) BACKEND (/ml) si le local manque de données ─────
      if (!wf?.ok) {
        const bwf = await mlWeightForecast(targetWeight).catch(() => null);
        if (bwf?.ok) { wf = bwf; src = 'server'; }
      }
      if (!mr?.ok || !mr.recommendations?.length) {
        const bmr = await mlMealReco(remaining, goal as any, 3).catch(() => null);
        if (bmr?.ok) { mr = bmr; if (src !== 'server') src = 'server'; }
      }

      // ───── 3) GEMINI : tier IA de secours au niveau écran ─────
      // La narration IA (résumé/reco) est fournie par les cartes Bento de
      // analytics.tsx via InsightsService→Gemini. Si local ET backend échouent
      // pour la prévision, on affiche l'état « enregistre ton poids » et la
      // narration Gemini prend le relais plus bas dans l'écran.

      setForecast(wf); setMeals(mr); setSource(src);
    } catch (e: any) {
      setErr(e?.message || 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const dirLabel = (d?: string) => d === 'losing' ? tx.losing : d === 'gaining' ? tx.gaining : tx.stable;

  return (
    <View style={[styles.card, { backgroundColor: cardBg }]}>
      <View style={[styles.header, isRTL && { flexDirection: 'row-reverse' }]}>
        <Sparkles size={18} color={accent} />
        <Text style={[styles.title, { color: titleColor }, isRTL && { marginLeft: 0, marginRight: 8, textAlign: 'right' }]}>{tx.title}</Text>
        {source && !loading && (
          <View style={[styles.srcBadge, { backgroundColor: isDark ? 'rgba(46,139,87,0.18)' : '#EAF4EE' }]}>
            <Text style={styles.srcBadgeTxt}>{source === 'local' ? tx.srcLocal : source === 'server' ? tx.srcServer : tx.srcAi}</Text>
          </View>
        )}
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('rafraichir')} onPress={load} style={styles.refresh} hitSlop={10}>
          <RefreshCw size={15} color={subColor} />
        </TouchableOpacity>
      </View>

      {loading && <ActivityIndicator color={accent} style={{ marginVertical: 16 }} />}
      {!loading && err && <Text style={[styles.muted, { color: subColor }]}>{tx.unavailable} ({err})</Text>}

      {!loading && !err && (
        <>
          {/* Prévision de poids */}
          <View style={styles.block}>
            <Text style={[styles.blockTitle, { color: blockColor }]}>{tx.weightForecast}</Text>
            {forecast?.ok ? (
              <View>
                <View style={[styles.row, isRTL && { flexDirection: 'row-reverse' }]}>
                  {forecast.direction === 'losing' ? <TrendingDown size={18} color={accent} />
                    : forecast.direction === 'gaining' ? <TrendingUp size={18} color="#E11D48" />
                    : <Minus size={18} color="#94A3B8" />}
                  <Text style={[styles.trend, { color: trendColor }, isRTL && { marginLeft: 0, marginRight: 8, textAlign: 'right' }]}>
                    {Math.abs(forecast.trendKgPerWeek || 0).toFixed(2)} {tx.perWeek} {dirLabel(forecast.direction)}
                  </Text>
                  <Text style={[styles.conf, { color: subColor }]}>{tx.conf} {Math.round((forecast.confidence || 0) * 100)}%</Text>
                </View>
                {forecast.plateau && (
                  <View style={styles.warn}>
                    <AlertTriangle size={14} color="#B45309" />
                    <Text style={styles.warnTxt}>{tx.plateau}</Text>
                  </View>
                )}
                {forecast.projection && (
                  <Text style={styles.proj}>
                    {tx.goalIn(forecast.projection.targetWeight, forecast.projection.daysToGoal)}
                  </Text>
                )}
              </View>
            ) : (
              <Text style={[styles.muted, { color: subColor }]}>{tx.activate}</Text>
            )}
          </View>

          {/* Reco repas */}
          <View style={styles.block}>
            <View style={[styles.row, isRTL && { flexDirection: 'row-reverse' }]}>
              <Utensils size={15} color={accent} />
              <Text style={[styles.blockTitle, { color: blockColor }]}>  {tx.recoMeals}</Text>
            </View>
            {meals?.recommendations?.length ? meals.recommendations.map((m, i) => (
              <View key={i} style={[styles.meal, isRTL && { flexDirection: 'row-reverse' }]}>
                <Text style={[styles.mealName, { color: mealNameColor }]} numberOfLines={1}>{m.name}</Text>
                <Text style={[styles.mealMacro, { color: subColor }]}>{m.kcal} kcal · {m.p}g P</Text>
              </View>
            )) : <Text style={[styles.muted, { color: subColor }]}>—</Text>}
          </View>
          <Text style={[styles.footer, { color: k.textFaint, textAlign: isRTL ? 'left' : 'right' }]}>{tx.footer}</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 16, marginHorizontal: 16, marginVertical: 8,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  title: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginStart: 8, flex: 1 },
  srcBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginEnd: 6 },
  srcBadgeTxt: { fontSize: 10, fontWeight: '800', color: '#2E8B57', textTransform: 'uppercase', letterSpacing: 0.3 },
  refresh: { padding: 4 },
  block: { marginTop: 10 },
  blockTitle: { fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center' },
  trend: { fontSize: 14, fontWeight: '600', color: '#0F172A', marginStart: 8, flex: 1 },
  conf: { fontSize: 11, color: '#94A3B8' },
  warn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF3C7', borderRadius: 10, padding: 8, marginTop: 8 },
  warnTxt: { fontSize: 12, color: '#92400E', marginStart: 6, flex: 1 },
  proj: { fontSize: 13, color: GREEN, marginTop: 6, fontWeight: '600' },
  meal: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 },
  mealName: { fontSize: 13, color: '#0F172A', flex: 1, marginEnd: 8 },
  mealMacro: { fontSize: 12, color: '#64748B' },
  muted: { fontSize: 13, color: '#94A3B8', marginTop: 4 },
  footer: { fontSize: 10, color: '#CBD5E1', marginTop: 12, textAlign: 'right' },
});

// PERF #17 : carte presentational / props-driven — memoïsée pour éviter les
// re-rendus quand les props (weightHistory/remaining/goal) sont inchangées.
export default React.memo(MlInsightsCard);
