import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { useEspaceBasSimple } from '../../lib/espaceBas';
import { numLocaleFor } from '../../lib/format';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Sparkles, RefreshCw, Plus, Lightbulb, Save, History, Check, ShoppingCart } from 'lucide-react-native';
import { Alert } from 'react-native';
import { SecondaryButton } from '../../components/ui';
import ScreenTopBar from '../../components/ScreenTopBar';
import PhotoStrip from '../../components/PhotoStrip';
import BrandBanner from '../../components/BrandBanner';
import { SkeletonCard } from '../../components/ui';
import { Colors } from '../../constants/Colors';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { rowDir, txtAlign } from '../../lib/rtl';
import { emailToDocId } from '../../lib/firebase';
import { generateMealPlan, MealPlan } from '../../lib/AiModel';
import { saveMealPlan } from '../../lib/aiStore';
import { getDietPrefs, dietPromptHint } from '../../lib/dietPrefs';
import { useScreenGate } from '../../components/FeatureGate';

const DEFAULTS = { calories: 2000, protein: 150, carbs: 220, fat: 65 };

export default function MealPlanScreen() {
  const __gate = useScreenGate('meal-plan');
  const { user } = useUser();
  const espaceBas = useEspaceBasSimple();
  const { colors, resolved } = useTheme();
  const { t, language, isRTL } = useTranslation() as any;
  const isDark = resolved === 'dark';
  const styles = useMemo(() => makeStyles(isDark), [isDark]);

  // Local FR/EN/AR strings for the pre-generation preview (D1). Kept inline so
  // we don't touch the shared i18n file — zero risk of breaking other screens.
  const LSTR: Record<string, Record<string, string>> = {
    en: { banner_title: 'AI Meal Plan', banner_sub: 'A full day of meals, built around your goals.', targets_title: "Today's targets", protein: 'Protein', carbs: 'Carbs', fat: 'Fat', how_title: 'How it works', step1: 'We build a full day of meals around your calorie & macro targets.', step2: 'Tap "Log" on any meal to add it to your day in one tap.', step3: 'Save the whole plan to your history to reuse it anytime.', saved_plans: 'Saved plans', history: 'History', save_all: 'Save the whole plan', plan_saved: 'Plan saved', save_ok_title: 'Saved', save_ok_msg: 'Plan saved to your history.', save_err_title: 'Oops', save_err_msg: 'Could not save. Try again.', add_to_list: 'Add to shopping list', added_n: 'items added', already_all: 'Already on your list' },
    fr: { banner_title: 'Plan de repas IA', banner_sub: 'Une journée de repas calée sur tes objectifs.', targets_title: 'Tes objectifs du jour', protein: 'Protéines', carbs: 'Glucides', fat: 'Lipides', how_title: 'Comment ça marche', step1: 'On construit une journée de repas calée sur tes calories et macros.', step2: 'Touche « Logger » sur un repas pour l\'ajouter en un tap.', step3: 'Enregistre tout le plan dans ton historique pour le réutiliser.', saved_plans: 'Plans enregistrés', history: 'Historique', save_all: 'Enregistrer tout le plan', plan_saved: 'Plan enregistré', save_ok_title: 'Enregistré', save_ok_msg: 'Plan enregistré dans ton historique.', save_err_title: 'Oups', save_err_msg: 'Échec de l\'enregistrement. Réessaie.', add_to_list: 'Ajouter à la liste de courses', added_n: 'articles ajoutés', already_all: 'Déjà dans ta liste' },
    ar: { banner_title: 'خطة وجبات بالذكاء', banner_sub: 'يوم كامل من الوجبات وفق أهدافك.', targets_title: 'أهداف اليوم', protein: 'بروتين', carbs: 'كربوهيدرات', fat: 'دهون', how_title: 'كيف يعمل', step1: 'نُنشئ يومًا كاملًا من الوجبات وفق سعراتك ووحداتك الكبرى.', step2: 'اضغط «تسجيل» على أي وجبة لإضافتها بنقرة واحدة.', step3: 'احفظ الخطة كاملة في سجلّك لإعادة استخدامها.', saved_plans: 'الخطط المحفوظة', history: 'السجل', save_all: 'احفظ الخطة كاملة', plan_saved: 'تم حفظ الخطة', save_ok_title: 'تم الحفظ', save_ok_msg: 'حُفظت الخطة في سجلّك.', save_err_title: 'تعذّر', save_err_msg: 'فشل الحفظ. حاول مجددًا.', add_to_list: 'أضف إلى قائمة المشتريات', added_n: 'عناصر مضافة', already_all: 'موجود بالفعل في قائمتك' },
  };
  const L = (k: string) => (LSTR[String(language)] || LSTR.en)[k] || LSTR.en[k] || k;

  // i18n #90 — locale-aware number formatting (display only, no calc change).
  const numLocale = numLocaleFor(language);
  const fmtNum = (n: number) => {
    try { return Number(n).toLocaleString(numLocale); } catch { return String(n); }
  };

  const [targets, setTargets] = useState(DEFAULTS);
  const [usingDefaults, setUsingDefaults] = useState(true);
  const [goal, setGoal] = useState('maintain');
  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const saveAll = async () => {
    const email = user?.primaryEmailAddress?.emailAddress || '';
    if (!email || !plan || saving) return;
    setSaving(true);
    const id = await saveMealPlan(email, plan, targets);
    setSaving(false);
    if (id) { setSaved(true); Alert.alert(L('save_ok_title'), L('save_ok_msg')); }
    else Alert.alert(L('save_err_title'), L('save_err_msg'));
  };

  // Feature #165 — ajoute les ingrédients du plan à la liste de courses.
  // Source: les `items` (ingrédients) de chaque repas ; fallback sur le titre
  // du repas si un repas n'expose pas d'items. Dédup insensible à la casse vs
  // l'existant ET dans le lot. Persiste sous la même clé/forme que shopping-list.
  const SHOPPING_KEY = 'shopping_list_v1';
  const [addingList, setAddingList] = useState(false);

  const addToShoppingList = async () => {
    if (!plan || addingList) return;
    setAddingList(true);
    try {
      // Collecte des noms d'ingrédients (fallback: titre du repas).
      const raw: string[] = [];
      for (const m of plan.meals) {
        if (Array.isArray(m.items) && m.items.length) raw.push(...m.items);
        else if (m.title) raw.push(m.title);
      }
      const names = raw
        .map((s) => String(s || '').trim())
        .filter((s) => s.length > 0);

      // Liste existante (défensif).
      let existing: { id: string; name: string; done: boolean }[] = [];
      try {
        const stored = await AsyncStorage.getItem(SHOPPING_KEY);
        const parsed = stored ? JSON.parse(stored) : null;
        if (Array.isArray(parsed)) {
          existing = parsed.filter(
            (it) => it && typeof it.name === 'string' && typeof it.id === 'string'
          );
        }
      } catch {}

      // Dédup case-insensitive vs existant + à l'intérieur du lot.
      const seen = new Set(existing.map((it) => it.name.trim().toLowerCase()));
      const fresh: { id: string; name: string; done: boolean }[] = [];
      names.forEach((name, index) => {
        const key = name.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        fresh.push({ id: String(Date.now() + index), name, done: false });
      });

      if (fresh.length === 0) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        Alert.alert(L('banner_title'), L('already_all'));
        return;
      }

      // Plus récent en tête (comme l'écran liste de courses).
      const next = [...fresh, ...existing];
      await AsyncStorage.setItem(SHOPPING_KEY, JSON.stringify(next));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert(L('banner_title'), `${fmtNum(fresh.length)} ${L('added_n')}`);
    } catch {
      Alert.alert(L('save_err_title'), L('save_err_msg'));
    } finally {
      setAddingList(false);
    }
  };

  const text = isDark ? '#fff' : Colors.light.gray[900];
  const sub = isDark ? '#9BA1A6' : Colors.light.gray[500];
  const card = isDark ? Colors.dark.card : '#fff';
  const bg = isDark ? '#0f1419' : 'transparent';

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
    setLoading(true); setError(null); setSaved(false);
    try {
      // Injecte les contraintes de régime (halal/keto/...) dans le prompt IA.
      const prefs = await getDietPrefs();
      const dietHint = dietPromptHint(prefs, String(language || 'en'));
      const p = await generateMealPlan({ ...targets, goal, language: (language as any) || 'en', diet: dietHint || undefined });
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

  if (!__gate.ok) return __gate.node;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: espaceBas }]} showsVerticalScrollIndicator={false}>
        <ScreenTopBar showBack showBrand={false} showNotif={false} />

        <View style={[styles.titleRow, { flexDirection: rowDir(isRTL) }]}>
          <Sparkles size={26} color={colors.primary} />
          <Text style={[styles.title, { color: text, textAlign: txtAlign(isRTL) }]}>{t('mealplan.title')}</Text>
        </View>
        <PhotoStrip category="food" />
        <Text style={[styles.subtitle, { color: sub, textAlign: txtAlign(isRTL) }]}>
          {t('mealplan.subtitle_prefix')} — {fmtNum(targets.calories)} kcal · {fmtNum(targets.protein)}P / {fmtNum(targets.carbs)}C / {fmtNum(targets.fat)}F
          {usingDefaults ? '  ' + t('mealplan.default_note') : ''}
        </Text>
        <BrandBanner title={L('banner_title')} subtitle={L('banner_sub')} height={120} style={{ marginBottom: 18 }} />

        {!plan && !loading && (
          <>
            {/* D1: pre-generation preview — targets + how-it-works fill the empty
                space and set expectations before the AI plan is generated. */}
            <View style={styles.targetsCard}>
              <Text style={[styles.targetsTitle, { textAlign: txtAlign(isRTL) }]}>{L('targets_title')}</Text>
              <View style={[styles.targetsRow, { flexDirection: rowDir(isRTL) }]}>
                <View style={styles.targetTile}>
                  <Text style={styles.targetVal}>{fmtNum(targets.calories)}</Text>
                  <Text style={styles.targetLbl}>kcal</Text>
                </View>
                <View style={styles.targetTile}>
                  <Text style={[styles.targetVal, { color: '#0ea5e9' }]}>{fmtNum(targets.protein)}g</Text>
                  <Text style={styles.targetLbl}>{L('protein')}</Text>
                </View>
                <View style={styles.targetTile}>
                  <Text style={[styles.targetVal, { color: '#f59e0b' }]}>{fmtNum(targets.carbs)}g</Text>
                  <Text style={styles.targetLbl}>{L('carbs')}</Text>
                </View>
                <View style={styles.targetTile}>
                  <Text style={[styles.targetVal, { color: '#ef4444' }]}>{fmtNum(targets.fat)}g</Text>
                  <Text style={styles.targetLbl}>{L('fat')}</Text>
                </View>
              </View>
            </View>

            <View style={[styles.stepsCard, { backgroundColor: card, borderColor: isDark ? '#283241' : Colors.light.gray[100] }]}>
              <Text style={[styles.stepsTitle, { color: text, textAlign: txtAlign(isRTL) }]}>{L('how_title')}</Text>
              {[L('step1'), L('step2'), L('step3')].map((s, i) => (
                <View key={i} style={[styles.stepRow, { flexDirection: rowDir(isRTL) }]}>
                  <View style={styles.stepNum}><Text style={styles.stepNumTxt}>{i + 1}</Text></View>
                  <Text style={[styles.stepTxt, { color: sub, textAlign: txtAlign(isRTL) }]}>{s}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity style={[styles.generateBtn, { backgroundColor: colors.primary, flexDirection: rowDir(isRTL) }]} onPress={generate}>
              <Sparkles size={20} color="#fff" />
              <Text style={styles.generateText}>{t('mealplan.generate')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.histLink, { flexDirection: rowDir(isRTL) }]} onPress={() => router.push('/meal-plan-history' as any)}>
              <History size={18} color={colors.primary} />
              <Text style={[styles.histLinkTxt, { color: colors.primary }]}>{L('saved_plans')}</Text>
            </TouchableOpacity>
          </>
        )}

        {loading && (
          <>
            {/* D1: skeleton cards preview the meal-card structure while the AI
                plan generates — premium wait, no empty screen or content jump. */}
            <Text style={[styles.loadingText, { color: sub, textAlign: txtAlign(isRTL), marginBottom: 14 }]}>{t('mealplan.cooking')}</Text>
            <SkeletonCard height={120} />
            <SkeletonCard height={120} />
            <SkeletonCard height={120} />
          </>
        )}

        {error && !loading && (
          <View style={[styles.errorBox, { backgroundColor: card }]}>
            <Text style={{ color: isDark ? Colors.dark.error : Colors.light.error, fontWeight: '600', textAlign: txtAlign(isRTL) }}>{t('mealplan.error')}</Text>
            <TouchableOpacity style={[styles.generateBtn, { backgroundColor: colors.primary, flexDirection: rowDir(isRTL) }]} onPress={generate}>
              <RefreshCw size={18} color="#fff" /><Text style={styles.generateText}>{t('mealplan.retry')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {plan && !loading && (
          <>
            {plan.meals.map((m, i) => (
              <View key={i} style={[styles.mealCard, { backgroundColor: card, borderWidth: 1, borderColor: isDark ? '#283241' : 'transparent', shadowColor: isDark ? 'transparent' : '#000' }]}>
                <View style={[styles.mealHead, { flexDirection: rowDir(isRTL) }]}>
                  <Text style={[styles.mealType, { textAlign: txtAlign(isRTL) }]}>{m.type}</Text>
                  <Text style={[styles.mealKcal, { color: colors.primary }]}>{fmtNum(Math.round(m.calories))} kcal</Text>
                </View>
                <Text style={[styles.mealTitle, { color: text, textAlign: txtAlign(isRTL) }]}>{m.title}</Text>
                {!!m.items?.length && <Text style={[styles.mealItems, { color: sub, textAlign: txtAlign(isRTL) }]}>{m.items.join(' · ')}</Text>}
                <View style={[styles.macroRow, { flexDirection: rowDir(isRTL) }]}>
                  <Text style={[styles.macro, { color: sub }]}>P {fmtNum(Math.round(m.protein))}g</Text>
                  <Text style={[styles.macro, { color: sub }]}>C {fmtNum(Math.round(m.carbs))}g</Text>
                  <Text style={[styles.macro, { color: sub }]}>F {fmtNum(Math.round(m.fat))}g</Text>
                  <View style={{ flex: 1 }} />
                  <TouchableOpacity style={[styles.logBtn, { backgroundColor: colors.primary, flexDirection: rowDir(isRTL) }]} onPress={() => logMeal(m)}>
                    <Plus size={16} color="#fff" /><Text style={styles.logBtnText}>{t('mealplan.log')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            {/* Totals */}
            <View style={[styles.totalsCard, { backgroundColor: isDark ? Colors.dark.primaryLight : Colors.light.primaryLight }]}>
              <Text style={[styles.totalsTitle, { color: isDark ? Colors.dark.primaryDark : Colors.light.primaryDark, textAlign: txtAlign(isRTL) }]}>{t('mealplan.daily_total')}</Text>
              <Text style={[styles.totalsValue, { color: isDark ? Colors.dark.primaryDark : Colors.light.primaryDark, textAlign: txtAlign(isRTL) }]}>
                {fmtNum(Math.round(plan.totals.calories))} kcal · {fmtNum(Math.round(plan.totals.protein))}P / {fmtNum(Math.round(plan.totals.carbs))}C / {fmtNum(Math.round(plan.totals.fat))}F
              </Text>
            </View>

            {/* Micronutrients */}
            {!!plan.micros?.length && (
              <>
                <Text style={[styles.section, { color: text, textAlign: txtAlign(isRTL) }]}>{t('mealplan.micros')}</Text>
                <View style={[styles.microCard, { backgroundColor: card, borderWidth: 1, borderColor: isDark ? '#283241' : 'transparent' }]}>
                  {plan.micros.map((mi, i) => (
                    <View key={i} style={[styles.microRow, { flexDirection: rowDir(isRTL) }]}>
                      <Text style={[styles.microName, { color: text, textAlign: txtAlign(isRTL) }]}>{mi.name}</Text>
                      <View style={styles.microBarTrack}>
                        <View style={[styles.microBarFill, { width: `${Math.min(100, Math.max(2, mi.pct))}%`, backgroundColor: mi.pct >= 90 ? '#10B981' : mi.pct >= 50 ? colors.primary : '#f59e0b' }]} />
                      </View>
                      <Text style={[styles.microPct, { color: sub, textAlign: isRTL ? 'left' : 'right' }]}>{mi.amount}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* Tip */}
            {!!plan.tip && (
              <View style={[styles.tipCard, { backgroundColor: card, flexDirection: rowDir(isRTL), borderWidth: 1, borderColor: isDark ? '#283241' : 'transparent' }]}>
                <Lightbulb size={20} color={colors.primary} />
                <Text style={[styles.tipText, { color: text, textAlign: txtAlign(isRTL) }]}>{plan.tip}</Text>
              </View>
            )}

            <TouchableOpacity style={[styles.saveAllBtn, { backgroundColor: colors.primary, flexDirection: rowDir(isRTL) }, saved && { backgroundColor: '#16a34a' }]} onPress={saveAll} disabled={saving || saved}>
              {saving ? <ActivityIndicator color="#fff" /> : (saved ? <Check size={18} color="#fff" /> : <Save size={18} color="#fff" />)}
              <Text style={styles.saveAllText}>{saved ? L('plan_saved') : L('save_all')}</Text>
            </TouchableOpacity>

            {/* Feature #165 — ajouter les ingrédients du plan à la liste de courses. */}
            <SecondaryButton
              title={L('add_to_list')}
              onPress={addToShoppingList}
              icon={<ShoppingCart size={18} color={colors.primary} />}
              disabled={addingList}
              style={{ marginTop: 10 }}
            />

            <View style={[styles.rowBtns, { flexDirection: rowDir(isRTL) }]}>
              <TouchableOpacity style={[styles.regenBtn, { flex: 1, flexDirection: rowDir(isRTL) }]} onPress={generate}>
                <RefreshCw size={18} color={colors.primary} /><Text style={[styles.regenText, { color: colors.primary }]}>{t('mealplan.regenerate')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.regenBtn, { flex: 1, flexDirection: rowDir(isRTL) }]} onPress={() => router.push('/meal-plan-history' as any)}>
                <History size={18} color={colors.primary} /><Text style={[styles.regenText, { color: colors.primary }]}>{L('history')}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// Fabrique thémée : un StyleSheet est évalué au chargement du module, où `isDark`
// n'existe pas. Le composant l'appelle via useMemo, recalculé au changement de thème.
const makeStyles = (isDark: boolean) => StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 60 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? Colors.dark.gray[50] : Colors.light.gray[50] },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  title: { fontSize: 30, fontWeight: '900', letterSpacing: -1 },
  subtitle: { fontSize: 14, marginTop: 8, marginBottom: 14, lineHeight: 20 },
  hero: { width: '100%', height: 140, borderRadius: 18, marginBottom: 18 },
  targetsCard: { backgroundColor: isDark ? Colors.dark.primaryLight : Colors.light.primaryLight, borderRadius: 18, padding: 16, marginTop: 2, marginBottom: 14 },
  targetsTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', color: isDark ? Colors.dark.primaryDark : Colors.light.primaryDark, marginBottom: 14 },
  targetsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  targetTile: { alignItems: 'center', flex: 1 },
  targetVal: { fontSize: 20, fontWeight: '900', color: isDark ? Colors.dark.primaryDark : Colors.light.primaryDark },
  targetLbl: { fontSize: 11, fontWeight: '700', color: isDark ? Colors.dark.gray[500] : Colors.light.gray[500], marginTop: 2 },
  stepsCard: { borderRadius: 18, padding: 16, marginBottom: 16, gap: 12, borderWidth: 1, borderColor: isDark ? Colors.dark.gray[100] : Colors.light.gray[100] },
  stepsTitle: { fontSize: 14, fontWeight: '800', marginBottom: 2 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: isDark ? Colors.dark.primaryLight : Colors.light.primaryLight, alignItems: 'center', justifyContent: 'center' },
  stepNumTxt: { color: isDark ? Colors.dark.primary : Colors.light.primary, fontWeight: '900', fontSize: 13 },
  stepTxt: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
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
  regenText: { color: isDark ? Colors.dark.primary : Colors.light.primary, fontSize: 15, fontWeight: '700' },
  histLink: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, marginTop: 6 },
  histLinkTxt: { color: isDark ? Colors.dark.primary : Colors.light.primary, fontSize: 15, fontWeight: '800' },
  saveAllBtn: { flexDirection: 'row', gap: 8, backgroundColor: Colors.light.primary, paddingVertical: 15, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  saveAllText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  rowBtns: { flexDirection: 'row', gap: 8, marginTop: 4 },
});
