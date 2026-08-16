// RECETTES LOCALES SANTÉ — ancrage MENA (tajine, couscous, harira…).
// Grille de recettes locales AVEC un badge verdict personnalisé selon l'objectif
// du jour + les conditions médicales de l'utilisateur (réutilise scoreRecipe /
// recommendForMe + buildObjectiveContext + useNutritionData). Détail d'une
// recette = ingrédients, étapes, astuces santé + les raisons du verdict.
// 100% offline (données statiques), i18n/dark/RTL/retour.
import React, { useEffect, useMemo, useState } from 'react';
import { useEspaceBasSimple } from '../../lib/espaceBas';
import { directionAuto } from '../../lib/rtl';
import { a11y } from '../../lib/a11y';
import { useTokens } from '../../constants/tokens';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Modal, Share } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useUser } from '@clerk/clerk-expo';
import { CheckCircle2, MinusCircle, AlertTriangle, X, Utensils, Info, Share2 } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { SkeletonCard } from '../../components/ui';
import { Stepper } from '../../components/FormKit';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { useNutritionData } from '../../hooks/useNutritionData';
import { buildObjectiveContext } from '../../lib/objective/buildContext';
import type { ObjectiveContext } from '../../lib/objective/scoring';
import {
  listCategories,
  recommendForMe,
  scoreRecipe,
  type LocalRecipe,
  type RecipeCategory,
  type ScoredRecipe,
} from '../../lib/localRecipes';

const GREEN = '#2E8B57';

const TXT: any = {
  en: {
    title: 'Local recipes', sub: 'Familiar MENA dishes, rated for your goal & health.',
    all: 'All', loading: 'Rating recipes for you…',
    recommended: 'Recommended for you',
    great: 'Great for you', ok: 'Decent', avoid: 'Go easy',
    forYourGoal: 'For your goal', kcal: 'kcal', protein: 'Protein', carbs: 'Carbs', fat: 'Fat',
    servings: 'servings', portionsLabel: 'Portions', ingredients: 'Ingredients', steps: 'Steps', swaps: 'Healthy swaps',
    why: 'Why this rating', close: 'Close', disclaimer: 'Dietary guidance, not a medical diagnosis.',
    share: 'Share', shareVia: 'via Salorie',
    cats: { soup: 'Soups', main: 'Mains', salad: 'Salads', bread: 'Breads', pastry: 'Pastries', dessert: 'Desserts' },
  },
  fr: {
    title: 'Recettes locales', sub: 'Des plats MENA familiers, notés selon ton objectif et ta santé.',
    all: 'Toutes', loading: 'Notation des recettes pour toi…',
    great: 'Idéal pour toi', ok: 'Correct', avoid: 'À modérer',
    forYourGoal: 'Pour ton objectif', kcal: 'kcal', protein: 'Protéines', carbs: 'Glucides', fat: 'Lipides',
    servings: 'portions', portionsLabel: 'Portions', ingredients: 'Ingrédients', steps: 'Étapes', swaps: 'Astuces santé',
    why: 'Pourquoi cette note', close: 'Fermer', disclaimer: 'Conseil diététique, pas un diagnostic médical.',
    share: 'Partager', shareVia: 'via Salorie',
    cats: { soup: 'Soupes', main: 'Plats', salad: 'Salades', bread: 'Pains', pastry: 'Feuilletés', dessert: 'Desserts' },
  },
  ar: {
    title: 'وصفات محلية', sub: 'أطباق مألوفة من المنطقة، مُقيَّمة حسب هدفك وصحتك.',
    all: 'الكل', loading: 'جارٍ تقييم الوصفات لك…',
    great: 'مثالي لك', ok: 'مقبول', avoid: 'باعتدال',
    forYourGoal: 'لهدفك', kcal: 'سعرة', protein: 'بروتين', carbs: 'كربوهيدرات', fat: 'دهون',
    servings: 'حصص', portionsLabel: 'الحصص', ingredients: 'المكوّنات', steps: 'الخطوات', swaps: 'نصائح صحية',
    why: 'سبب هذا التقييم', close: 'إغلاق', disclaimer: 'إرشاد غذائي، وليس تشخيصاً طبياً.',
    share: 'مشاركة', shareVia: 'عبر Salorie',
    cats: { soup: 'شوربات', main: 'أطباق رئيسية', salad: 'سلطات', bread: 'خبز', pastry: 'معجّنات', dessert: 'حلويات' },
  },
};

