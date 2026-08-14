// Plan repas IA — génère un plan de 3 jours selon objectif + budget MAD +
// conditions médicales (diabète/hypertension…) + ingrédients locaux/MENA.
import React, { useEffect, useRef, useState } from 'react';
import { useTokens } from '../../constants/tokens';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { Sparkles, Bookmark, MapPin } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ScreenTopBar from '../../components/ScreenTopBar';
import PhotoStrip from '../../components/PhotoStrip';
import { FormCard, FormInput, Stepper, SubmitBar } from '../../components/FormKit';
import ScreenTitle from '../../components/ui/ScreenTitle';
import { aiGenerate } from '../../lib/aiProxy';
import { getUserFromFirestore } from '../../lib/firebase';
import { logEntry, getEntries } from '../../lib/tracking';
import { getDietPrefs } from '../../lib/dietPrefs';
import { buildObjectiveContext } from '../../lib/objective/buildContext';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { useScreenGate } from '../../components/FeatureGate';

const GREEN = '#2E8B57';

// Traduction des conditions médicales (dietPrefs.conditions, mêmes clés que
// lib/objective/scoring.ts) en consignes IA — miroir des règles de scoreFood
// (diabète→limiter sucre/IG élevé, hypertension→limiter sel/sodium, etc.).
// Guidance diététique conservatrice, PAS un diagnostic.
const MEDICAL_HINTS: Record<string, Record<string, string>> = {
  fr: {
    diabetes: 'diabète (limiter sucre, jus, aliments à index glycémique élevé ; privilégier fibres)',
    hypertension: 'hypertension (limiter sel/sodium, charcuterie, conserves, plats salés)',
    high_cholesterol: 'cholestérol élevé (limiter graisses saturées, fritures, beurre, charcuterie)',
    celiac: 'maladie cœliaque (STRICTEMENT sans gluten : ni blé, orge, seigle, pain, pâtes, couscous)',
    kidney: 'insuffisance rénale (modérer protéines, potassium et sodium)',
    ibs: 'syndrome de l’intestin irritable (limiter les FODMAP : oignon, ail, légumineuses…)',
    lowfodmap: 'régime pauvre en FODMAP (éviter oignon, ail, légumineuses, lactose…)',
    gout: 'goutte (limiter viande rouge, abats, fruits de mer, alcool)',
  },
  en: {
    diabetes: 'diabetes (limit sugar, juices, high-glycemic foods; favor fiber)',
    hypertension: 'hypertension (limit salt/sodium, cured meats, canned/salty dishes)',
    high_cholesterol: 'high cholesterol (limit saturated fat, fried food, butter, cured meats)',
    celiac: 'celiac disease (STRICTLY gluten-free: no wheat, barley, rye, bread, pasta, couscous)',
    kidney: 'kidney impairment (moderate protein, potassium and sodium)',
    ibs: 'irritable bowel syndrome (limit FODMAPs: onion, garlic, legumes…)',
    lowfodmap: 'low-FODMAP diet (avoid onion, garlic, legumes, lactose…)',
    gout: 'gout (limit red meat, organ meats, seafood, alcohol)',
  },
  ar: {
    diabetes: 'السكري (تقليل السكر والعصائر والأطعمة عالية المؤشر الجلايسيمي؛ تفضيل الألياف)',
    hypertension: 'ارتفاع ضغط الدم (تقليل الملح/الصوديوم واللحوم المصنعة والمعلبات)',
    high_cholesterol: 'ارتفاع الكوليسترول (تقليل الدهون المشبعة والمقليات والزبدة)',
    celiac: 'الداء البطني (خالٍ تمامًا من الغلوتين: لا قمح ولا شعير ولا خبز ولا معكرونة ولا كسكس)',
    kidney: 'قصور كلوي (تعديل البروتين والبوتاسيوم والصوديوم)',
    ibs: 'القولون العصبي (تقليل الفودماب: البصل، الثوم، البقوليات…)',
    lowfodmap: 'حمية قليلة الفودماب (تجنب البصل والثوم والبقوليات واللاكتوز…)',
    gout: 'النقرس (تقليل اللحوم الحمراء والأحشاء والمأكولات البحرية والكحول)',
  },
};

