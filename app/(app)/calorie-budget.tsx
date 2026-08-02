// Budget calories — tes calories comme un compte en banque.
import React from 'react';
import { numLocaleFor } from '../../lib/format';
import { Image, View, Text, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { Wallet, ArrowDownCircle, ArrowUpCircle, PiggyBank } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { useScreenGate } from '../../components/FeatureGate';
import { ScreenTitle } from '../../components/ui';
import { useNutritionData } from '../../hooks/useNutritionData';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { rowDir, txtAlign } from '../../lib/rtl';

const TXT: any = {
  en: {
    title: 'Calorie budget',
    sub: 'Your calories like a bank account: allowance − meals + sport = balance.',
    heroLabel: "Today's balance",
    margin: 'You still have room 🎉',
    over: 'Budget exceeded',
    allowance: 'Allowance (goal)',
    spent: 'Spent (meals)',
    earned: 'Earned (activity)',
    balance: 'Remaining balance',
    used: 'of budget used',
    howTitle: 'How it works',
    howBody1: 'A calorie budget treats your daily calories like money in a bank account. You get a daily allowance to "spend", and every meal withdraws from it.',
    howBody2: 'Your allowance is your daily calorie goal. That goal is built from your maintenance calories (TDEE — what your body burns in a day) adjusted for your objective: a deficit if you want to lose weight, a surplus if you want to gain, or maintenance to stay the same.',
    howFormulaLabel: 'The daily formula',
    howFormula: 'Allowance − Meals eaten + Activity burned = Remaining balance',
    howBody3: 'As you log meals, the "Spent" total grows and your remaining balance drops. When you log a workout, the calories you burned are added back, giving you a little more room.',
    howBody4: 'A positive balance (green) means you still have calories to spend today. A negative balance (red) means you went over your budget. The progress bar shows the percentage of your budget already used.',
  },
  fr: {
    title: 'Budget calories',
    sub: 'Tes calories comme un compte : allocation − repas + sport = solde.',
    heroLabel: 'Solde du jour',
    margin: 'Il te reste de la marge 🎉',
    over: 'Budget dépassé',
    allowance: 'Allocation (objectif)',
    spent: 'Dépensé (repas)',
    earned: 'Gagné (activité)',
    balance: 'Solde restant',
    used: 'du budget utilisé',
    howTitle: 'Comment ça marche',
    howBody1: "Un budget calories traite tes calories quotidiennes comme de l'argent sur un compte en banque. Tu reçois une allocation journalière à « dépenser », et chaque repas en retire une partie.",
    howBody2: "Ton allocation correspond à ton objectif calorique quotidien. Cet objectif part de tes calories de maintenance (TDEE — ce que ton corps brûle dans une journée) ajustées selon ton but : un déficit pour perdre du poids, un surplus pour en prendre, ou la maintenance pour rester stable.",
    howFormulaLabel: 'La formule du jour',
    howFormula: 'Allocation − Repas mangés + Activité brûlée = Solde restant',
    howBody3: "À mesure que tu logges tes repas, le total « Dépensé » augmente et ton solde restant diminue. Quand tu logges une séance, les calories brûlées sont rajoutées, ce qui te redonne un peu de marge.",
    howBody4: "Un solde positif (vert) signifie qu'il te reste des calories à dépenser aujourd'hui. Un solde négatif (rouge) signifie que tu as dépassé ton budget. La barre de progression montre le pourcentage de budget déjà utilisé.",
  },
  ar: {
    title: 'ميزانية السعرات',
    sub: 'سعراتك مثل حساب بنكي: المخصص − الوجبات + الرياضة = الرصيد.',
    heroLabel: 'رصيد اليوم',
    margin: 'لا يزال لديك هامش 🎉',
    over: 'تم تجاوز الميزانية',
    allowance: 'المخصص (الهدف)',
    spent: 'المصروف (الوجبات)',
    earned: 'المكتسب (النشاط)',
    balance: 'الرصيد المتبقي',
    used: 'من الميزانية مستخدمة',
    howTitle: 'كيف تعمل',
    howBody1: 'تتعامل ميزانية السعرات مع سعراتك اليومية مثل المال في حساب بنكي. تحصل على مخصص يومي «لتنفقه»، وكل وجبة تسحب منه.',
    howBody2: 'مخصصك هو هدفك اليومي من السعرات. يُبنى هذا الهدف من سعرات الصيانة (TDEE — ما يحرقه جسمك في اليوم) معدّلة حسب هدفك: عجز لإنقاص الوزن، فائض لزيادته، أو الصيانة للبقاء كما أنت.',
    howFormulaLabel: 'المعادلة اليومية',
    howFormula: 'المخصص − الوجبات المأكولة + النشاط المحروق = الرصيد المتبقي',
    howBody3: 'كلما سجّلت وجباتك، يزداد إجمالي «المصروف» وينخفض رصيدك المتبقي. عند تسجيل تمرين، تُضاف السعرات المحروقة من جديد، مما يمنحك هامشاً أكبر.',
    howBody4: 'الرصيد الموجب (أخضر) يعني أنه لا تزال لديك سعرات لإنفاقها اليوم. الرصيد السالب (أحمر) يعني أنك تجاوزت ميزانيتك. يوضح شريط التقدم النسبة المئوية من الميزانية المستخدمة بالفعل.',
  },
};

export default function CalorieBudgetScreen() {
  const __gate = useScreenGate('calorie-budget');
  const { colors, resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;

  // i18n #90 — locale-aware number formatting (display only, no calc change).
  const numLocale = numLocaleFor(language);
  const fmtNum = (n: number) => {
    try { return Number(n).toLocaleString(numLocale); } catch { return String(n); }
  };
  const isDark = resolved === 'dark';
  const GREEN = colors.primary;
  const bg = isDark ? '#0f1419' : '#F4F7F9';
  const card = isDark ? '#1e293b' : '#ffffff';
  const text = isDark ? '#f1f5f9' : '#0F172A';
  const sub = isDark ? '#94a3b8' : '#64748B';
  const border = isDark ? '#283241' : 'transparent';
  const align: any = { textAlign: txtAlign(isRTL) };

  const { goals, consumed, logs } = useNutritionData(new Date().toISOString().split('T')[0]);
  const allowance = goals.calories || 2000;
  const earned = (logs || []).filter((l: any) => l.type === 'activity').reduce((a: number, l: any) => a + (l.calories || 0), 0);
  const spent = consumed.calories || 0;
  const balance = allowance + earned - spent;
  const pct = Math.max(0, Math.min(100, Math.round(((allowance + earned - balance) / (allowance + earned || 1)) * 100)));

  const Line = ({ icon: Icon, label, value, color, sign }: any) => (
    <View style={[styles.line, { flexDirection: rowDir(isRTL) }]}>
      <View style={[styles.lineIcon, { backgroundColor: color + '18' }]}><Icon size={20} color={color} /></View>
      <Text style={[styles.lineLabel, { color: text, textAlign: txtAlign(isRTL) }]}>{label}</Text>
      <Text style={[styles.lineValue, { color }]}>{sign}{fmtNum(value)} kcal</Text>
    </View>
  );

  if (!__gate.ok) return __gate.node;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body}>
        <Image source={require('../../assets/images/illustrations/dashboard_bg.jpg')} style={{ width: '100%', height: 110, borderRadius: 18, marginBottom: 14 }} resizeMode="cover" />
        <ScreenTitle title={t.title} icon={<Wallet size={26} color={GREEN} />} subtitle={t.sub} />

        <View style={[styles.hero, { backgroundColor: balance >= 0 ? GREEN : '#E11D48' }]}>
          <Text style={styles.heroLabel}>{t.heroLabel}</Text>
          <Text style={styles.heroValue}>{balance >= 0 ? '' : '−'}{fmtNum(Math.abs(balance))}<Text style={styles.heroUnit}> kcal</Text></Text>
          <Text style={styles.heroNote}>{balance >= 0 ? t.margin : t.over}</Text>
        </View>

        <View style={[styles.card, { backgroundColor: card, borderWidth: 1, borderColor: border }, !isDark && styles.cardShadow]}>
          <Line icon={Wallet} label={t.allowance} value={allowance} color="#0EA5E9" sign="" />
          <Line icon={ArrowDownCircle} label={t.spent} value={spent} color="#E11D48" sign="−" />
          <Line icon={ArrowUpCircle} label={t.earned} value={earned} color={GREEN} sign="+" />
          <View style={[styles.sep, { backgroundColor: isDark ? '#334155' : '#EEF2F7' }]} />
          <Line icon={PiggyBank} label={t.balance} value={Math.abs(balance)} color={balance >= 0 ? GREEN : '#E11D48'} sign={balance >= 0 ? '' : '−'} />
        </View>

        <View style={[styles.barTrack, { backgroundColor: isDark ? '#334155' : '#E5E7EB' }]}><View style={[styles.barFill, { width: `${pct}%`, backgroundColor: pct > 100 ? '#E11D48' : GREEN }]} /></View>
        <Text style={[styles.barLabel, { color: isDark ? '#64748b' : '#94A3B8' }]}>{fmtNum(pct)}% {t.used}</Text>

        <View style={[styles.howCard, { backgroundColor: card, borderWidth: 1, borderColor: border }, !isDark && styles.cardShadow]}>
          <Text style={[styles.howTitle, { color: GREEN }, align]}>{t.howTitle}</Text>
          <Text style={[styles.howBody, { color: sub }, align]}>{t.howBody1}</Text>
          <Text style={[styles.howBody, { color: sub }, align]}>{t.howBody2}</Text>
          <View style={[styles.formulaBox, { backgroundColor: GREEN + '14' }]}>
            <Text style={[styles.formulaLabel, { color: GREEN }, align]}>{t.howFormulaLabel}</Text>
            <Text style={[styles.formula, { color: text }, align]}>{t.howFormula}</Text>
          </View>
          <Text style={[styles.howBody, { color: sub }, align]}>{t.howBody3}</Text>
          <Text style={[styles.howBody, { color: sub }, align]}>{t.howBody4}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F7F9' },
  body: { padding: 20, paddingBottom: 100 },
  hero: { borderRadius: 24, padding: 24, alignItems: 'center', marginBottom: 18 },
  heroLabel: { color: '#fff', opacity: 0.9, fontSize: 13, fontWeight: '600' },
  heroValue: { color: '#fff', fontSize: 46, fontWeight: '900', letterSpacing: -2, marginTop: 4 },
  heroUnit: { fontSize: 18, fontWeight: '700' },
  heroNote: { color: '#fff', opacity: 0.9, fontSize: 13, fontWeight: '600', marginTop: 2 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 8, marginBottom: 18 },
  cardShadow: { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 10 },
  lineIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  lineLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: '#0F172A' },
  lineValue: { fontSize: 15, fontWeight: '800' },
  sep: { height: 1, backgroundColor: '#EEF2F7', marginHorizontal: 10 },
  barTrack: { height: 12, borderRadius: 6, backgroundColor: '#E5E7EB', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 6 },
  barLabel: { fontSize: 12, color: '#94A3B8', marginTop: 6, textAlign: 'center' },
  howCard: { backgroundColor: '#fff', borderRadius: 20, padding: 18, marginTop: 22 },
  howTitle: { fontSize: 18, fontWeight: '900', marginBottom: 10 },
  howBody: { fontSize: 14, lineHeight: 21, marginBottom: 10 },
  formulaBox: { borderRadius: 14, padding: 14, marginVertical: 4, marginBottom: 12 },
  formulaLabel: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  formula: { fontSize: 14, fontWeight: '800', lineHeight: 20 },
});
