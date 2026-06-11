import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { Activity, TrendingDown, TrendingUp, Check } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { getUserFromFirestore, updateDailyCalories } from '../../lib/firebase';
import { getEntries } from '../../lib/tracking';
import { computeAdaptiveTDEE, AdaptiveResult } from '../../lib/adaptiveTDEE';

const GREEN = '#2E8B57';

export default function AdaptiveTDEE() {
  const { user } = useUser();
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
  const confLabel = conf === 'high' ? 'Élevée' : conf === 'medium' ? 'Moyenne' : 'Faible';
  const confColor = conf === 'high' ? GREEN : conf === 'medium' ? '#B45309' : '#94a3b8';
  const losing = (res?.trendKgPerWeek || 0) < 0;

  return (
    <SafeAreaView style={s.safe}>
      <ScreenTopBar />
      <ScrollView contentContainerStyle={s.body}>
        <View style={s.head}>
          <Activity size={26} color={GREEN} />
          <Text style={s.title}>TDEE adaptatif</Text>
        </View>
        <Text style={s.sub}>Ta maintenance réelle, apprise de tes repas loggés + ta tendance de poids — recalibrée automatiquement chaque semaine.</Text>

        {loading ? (
          <ActivityIndicator color={GREEN} style={{ marginTop: 40 }} />
        ) : !res?.tdee ? (
          <View style={s.card}>
            <Text style={s.cardLabel}>Pas encore assez de données</Text>
            <Text style={s.note}>{res?.note}</Text>
            <Text style={s.hint}>Logge tes repas chaque jour + pèse-toi 2-3×/semaine. Le calcul se débloque vers 7 jours.</Text>
          </View>
        ) : (
          <>
            <View style={s.heroCard}>
              <Text style={s.heroLabel}>MAINTENANCE APPRISE (TDEE)</Text>
              <Text style={s.heroValue}>{res.tdee}</Text>
              <Text style={s.heroUnit}>kcal / jour</Text>
              <View style={[s.confPill, { backgroundColor: confColor + '22' }]}>
                <Text style={[s.confTxt, { color: confColor }]}>Confiance : {confLabel}</Text>
              </View>
            </View>

            <View style={s.row}>
              <View style={s.statCard}>
                <Text style={s.statLabel}>Apport moyen réel</Text>
                <Text style={s.statValue}>{res.avgIntake}</Text>
                <Text style={s.statUnit}>kcal/j · {res.intakeDays} j</Text>
              </View>
              <View style={s.statCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  {losing ? <TrendingDown size={14} color={GREEN} /> : <TrendingUp size={14} color="#B45309" />}
                  <Text style={s.statLabel}>Tendance poids</Text>
                </View>
                <Text style={[s.statValue, { color: losing ? GREEN : '#B45309' }]}>
                  {res.trendKgPerWeek > 0 ? '+' : ''}{res.trendKgPerWeek}
                </Text>
                <Text style={s.statUnit}>kg/sem · {res.weighIns} pesées</Text>
              </View>
            </View>

            <View style={s.card}>
              <Text style={s.cardLabel}>Cible conseillée pour ton objectif{goal ? ` (${goal})` : ''}</Text>
              <Text style={s.recValue}>{res.recommendedTarget} <Text style={s.recUnit}>kcal/j</Text></Text>
              {currentTarget ? (
                <Text style={s.note}>Cible actuelle : {currentTarget} kcal/j</Text>
              ) : null}
              <TouchableOpacity
                style={[s.applyBtn, (applied || currentTarget === res.recommendedTarget) && s.applyBtnDone]}
                onPress={apply}
                disabled={applied || currentTarget === res.recommendedTarget}
              >
                <Check size={18} color="#fff" />
                <Text style={s.applyTxt}>
                  {applied || currentTarget === res.recommendedTarget ? 'Cible appliquée' : 'Appliquer cette cible'}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={s.foot}>{res.note} L'estimation s'affine à chaque repas loggé et chaque pesée.</Text>
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
