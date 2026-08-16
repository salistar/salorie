// Jumeau métabolique — projette ton poids selon ce que tu manges (+ ETA objectif).
import React, { useEffect, useState } from 'react';
import { a11y } from '../../lib/a11y';
import { useTokens } from '../../constants/tokens';
import { Image, View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView, ActivityIndicator } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { Minus, Plus, TrendingDown, Flag } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { useScreenGate } from '../../components/FeatureGate';
import ScreenTitle from '../../components/ui/ScreenTitle';
import { spacing, type } from '../../constants/theme';
import { getUserFromFirestore } from '../../lib/firebase';
import { ProfileLite, estimateTDEE, projectWeight, weeklyRate, weeksToGoal } from '../../lib/projections';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { rowDir, txtAlign } from '../../lib/rtl';

const TXT: any = {
  en: {
    title: 'Metabolic twin', sub1: 'Simulate the effect of your diet on your weight (estimate, TDEE ≈ ', sub2: ' kcal).', ifIEat: 'If I eat every day…', heroLabel: 'Estimated weight in 30 days', perWeek: 'kg/wk', d7: '7 days', d30: '30 days', d90: '90 days', goal: 'Goal', notSet: '(not set)', etaA: '≈ ', etaB: ' weeks at this pace (~', etaC: ' months)', etaEmpty: 'Set a weight goal and a deficit/surplus to estimate the date.',
    howTitle: 'What this is',
    howBody1: 'Your metabolic twin is a simple energy-balance model of your body. It projects how your weight would change if you kept eating a chosen number of calories every day. Move the stepper to test different intakes.',
    howMathTitle: 'How the math works',
    howBody2: 'It compares your daily intake to your maintenance calories (TDEE — the energy you burn per day). Eating below maintenance creates a deficit (you lose weight); above it creates a surplus (you gain).',
    fTdee: 'Maintenance (TDEE)',
    fTdeeBody: 'Estimated from your weight using a standard activity-adjusted rate. The classic basis is the Mifflin-St Jeor BMR (10·kg + 6.25·cm − 5·age + s) multiplied by an activity factor; here a simplified ~31 kcal/kg of body weight is used:',
    fEnergy: 'Energy per kg',
    fEnergyBody: '1 kg of body mass ≈ 7700 kcal.',
    fProjection: 'Weight projection',
    fProjBody: 'Future weight = current weight + ((intake − TDEE) × days) ÷ 7700',
    fPlug: 'With your numbers',
    fRate: 'Weekly rate = (intake − TDEE) × 7 ÷ 7700',
    kcalDay: 'kcal/day',
    disclaimer: 'Estimate for guidance only — not a medical diagnosis.',
  },
  fr: {
    title: 'Jumeau métabolique', sub1: "Simule l'effet de ton alimentation sur ton poids (estimation, TDEE ≈ ", sub2: ' kcal).', ifIEat: 'Si je mange chaque jour…', heroLabel: 'Poids estimé dans 30 jours', perWeek: 'kg/sem', d7: '7 jours', d30: '30 jours', d90: '90 jours', goal: 'Objectif', notSet: '(non défini)', etaA: '≈ ', etaB: ' semaines à ce rythme (~', etaC: ' mois)', etaEmpty: 'Définis un objectif de poids et un déficit/surplus pour estimer la date.',
    howTitle: "Ce que c'est",
    howBody1: "Ton jumeau métabolique est un modèle simple de bilan énergétique de ton corps. Il projette l'évolution de ton poids si tu continuais à manger un certain nombre de calories chaque jour. Utilise le sélecteur pour tester différents apports.",
    howMathTitle: 'Comment le calcul fonctionne',
    howBody2: "Il compare ton apport quotidien à tes calories de maintenance (TDEE — l'énergie que tu brûles par jour). Manger sous la maintenance crée un déficit (tu perds du poids) ; au-dessus, un surplus (tu en prends).",
    fTdee: 'Maintenance (TDEE)',
    fTdeeBody: "Estimée à partir de ton poids avec un taux ajusté à l'activité. La base classique est le métabolisme de base Mifflin-St Jeor (10·kg + 6,25·cm − 5·âge + s) multiplié par un facteur d'activité ; ici un ~31 kcal/kg de poids corporel simplifié est utilisé :",
    fEnergy: 'Énergie par kg',
    fEnergyBody: '1 kg de masse corporelle ≈ 7700 kcal.',
    fProjection: 'Projection du poids',
    fProjBody: 'Poids futur = poids actuel + ((apport − TDEE) × jours) ÷ 7700',
    fPlug: 'Avec tes chiffres',
    fRate: 'Rythme hebdo = (apport − TDEE) × 7 ÷ 7700',
    kcalDay: 'kcal/jour',
    disclaimer: 'Estimation à titre indicatif — pas un diagnostic médical.',
  },
  ar: {
    title: 'التوأم الأيضي', sub1: 'حاكِ تأثير غذائك على وزنك (تقدير، TDEE ≈ ', sub2: ' سعرة).', ifIEat: 'إذا أكلت كل يوم…', heroLabel: 'الوزن المقدَّر بعد 30 يوماً', perWeek: 'كغ/أسبوع', d7: '7 أيام', d30: '30 يوماً', d90: '90 يوماً', goal: 'الهدف', notSet: '(غير محدد)', etaA: '≈ ', etaB: ' أسبوعاً بهذا الإيقاع (~', etaC: ' أشهر)', etaEmpty: 'حدد هدف وزن وعجزاً/فائضاً لتقدير الموعد.',
    howTitle: 'ما هذا',
    howBody1: 'توأمك الأيضي هو نموذج بسيط لتوازن الطاقة في جسمك. يتوقع كيف سيتغيّر وزنك إذا واصلت أكل عدد معيّن من السعرات كل يوم. حرّك المُحدِّد لتجربة كميات مختلفة.',
    howMathTitle: 'كيف يعمل الحساب',
    howBody2: 'يقارن استهلاكك اليومي بسعرات الصيانة (TDEE — الطاقة التي تحرقها يومياً). الأكل تحت الصيانة يخلق عجزاً (تفقد الوزن) ؛ وفوقها يخلق فائضاً (تكتسب الوزن).',
    fTdee: 'الصيانة (TDEE)',
    fTdeeBody: 'تُقدَّر من وزنك بمعدل معدّل حسب النشاط. الأساس الكلاسيكي هو معدل الأيض الأساسي Mifflin-St Jeor (10·كغ + 6.25·سم − 5·العمر + s) مضروباً في عامل النشاط ؛ هنا يُستخدم ~31 سعرة/كغ من وزن الجسم بشكل مبسّط:',
    fEnergy: 'الطاقة لكل كغ',
    fEnergyBody: '1 كغ من كتلة الجسم ≈ 7700 سعرة.',
    fProjection: 'توقّع الوزن',
    fProjBody: 'الوزن المستقبلي = الوزن الحالي + ((الاستهلاك − TDEE) × الأيام) ÷ 7700',
    fPlug: 'بأرقامك',
    fRate: 'المعدل الأسبوعي = (الاستهلاك − TDEE) × 7 ÷ 7700',
    kcalDay: 'سعرة/يوم',
    disclaimer: 'تقدير لأغراض إرشادية فقط — ليس تشخيصاً طبياً.',
  },
};