// Construit la phrase "conditions médicales" à injecter dans le prompt IA.
function medicalPromptHint(conditions: string[], language: string): string {
  const dict = MEDICAL_HINTS[language] || MEDICAL_HINTS.en;
  const parts = (conditions || []).map((c) => dict[String(c).toLowerCase().trim()]).filter(Boolean);
  if (!parts.length) return '';
  const lead: Record<string, string> = {
    fr: 'Adapte STRICTEMENT le plan à ces conditions de santé (guidance, pas un diagnostic) : ',
    en: 'STRICTLY adapt the plan to these health conditions (guidance, not a diagnosis): ',
    ar: 'كيّف الخطة بدقة مع هذه الحالات الصحية (إرشاد، وليس تشخيصًا): ',
  };
  const sep = language === 'ar' ? '؛ ' : ' ; ';
  return `${lead[language] || lead.en}${parts.join(sep)}.`;
}

const TXT: any = {
  en: {
    title: 'AI meal plan',
    sub1: 'Goal', sub2: 'kcal · 3 days. Set your budget and ingredients.',
    calsLabel: 'Target calories',
    budgetLabel: 'Budget (MAD/day, optional)',
    budgetPh: 'e.g. 60',
    fridgeLabel: 'Available ingredients (optional)',
    fridgePh: 'e.g. chicken, rice, broccoli, eggs…',
    localLabel: 'Local & MENA ingredients',
    localHint: 'Favor affordable local produce (Morocco / MENA).',
    medBadge: 'Medical conditions taken into account',
    generate: 'Generate my 3-day plan',
    regenerate: 'Regenerate',
    generating: 'Generating the plan…',
    fail: 'Generation failed',
    error: 'error',
    replyLang: 'Reply in English',
    savedTitle: 'My saved plans',
    savedHint: 'Saved on this phone + your account. Tap to reopen.',
  },
  fr: {
    title: 'Plan repas IA',
    sub1: 'Objectif', sub2: 'kcal · 3 jours. Choisis budget et ingrédients.',
    calsLabel: 'Calories cibles',
    budgetLabel: 'Budget (MAD/jour, optionnel)',
    budgetPh: 'ex. 60',
    fridgeLabel: 'Ingrédients dispo (optionnel)',
    fridgePh: 'ex. poulet, riz, brocoli, œufs…',
    localLabel: 'Ingrédients locaux & MENA',
    localHint: 'Privilégie les produits locaux abordables (Maroc / MENA).',
    medBadge: 'Conditions médicales prises en compte',
    generate: 'Générer mon plan 3 jours',
    regenerate: 'Régénérer',
    generating: 'Génération du plan…',
    fail: 'Génération impossible',
    error: 'erreur',
    replyLang: 'Réponds en français',
    savedTitle: 'Mes plans enregistrés',
    savedHint: 'Enregistrés sur ce téléphone + ton compte. Touche pour rouvrir.',
  },
  ar: {
    title: 'خطة وجبات ذكية',
    sub1: 'الهدف', sub2: 'سعرة · 3 أيام. حدّد الميزانية والمكونات.',
    calsLabel: 'السعرات المستهدفة',
    budgetLabel: 'الميزانية (درهم/يوم، اختياري)',
    budgetPh: 'مثال: 60',
    fridgeLabel: 'المكونات المتوفرة (اختياري)',
    fridgePh: 'مثال: دجاج، أرز، بروكلي، بيض…',
    localLabel: 'مكونات محلية ومن منطقة الشرق الأوسط',
    localHint: 'تفضيل المنتجات المحلية الاقتصادية (المغرب / MENA).',
    medBadge: 'تؤخذ الحالات الصحية بعين الاعتبار',
    generate: 'أنشئ خطة 3 أيام',
    regenerate: 'إعادة الإنشاء',
    generating: 'جارٍ إنشاء الخطة…',
    fail: 'تعذّر الإنشاء',
    error: 'خطأ',
    replyLang: 'أجب بالعربية',
    savedTitle: 'خططي المحفوظة',
    savedHint: 'محفوظة على الهاتف + حسابك. اضغط لإعادة الفتح.',
  },
};

