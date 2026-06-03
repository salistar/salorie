import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowLeft, Sparkles, RefreshCw, Plus, Lightbulb } from 'lucide-react-native';
import ScreenTopBar from '../components/ScreenTopBar';
import { Colors } from '../constants/Colors';
import { useTheme } from '../lib/ThemeContext';
import { useTranslation } from '../lib/i18n';
import { emailToDocId } from '../lib/firebase';
import { generateMealPlan, MealPlan } from '../lib/AiModel';

const DEFAULTS = { calories: 2000, protein: 150, carbs: 220, fat: 65 };

export default function MealPlanScreen() {
  const { user } = useUser();
  const { resolved } = useTheme();
  const { language } = useTranslation() as any;
  const isDark = resolved === 'dark';

  const [targets, setTargets] = useState(DEFAULTS);
  const [usingDefaults, setUsingDefaults] = useState(true);
  const [goal, setGoal] = useState('maintain');
  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const text = isDark ? '#fff' : Colors.light.gray[900];
  const sub = isDark ? '#9BA1A6' : Colors.light.gray[500];
  const card = isDark ? Colors.dark.card : '#fff';
  const bg = isDark ? '#000' : 'transparent';

  useEffect(() => {
    (async () => {
      const email = user?.primaryEmailAddress?.emailAddress || '';
      if (!email) return;
      try {
        const raw = await AsyncStorage.getItem(`profile_${emailToDocId(email)}`);
        if (raw) {
          const p = JSON.parse(raw);
          const np = p.nutritionalPlan || {};
          if (np.calories) {
            setTargets({
              calories: Number(np.calories) || DEFAULTS.calories,
              protein: Number(np.protein) || DEFAULTS.protein,
              carbs: Number(np.carbs) || DEFAULTS.carbs,
              fat: Number(np.fat) || DEFAULTS.fat,
            });
            setUsingDefaults(false);
          }
          if (p.goal) setGoal(p.goal);
        }
      } catch {}
    })();
  }, [user]);

  const generate = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const p = await generateMealPlan({ ...targets, goal, language: (language as any) || 'en' });
      setPlan(p);
    } catch (e) {
      setError('Could not generate a plan. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [targets, goal, language]);

  const logMeal = (m: MealPlan['meals'][0]) => {
    router.push({
      pathname: '/log-food-details' as any,
      params: {
        name: m.title,
        calories: String(Math.round(m.calories)),
        protein: String(Math.round(m.protein)),
        carbs: String(Math.round(m.carbs)),
        fat: String(Math.round(m.fat)),
        serving: '1 serving',
      },
    });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <ArrowLeft size={22} color={text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}><ScreenTopBar showBrand={false} showNotif={false} /></View>
        </View>

        <View style={styles.titleRow}>
          <Sparkles size={26} color={Colors.light.primary} />
          <Text style={[styles.title, { color: text }]}>Meal Plan</Text>
        </View>
        <Text style={[styles.subtitle, { color: sub }]}>
          An AI day of meals built around your targets — {targets.calories} kcal · {targets.protein}P / {targets.carbs}C / {targets.fat}F
          {usingDefaults ? '  (default — set yours in Personal Details)' : ''}
        </Text>

        {!plan && !loading && (
          <TouchableOpacity style={styles.generateBtn} onPress={generate}>
            <Sparkles size={20} color="#fff" />
            <Text style={styles.generateText}>Generate my meal plan</Text>
          </TouchableOpacity>
        )}

        {loading && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={Colors.light.primary} />
            <Text style={[styles.loadingText, { color: sub }]}>Cooking up your plan…</Text>
          </View>
        )}

        {error && !loading && (
          <View style={[styles.errorBox, { backgroundColor: card }]}>
            <Text style={{ color: Colors.light.error, fontWeight: '600' }}>{error}</Text>
            <TouchableOpacity style={styles.generateBtn} onPress={generate}>
              <RefreshCw size={18} color="#fff" /><Text style={styles.generateText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {plan && !loading && (
          <>
            {plan.meals.map((m, i) => (
              <View key={i} style={[styles.mealCard, { backgroundColor: card }]}>
                <View style={styles.mealHead}>
                  <Text style={styles.mealType}>{m.type}</Text>
                  <Text style={[styles.mealKcal, { color: Colors.light.primary }]}>{Math.round(m.calories)} kcal</Text>
                </View>
                <Text style={[styles.mealTitle, { color: text }]}>{m.title}</Text>
                {!!m.items?.length && <Text style={[styles.mealItems, { color: sub }]}>{m.items.join(' · ')}</Text>}
                <View style={styles.macroRow}>
                  <Text style={[styles.macro, { color: sub }]}>P {Math.round(m.protein)}g</Text>
                  <Text style={[styles.macro, { color: sub }]}>C {Math.round(m.carbs)}g</Text>
                  <Text style={[styles.macro, { color: sub }]}>F {Math.round(m.fat)}g</Text>
                  <View style={{ flex: 1 }} />
                  <TouchableOpacity style={styles.logBtn} onPress={() => logMeal(m)}>
                    <Plus size={16} color="#fff" /><Text style={styles.logBtnText}>Log</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            {/* Totals */}
            <View style={[styles.totalsCard, { backgroundColor: Colors.light.primaryLight }]}>
              <Text style={[styles.totalsTitle, { color: Colors.light.primaryDark }]}>Daily total</Text>
              <Text style={[styles.totalsValue, { color: Colors.light.primaryDark }]}>
                {Math.round(plan.totals.calories)} kcal · {Math.round(plan.totals.protein)}P / {Math.round(plan.totals.carbs)}C / {Math.round(plan.totals.fat)}F
              </Text>
            </View>

            {/* Micronutrients */}
            {!!plan.micros?.length && (
              <>
                <Text style={[styles.section, { color: text }]}>Micronutrients (est. % of daily needs)</Text>
                <View style={[styles.microCard, { backgroundColor: card }]}>
                  {plan.micros.map((mi, i) => (
                    <View key={i} style={styles.microRow}>
                      <Text style={[styles.microName, { color: text }]}>{mi.name}</Text>
                      <View style={styles.microBarTrack}>
                        <View style={[styles.microBarFill, { width: `${Math.min(100, Math.max(2, mi.pct))}%`, backgroundColor: mi.pct >= 90 ? '#10B981' : mi.pct >= 50 ? Colors.light.primary : '#f59e0b' }]} />
                      </View>
                      <Text style={[styles.microPct, { color: sub }]}>{mi.amount}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* Tip */}
            {!!plan.tip && (
              <View style={[styles.tipCard, { backgroundColor: card }]}>
                <Lightbulb size={20} color={Colors.light.primary} />
                <Text style={[styles.tipText, { color: text }]}>{plan.tip}</Text>
              </View>
            )}

            <TouchableOpacity style={[styles.regenBtn]} onPress={generate}>
              <RefreshCw size={18} color={Colors.light.primary} /><Text style={styles.regenText}>Regenerate</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 60 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.light.gray[50] },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  title: { fontSize: 30, fontWeight: '900', letterSpacing: -1 },
  subtitle: { fontSize: 14, marginTop: 8, marginBottom: 20, lineHeight: 20 },
  generateBtn: { flexDirection: 'row', gap: 8, backgroundColor: Colors.light.primary, paddingVertical: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  generateText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  loadingBox: { alignItems: 'center', gap: 12, paddingVertical: 60 },
  loadingText: { fontSize: 15, fontWeight: '600' },
  errorBox: { borderRadius: 16, padding: 20, gap: 14, marginTop: 10 },
  mealCard: { borderRadius: 18, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  mealHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mealType: { fontSize: 12, fontWeight: '800', color: '#94A3B8', letterSpacing: 1, textTransform: 'uppercase' },
  mealKcal: { fontSize: 15, fontWeight: '800' },
  mealTitle: { fontSize: 18, fontWeight: '800', marginTop: 4 },
  mealItems: { fontSize: 13, marginTop: 4, lineHeight: 18 },
  macroRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  macro: { fontSize: 13, fontWeight: '700' },
  logBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.light.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  logBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  totalsCard: { borderRadius: 16, padding: 16, marginTop: 4, marginBottom: 22 },
  totalsTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  totalsValue: { fontSize: 16, fontWeight: '800', marginTop: 4 },
  section: { fontSize: 20, fontWeight: '800', marginBottom: 12 },
  microCard: { borderRadius: 18, padding: 16, marginBottom: 20, gap: 12 },
  microRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  microName: { width: 90, fontSize: 13, fontWeight: '700' },
  microBarTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: 'rgba(120,140,130,0.18)', overflow: 'hidden' },
  microBarFill: { height: 8, borderRadius: 4 },
  microPct: { width: 70, textAlign: 'right', fontSize: 12, fontWeight: '600' },
  tipCard: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', borderRadius: 16, padding: 16, marginBottom: 18 },
  tipText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  regenBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  regenText: { color: Colors.light.primary, fontSize: 15, fontWeight: '700' },
});