type Verdict = 'great' | 'ok' | 'avoid';

export default function HealthyRecipesScreen() {
  const { user } = useUser();
  const espaceBas = useEspaceBasSimple();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const lang: 'fr' | 'ar' | 'en' = language === 'fr' ? 'fr' : language === 'ar' ? 'ar' : 'en';
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';

  const tok = useTokens();
  const bg = tok.bg;
  const card = tok.surface;
  const text = tok.text;
  const sub = tok.textMuted;
  const border = isDark ? 'rgba(255,255,255,0.08)' : '#EEF2F6';
  const accent = isDark ? '#4ade80' : GREEN;
  const chipBg = isDark ? '#1e293b' : '#EAF4EE';
  const align: any = { textAlign: isRTL ? 'right' : 'left' };
  const rowDir: any = isRTL ? 'row-reverse' : 'row';

  const today = new Date().toISOString().slice(0, 10);
  const { goals, consumed, loading: nutriLoading } = useNutritionData(today) as any;

  const [ctx, setCtx] = useState<ObjectiveContext | null>(null);
  const [ctxLoading, setCtxLoading] = useState(true);
  const [category, setCategory] = useState<RecipeCategory | 'all'>('all');
  const [selected, setSelected] = useState<LocalRecipe | null>(null);
  // Mise à l'échelle des portions (affichage local uniquement, rien en base).
  const [portions, setPortions] = useState('1');
  const portionsN = Math.max(1, Math.round(Number(portions) || 1));

  // Ouvre le détail d'une recette en réinitialisant l'échelle à 1 portion.
  const openRecipe = (r: LocalRecipe) => {
    setPortions('1');
    setSelected(r);
  };

  // Partage d'un résumé texte de la recette (nom + kcal + macros + « via Salorie »),
  // mis à l'échelle selon le nombre de portions affiché. 100% côté client.
  const onShare = async () => {
    if (!selected) return;
    try { Haptics.selectionAsync(); } catch {}
    const summary =
      `${selected.name[lang]}\n` +
      `${selected.kcal * portionsN} ${t.kcal} · ` +
      `${t.protein} ${selected.protein * portionsN}g · ` +
      `${t.carbs} ${selected.carbs * portionsN}g · ` +
      `${t.fat} ${selected.fat * portionsN}g\n` +
      `${t.shareVia}`;
    try {
      await Share.share({ title: selected.name[lang], message: summary });
    } catch {
      /* partage annulé ou indisponible — silencieux */
    }
  };

  // Construit le contexte d'objectif (objectif du jour + conditions médicales).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const email = user?.primaryEmailAddress?.emailAddress || '';
        const built = await buildObjectiveContext(email, user?.id, today, { goals, consumed });
        if (alive) setCtx(built);
      } catch {
        /* défauts sûrs : ctx reste null → scoring sur défauts */
      } finally {
        if (alive) setCtxLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [user?.id, user?.primaryEmailAddress?.emailAddress, goals, consumed, today]);

  // Contexte robuste pour le scoring (défauts sûrs si non chargé).
  const safeCtx: ObjectiveContext = useMemo(
    () =>
      ctx || {
        goal: 'maintain', tdee: 0, dailyKcalTarget: 0, remainingKcal: 0,
        macroTargets: { protein: 0, carbs: 0, fat: 0 },
        remainingMacros: { protein: 0, carbs: 0, fat: 0 },
        diet: [], allergies: [], dislikes: [], conditions: [],
      },
    [ctx],
  );

  // Recettes triées par fit, filtrées par catégorie.
  const scored: ScoredRecipe[] = useMemo(
    () => recommendForMe(safeCtx, category === 'all' ? undefined : { category }),
    [safeCtx, category],
  );

  // « Recommandé pour toi » : la liste est déjà triée du meilleur au moins bon
  // (recommendForMe → verdict great→ok→avoid puis fit décroissant). On met en
  // avant les 1-2 premières recettes, à condition qu'elles soient vraiment un
  // bon choix (verdict 'great' et non bloquées) — jamais un item « à modérer ».
  const recommendedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const s of scored) {
      if (ids.size >= 2) break;
      if (s.score.verdict === 'great' && !s.score.blocked) ids.add(s.recipe.id);
    }
    return ids;
  }, [scored]);

  const categories = useMemo(() => listCategories(), []);
  const loading = ctxLoading || nutriLoading;

  const verdictMeta = (v: Verdict) => {
    if (v === 'great') return { label: t.great, color: '#16a34a', Icon: CheckCircle2, bg: isDark ? 'rgba(22,163,74,0.16)' : '#DCFCE7' };
    if (v === 'ok') return { label: t.ok, color: '#d97706', Icon: MinusCircle, bg: isDark ? 'rgba(217,119,6,0.16)' : '#FEF3C7' };
    return { label: t.avoid, color: '#dc2626', Icon: AlertTriangle, bg: isDark ? 'rgba(220,38,38,0.16)' : '#FEE2E2' };
  };

  const selectedScore = selected ? scoreRecipe(selected, safeCtx) : null;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: espaceBas }]} showsVerticalScrollIndicator={false}>
        <View style={[styles.head, { flexDirection: rowDir }]}>
          <Utensils size={26} color={accent} />
          <Text style={[styles.title, { color: text }, align]}>{t.title}</Text>
        </View>
        <Text style={[styles.sub, { color: sub }, align]}>{t.sub}</Text>

        {/* Filtres catégorie */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.filterRow, { paddingBottom: espaceBas }]}
          style={{ marginTop: 8 }}
        >
          {(['all', ...categories] as (RecipeCategory | 'all')[]).map((c) => {
            const activeCat = category === c;
            const label = c === 'all' ? t.all : (t.cats[c] || c);
            return (
              <TouchableOpacity
                key={c}
                onPress={() => setCategory(c)}
                style={[
                  styles.filterChip,
                  { backgroundColor: activeCat ? accent : chipBg, borderColor: border },
                ]}
                activeOpacity={0.85}
              >
                <Text style={[styles.filterTxt, { color: activeCat ? '#fff' : (isDark ? '#cbd5e1' : GREEN) }]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {loading ? (
          <View style={styles.skeletonWrap}>
            {[0, 1, 2, 3].map((i) => (
              <SkeletonCard key={i} height={110} />
            ))}
          </View>
        ) : (
          <View style={styles.grid}>
            {scored.map(({ recipe, score }) => {
              const vm = verdictMeta(score.verdict);
              const isRecommended = recommendedIds.has(recipe.id);
              return (
                <TouchableOpacity
                  key={recipe.id}
                  style={[
                    styles.tile,
                    { backgroundColor: card, borderColor: isRecommended ? accent : border },
                    isRecommended && { borderWidth: 1.5 },
                  ]}
                  activeOpacity={0.85}
                  onPress={() => openRecipe(recipe)}
                >
                  {isRecommended && (
                    <View
                      style={[styles.recoBadge, { backgroundColor: accent, flexDirection: rowDir }]}
                      accessible
                      accessibilityLabel={t.recommended}
                    >
                      <CheckCircle2 size={12} color="#fff" />
                      <Text style={[styles.recoTxt]} numberOfLines={1}>{t.recommended}</Text>
                    </View>
                  )}
                  <View
                    style={[styles.badge, { backgroundColor: vm.bg, flexDirection: rowDir }]}
                    accessible
                    accessibilityLabel={vm.label}
                  >
                    <vm.Icon size={13} color={vm.color} />
                    <Text style={[styles.badgeTxt, { color: vm.color }]} numberOfLines={1}>{vm.label}</Text>
                  </View>
                  <Text
                    style={[styles.tileName, { color: text }, align]}
                    numberOfLines={2}
                    accessibilityRole="header"
                  >
                    {recipe.name[lang]}
                  </Text>
                  <View style={[styles.macroRow, { flexDirection: rowDir }]}>
                    <Text style={[styles.kcal, { color: accent }]}>{recipe.kcal} {t.kcal}</Text>
                    <Text style={[styles.macroMini, { color: sub }]}>
                      P{recipe.protein} · G{recipe.carbs} · L{recipe.fat}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* DÉTAIL recette */}
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={[styles.modalBackdrop, directionAuto()]}>
          <View style={[styles.sheet, { backgroundColor: bg }]}>
            {selected && selectedScore && (() => {
              const vm = verdictMeta(selectedScore.verdict);
              return (
                <>
                  <View style={[styles.sheetHead, { flexDirection: rowDir }]}>
                    <Text style={[styles.sheetTitle, { color: text }, align]} numberOfLines={2}>
                      {selected.name[lang]}
                    </Text>
                    <View style={[styles.headActions, { flexDirection: rowDir }]}>
                      <TouchableOpacity
                        onPress={onShare}
                        style={[styles.closeBtn, { backgroundColor: card, borderColor: border }]}
                        accessibilityRole="button"
                        accessibilityLabel={t.share}
                        activeOpacity={0.85}
                      >
                        <Share2 size={19} color={accent} />
                      </TouchableOpacity>
                      <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('fermer')} onPress={() => setSelected(null)} style={[styles.closeBtn, { backgroundColor: card, borderColor: border }]}>
                        <X size={20} color={sub} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
                    {/* Verdict + raisons */}
                    <View style={[styles.verdictCard, { backgroundColor: vm.bg }]}>
                      <View style={[styles.verdictHead, { flexDirection: rowDir }]}>
                        <vm.Icon size={20} color={vm.color} />
                        <Text style={[styles.verdictLabel, { color: vm.color }]}>{vm.label}</Text>
                        <Text style={[styles.fitTxt, { color: vm.color }]}>· {selectedScore.fit}/100</Text>
                      </View>
                      {selectedScore.reasons.map((r, i) => (
                        <View key={i} style={[styles.reasonRow, { flexDirection: rowDir }]}>
                          <Info size={13} color={vm.color} style={{ marginTop: 2 }} />
                          <Text style={[styles.reasonTxt, { color: vm.color }, align]}>{r}</Text>
                        </View>
                      ))}
                    </View>

                    {/* Macros (mises à l'échelle selon le nombre de portions) */}
                    <View style={[styles.macroCard, { backgroundColor: card, borderColor: border }]}>
                      {[
                        { k: t.kcal, v: `${selected.kcal * portionsN}` },
                        { k: t.protein, v: `${selected.protein * portionsN}g` },
                        { k: t.carbs, v: `${selected.carbs * portionsN}g` },
                        { k: t.fat, v: `${selected.fat * portionsN}g` },
                      ].map((m) => (
                        <View key={m.k} style={styles.macroCell}>
                          <Text style={[styles.macroVal, { color: text }]}>{m.v}</Text>
                          <Text style={[styles.macroKey, { color: sub }]}>{m.k}</Text>
                        </View>
                      ))}
                    </View>
                    <Text style={[styles.servingsTxt, { color: sub }, align]}>
                      {selected.servings} {t.servings}
                    </Text>

                    {/* Portions — ajustement d'affichage local (rien en base) */}
                    <View style={styles.portionsWrap}>
                      <Stepper
                        label={t.portionsLabel}
                        value={portions}
                        onChange={setPortions}
                        min={1}
                        max={99}
                      />
                    </View>

                    {/* Ingrédients */}
                    <Text style={[styles.secTitle, { color: text }, align]}>{t.ingredients}</Text>
                    {selected.ingredients.map((ing, i) => (
                      <Text key={i} style={[styles.listItem, { color: sub }, align]}>• {ing[lang]}</Text>
                    ))}

                    {/* Étapes */}
                    <Text style={[styles.secTitle, { color: text }, align]}>{t.steps}</Text>
                    {selected.steps.map((st, i) => (
                      <View key={i} style={[styles.stepRow, { flexDirection: rowDir }]}>
                        <View style={[styles.stepNum, { backgroundColor: chipBg }]}>
                          <Text style={[styles.stepNumTxt, { color: accent }]}>{i + 1}</Text>
                        </View>
                        <Text style={[styles.stepTxt, { color: sub }, align]}>{st[lang]}</Text>
                      </View>
                    ))}

                    {/* Astuces santé */}
                    <Text style={[styles.secTitle, { color: text }, align]}>{t.swaps}</Text>
                    {selected.healthySwaps.map((sw, i) => (
                      <View key={i} style={[styles.swapRow, { flexDirection: rowDir, backgroundColor: isDark ? 'rgba(74,222,128,0.1)' : '#EAF4EE' }]}>
                        <CheckCircle2 size={15} color={accent} style={{ marginTop: 1 }} />
                        <Text style={[styles.swapTxt, { color: isDark ? '#cbd5e1' : '#166534' }, align]}>{sw[lang]}</Text>
                      </View>
                    ))}

                    <Text style={[styles.disclaimer, { color: sub }, align]}>{t.disclaimer}</Text>
                  </ScrollView>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { padding: 18, paddingBottom: 110 },
  head: { alignItems: 'center', gap: 10, marginTop: 4 },
  title: { fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  sub: { fontSize: 13.5, marginTop: 6 },
  filterRow: { gap: 8, paddingVertical: 4, paddingHorizontal: 2 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  filterTxt: { fontSize: 13, fontWeight: '800' },
  loadingWrap: { alignItems: 'center', gap: 10, paddingVertical: 50 },
  loadingTxt: { fontSize: 13, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 12 },
  skeletonWrap: { marginTop: 12 },
  tile: { width: '47%', borderRadius: 20, borderWidth: 1, padding: 14, marginBottom: 12, gap: 8 },
  badge: { alignSelf: 'flex-start', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  badgeTxt: { fontSize: 10.5, fontWeight: '900' },
  recoBadge: { alignSelf: 'flex-start', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  recoTxt: { fontSize: 10, fontWeight: '900', color: '#fff' },
  tileName: { fontSize: 14.5, fontWeight: '800', lineHeight: 19 },
  macroRow: { alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 },
  kcal: { fontSize: 13, fontWeight: '900' },
  macroMini: { fontSize: 10.5, fontWeight: '700' },
  // Modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '90%', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingTop: 16 },
  sheetHead: { alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 },
  sheetTitle: { flex: 1, fontSize: 20, fontWeight: '900', letterSpacing: -0.5 },
  headActions: { alignItems: 'center', gap: 8 },
  closeBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  verdictCard: { borderRadius: 16, padding: 14, gap: 8, marginBottom: 14 },
  verdictHead: { alignItems: 'center', gap: 8 },
  verdictLabel: { fontSize: 16, fontWeight: '900' },
  fitTxt: { fontSize: 14, fontWeight: '800' },
  reasonRow: { gap: 8, alignItems: 'flex-start' },
  reasonTxt: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  macroCard: { flexDirection: 'row', borderRadius: 16, borderWidth: 1, paddingVertical: 14, justifyContent: 'space-around' },
  macroCell: { alignItems: 'center', gap: 3 },
  macroVal: { fontSize: 17, fontWeight: '900' },
  macroKey: { fontSize: 11, fontWeight: '700' },
  servingsTxt: { fontSize: 12.5, fontWeight: '600', marginTop: 8 },
  portionsWrap: { marginTop: 14 },
  secTitle: { fontSize: 15, fontWeight: '900', marginTop: 20, marginBottom: 10 },
  listItem: { fontSize: 14, fontWeight: '500', lineHeight: 22 },
  stepRow: { gap: 10, alignItems: 'flex-start', marginBottom: 10 },
  stepNum: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stepNumTxt: { fontSize: 12, fontWeight: '900' },
  stepTxt: { flex: 1, fontSize: 14, fontWeight: '500', lineHeight: 20 },
  swapRow: { gap: 8, alignItems: 'flex-start', padding: 12, borderRadius: 12, marginBottom: 8 },
  swapTxt: { flex: 1, fontSize: 13.5, fontWeight: '600', lineHeight: 19 },
  disclaimer: { fontSize: 11.5, fontStyle: 'italic', marginTop: 20 },
});