export default function AiMealPlanScreen() {
  const __gate = useScreenGate('ai-meal-plan');
  const { user } = useUser();
  // FEATURE #103 : ingrédients transmis depuis « Frigo → recettes » (param URL).
  const params = useLocalSearchParams<{ ingredients?: string }>();
  const { resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';
  // Accent thémé : GREEN est le vert CLAIR ; en sombre on utilise le token
  // dark officiel (contraste correct sur fond sombre).
  const accent = isDark ? '#4ade80' : GREEN;
  const tok = useTokens();
  const bg = tok.bg;
  const card = tok.surface;
  const text = tok.text;
  const sub = tok.textMuted;
  const align: any = { textAlign: isRTL ? 'right' : 'left' };

  const [goal, setGoal] = useState('maintain');
  const [cals, setCals] = useState(2000);
  const [budget, setBudget] = useState('');
  const [fridge, setFridge] = useState('');
  const [localPref, setLocalPref] = useState(true);
  const [conditions, setConditions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState('');
  const [saved, setSaved] = useState<any[]>([]);
  const email = user?.primaryEmailAddress?.emailAddress || '';
  const CACHE_KEY = 'ai_meal_plans_v1';
  // FEATURE #66 : dernier plan généré, caché sur le device pour ré-affichage instantané.
  const LAST_PLAN_KEY = '@salorie/last_meal_plan';

  // FEATURE #103 : pré-remplit le champ « ingrédients dispo » avec ce qui vient
  // de « Frigo → recettes » (param URL) — une seule fois, sans écraser une saisie manuelle.
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (prefilledRef.current) return;
    const incoming = typeof params.ingredients === 'string' ? params.ingredients.trim() : '';
    if (incoming) { setFridge(incoming); prefilledRef.current = true; }
  }, [params.ingredients]);

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

  // FEATURE #66 : à l'ouverture, hydrate le dernier plan caché (device) pour
  // l'afficher instantanément au lieu de l'état vide. JSON.parse en try/catch.
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(LAST_PLAN_KEY);
        if (!raw) return;
        const cached = JSON.parse(raw);
        if (cached && typeof cached.plan === 'string' && cached.plan) setPlan(cached.plan);
      } catch {}
    })();
  }, []);

  useEffect(() => { (async () => { try { const e = user?.primaryEmailAddress?.emailAddress; if (e) { const p: any = await getUserFromFirestore(e, user?.id); if (p?.goal) setGoal(p.goal); if (p?.nutritionalPlan?.dailyCalories) setCals(Number(p.nutritionalPlan.dailyCalories)); } } catch {} })(); }, []);

  // Charge les conditions médicales déclarées (dietPrefs) pour afficher le badge
  // et les injecter dans le prompt (source de vérité = getDietPrefs).
  useEffect(() => { (async () => { try { const p = await getDietPrefs(); setConditions(Array.isArray(p.conditions) ? p.conditions : []); } catch {} })(); }, []);

  const run = async () => {
    setPlan(''); setLoading(true);
    try {
      const g = goal === 'lose' ? 'perte de poids' : goal === 'gain' ? 'prise de muscle' : 'maintien';
      // Contexte objectif (goal + régimes + conditions médicales) via le builder
      // partagé — on réutilise ses `conditions` (source de vérité) pour le prompt.
      let ctxConditions = conditions;
      try {
        const ctx = await buildObjectiveContext(email, user?.id);
        if (Array.isArray(ctx.conditions)) ctxConditions = ctx.conditions;
      } catch {}
      const medHint = medicalPromptHint(ctxConditions, language);
      const budgetHint = budget.trim()
        ? ` Budget serré : max ${budget} MAD (dirham marocain) par jour — privilégie des repas ÉCONOMIQUES (protéines abordables : œufs, lentilles, poulet, sardines ; féculents bon marché).`
        : ' Privilégie des repas économiques.';
      const localHint = localPref
        ? ' Privilégie des ingrédients LOCAUX et de la région MENA (Maroc/Maghreb/Moyen-Orient) : légumes de saison, légumineuses, huile d’olive, épices locales, pain complet.'
        : '';
      const fridgeHint = fridge.trim() ? ` Privilégie ces ingrédients dispo : ${fridge}.` : '';
      const text = await aiGenerate(`Génère un plan de repas sur 3 JOURS (Jour 1, Jour 2, Jour 3). Objectif : ${g}, ~${cals} kcal/jour.${budgetHint}${localHint}${fridgeHint}${medHint ? ` ${medHint}` : ''} Pour chaque jour donne : petit-déjeuner, déjeuner, collation, dîner — chacun avec les aliments et une estimation calories, puis le total du jour. ${t.replyLang}, concis, structuré par jour.`);
      const clean = text.trim();
      setPlan(clean);
      // SAUVEGARDE : device (AsyncStorage) + backend (Firestore via logEntry).
      const entry: any = { name: `${cals} kcal · ${goal}`, plan: clean, goal, cals, at: Date.now() };
      // FEATURE #66 : cache le dernier plan pour ré-affichage instantané à l'ouverture.
      AsyncStorage.setItem(LAST_PLAN_KEY, JSON.stringify(entry)).catch(() => {});
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

  if (!__gate.ok) return __gate.node;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <ScreenTitle title={t.title} icon={<Sparkles size={24} color={accent} />} />
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
            step={10}
            min={0}
            max={1000}
            unit="MAD"
          />
          <FormInput
            label={t.fridgeLabel}
            placeholder={t.fridgePh}
            multiline
            value={fridge}
            onChangeText={setFridge}
            style={{ height: 70, textAlignVertical: 'top' }}
          />
          {/* Préférence ingrédients locaux / MENA (toggle). */}
          <TouchableOpacity
            onPress={() => setLocalPref((v) => !v)}
            activeOpacity={0.8}
            style={[styles.localRow, isRTL && { flexDirection: 'row-reverse' }]}
          >
            <MapPin size={18} color={accent} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.localLabel, { color: text }, align]}>{t.localLabel}</Text>
              <Text style={[styles.localHint, { color: sub }, align]}>{t.localHint}</Text>
            </View>
            <View style={[styles.toggle, { backgroundColor: localPref ? accent : (isDark ? '#334155' : '#cbd5e1') }]}>
              <View style={[styles.knob, localPref ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' }]} />
            </View>
          </TouchableOpacity>
        </FormCard>

        {/* Badge conditions médicales prises en compte (source : dietPrefs). */}
        {conditions.length > 0 && (
          <View style={[styles.medBadge, { backgroundColor: isDark ? '#14532d' : '#dcfce7' }, isRTL && { flexDirection: 'row-reverse' }]}>
            <Sparkles size={16} color={accent} />
            <Text style={[styles.medBadgeTxt, { color: isDark ? '#bbf7d0' : '#166534' }, align]}>{t.medBadge}</Text>
          </View>
        )}

        {loading && <Text style={[styles.loadingTxt, { color: sub }]}>{t.generating}</Text>}
        {!!plan && (
          <View style={[styles.card, { backgroundColor: card }]}>
            <Text style={[styles.cardTxt, { color: text }, align]}>{plan}</Text>
            {/* FEATURE #66 : relance le flux de génération existant sur le plan caché. */}
            <TouchableOpacity
              onPress={run}
              disabled={loading}
              activeOpacity={0.85}
              style={[styles.regenBtn, isRTL && { flexDirection: 'row-reverse' }]}
            >
              <Sparkles size={16} color={accent} />
              <Text style={styles.regenTxt}>{t.regenerate}</Text>
            </TouchableOpacity>
          </View>
        )}

        {saved.length > 0 && (
          <>
            <Text style={[styles.savedTitle, { color: text }, align]}>{t.savedTitle}</Text>
            <Text style={[styles.savedHint, { color: sub }, align]}>{t.savedHint}</Text>
            {saved.map((s, i) => (
              <TouchableOpacity key={s.id || i} style={[styles.savedItem, { backgroundColor: card }, isRTL && { flexDirection: 'row-reverse' }]} onPress={() => setPlan(s.plan)} activeOpacity={0.85}>
                <Bookmark size={18} color={accent} />
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
  regenBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: GREEN },
  regenTxt: { fontSize: 14, fontWeight: '800', color: GREEN },
  savedTitle: { fontSize: 15, fontWeight: '800', marginTop: 24, marginBottom: 2 },
  savedHint: { fontSize: 12, marginBottom: 10 },
  savedItem: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 14, marginBottom: 8 },
  savedName: { fontSize: 14, fontWeight: '700' },
  savedDate: { fontSize: 12, marginTop: 1 },
  localRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  localLabel: { fontSize: 14, fontWeight: '700' },
  localHint: { fontSize: 12, marginTop: 1, lineHeight: 16 },
  toggle: { width: 46, height: 26, borderRadius: 13, padding: 3, justifyContent: 'center' },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  medBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, marginTop: 12 },
  medBadgeTxt: { fontSize: 13, fontWeight: '700', flex: 1 },
});

