// Plan repas IA — génère un plan du jour selon objectif + budget + ingrédients dispo.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { Sparkles, Bookmark } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ScreenTopBar from '../../components/ScreenTopBar';
import PhotoStrip from '../../components/PhotoStrip';
import { FormCard, FormInput, Stepper, SubmitBar } from '../../components/FormKit';
import { aiGenerate } from '../../lib/aiProxy';
import { getUserFromFirestore } from '../../lib/firebase';
import { logEntry, getEntries } from '../../lib/tracking';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';

const GREEN = '#2E8B57';

const TXT: any = {
  en: {
    title: 'AI meal plan',
    sub1: 'Goal', sub2: 'kcal. Add a budget and ingredients (optional).',
    calsLabel: 'Target calories',
    budgetLabel: 'Budget (€, optional)',
    budgetPh: 'e.g. 8',
    fridgeLabel: 'Available ingredients (optional)',
    fridgePh: 'e.g. chicken, rice, broccoli, eggs…',
    generate: 'Generate my plan',
    generating: 'Generating the plan…',
    fail: 'Generation failed',
    error: 'error',
    replyLang: 'Réponds en anglais',
    savedTitle: 'My saved plans',
    savedHint: 'Saved on this phone + your account. Tap to reopen.',
  },
  fr: {
    title: 'Plan repas IA',
    sub1: 'Objectif', sub2: 'kcal. Ajoute budget et ingrédients (optionnel).',
    calsLabel: 'Calories cibles',
    budgetLabel: 'Budget (€, optionnel)',
    budgetPh: 'ex. 8',
    fridgeLabel: 'Ingrédients dispo (optionnel)',
    fridgePh: 'ex. poulet, riz, brocoli, œufs…',
    generate: 'Générer mon plan',
    generating: 'Génération du plan…',
    fail: 'Génération impossible',
    error: 'erreur',
    replyLang: 'Réponds en français',
    savedTitle: 'Mes plans enregistrés',
    savedHint: 'Enregistrés sur ce téléphone + ton compte. Touche pour rouvrir.',
  },
  ar: {
    title: 'خطة وجبات ذكية',
    sub1: 'الهدف', sub2: 'سعرة. أضف ميزانية ومكونات (اختياري).',
    calsLabel: 'السعرات المستهدفة',
    budgetLabel: 'الميزانية (€، اختياري)',
    budgetPh: 'مثال: 8',
    fridgeLabel: 'المكونات المتوفرة (اختياري)',
    fridgePh: 'مثال: دجاج، أرز، بروكلي، بيض…',
    generate: 'أنشئ خطتي',
    generating: 'جارٍ إنشاء الخطة…',
    fail: 'تعذّر الإنشاء',
    error: 'خطأ',
    replyLang: 'Réponds en arabe',
    savedTitle: 'خططي المحفوظة',
    savedHint: 'محفوظة على الهاتف + حسابك. اضغط لإعادة الفتح.',
  },
};

