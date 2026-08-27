import React, { useEffect, useState, useCallback } from 'react';
import {
  Image,
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { router } from 'expo-router';
import { Activity, TrendingDown, TrendingUp, Check, Scale, Utensils } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { useScreenGate } from '../../components/FeatureGate';
import { ScreenTitle } from '../../components/ui';
import { getUserFromFirestore, updateDailyCalories } from '../../lib/firebase';
import { getEntries } from '../../lib/tracking';
import { computeAdaptiveTDEE, AdaptiveResult } from '../../lib/adaptiveTDEE';
import { useTheme } from '../../lib/ThemeContext';
import { useTokens } from '../../constants/tokens';
import { useTranslation } from '../../lib/i18n';
import { rowDir, txtAlign } from '../../lib/rtl';

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
    confGeneric: 'Adjusted every week',
    recalibrateNote: 'Your TDEE recalibrates itself automatically every week as new meals and weigh-ins come in.',
    avgIntake: 'Real average intake',
    days: 'd', kcalDay: 'kcal/day',
    weightTrend: 'Weight trend',
    kgWeek: 'kg/wk', weighIns: 'weigh-ins',
    recommended: 'Recommended target for your goal',
    currentTarget: 'Current target:',
    applied: 'Target applied',
    apply: 'Apply this target',
    foot: "The estimate gets sharper with every logged meal and every weigh-in.",
    howTitle: 'How it is computed',
    howBody1: 'Adaptive TDEE learns your real maintenance calories from what actually happens to your body, not from a generic formula. It compares how much you ate with how your weight moved over the last weeks.',
    howBody2: 'Over a rolling window (~21 days) it measures two things: your real average daily intake from logged meals, and your weight trend using a linear regression over your weigh-ins (regression is robust to daily scale noise).',
    howMethodLabel: 'The method',
    howMethod: 'Real TDEE = average intake − (weight change per day × 7700 kcal/kg)',
    howBody3: 'Each kg of body mass is about 7700 kcal. If you are losing weight while eating a known amount, your body must be burning more than you eat — so your true maintenance is higher than your intake. It recalibrates automatically every time you open the screen.',
    howNeed: 'What it needs: ~7+ days of logged meals and at least 2 weigh-ins spaced ~7 days apart.',
    addData: 'Add my data',
    addWeight: 'Log my weight',
    logMeal: 'Log a meal',
    signInPrompt: 'Sign in to add your data and unlock your TDEE.',
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
    confGeneric: 'Ajusté chaque semaine',
    recalibrateNote: 'Ton TDEE se recalibre tout seul automatiquement chaque semaine, au fil des nouveaux repas et pesées.',
    avgIntake: 'Apport moyen réel',
    days: 'j', kcalDay: 'kcal/j',
    weightTrend: 'Tendance poids',
    kgWeek: 'kg/sem', weighIns: 'pesées',
    recommended: 'Cible conseillée pour ton objectif',
    currentTarget: 'Cible actuelle :',
    applied: 'Cible appliquée',
    apply: 'Appliquer cette cible',
    foot: "L'estimation s'affine à chaque repas loggé et chaque pesée.",
    howTitle: 'Comment c\'est calculé',
    howBody1: "Le TDEE adaptatif apprend tes vraies calories de maintenance à partir de ce qui arrive réellement à ton corps, et non d'une formule générique. Il compare ce que tu as mangé à l'évolution de ton poids sur les dernières semaines.",
    howBody2: "Sur une fenêtre glissante (~21 jours), il mesure deux choses : ton apport quotidien moyen réel à partir des repas loggés, et ta tendance de poids via une régression linéaire sur tes pesées (la régression résiste au bruit quotidien de la balance).",
    howMethodLabel: 'La méthode',
    howMethod: 'TDEE réel = apport moyen − (variation de poids par jour × 7700 kcal/kg)',
    howBody3: "Chaque kg de masse corporelle vaut environ 7700 kcal. Si tu perds du poids tout en mangeant une quantité connue, ton corps brûle plus que tu ne manges — ta vraie maintenance est donc supérieure à ton apport. Il se recalibre automatiquement à chaque ouverture de l'écran.",
    howNeed: "Ce qu'il faut : ~7 jours et plus de repas loggés et au moins 2 pesées espacées d'environ 7 jours.",
    addData: 'Ajouter mes données',
    addWeight: 'Logger mon poids',
    logMeal: 'Logger un repas',
    signInPrompt: 'Connecte-toi pour ajouter tes données et débloquer ton TDEE.',
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
    confGeneric: 'يُضبط كل أسبوع',
    recalibrateNote: 'يُعيد TDEE الخاص بك معايرة نفسه تلقائياً كل أسبوع مع كل وجبة ووزنة جديدة.',
    avgIntake: 'متوسط الاستهلاك الفعلي',
    days: 'ي', kcalDay: 'سعرة/يوم',
    weightTrend: 'اتجاه الوزن',
    kgWeek: 'كغ/أسبوع', weighIns: 'وزنات',
    recommended: 'الهدف الموصى به لهدفك',
    currentTarget: 'الهدف الحالي:',
    applied: 'تم تطبيق الهدف',
    apply: 'طبّق هذا الهدف',
    foot: 'يزداد التقدير دقة مع كل وجبة مسجلة وكل وزنة.',
    howTitle: 'كيف يُحسب',
    howBody1: 'يتعلّم TDEE التكيفي سعرات الصيانة الحقيقية من ما يحدث فعلاً لجسمك، وليس من معادلة عامة. يقارن كمية ما أكلته بكيفية تغيّر وزنك خلال الأسابيع الماضية.',
    howBody2: 'على مدى نافذة متحركة (~21 يوماً) يقيس أمرين: متوسط استهلاكك اليومي الحقيقي من الوجبات المسجلة، واتجاه وزنك باستخدام انحدار خطي على وزناتك (الانحدار مقاوم لضوضاء الميزان اليومية).',
    howMethodLabel: 'الطريقة',
    howMethod: 'TDEE الحقيقي = متوسط الاستهلاك − (تغيّر الوزن في اليوم × 7700 سعرة/كغ)',
    howBody3: 'كل كيلوغرام من كتلة الجسم يساوي حوالي 7700 سعرة. إذا كنت تفقد الوزن أثناء أكل كمية معروفة، فإن جسمك يحرق أكثر مما تأكل — لذا فإن صيانتك الحقيقية أعلى من استهلاكك. تُعاد المعايرة تلقائياً في كل مرة تفتح فيها الشاشة.',
    howNeed: 'ما يحتاجه: 7 أيام فأكثر من الوجبات المسجلة ووزنتان على الأقل بفارق ~7 أيام.',
    addData: 'أضف بياناتي',
    addWeight: 'سجّل وزني',
    logMeal: 'سجّل وجبة',
    signInPrompt: 'سجّل الدخول لإضافة بياناتك وفتح TDEE الخاص بك.',
  },
};

