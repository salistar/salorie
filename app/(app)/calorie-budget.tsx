// Budget calories — tes calories comme un compte en banque.
import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { Wallet, ArrowDownCircle, ArrowUpCircle, PiggyBank } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { useNutritionData } from '../../hooks/useNutritionData';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';

const GREEN = '#2E8B57';

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
  },
};

export default function CalorieBudgetScreen() {
  const { resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';
  const bg = isDark ? '#0f172a' : '#F4F7F9';
  const card = isDark ? '#1e293b' : '#ffffff';
  const text = isDark ? '#f1f5f9' : '#0F172A';
  const sub = isDark ? '#94a3b8' : '#64748B';
  const align: any = { textAlign: isRTL ? 'right' : 'left' };

  const { goals, consumed, logs } = useNutritionData();
  const allowance = goals.calories || 2000;
  const earned = (logs || []).filter((l: any) => l.type === 'activity').reduce((a: number, l: any) => a + (l.calories || 0), 0);
  const spent = consumed.calories || 0;
  const balance = allowance + earned - spent;
  const pct = Math.max(0, Math.min(100, Math.round(((allowance + earned - balance) / (allowance + earned || 1)) * 100)));

  const Line = ({ icon: Icon, label, value, color, sign }: any) => (
    <View style={styles.line}>
      <View style={[styles.lineIcon, { backgroundColor: color + '18' }]}><Icon size={20} color={color} /></View>
      <Text style={[styles.lineLabel, { color: text }]}>{label}</Text>
      <Text style={[styles.lineValue, { color }]}>{sign}{value} kcal</Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.head}><Wallet size={24} color={GREEN} /><Text style={[styles.title, { color: text }]}>{t.title}</Text></View>
        <Text style={[styles.sub, { color: sub }, align]}>{t.sub}</Text>

        <View style={[styles.hero, { backgroundColor: balance >= 0 ? GREEN : '#E11D48' }]}>
          <Text style={styles.heroLabel}>{t.heroLabel}</Text>
          <Text style={styles.heroValue}>{balance >= 0 ? '' : '−'}{Math.abs(balance)}<Text style={styles.heroUnit}> kcal</Text></Text>
          <Text style={styles.heroNote}>{balance >= 0 ? t.margin : t.over}</Text>
        </View>

        <View style={[styles.card, { backgroundColor: card }]}>
          <Line icon={Wallet} label={t.allowance} value={allowance} color="#0EA5E9" sign="" />
          <Line icon={ArrowDownCircle} label={t.spent} value={spent} color="#E11D48" sign="−" />
          <Line icon={ArrowUpCircle} label={t.earned} value={earned} color={GREEN} sign="+" />
          <View style={[styles.sep, { backgroundColor: isDark ? '#334155' : '#EEF2F7' }]} />
          <Line icon={PiggyBank} label={t.balance} value={Math.abs(balance)} color={balance >= 0 ? GREEN : '#E11D48'} sign={balance >= 0 ? '' : '−'} />
        </View>

        <View style={[styles.barTrack, { backgroundColor: isDark ? '#334155' : '#E5E7EB' }]}><View style={[styles.barFill, { width: `${pct}%`, backgroundColor: pct > 100 ? '#E11D48' : GREEN }]} /></View>
        <Text style={styles.barLabel}>{pct}% {t.used}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F7F9' },
  body: { padding: 20, paddingBottom: 100 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  title: { fontSize: 26, fontWeight: '900', color: '#0F172A', letterSpacing: -0.5 },
  sub: { fontSize: 14, color: '#64748B', lineHeight: 20, marginBottom: 22 },
  hero: { borderRadius: 24, padding: 24, alignItems: 'center', marginBottom: 18 },
  heroLabel: { color: '#fff', opacity: 0.9, fontSize: 13, fontWeight: '600' },
  heroValue: { color: '#fff', fontSize: 46, fontWeight: '900', letterSpacing: -2, marginTop: 4 },
  heroUnit: { fontSize: 18, fontWeight: '700' },
  heroNote: { color: '#fff', opacity: 0.9, fontSize: 13, fontWeight: '600', marginTop: 2 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 8, marginBottom: 18, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 10 },
  lineIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  lineLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: '#0F172A' },
  lineValue: { fontSize: 15, fontWeight: '800' },
  sep: { height: 1, backgroundColor: '#EEF2F7', marginHorizontal: 10 },
  barTrack: { height: 12, borderRadius: 6, backgroundColor: '#E5E7EB', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 6 },
  barLabel: { fontSize: 12, color: '#94A3B8', marginTop: 6, textAlign: 'center' },
});
