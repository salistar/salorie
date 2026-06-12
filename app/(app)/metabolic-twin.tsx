// Jumeau métabolique — projette ton poids selon ce que tu manges (+ ETA objectif).
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView, ActivityIndicator } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { Minus, Plus, TrendingDown, Flag } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { getUserFromFirestore } from '../../lib/firebase';
import { ProfileLite, estimateTDEE, projectWeight, weeklyRate, weeksToGoal } from '../../lib/projections';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';

const GREEN = '#2E8B57';

const TXT: any = {
  en: { title: 'Metabolic twin', sub1: 'Simulate the effect of your diet on your weight (estimate, TDEE ≈ ', sub2: ' kcal).', ifIEat: 'If I eat every day…', heroLabel: 'Estimated weight in 30 days', perWeek: 'kg/wk', d7: '7 days', d30: '30 days', d90: '90 days', goal: 'Goal', notSet: '(not set)', etaA: '≈ ', etaB: ' weeks at this pace (~', etaC: ' months)', etaEmpty: 'Set a weight goal and a deficit/surplus to estimate the date.' },
  fr: { title: 'Jumeau métabolique', sub1: "Simule l'effet de ton alimentation sur ton poids (estimation, TDEE ≈ ", sub2: ' kcal).', ifIEat: 'Si je mange chaque jour…', heroLabel: 'Poids estimé dans 30 jours', perWeek: 'kg/sem', d7: '7 jours', d30: '30 jours', d90: '90 jours', goal: 'Objectif', notSet: '(non défini)', etaA: '≈ ', etaB: ' semaines à ce rythme (~', etaC: ' mois)', etaEmpty: 'Définis un objectif de poids et un déficit/surplus pour estimer la date.' },
  ar: { title: 'التوأم الأيضي', sub1: 'حاكِ تأثير غذائك على وزنك (تقدير، TDEE ≈ ', sub2: ' سعرة).', ifIEat: 'إذا أكلت كل يوم…', heroLabel: 'الوزن المقدَّر بعد 30 يوماً', perWeek: 'كغ/أسبوع', d7: '7 أيام', d30: '30 يوماً', d90: '90 يوماً', goal: 'الهدف', notSet: '(غير محدد)', etaA: '≈ ', etaB: ' أسبوعاً بهذا الإيقاع (~', etaC: ' أشهر)', etaEmpty: 'حدد هدف وزن وعجزاً/فائضاً لتقدير الموعد.' },
};

export default function MetabolicTwinScreen() {
  const { resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';
  const bg = isDark ? '#0f172a' : '#F4F7F9';
  const card = isDark ? '#1e293b' : '#ffffff';
  const text = isDark ? '#f1f5f9' : '#0F172A';
  const sub = isDark ? '#94a3b8' : '#64748B';
  const align: any = { textAlign: isRTL ? 'right' : 'left' };

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

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.head}><TrendingDown size={24} color={GREEN} /><Text style={[styles.title, { color: text }]}>{t.title}</Text></View>
        <Text style={[styles.sub, { color: sub }, align]}>{t.sub1}{tdee}{t.sub2}</Text>

        <Text style={[styles.label, { color: sub }, align]}>{t.ifIEat}</Text>
        <View style={styles.stepper}>
          <TouchableOpacity style={[styles.stepBtn, isDark && { backgroundColor: '#1e3a2f' }]} onPress={() => setIntake((v) => Math.max(800, v - 100))}><Minus size={22} color={GREEN} /></TouchableOpacity>
          <View style={styles.intakeWrap}><Text style={[styles.intake, { color: text }]}>{intake}</Text><Text style={[styles.unit, { color: sub }]}>kcal</Text></View>
          <TouchableOpacity style={[styles.stepBtn, isDark && { backgroundColor: '#1e3a2f' }]} onPress={() => setIntake((v) => Math.min(5000, v + 100))}><Plus size={22} color={GREEN} /></TouchableOpacity>
        </View>

        <View style={styles.hero}>
          <Text style={styles.heroLabel}>{t.heroLabel}</Text>
          <Text style={styles.heroValue}>{w30}<Text style={styles.heroUnit}> kg</Text></Text>
          <Text style={[styles.heroDelta, { color: delta30 <= 0 ? GREEN : '#E11D48' }]}>{delta30 > 0 ? '+' : ''}{delta30} kg · {rate > 0 ? '+' : ''}{rate} {t.perWeek}</Text>
        </View>

        <View style={styles.row}>
          <View style={[styles.cell, { backgroundColor: card }]}><Text style={[styles.cellV, { color: text }]}>{w7} kg</Text><Text style={[styles.cellL, { color: sub }]}>{t.d7}</Text></View>
          <View style={[styles.cell, { backgroundColor: card }]}><Text style={[styles.cellV, { color: text }]}>{w30} kg</Text><Text style={[styles.cellL, { color: sub }]}>{t.d30}</Text></View>
          <View style={[styles.cell, { backgroundColor: card }]}><Text style={[styles.cellV, { color: text }]}>{w90} kg</Text><Text style={[styles.cellL, { color: sub }]}>{t.d90}</Text></View>
        </View>

        <View style={[styles.etaCard, { backgroundColor: card }]}>
          <Flag size={20} color={GREEN} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.etaTitle, { color: text }, align]}>{t.goal} {p.targetWeight ? `${p.targetWeight} kg` : t.notSet}</Text>
            <Text style={[styles.etaSub, { color: sub }, align]}>{eta ? `${t.etaA}${eta}${t.etaB}${Math.ceil(eta / 4)}${t.etaC}` : t.etaEmpty}</Text>
          </View>
        </View>
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
  hero: { backgroundColor: GREEN, borderRadius: 24, padding: 24, alignItems: 'center', marginBottom: 16 },
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
});