export default function AdaptiveTDEE() {
  const __gate = useScreenGate('adaptive-tdee');
  const { user } = useUser();
  const { colors, resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';
  const GREEN = colors.primary;
  // Six ternaires ecrits a la main ont laisse place aux tokens : la definition de
  // « une carte en mode sombre » n'appartient plus a cet ecran (cf. constants/tokens.ts).
  const tok = useTokens();
  const bg = tok.bg;
  const card = tok.surface;
  const text = tok.text;
  const sub = tok.textMuted;
  const muted = tok.textFaint;
  const border = tok.border;
  const align: any = { textAlign: txtAlign(isRTL) };
  const rowAlign: any = { flexDirection: rowDir(isRTL) };

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
  const confColor = conf === 'high' ? GREEN : conf === 'medium' ? tok.warningInk : tok.textFaint;
  const losing = (res?.trendKgPerWeek || 0) < 0;

  // Feature #141 — badge de confiance dérivé du nombre de jours de données déjà
  // disponibles (>=14 j = élevée, 7-13 = moyenne, <7 = faible). Additif : sert
  // notamment au badge de l'état « pas encore assez de données ».
  const dataDays = res?.intakeDays ?? 0;
  const dayConf: 'high' | 'medium' | 'low' = dataDays >= 14 ? 'high' : dataDays >= 7 ? 'medium' : 'low';
  const dayConfLabel = dayConf === 'high' ? t.confHigh : dayConf === 'medium' ? t.confMed : t.confLow;
  const dayConfColor = dayConf === 'high' ? GREEN : dayConf === 'medium' ? tok.warningInk : tok.textFaint;

  if (!__gate.ok) return __gate.node;

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[s.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={s.body}>
        <Image source={require('../../assets/images/abstraits/hero-seance.jpg')} style={{ width: '100%', height: 110, borderRadius: 18, marginBottom: 14 }} resizeMode="cover" />
        <ScreenTitle title={t.title} icon={<Activity size={26} color={GREEN} />} subtitle={t.sub} />

        {loading ? (
          <ActivityIndicator color={GREEN} style={{ marginTop: 40 }} />
        ) : !res?.tdee ? (
          <View style={[s.card, { backgroundColor: card, borderColor: border }]}>
            <Text style={[s.cardLabel, { color: text }, align]}>{t.notEnough}</Text>
            <View style={[s.confPill, s.confPillInline, { backgroundColor: dataDays > 0 ? dayConfColor + '22' : GREEN + '22' }]}>
              <Text style={[s.confTxt, { color: dataDays > 0 ? dayConfColor : GREEN }]}>
                {dataDays > 0 ? `${t.confidence} ${dayConfLabel}` : t.confGeneric}
              </Text>
            </View>
            <Text style={[s.note, { color: sub }, align]}>{res?.note}</Text>
            <Text style={[s.note, { color: sub }, align]}>{t.recalibrateNote}</Text>
            <Text style={[s.hint, { color: muted }, align]}>{t.hint}</Text>
          </View>
        ) : (
          <>
            <View style={[s.heroCard, { backgroundColor: card, borderColor: border }]}>
              <Text style={[s.heroLabel, { color: muted }]}>{t.heroLabel}</Text>
              <Text style={[s.heroValue, { color: GREEN }]}>{res.tdee}</Text>
              <Text style={[s.heroUnit, { color: sub }]}>{t.perDay}</Text>
              <View style={[s.confPill, { backgroundColor: confColor + '22' }]}>
                <Text style={[s.confTxt, { color: confColor }]}>{t.confidence} {confLabel}</Text>
              </View>
              <Text style={[s.recalibrate, { color: sub }]}>{t.recalibrateNote}</Text>
            </View>

            <View style={[s.row, rowAlign]}>
              <View style={[s.statCard, { backgroundColor: card, borderColor: border }]}>
                <Text style={[s.statLabel, { color: muted }, align]}>{t.avgIntake}</Text>
                <Text style={[s.statValue, { color: text }, align]}>{res.avgIntake}</Text>
                <Text style={[s.statUnit, { color: muted }, align]}>{t.kcalDay} · {res.intakeDays} {t.days}</Text>
              </View>
              <View style={[s.statCard, { backgroundColor: card, borderColor: border }]}>
                <View style={{ flexDirection: rowDir(isRTL), alignItems: 'center', gap: 4 }}>
                  {losing ? <TrendingDown size={14} color={GREEN} /> : <TrendingUp size={14} color={tok.warningInk} />}
                  <Text style={[s.statLabel, { color: muted }]}>{t.weightTrend}</Text>
                </View>
                <Text style={[s.statValue, { color: losing ? GREEN : tok.warningInk }, align]}>
                  {res.trendKgPerWeek > 0 ? '+' : ''}{res.trendKgPerWeek}
                </Text>
                <Text style={[s.statUnit, { color: muted }, align]}>{t.kgWeek} · {res.weighIns} {t.weighIns}</Text>
              </View>
            </View>

            <View style={[s.card, { backgroundColor: card, borderColor: border }]}>
              <Text style={[s.cardLabel, { color: text }, align]}>{t.recommended}{goal ? ` (${goal})` : ''}</Text>
              <Text style={[s.recValue, { color: GREEN }, align]}>{res.recommendedTarget} <Text style={[s.recUnit, { color: sub }]}>{t.kcalDay}</Text></Text>
              {currentTarget ? (
                <Text style={[s.note, { color: sub }, align]}>{t.currentTarget} {currentTarget} {t.kcalDay}</Text>
              ) : null}
              <TouchableOpacity
                style={[s.applyBtn, { backgroundColor: GREEN, flexDirection: rowDir(isRTL) }, (applied || currentTarget === res.recommendedTarget) && s.applyBtnDone]}
                onPress={apply}
                disabled={applied || currentTarget === res.recommendedTarget}
              >
                <Check size={18} color={tok.onAccent} />
                <Text style={s.applyTxt}>
                  {applied || currentTarget === res.recommendedTarget ? t.applied : t.apply}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={[s.foot, { color: muted }]}>{res.note} {t.foot}</Text>
          </>
        )}

        <View style={[s.howCard, { backgroundColor: card, borderColor: border }]}>
          <Text style={[s.howTitle, { color: GREEN }, align]}>{t.howTitle}</Text>
          <Text style={[s.howBody, { color: sub }, align]}>{t.howBody1}</Text>
          <Text style={[s.howBody, { color: sub }, align]}>{t.howBody2}</Text>
          <View style={[s.methodBox, { backgroundColor: GREEN + '14' }]}>
            <Text style={[s.methodLabel, { color: GREEN }, align]}>{t.howMethodLabel}</Text>
            <Text style={[s.method, { color: text }, align]}>{t.howMethod}</Text>
          </View>
          <Text style={[s.howBody, { color: sub }, align]}>{t.howBody3}</Text>
          <Text style={[s.howNeed, { color: sub }, align]}>{t.howNeed}</Text>
        </View>

        {user ? (
          <View style={s.dataCard}>
            <Text style={[s.dataTitle, { color: text }, align]}>{t.addData}</Text>
            <View style={[s.dataRow, rowAlign]}>
              <TouchableOpacity style={[s.dataBtn, { backgroundColor: GREEN, flexDirection: rowDir(isRTL) }]} onPress={() => router.push('/update-weight' as any)}>
                <Scale size={18} color={tok.onAccent} />
                <Text style={s.dataBtnTxt}>{t.addWeight}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.dataBtn, s.dataBtnAlt, { borderColor: GREEN, flexDirection: rowDir(isRTL) }]} onPress={() => router.push('/log-manual' as any)}>
                <Utensils size={18} color={GREEN} />
                <Text style={[s.dataBtnTxt, { color: GREEN }]}>{t.logMeal}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <Text style={[s.signIn, align]}>{t.signInPrompt}</Text>
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
  heroValue: { fontSize: 52, fontWeight: '900', marginTop: 4 },
  heroUnit: { fontSize: 13, color: '#667085', marginTop: -4 },
  confPill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, marginTop: 12 },
  confPillInline: { alignSelf: 'flex-start', marginTop: 8 },
  confTxt: { fontSize: 12, fontWeight: '700' },
  recalibrate: { fontSize: 11, marginTop: 10, lineHeight: 16, textAlign: 'center' },
  row: { flexDirection: 'row', gap: 12, marginTop: 14 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#e6ece8' },
  statLabel: { fontSize: 11, color: '#94a3b8', fontWeight: '600' },
  statValue: { fontSize: 26, fontWeight: '800', color: '#1B2A33', marginTop: 4 },
  statUnit: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 18, marginTop: 14, borderWidth: 1, borderColor: '#e6ece8' },
  cardLabel: { fontSize: 13, fontWeight: '700', color: '#1B2A33' },
  recValue: { fontSize: 38, fontWeight: '900', marginTop: 6 },
  recUnit: { fontSize: 15, fontWeight: '600', color: '#667085' },
  note: { fontSize: 12, color: '#667085', marginTop: 6, lineHeight: 18 },
  hint: { fontSize: 12, color: '#94a3b8', marginTop: 10, lineHeight: 18 },
  applyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 14, marginTop: 16 },
  applyBtnDone: { backgroundColor: '#94a3b8' },
  applyTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  foot: { fontSize: 11, color: '#94a3b8', marginTop: 16, lineHeight: 17, textAlign: 'center' },
  howCard: { backgroundColor: '#fff', borderRadius: 18, padding: 18, marginTop: 18, borderWidth: 1, borderColor: '#e6ece8' },
  howTitle: { fontSize: 17, fontWeight: '900', marginBottom: 10 },
  howBody: { fontSize: 13, lineHeight: 20, marginBottom: 10 },
  methodBox: { borderRadius: 14, padding: 14, marginVertical: 2, marginBottom: 12 },
  methodLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  method: { fontSize: 14, fontWeight: '800', lineHeight: 20 },
  howNeed: { fontSize: 12, lineHeight: 18, fontStyle: 'italic' },
  dataCard: { marginTop: 16 },
  dataTitle: { fontSize: 14, fontWeight: '800', marginBottom: 10 },
  dataRow: { flexDirection: 'row', gap: 12 },
  dataBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 14 },
  dataBtnAlt: { backgroundColor: 'transparent', borderWidth: 1.5 },
  dataBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  signIn: { fontSize: 13, color: '#667085', marginTop: 18, lineHeight: 19, fontWeight: '600' },
});
