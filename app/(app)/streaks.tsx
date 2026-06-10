// Streaks multi-dimensions — séries de jours consécutifs par catégorie.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, ActivityIndicator } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Flame, Utensils, Droplets, Activity } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { db, emailToDocId } from '../../lib/firebase';

const GREEN = '#2E8B57';
const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function streakOf(dates: Set<string>): number {
  let s = 0; const d = new Date();
  while (dates.has(fmt(d))) { s++; d.setDate(d.getDate() - 1); }
  return s;
}

export default function StreaksScreen() {
  const { user } = useUser();
  const [loading, setLoading] = useState(true);
  const [st, setSt] = useState({ meal: 0, water: 0, activity: 0 });

  useEffect(() => {
    (async () => {
      try {
        const email = user?.primaryEmailAddress?.emailAddress;
        const docId = email ? emailToDocId(email) : null;
        if (!docId) return;
        const since = fmt(new Date(Date.now() - 70 * 86400000));
        const snap = await getDocs(query(collection(db, 'users', docId, 'logs'), where('date', '>=', since)));
        const byType: Record<string, Set<string>> = { meal: new Set(), water: new Set(), activity: new Set() };
        snap.forEach((d) => { const x: any = d.data(); if (byType[x.type] && x.date) byType[x.type].add(x.date); });
        setSt({ meal: streakOf(byType.meal), water: streakOf(byType.water), activity: streakOf(byType.activity) });
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  const Card = ({ icon: Icon, label, value, color }: any) => (
    <View style={styles.card}>
      <View style={[styles.iconWrap, { backgroundColor: color + '18' }]}><Icon size={26} color={color} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardValue}>{value} <Text style={styles.cardUnit}>{value > 1 ? 'jours' : 'jour'}</Text></Text>
        <Text style={styles.cardLabel}>{label}</Text>
      </View>
      <Flame size={22} color={value > 0 ? '#F59E0B' : '#CBD5E1'} />
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.head}><Flame size={24} color="#F59E0B" /><Text style={styles.title}>Tes séries</Text></View>
        <Text style={styles.sub}>Jours consécutifs où tu as été régulier, par catégorie.</Text>
        {loading ? <ActivityIndicator color={GREEN} style={{ marginTop: 40 }} /> : (
          <>
            <Card icon={Utensils} label="Repas loggés" value={st.meal} color={GREEN} />
            <Card icon={Droplets} label="Hydratation" value={st.water} color="#0EA5E9" />
            <Card icon={Activity} label="Activité" value={st.activity} color="#8B5CF6" />
            <Text style={styles.tip}>Astuce : logge chaque jour pour garder tes flammes 🔥 allumées.</Text>
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
  title: { fontSize: 26, fontWeight: '900', color: '#0F172A', letterSpacing: -0.5 },
  sub: { fontSize: 14, color: '#64748B', lineHeight: 20, marginBottom: 22 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#fff', borderRadius: 18, padding: 18, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  iconWrap: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  cardValue: { fontSize: 24, fontWeight: '900', color: '#0F172A' },
  cardUnit: { fontSize: 14, fontWeight: '600', color: '#94A3B8' },
  cardLabel: { fontSize: 13, color: '#64748B', marginTop: 2 },
  tip: { fontSize: 13, color: '#94A3B8', marginTop: 14, textAlign: 'center', lineHeight: 18 },
});
