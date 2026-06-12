import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { Activity, TrendingDown, TrendingUp, Check } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { getUserFromFirestore, updateDailyCalories } from '../../lib/firebase';
import { getEntries } from '../../lib/tracking';
import { computeAdaptiveTDEE, AdaptiveResult } from '../../lib/adaptiveTDEE';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';

const GREEN = '#2E8B57';

const TXT: any = {
  en: {
    title: 'Adaptive TDEE',
    sub: 'Your real maintenance, learned from your logged meals + your weight trend — automatically recalibrated every week.',
    notEnough: 'Not enough data yet',
    hint: 'Log your meals every day + weigh yourself 2-3×/week. The calculation unlocks around 7 days.',
    heroLabel: 'LEARNED MAINTENANCE (TDEE)',
    perDay: 'kcal / day',
    confidence: 'Confidence:',
    confHigh: 'High', confMed: 'Medium', confLow: 'Low',
    avgIntake: 'Real average intake',
    days: 'd', kcalDay: 'kcal/day',
    weightTrend: 'Weight trend',
    kgWeek: 'kg/wk', weighIns: 'weigh-ins',
    recommended: 'Recommended target for your goal',
    currentTarget: 'Current target:',
    applied: 'Target applied',
    apply: 'Apply this target',
    foot: "The estimate gets sharper with every logged meal and every weigh-in.",
  },
  fr: {
    title: 'TDEE adaptatif',
    sub: 'Ta maintenance réelle, apprise de tes repas loggés + ta tendance de poids — recalibrée automatiquement chaque semaine.',
    notEnough: 'Pas encore assez de données',
    hint: 'Logge tes repas chaque jour + pèse-toi 2-3×/semaine. Le calcul se débloque vers 7 jours.',
    heroLabel: 'MAINTENANCE APPRISE (TDEE)',
    perDay: 'kcal / jour',
    confidence: 'Confiance :',
    confHigh: 'Élevée', confMed: 'Moyenne', confLow: 'Faible',
    avgIntake: 'Apport moyen réel',
    days: 'j', kcalDay: 'kcal/j',
    weightTrend: 'Tendance poids',
    kgWeek: 'kg/sem', weighIns: 'pesées',
    recommended: 'Cible conseillée pour ton objectif',
    currentTarget: 'Cible actuelle :',
    applied: 'Cible appliquée',
    apply: 'Appliquer cette cible',
    foot: "L'estimation s'affine à chaque repas loggé et chaque pesée.",
  },
  ar: {
    title: 'TDEE التكيفي',
    sub: 'صيانتك الحقيقية، مستخلصة من وجباتك المسجلة + اتجاه وزنك — تُعاد معايرتها تلقائياً كل أسبوع.',
    notEnough: 'لا توجد بيانات كافية بعد',
    hint: 'سجّل وجباتك يومياً + زِن نفسك 2-3 مرات في الأسبوع. يبدأ الحساب بعد حوالي 7 أيام.',
    heroLabel: 'الصيانة المُتعلَّمة (TDEE)',
    perDay: 'سعرة / يوم',
    confidence: 'الثقة:',
    confHigh: 'عالية', confMed: 'متوسطة', confLow: 'منخفضة',
    avgIntake: 'متوسط الاستهلاك الفعلي',
    days: 'ي', kcalDay: 'سعرة/يوم',
    weightTrend: 'اتجاه الوزن',
    kgWeek: 'كغ/أسبوع', weighIns: 'وزنات',
    recommended: 'الهدف الموصى به لهدفك',
    currentTarget: 'الهدف الحالي:',
    applied: 'تم تطبيق الهدف',
    apply: 'طبّق هذا الهدف',
    foot: 'يزداد التقدير دقة مع كل وجبة مسجلة وكل وزنة.',
  },
};