export default function AiMealPlanScreen() {
  const { user } = useUser();
  const { resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';
  const bg = isDark ? '#0f172a' : '#F4F7F9';
  const card = isDark ? '#1e293b' : '#ffffff';
  const text = isDark ? '#f1f5f9' : '#0F172A';
  const sub = isDark ? '#94a3b8' : '#64748B';
  const align: any = { textAlign: isRTL ? 'right' : 'left' };

  const [goal, setGoal] = useState('maintain');
  const [cals, setCals] = useState(2000);
  const [budget, setBudget] = useState('');
  const [fridge, setFridge] = useState('');
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState('');
  const [saved, setSaved] = useState<any[]>([]);
  const email = user?.primaryEmailAddress?.emailAddress || '';
  const CACHE_KEY = 'ai_meal_plans_v1';

  // Lecture des plans sauvegardés : CASCADE device (AsyncStorage) → backend (Firestore).
  const loadSaved = async () => {
    try { const c = await AsyncStorage.getItem(CACHE_KEY); if (c) setSaved(JSON.parse(c)); } catch {}
    if (email) {
      try {
        const r = await getEntries(email, 'meal_plans', 10);
        if (r?.length) { setSaved(r); AsyncStorage.setItem(CACHE_KEY, JSON.stringify(r)).catch(() => {}); }
      } catch {}
    }
  };
  useEffect(() => { loadSaved(); }, [email]);

  useEffect(() => { (async () => { try { const e = user?.primaryEmailAddress?.emailAddress; if (e) { const p: any = await getUserFromFirestore(e, user?.id); if (p?.goal) setGoal(p.goal); if (p?.nutritionalPlan?.dailyCalories) setCals(Number(p.nutritionalPlan.dailyCalories)); } } catch {} })(); }, []);

  const run = async () => {
    setPlan(''); setLoading(true);
    try {
      const g = goal === 'lose' ? 'perte de poids' : goal === 'gain' ? 'prise de muscle' : 'maintien';
      const text = await aiGenerate(`Génère un plan de repas pour UNE journée. Objectif : ${g}, ~${cals} kcal/jour.${budget.trim() ? ` Budget max : ${budget}€.` : ''}${fridge.trim() ? ` Privilégie ces ingrédients dispo : ${fridge}.` : ''} Donne : petit-déjeuner, déjeuner, collation, dîner — chacun avec les aliments et une estimation calories. Total à la fin. ${t.replyLang}, concis.`);
      const clean = text.trim();
      setPlan(clean);
      // SAUVEGARDE : device (AsyncStorage) + backend (Firestore via logEntry).
      const entry: any = { name: `${cals} kcal · ${goal}`, plan: clean, goal, cals, at: Date.now() };
      try {
        const c = await AsyncStorage.getItem(CACHE_KEY);
        const arr = c ? JSON.parse(c) : [];
        arr.unshift(entry);
        const trimmed = arr.slice(0, 20);
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(trimmed));
        setSaved(trimmed);
      } catch {}
      if (email) { logEntry(email, 'meal_plans', entry).catch(() => {}); }
    } catch (e: any) { setPlan(`${t.fail} (${e?.message || t.error}).`); } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.head}><Sparkles size={24} color={GREEN} /><Text style={[styles.title, { color: text }]}>{t.title}</Text></View>
        <PhotoStrip category="food" />
        <Text style={[styles.sub, { color: sub }, align]}>{t.sub1} {goal} · ~{cals} {t.sub2}</Text>

        {/* Champs groupés en carte — pattern FormKit (Stepper pour les nombres). */}
        <FormCard>
          <Stepper
            label={t.calsLabel}
            value={cals}
            onChange={(v: string) => setCals(Math.max(0, parseInt(v, 10) || 0))}
            step={50}
            min={800}
            max={6000}
            unit="kcal"
          />
          <Stepper
            label={t.budgetLabel}
            value={budget}
            onChange={setBudget}
            step={1}
            min={0}
            max={500}
            unit="€"
          />
          <FormInput
            label={t.fridgeLabel}
            placeholder={t.fridgePh}
            multiline
            value={fridge}
            onChangeText={setFridge}
            style={{ height: 70, textAlignVertical: 'top' }}
          />
        </FormCard>

        {loading && <Text style={[styles.loadingTxt, { color: sub }]}>{t.generating}</Text>}
        {!!plan && <View style={[styles.card, { backgroundColor: card }]}><Text style={[styles.cardTxt, { color: text }, align]}>{plan}</Text></View>}

        {saved.length > 0 && (
          <>
            <Text style={[styles.savedTitle, { color: text }, align]}>{t.savedTitle}</Text>
            <Text style={[styles.savedHint, { color: sub }, align]}>{t.savedHint}</Text>
            {saved.map((s, i) => (
              <TouchableOpacity key={s.id || i} style={[styles.savedItem, { backgroundColor: card }, isRTL && { flexDirection: 'row-reverse' }]} onPress={() => setPlan(s.plan)} activeOpacity={0.85}>
                <Bookmark size={18} color={GREEN} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.savedName, { color: text }, align]} numberOfLines={1}>{s.name || `${s.cals} kcal · ${s.goal}`}</Text>
                  <Text style={[styles.savedDate, { color: sub }, align]}>{s.at ? new Date(s.at).toLocaleDateString() : ''}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>
      {/* CTA unique vert plein en bas (SubmitBar FormKit). */}
      <SubmitBar label={t.generate} onPress={run} loading={loading} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F7F9' },
  body: { padding: 20, paddingBottom: 100 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  title: { fontSize: 26, fontWeight: '900', color: '#0F172A', letterSpacing: -0.5 },
  sub: { fontSize: 14, color: '#64748B', marginBottom: 18, lineHeight: 20 },
  loadingTxt: { color: '#64748B', textAlign: 'center', marginTop: 16, fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 18, marginTop: 18, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  cardTxt: { fontSize: 14.5, color: '#1F2937', lineHeight: 22 },
  savedTitle: { fontSize: 15, fontWeight: '800', marginTop: 24, marginBottom: 2 },
  savedHint: { fontSize: 12, marginBottom: 10 },
  savedItem: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 14, marginBottom: 8 },
  savedName: { fontSize: 14, fontWeight: '700' },
  savedDate: { fontSize: 12, marginTop: 1 },
});

