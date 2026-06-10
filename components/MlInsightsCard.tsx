// Carte "Insights IA" — consomme les modèles ML backend (/ml).
//  - Prévision de poids + détection de plateau (régression + EMA serveur)
//  - Recommandation de repas (scoring macro vs objectif)
// Autonome : récupère le profil, appelle les endpoints, gère loading/erreur/no-data.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { TrendingDown, TrendingUp, Minus, Sparkles, Utensils, AlertTriangle, RefreshCw } from 'lucide-react-native';
import { auth } from '../lib/firebaseAuth';
import { getUserFromFirestore } from '../lib/firebase';
import { mlWeightForecast, mlMealReco, WeightForecast, MealReco } from '../lib/mlApi';

const GREEN = '#2E8B57';

export default function MlInsightsCard() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [forecast, setForecast] = useState<WeightForecast | null>(null);
  const [meals, setMeals] = useState<MealReco | null>(null);

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const email = auth.currentUser?.email || (auth.currentUser as any)?.uid || '';
      const profile: any = email ? await getUserFromFirestore(email).catch(() => null) : null;
      const plan = profile?.nutritionalPlan || profile || {};
      const goal = (profile?.goal === 'lose' || profile?.goal === 'gain') ? profile.goal : 'maintain';
      const remaining = {
        kcal: Number(plan.dailyCalories || profile?.dailyCalories || 2000),
        p: Number(plan.protein || profile?.protein || 120),
        c: Number(plan.carbs || profile?.carbs || 200),
        f: Number(plan.fat || profile?.fat || 60),
      };
      const [wf, mr] = await Promise.all([
        mlWeightForecast().catch(() => null),
        mlMealReco(remaining, goal as any, 3).catch(() => null),
      ]);
      setForecast(wf); setMeals(mr);
    } catch (e: any) {
      setErr(e?.message || 'erreur');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Sparkles size={18} color={GREEN} />
        <Text style={styles.title}>Insights IA</Text>
        <TouchableOpacity onPress={load} style={styles.refresh} hitSlop={10}>
          <RefreshCw size={15} color="#94A3B8" />
        </TouchableOpacity>
      </View>

      {loading && <ActivityIndicator color={GREEN} style={{ marginVertical: 16 }} />}
      {!loading && err && <Text style={styles.muted}>Indisponible ({err})</Text>}

      {!loading && !err && (
        <>
          {/* Prévision de poids */}
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Prévision de poids</Text>
            {forecast?.ok ? (
              <View>
                <View style={styles.row}>
                  {forecast.direction === 'losing' ? <TrendingDown size={18} color={GREEN} />
                    : forecast.direction === 'gaining' ? <TrendingUp size={18} color="#E11D48" />
                    : <Minus size={18} color="#94A3B8" />}
                  <Text style={styles.trend}>
                    {Math.abs(forecast.trendKgPerWeek || 0).toFixed(2)} kg/sem{' '}
                    {forecast.direction === 'losing' ? 'de perte' : forecast.direction === 'gaining' ? 'de prise' : 'stable'}
                  </Text>
                  <Text style={styles.conf}>conf. {Math.round((forecast.confidence || 0) * 100)}%</Text>
                </View>
                {forecast.plateau && (
                  <View style={styles.warn}>
                    <AlertTriangle size={14} color="#B45309" />
                    <Text style={styles.warnTxt}>Plateau détecté — ajuste calories ou activité.</Text>
                  </View>
                )}
                {forecast.projection && (
                  <Text style={styles.proj}>
                    Objectif {forecast.projection.targetWeight} kg dans ~{forecast.projection.daysToGoal} jours
                  </Text>
                )}
              </View>
            ) : (
              <Text style={styles.muted}>Enregistre ton poids quelques jours pour activer la prévision.</Text>
            )}
          </View>

          {/* Reco repas */}
          <View style={styles.block}>
            <View style={styles.row}>
              <Utensils size={15} color={GREEN} />
              <Text style={styles.blockTitle}>  Repas recommandés</Text>
            </View>
            {meals?.recommendations?.length ? meals.recommendations.map((m, i) => (
              <View key={i} style={styles.meal}>
                <Text style={styles.mealName} numberOfLines={1}>{m.name}</Text>
                <Text style={styles.mealMacro}>{m.kcal} kcal · {m.p}g P</Text>
              </View>
            )) : <Text style={styles.muted}>—</Text>}
          </View>
          <Text style={styles.footer}>Modèles ML · serveur Salorie</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 16, marginHorizontal: 16, marginVertical: 8,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  title: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginLeft: 8, flex: 1 },
  refresh: { padding: 4 },
  block: { marginTop: 10 },
  blockTitle: { fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center' },
  trend: { fontSize: 14, fontWeight: '600', color: '#0F172A', marginLeft: 8, flex: 1 },
  conf: { fontSize: 11, color: '#94A3B8' },
  warn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF3C7', borderRadius: 10, padding: 8, marginTop: 8 },
  warnTxt: { fontSize: 12, color: '#92400E', marginLeft: 6, flex: 1 },
  proj: { fontSize: 13, color: GREEN, marginTop: 6, fontWeight: '600' },
  meal: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 },
  mealName: { fontSize: 13, color: '#0F172A', flex: 1, marginRight: 8 },
  mealMacro: { fontSize: 12, color: '#64748B' },
  muted: { fontSize: 13, color: '#94A3B8', marginTop: 4 },
  footer: { fontSize: 10, color: '#CBD5E1', marginTop: 12, textAlign: 'right' },
});
