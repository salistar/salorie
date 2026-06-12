import React, { useEffect, useState } from 'react';
import { Image, View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { ArrowLeft, History, ChevronDown } from 'lucide-react-native';
import { Colors } from '../../constants/Colors';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import ScreenTopBar from '../../components/ScreenTopBar';
import { listMealPlans, SavedMealPlan } from '../../lib/aiStore';

function fmtDate(ts: any): string {
  try {
    const d = ts?.seconds ? new Date(ts.seconds * 1000) : (ts?.toDate ? ts.toDate() : null);
    if (!d) return '';
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch { return ''; }
}

export default function MealPlanHistoryScreen() {
  const { user } = useUser();
  const { resolved } = useTheme();
  const { language } = useTranslation() as any;
  const isDark = resolved === 'dark';
  const savedTitle = language === 'fr' ? 'Plans enregistrés' : language === 'ar' ? 'الخطط المحفوظة' : 'Saved plans';
  const [plans, setPlans] = useState<SavedMealPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<number | null>(0);

  const text = isDark ? '#fff' : Colors.light.gray[900];
  const sub = isDark ? '#9BA1A6' : Colors.light.gray[500];
  const card = isDark ? Colors.dark.card : '#fff';
  const bg = isDark ? '#000' : 'transparent';

  useEffect(() => {
    (async () => {
      const email = user?.primaryEmailAddress?.emailAddress || '';
      if (!email) { setLoading(false); return; }
      setPlans(await listMealPlans(email));
      setLoading(false);
    })();
  }, [user]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenTopBar showBack title={savedTitle} showBrand={false} showNotif={false} />
        <Image source={require('../../assets/images/illustrations/splash_bg.jpg')} style={{ width: '100%', height: 110, borderRadius: 18, marginBottom: 14 }} resizeMode="cover" />

        {loading ? (
          <View style={{ paddingVertical: 60, alignItems: 'center' }}><ActivityIndicator size="large" color={Colors.light.primary} /></View>
        ) : plans.length === 0 ? (
          <Text style={[styles.empty, { color: sub }]}>Aucun plan enregistré pour l'instant. Génère un plan de repas et appuie sur « Enregistrer tout le plan ».</Text>
        ) : (
          plans.map((sp, i) => {
            const p = sp.plan || {};
            const isOpen = open === i;
            const totals = p.totals || {};
            return (
              <View key={sp.id || i} style={[styles.planCard, { backgroundColor: card }]}>
                <TouchableOpacity activeOpacity={0.85} style={styles.planHead} onPress={() => setOpen(isOpen ? null : i)}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.planDate, { color: text }]}>{fmtDate(sp.createdAt) || `Plan ${i + 1}`}</Text>
                    <Text style={[styles.planTotals, { color: Colors.light.primary }]}>
                      {Math.round(totals.calories || 0)} kcal · {Math.round(totals.protein || 0)}P / {Math.round(totals.carbs || 0)}C / {Math.round(totals.fat || 0)}F
                    </Text>
                  </View>
                  <ChevronDown size={22} color={sub} style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }} />
                </TouchableOpacity>
                {isOpen && (p.meals || []).map((m: any, j: number) => (
                  <View key={j} style={styles.mealRow}>
                    <Text style={[styles.mealType, { color: sub }]}>{m.type} · {Math.round(m.calories || 0)} kcal</Text>
                    <Text style={[styles.mealTitle, { color: text }]}>{m.title}</Text>
                    {!!m.items?.length && <Text style={[styles.mealItems, { color: sub }]}>{m.items.join(' · ')}</Text>}
                  </View>
                ))}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 60 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.light.gray[50] },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  empty: { fontSize: 14, lineHeight: 20, marginTop: 30, textAlign: 'center' },
  planCard: { borderRadius: 18, padding: 16, marginTop: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  planHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  planDate: { fontSize: 15, fontWeight: '800' },
  planTotals: { fontSize: 13, fontWeight: '700', marginTop: 3 },
  mealRow: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(120,140,130,0.15)' },
  mealType: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  mealTitle: { fontSize: 15, fontWeight: '800', marginTop: 3 },
  mealItems: { fontSize: 12.5, marginTop: 3, lineHeight: 18 },
});