export default function AdaptiveTDEE() {
  const { user } = useUser();
  const { resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';
  const bg = isDark ? '#0f172a' : '#f3f6f4';
  const card = isDark ? '#1e293b' : '#ffffff';
  const text = isDark ? '#f1f5f9' : '#1B2A33';
  const sub = isDark ? '#94a3b8' : '#667085';
  const border = isDark ? '#334155' : '#e6ece8';
  const align: any = { textAlign: isRTL ? 'right' : 'left' };

  const email = user?.primaryEmailAddress?.emailAddress || '';
  const [loading, setLoading] = useState(true);
  const [res, setRes] = useState<AdaptiveResult | null>(null);
  const [goal, setGoal] = useState<string>('');
  const [currentTarget, setCurrentTarget] = useState<number | null>(null);
  const [applied, setApplied] = useState(false);

  const load = useCallback(async () => {
    if (!email) { setLoading(false); return; }
    setLoading(true);
    try {
      const [logs, weights, prof] = await Promise.all([
        getEntries(email, 'logs', 400),
        getEntries(email, 'weight_history', 200),
        getUserFromFirestore(email, user?.id).catch(() => null) as any,
      ]);
      const g = prof?.goal || prof?.nutritionalPlan?.goal || '';
      const target = Number(prof?.nutritionalPlan?.dailyCalories) || null;
      setGoal(g); setCurrentTarget(target);
      setRes(computeAdaptiveTDEE(logs || [], weights || [], g));
    } finally { setLoading(false); }
  }, [email, user?.id]);

  useEffect(() => { load(); }, [load]);

  const apply = async () => {
    if (!res?.recommendedTarget || !email) return;
    await updateDailyCalories(email, res.recommendedTarget);
    setCurrentTarget(res.recommendedTarget);
    setApplied(true);
  };

  const conf = res?.confidence;
  const confLabel = conf === 'high' ? t.confHigh : conf === 'medium' ? t.confMed : t.confLow;
  const confColor = conf === 'high' ? GREEN : conf === 'medium' ? '#B45309' : '#94a3b8';
  const losing = (res?.trendKgPerWeek || 0) < 0;

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: bg }]}>
      <ScreenTopBar />
      <ScrollView contentContainerStyle={s.body}>
        <View style={s.head}>
          <Activity size={26} color={GREEN} />
          <Text style={[s.title, { color: text }]}>{t.title}</Text>
        </View>
        <Text style={[s.sub, { color: sub }, align]}>{t.sub}</Text>

        {loading ? (
          <ActivityIndicator color={GREEN} style={{ marginTop: 40 }} />
        ) : !res?.tdee ? (
          <View style={[s.card, { backgroundColor: card, borderColor: border }]}>
            <Text style={[s.cardLabel, { color: text }, align]}>{t.notEnough}</Text>
            <Text style={[s.note, { color: sub }, align]}>{res?.note}</Text>
            <Text style={[s.hint, align]}>{t.hint}</Text>
          </View>
        ) : (
          <>
            <View style={[s.heroCard, { backgroundColor: card, borderColor: border }]}>
              <Text style={s.heroLabel}>{t.heroLabel}</Text>
              <Text style={s.heroValue}>{res.tdee}</Text>
              <Text style={[s.heroUnit, { color: sub }]}>{t.perDay}</Text>
              <View style={[s.confPill, { backgroundColor: confColor + '22' }]}>
                <Text style={[s.confTxt, { color: confColor }]}>{t.confidence} {confLabel}</Text>
              </View>
            </View>

            <View style={s.row}>
              <View style={[s.statCard, { backgroundColor: card, borderColor: border }]}>
                <Text style={s.statLabel}>{t.avgIntake}</Text>
                <Text style={[s.statValue, { color: text }]}>{res.avgIntake}</Text>
                <Text style={s.statUnit}>{t.kcalDay} · {res.intakeDays} {t.days}</Text>
              </View>
              <View style={[s.statCard, { backgroundColor: card, borderColor: border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  {losing ? <TrendingDown size={14} color={GREEN} /> : <TrendingUp size={14} color="#B45309" />}
                  <Text style={s.statLabel}>{t.weightTrend}</Text>
                </View>
                <Text style={[s.statValue, { color: losing ? GREEN : '#B45309' }]}>
                  {res.trendKgPerWeek > 0 ? '+' : ''}{res.trendKgPerWeek}
                </Text>
                <Text style={s.statUnit}>{t.kgWeek} · {res.weighIns} {t.weighIns}</Text>
              </View>
            </View>

            <View style={[s.card, { backgroundColor: card, borderColor: border }]}>
              <Text style={[s.cardLabel, { color: text }, align]}>{t.recommended}{goal ? ` (${goal})` : ''}</Text>
              <Text style={s.recValue}>{res.recommendedTarget} <Text style={[s.recUnit, { color: sub }]}>{t.kcalDay}</Text></Text>
              {currentTarget ? (
                <Text style={[s.note, { color: sub }, align]}>{t.currentTarget} {currentTarget} {t.kcalDay}</Text>
              ) : null}
              <TouchableOpacity
                style={[s.applyBtn, (applied || currentTarget === res.recommendedTarget) && s.applyBtnDone]}
                onPress={apply}
                disabled={applied || currentTarget === res.recommendedTarget}
              >
                <Check size={18} color="#fff" />
                <Text style={s.applyTxt}>
                  {applied || currentTarget === res.recommendedTarget ? t.applied : t.apply}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={s.foot}>{res.note} {t.foot}</Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f3f6f4' },
  body: { padding: 18, paddingBottom: 90 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  title: { fontSize: 26, fontWeight: '800', color: '#1B2A33' },
  sub: { fontSize: 13, color: '#667085', marginTop: 6, lineHeight: 19 },
  heroCard: { backgroundColor: '#fff', borderRadius: 20, padding: 22, alignItems: 'center', marginTop: 18, borderWidth: 1, borderColor: '#e6ece8' },
  heroLabel: { fontSize: 11, fontWeight: '700', color: '#94a3b8', letterSpacing: 1 },
  heroValue: { fontSize: 52, fontWeight: '900', color: GREEN, marginTop: 4 },
  heroUnit: { fontSize: 13, color: '#667085', marginTop: -4 },
  confPill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, marginTop: 12 },
  confTxt: { fontSize: 12, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 12, marginTop: 14 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#e6ece8' },
  statLabel: { fontSize: 11, color: '#94a3b8', fontWeight: '600' },
  statValue: { fontSize: 26, fontWeight: '800', color: '#1B2A33', marginTop: 4 },
  statUnit: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 18, marginTop: 14, borderWidth: 1, borderColor: '#e6ece8' },
  cardLabel: { fontSize: 13, fontWeight: '700', color: '#1B2A33' },
  recValue: { fontSize: 38, fontWeight: '900', color: GREEN, marginTop: 6 },
  recUnit: { fontSize: 15, fontWeight: '600', color: '#667085' },
  note: { fontSize: 12, color: '#667085', marginTop: 6, lineHeight: 18 },
  hint: { fontSize: 12, color: '#94a3b8', marginTop: 10, lineHeight: 18 },
  applyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: GREEN, borderRadius: 14, paddingVertical: 14, marginTop: 16 },
  applyBtnDone: { backgroundColor: '#94a3b8' },
  applyTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  foot: { fontSize: 11, color: '#94a3b8', marginTop: 16, lineHeight: 17, textAlign: 'center' },
});
