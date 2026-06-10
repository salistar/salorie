// Hydratation intelligente — objectif d'eau calculé selon le poids + l'activité.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { Droplets, Activity, Sun } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { getUserFromFirestore } from '../../lib/firebase';

const GREEN = '#2E8B57';

export default function SmartHydrationScreen() {
  const { user } = useUser();
  const [weight, setWeight] = useState(70);
  const [activity, setActivity] = useState(1); // 0=sédentaire,1=modéré,2=intense
  const [hot, setHot] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const email = user?.primaryEmailAddress?.emailAddress;
        if (email) { const p: any = await getUserFromFirestore(email, user?.id); setWeight(Number(p?.weight) || 70); }
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  const base = Math.round(weight * 35); // ~35 ml/kg
  const actBonus = activity === 2 ? 700 : activity === 1 ? 350 : 0;
  const hotBonus = hot ? 500 : 0;
  const goal = base + actBonus + hotBonus;
  const glasses = Math.round(goal / 250);

  const ActLvl = ({ i, label }: any) => (
    <TouchableOpacity style={[styles.opt, activity === i && styles.optActive]} onPress={() => setActivity(i)}>
      <Text style={[styles.optTxt, activity === i && { color: '#fff' }]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.head}><Droplets size={24} color="#0EA5E9" /><Text style={styles.title}>Hydratation intelligente</Text></View>
        <Text style={styles.sub}>Objectif d'eau adapté à ton poids et ton activité.</Text>

        {loading ? <ActivityIndicator color={GREEN} style={{ marginTop: 40 }} /> : (
          <>
            <View style={styles.hero}>
              <Text style={styles.heroLabel}>Objectif recommandé</Text>
              <Text style={styles.heroValue}>{(goal / 1000).toFixed(1)}<Text style={styles.heroUnit}> L</Text></Text>
              <Text style={styles.heroNote}>≈ {glasses} verres · {goal} ml</Text>
            </View>

            <Text style={styles.label}><Activity size={13} color="#64748B" /> Niveau d'activité</Text>
            <View style={styles.optRow}><ActLvl i={0} label="Sédentaire" /><ActLvl i={1} label="Modéré" /><ActLvl i={2} label="Intense" /></View>

            <TouchableOpacity style={[styles.hotRow, hot && styles.hotActive]} onPress={() => setHot((h) => !h)}>
              <Sun size={20} color={hot ? '#fff' : '#F59E0B'} />
              <Text style={[styles.hotTxt, hot && { color: '#fff' }]}>Temps chaud / forte transpiration</Text>
              <Text style={[styles.hotTxt, hot && { color: '#fff' }]}>{hot ? '✓' : ''}</Text>
            </TouchableOpacity>

            <Text style={styles.calc}>Calcul : {weight} kg × 35 ml = {base} ml{actBonus ? ` + ${actBonus} (activité)` : ''}{hotBonus ? ` + ${hotBonus} (chaleur)` : ''}.</Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F7F9' },
  body: { padding: 20, paddingBottom: 100 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  title: { fontSize: 23, fontWeight: '900', color: '#0F172A', letterSpacing: -0.5 },
  sub: { fontSize: 14, color: '#64748B', marginBottom: 20 },
  hero: { backgroundColor: '#0EA5E9', borderRadius: 24, padding: 24, alignItems: 'center', marginBottom: 20 },
  heroLabel: { color: '#E0F2FE', fontSize: 13, fontWeight: '600' },
  heroValue: { color: '#fff', fontSize: 48, fontWeight: '900', letterSpacing: -2, marginTop: 4 },
  heroUnit: { fontSize: 20, fontWeight: '700' },
  heroNote: { color: '#E0F2FE', fontSize: 14, fontWeight: '600', marginTop: 2 },
  label: { fontSize: 13, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  optRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  opt: { flex: 1, backgroundColor: '#fff', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  optActive: { backgroundColor: GREEN },
  optTxt: { fontSize: 14, fontWeight: '700', color: '#64748B' },
  hotRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 16 },
  hotActive: { backgroundColor: '#F59E0B' },
  hotTxt: { fontSize: 14, fontWeight: '600', color: '#0F172A', flex: 1 },
  calc: { fontSize: 13, color: '#94A3B8', lineHeight: 19 },
});
