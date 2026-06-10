// Budget calories — tes calories comme un compte en banque.
import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { Wallet, ArrowDownCircle, ArrowUpCircle, PiggyBank } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { useNutritionData } from '../../hooks/useNutritionData';

const GREEN = '#2E8B57';

export default function CalorieBudgetScreen() {
  const { goals, consumed, logs } = useNutritionData();
  const allowance = goals.calories || 2000;
  const earned = (logs || []).filter((l: any) => l.type === 'activity').reduce((a: number, l: any) => a + (l.calories || 0), 0);
  const spent = consumed.calories || 0;
  const balance = allowance + earned - spent;
  const pct = Math.max(0, Math.min(100, Math.round(((allowance + earned - balance) / (allowance + earned || 1)) * 100)));

  const Line = ({ icon: Icon, label, value, color, sign }: any) => (
    <View style={styles.line}>
      <View style={[styles.lineIcon, { backgroundColor: color + '18' }]}><Icon size={20} color={color} /></View>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={[styles.lineValue, { color }]}>{sign}{value} kcal</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.head}><Wallet size={24} color={GREEN} /><Text style={styles.title}>Budget calories</Text></View>
        <Text style={styles.sub}>Tes calories comme un compte : allocation − repas + sport = solde.</Text>

        <View style={[styles.hero, { backgroundColor: balance >= 0 ? GREEN : '#E11D48' }]}>
          <Text style={styles.heroLabel}>Solde du jour</Text>
          <Text style={styles.heroValue}>{balance >= 0 ? '' : '−'}{Math.abs(balance)}<Text style={styles.heroUnit}> kcal</Text></Text>
          <Text style={styles.heroNote}>{balance >= 0 ? 'Il te reste de la marge 🎉' : 'Budget dépassé'}</Text>
        </View>

        <View style={styles.card}>
          <Line icon={Wallet} label="Allocation (objectif)" value={allowance} color="#0EA5E9" sign="" />
          <Line icon={ArrowDownCircle} label="Dépensé (repas)" value={spent} color="#E11D48" sign="−" />
          <Line icon={ArrowUpCircle} label="Gagné (activité)" value={earned} color={GREEN} sign="+" />
          <View style={styles.sep} />
          <Line icon={PiggyBank} label="Solde restant" value={Math.abs(balance)} color={balance >= 0 ? GREEN : '#E11D48'} sign={balance >= 0 ? '' : '−'} />
        </View>

        <View style={styles.barTrack}><View style={[styles.barFill, { width: `${pct}%`, backgroundColor: pct > 100 ? '#E11D48' : GREEN }]} /></View>
        <Text style={styles.barLabel}>{pct}% du budget utilisé</Text>
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
