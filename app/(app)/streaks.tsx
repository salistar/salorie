// Streaks multi-dimensions — séries de jours consécutifs par catégorie.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, ActivityIndicator } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Flame, Utensils, Droplets, Activity } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { db, emailToDocId } from '../../lib/firebase';
import { useTranslation } from '../../lib/i18n';
import { useTheme } from '../../lib/ThemeContext';

const GREEN = '#2E8B57';
const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function streakOf(dates: Set<string>): number {
  let s = 0; const d = new Date();
  while (dates.has(fmt(d))) { s++; d.setDate(d.getDate() - 1); }
  return s;
}

const TXT: any = {
  en: { title: 'Your streaks', sub: 'Consecutive days you stayed consistent, by category.', days: 'days', day: 'day', meals: 'Meals logged', hydration: 'Hydration', activity: 'Activity', tip: 'Tip: log every day to keep your flames 🔥 burning.' },
  fr: { title: 'Tes séries', sub: 'Jours consécutifs où tu as été régulier, par catégorie.', days: 'jours', day: 'jour', meals: 'Repas loggés', hydration: 'Hydratation', activity: 'Activité', tip: 'Astuce : logge chaque jour pour garder tes flammes 🔥 allumées.' },
  ar: { title: 'سلاسلك', sub: 'أيام متتالية حافظت فيها على الانتظام، حسب الفئة.', days: 'أيام', day: 'يوم', meals: 'وجبات مسجلة', hydration: 'الترطيب', activity: 'النشاط', tip: 'نصيحة: سجّل كل يوم لتُبقي شعلتك 🔥 مشتعلة.' },
};

export default function StreaksScreen() {
  const { user } = useUser();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  const bg = isDark ? '#0f172a' : '#F4F7F9';
  const card = isDark ? '#1e293b' : '#ffffff';
  const text = isDark ? '#f1f5f9' : '#0F172A';
  const sub = isDark ? '#94a3b8' : '#64748B';
  const align: any = { textAlign: isRTL ? 'right' : 'left' };

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
    <View style={[styles.card, { backgroundColor: card }]}>
      <View style={[styles.iconWrap, { backgroundColor: color + '18' }]}><Icon size={26} color={color} /></View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.cardValue, { color: text }]}>{value} <Text style={[styles.cardUnit, { color: sub }]}>{value > 1 ? t.days : t.day}</Text></Text>
        <Text style={[styles.cardLabel, { color: sub }]}>{label}</Text>
      </View>
      <Flame size={22} color={value > 0 ? '#F59E0B' : '#CBD5E1'} />
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.head}><Flame size={24} color="#F59E0B" /><Text style={[styles.title, { color: text }]}>{t.title}</Text></View>
        <Text style={[styles.sub, { color: sub }, align]}>{t.sub}</Text>
        {loading ? <ActivityIndicator color={GREEN} style={{ marginTop: 40 }} /> : (
          <>
            <Card icon={Utensils} label={t.meals} value={st.meal} color={GREEN} />
            <Card icon={Droplets} label={t.hydration} value={st.water} color="#0EA5E9" />
            <Card icon={Activity} label={t.activity} value={st.activity} color="#8B5CF6" />
            <Text style={[styles.tip, { color: sub }]}>{t.tip}</Text>
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