export default function MetabolicTwinScreen() {
  const __gate = useScreenGate('metabolic-twin');
  const { colors, resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';
  const GREEN = colors.primary;
  const tok = useTokens();
  const bg = tok.bg;
  const card = tok.surface;
  const text = tok.text;
  const sub = tok.textMuted;
  const align: any = { textAlign: txtAlign(isRTL) };
  const cardBorder = isDark ? { borderWidth: 1, borderColor: '#283241' } : null;
  const shadow = isDark ? { shadowColor: 'transparent', elevation: 0 } : null;

  const { user } = useUser();
  const [p, setP] = useState<ProfileLite | null>(null);
  const [intake, setIntake] = useState(2000);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const email = user?.primaryEmailAddress?.emailAddress;
        if (!email) return;
        const prof: any = await getUserFromFirestore(email, user?.id);
        const lite: ProfileLite = {
          weight: Number(prof?.weight) || Number(prof?.currentWeight) || 70,
          targetWeight: Number(prof?.targetWeight) || Number(prof?.goalWeight) || undefined,
          goal: prof?.goal,
          dailyCalories: Number(prof?.nutritionalPlan?.dailyCalories) || 2000,
        };
        setP(lite);
        setIntake(lite.dailyCalories || 2000);
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  if (loading || !p) {
    return <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}><ScreenTopBar showBack showNotif={false} /><View style={styles.center}><ActivityIndicator color={GREEN} /></View></SafeAreaView>;
  }

  const tdee = estimateTDEE(p);
  const w30 = projectWeight(p, intake, 30);
  const w7 = projectWeight(p, intake, 7);
  const w90 = projectWeight(p, intake, 90);
  const delta30 = Math.round((w30 - (p.weight || 70)) * 10) / 10;
  const eta = weeksToGoal({ ...p, dailyCalories: intake });
  const rate = weeklyRate({ ...p, dailyCalories: intake });

  if (!__gate.ok) return __gate.node;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body}>
        <Image source={require('../../assets/images/illustrations/scale.jpg')} style={{ width: '100%', height: 110, borderRadius: 18, marginBottom: 14 }} resizeMode="cover" />
        <View style={{ marginHorizontal: -spacing.xl }}>
          <ScreenTitle title={t.title} icon={<TrendingDown size={24} color={GREEN} />} subtitle={`${t.sub1}${tdee}${t.sub2}`} />
        </View>

        <Text style={[styles.label, { color: sub }, align]}>{t.ifIEat}</Text>
        <View style={[styles.stepper, { flexDirection: rowDir(isRTL) }]}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('retirer')} style={[styles.stepBtn, isDark && { backgroundColor: '#1e3a2f' }]} onPress={() => setIntake((v) => Math.max(800, v - 100))}><Minus size={22} color={GREEN} /></TouchableOpacity>
          <View style={styles.intakeWrap}><Text style={[styles.intake, { color: text }]}>{intake}</Text><Text style={[styles.unit, { color: sub }]}>kcal</Text></View>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('ajouter')} style={[styles.stepBtn, isDark && { backgroundColor: '#1e3a2f' }]} onPress={() => setIntake((v) => Math.min(5000, v + 100))}><Plus size={22} color={GREEN} /></TouchableOpacity>
        </View>

        <View style={[styles.hero, { backgroundColor: GREEN }]}>
          <Text style={styles.heroLabel}>{t.heroLabel}</Text>
          <Text style={styles.heroValue}>{w30}<Text style={styles.heroUnit}> kg</Text></Text>
          <Text style={[styles.heroDelta, { color: delta30 <= 0 ? '#fff' : '#FECDD3' }]}>{delta30 > 0 ? '+' : ''}{delta30} kg · {rate > 0 ? '+' : ''}{rate} {t.perWeek}</Text>
        </View>

        <View style={[styles.row, { flexDirection: rowDir(isRTL) }]}>
          <View style={[styles.cell, { backgroundColor: card }, cardBorder, shadow]}><Text style={[styles.cellV, { color: text }]}>{w7} kg</Text><Text style={[styles.cellL, { color: sub }]}>{t.d7}</Text></View>
          <View style={[styles.cell, { backgroundColor: card }, cardBorder, shadow]}><Text style={[styles.cellV, { color: text }]}>{w30} kg</Text><Text style={[styles.cellL, { color: sub }]}>{t.d30}</Text></View>
          <View style={[styles.cell, { backgroundColor: card }, cardBorder, shadow]}><Text style={[styles.cellV, { color: text }]}>{w90} kg</Text><Text style={[styles.cellL, { color: sub }]}>{t.d90}</Text></View>
        </View>

        <View style={[styles.etaCard, { backgroundColor: card }, cardBorder, shadow, { flexDirection: rowDir(isRTL) }]}>
          <Flag size={20} color={GREEN} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.etaTitle, { color: text }, align]}>{t.goal} {p.targetWeight ? `${p.targetWeight} kg` : t.notSet}</Text>
            <Text style={[styles.etaSub, { color: sub }, align]}>{eta ? `${t.etaA}${eta}${t.etaB}${Math.ceil(eta / 4)}${t.etaC}` : t.etaEmpty}</Text>
          </View>
        </View>

        <View style={[styles.howCard, { backgroundColor: card }, cardBorder, shadow]}>
          <Text style={[styles.howTitle, { color: GREEN }, align]}>{t.howTitle}</Text>
          <Text style={[styles.howBody, { color: sub }, align]}>{t.howBody1}</Text>

          <Text style={[styles.howSubTitle, { color: text }, align]}>{t.howMathTitle}</Text>
          <Text style={[styles.howBody, { color: sub }, align]}>{t.howBody2}</Text>

          <View style={[styles.mathBox, { backgroundColor: GREEN + '14' }]}>
            <Text style={[styles.mathLabel, { color: GREEN }, align]}>{t.fTdee}</Text>
            <Text style={[styles.mathBody, { color: text }, align]}>{t.fTdeeBody}</Text>
            <Text style={[styles.mathFormula, { color: text }, align]}>TDEE ≈ {p.weight} kg × 31 = {tdee} {t.kcalDay}</Text>

            <View style={[styles.mathSep, { backgroundColor: isDark ? '#334155' : '#D7E8DD' }]} />
            <Text style={[styles.mathLabel, { color: GREEN }, align]}>{t.fEnergy}</Text>
            <Text style={[styles.mathBody, { color: text }, align]}>{t.fEnergyBody}</Text>

            <View style={[styles.mathSep, { backgroundColor: isDark ? '#334155' : '#D7E8DD' }]} />
            <Text style={[styles.mathLabel, { color: GREEN }, align]}>{t.fProjection}</Text>
            <Text style={[styles.mathFormula, { color: text }, align]}>{t.fProjBody}</Text>
            <Text style={[styles.mathBody, { color: sub }, align]}>{t.fPlug}: {p.weight} + (({intake} − {tdee}) × 30) ÷ 7700 = {w30} kg</Text>

            <View style={[styles.mathSep, { backgroundColor: isDark ? '#334155' : '#D7E8DD' }]} />
            <Text style={[styles.mathLabel, { color: GREEN }, align]}>{t.fRate}</Text>
            <Text style={[styles.mathFormula, { color: text }, align]}>({intake} − {tdee}) × 7 ÷ 7700 = {rate} {t.perWeek}</Text>
          </View>
        </View>

        <Text style={[styles.disclaimer, { color: sub }]}>{t.disclaimer}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F7F9' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 20, paddingBottom: 100 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  title: { fontSize: 26, fontWeight: '900', color: '#0F172A', letterSpacing: -0.5 },
  sub: { fontSize: 14, color: '#64748B', lineHeight: 20, marginBottom: 22 },
  label: { fontSize: 13, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  stepBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#EAF4EE', alignItems: 'center', justifyContent: 'center' },
  intakeWrap: { alignItems: 'center' },
  intake: { fontSize: 40, fontWeight: '900', color: '#0F172A', letterSpacing: -1 },
  unit: { fontSize: 13, color: '#94A3B8', fontWeight: '700' },
  hero: { borderRadius: 24, padding: 24, alignItems: 'center', marginBottom: 16 },
  heroLabel: { color: '#E7F5EC', fontSize: 13, fontWeight: '600' },
  heroValue: { color: '#fff', fontSize: 48, fontWeight: '900', letterSpacing: -2, marginTop: 4 },
  heroUnit: { fontSize: 20, fontWeight: '700' },
  heroDelta: { fontSize: 15, fontWeight: '800', marginTop: 4, color: '#fff' },
  row: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  cell: { flex: 1, backgroundColor: '#fff', borderRadius: 16, paddingVertical: 16, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  cellV: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  cellL: { fontSize: 12, color: '#94A3B8', marginTop: 4 },
  etaCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#fff', borderRadius: 18, padding: 18, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  etaTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  etaSub: { fontSize: 13, color: '#64748B', marginTop: 3, lineHeight: 18 },
  howCard: { backgroundColor: '#fff', borderRadius: 20, padding: 18, marginTop: 18, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  howTitle: { fontSize: 18, fontWeight: '900', marginBottom: 10 },
  howSubTitle: { fontSize: 15, fontWeight: '800', marginTop: 6, marginBottom: 8 },
  howBody: { fontSize: 14, lineHeight: 21, marginBottom: 10 },
  mathBox: { borderRadius: 14, padding: 14, marginTop: 4 },
  mathLabel: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  mathBody: { fontSize: 13, lineHeight: 19, marginBottom: 4 },
  mathFormula: { fontSize: 13, fontWeight: '800', lineHeight: 19, marginBottom: 2 },
  mathSep: { height: 1, marginVertical: 12 },
  disclaimer: { ...type.micro, textAlign: 'center', marginTop: spacing.lg, lineHeight: 18 },
});
