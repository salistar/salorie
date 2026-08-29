// Meal-builder / recettes — compose un repas en cherchant des ingrédients
// (searchFood / OpenFoodFacts) → total des macros en direct. Réutilise la recherche existante.
import React, { useState } from 'react';
import { a11y } from '../../lib/a11y';
import { useTokens } from '../../constants/tokens';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  FlatList,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search, Plus, Minus, Trash2, ChefHat, Check } from 'lucide-react-native';
import { useUser } from '@clerk/clerk-expo';
import { router } from 'expo-router';
import ScreenTopBar from '../../components/ScreenTopBar';
import { Input, EmptyState } from '../../components/ui';
import { searchFood } from '../../lib/fatsecret';
import { addNutritionLog } from '../../lib/firebase';
import { todayStr } from '../../lib/tracking';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { rowDir, txtAlign } from '../../lib/rtl';
import { useScreenGate } from '../../components/FeatureGate';

const GREEN = '#2E8B57';

const TXT: any = {
  en: { title: 'Build a meal', searchPh: 'Search for an ingredient…', empty: 'Search for ingredients to build your recipe. Macro totals update live.', p: 'P', c: 'C', f: 'F', logMeal: 'Log this meal', composed: 'Composed meal', logged: 'Logged ✅', loggedMsg: 'Meal added to today.', errTitle: 'Error', errMsg: 'Could not log the meal.' },
  fr: { title: 'Composer un repas', searchPh: 'Rechercher un ingrédient…', empty: 'Cherche des ingrédients pour composer ta recette. Le total des macros se calcule en direct.', p: 'P', c: 'G', f: 'L', logMeal: 'Logger ce repas', composed: 'Repas composé', logged: 'Loggé ✅', loggedMsg: "Repas ajouté à aujourd'hui.", errTitle: 'Erreur', errMsg: 'Impossible de logger le repas.' },
  ar: { title: 'تكوين وجبة', searchPh: 'ابحث عن مكوّن…', empty: 'ابحث عن مكونات لتكوين وصفتك. يُحسب مجموع العناصر الكبرى مباشرة.', p: 'ب', c: 'ك', f: 'د', logMeal: 'سجّل هذه الوجبة', composed: 'وجبة مكوّنة', logged: 'تم التسجيل ✅', loggedMsg: 'أُضيفت الوجبة إلى اليوم.', errTitle: 'خطأ', errMsg: 'تعذّر تسجيل الوجبة.' },
};

function parseDescription(desc: string) {
  const parts = (desc || '').split(' - ');
  const serving = parts[0] || '100g';
  const seg = parts[1]?.split(' | ') || [];
  const cals = parseInt((seg[0] || '0kcal').replace('Calories: ', '').replace('kcal', '')) || 0;
  const get = (k: string) => parseFloat((seg.find((p) => p.startsWith(k)) || '0g').replace(k, '').replace('g', '')) || 0;
  return { serving, calories: cals, protein: get('Protein: '), carbs: get('Carbs: '), fat: get('Fat: ') };
}

type Item = { id: string; name: string; qty: number; calories: number; protein: number; carbs: number; fat: number };

export default function MealBuilderScreen() {
  const k = useTokens();
  const __gate = useScreenGate('meal-builder');
  const { resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';
  const tok = useTokens();
  const bg = tok.bg;
  const card = tok.surface;
  const text = tok.text;
  const sub = tok.textMuted;
  const accent = isDark ? '#4ade80' : GREEN;
  const align: any = { textAlign: txtAlign(isRTL) };
  const row: any = { flexDirection: rowDir(isRTL) };

  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress || '';
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);

  const doSearch = async (text: string) => {
    setQ(text);
    if (text.trim().length < 3) { setResults([]); return; }
    setLoading(true);
    try { setResults(await searchFood(text)); } catch { setResults([]); }
    finally { setLoading(false); }
  };

  const add = (r: any) => {
    const m = parseDescription(r.food_description);
    setItems((it) => [...it, { id: `${r.food_id}-${it.length}`, name: r.food_name, qty: 1, ...m }]);
    setResults([]); setQ('');
  };
  const setQty = (id: string, d: number) => setItems((it) => it.map((x) => x.id === id ? { ...x, qty: Math.max(1, x.qty + d) } : x));
  const remove = (id: string) => setItems((it) => it.filter((x) => x.id !== id));

  const total = items.reduce((a, x) => ({
    calories: a.calories + x.calories * x.qty, protein: a.protein + x.protein * x.qty,
    carbs: a.carbs + x.carbs * x.qty, fat: a.fat + x.fat * x.qty,
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  // Retravaillé : on peut LOGGER le repas composé dans le journal du jour.
  const logMeal = async () => {
    if (!items.length || !email) return;
    setBusy(true);
    try {
      await addNutritionLog({
        userId: email, type: 'meal', name: t.composed,
        calories: Math.round(total.calories), protein: Math.round(total.protein),
        carbs: Math.round(total.carbs), fat: Math.round(total.fat), date: todayStr(),
      } as any);
      Alert.alert(t.logged, t.loggedMsg);
      setItems([]);
    } catch { Alert.alert(t.errTitle, t.errMsg); }
    finally { setBusy(false); }
  };

  if (!__gate.ok) return __gate.node;

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showBrand showNotif={false} />
      <View style={[styles.head, row]}><ChefHat size={22} color={accent} /><Text style={[styles.title, { color: text }, align]}>{t.title}</Text></View>

      <Input
        containerStyle={{ marginHorizontal: 16, marginBottom: 0 }}
        icon={<Search size={18} color={sub} />}
        right={loading ? <ActivityIndicator color={accent} /> : undefined}
        placeholder={t.searchPh}
        value={q}
        onChangeText={doSearch}
      />

      {results.length > 0 && (
        <View style={[styles.resultsBox, { backgroundColor: card }, isDark && { borderColor: '#334155' }]}>
          <FlatList data={results.slice(0, 8)} keyExtractor={(r) => String(r.food_id)} keyboardShouldPersistTaps="handled"
            renderItem={({ item: r }) => {
              const m = parseDescription(r.food_description);
              return (
                <TouchableOpacity style={[styles.resRow, row, isDark && { borderBottomColor: '#334155' }]} onPress={() => add(r)}>
                  <Text style={[styles.resName, { color: isDark ? '#e2e8f0' : '#1F2937' }, align]} numberOfLines={1}>{r.food_name}</Text>
                  <Text style={[styles.resMacro, { color: sub }, align]}>{m.calories} kcal</Text>
                  <Plus size={18} color={accent} />
                </TouchableOpacity>
              );
            }} />
        </View>
      )}

      <ScrollView contentContainerStyle={styles.body}>
        {items.length === 0 && results.length === 0 && (
          <View style={styles.emptyWrap}>
            <EmptyState icon={<ChefHat size={26} color={accent} />} title={t.title} subtitle={t.empty} />
          </View>
        )}
        {items.map((x) => (
          <View key={x.id} style={[styles.item, row, { backgroundColor: card }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemName, { color: text }, align]} numberOfLines={1}>{x.name}</Text>
              <Text style={[styles.itemMacro, { color: sub }, align]}>{Math.round(x.calories * x.qty)} kcal · {Math.round(x.protein * x.qty)}g {t.p} · {Math.round(x.carbs * x.qty)}g {t.c} · {Math.round(x.fat * x.qty)}g {t.f}</Text>
            </View>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('retirer')} onPress={() => setQty(x.id, -1)} style={[styles.qtyBtn, isDark && { backgroundColor: '#334155' }]}><Minus size={16} color={isDark ? '#cbd5e1' : '#475569'} /></TouchableOpacity>
            <Text style={[styles.qty, { color: text }]}>{x.qty}</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('ajouter')} onPress={() => setQty(x.id, 1)} style={[styles.qtyBtn, isDark && { backgroundColor: '#334155' }]}><Plus size={16} color={isDark ? '#cbd5e1' : '#475569'} /></TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('supprimer')} onPress={() => remove(x.id)} style={{ marginHorizontal: 8 }}><Trash2 size={18} color="#E11D48" /></TouchableOpacity>
          </View>
        ))}
      </ScrollView>

      {items.length > 0 && (
        <View style={[styles.totalBar, row]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.totalKcal, align]}>{Math.round(total.calories)} kcal</Text>
            <Text style={[styles.totalMacro, align]}>{Math.round(total.protein)}g {t.p} · {Math.round(total.carbs)}g {t.c} · {Math.round(total.fat)}g {t.f}</Text>
          </View>
          <TouchableOpacity style={[styles.logBtn, row]} onPress={logMeal} disabled={busy} activeOpacity={0.85}>
            {busy ? <ActivityIndicator color={GREEN} /> : (<><Check size={18} color={GREEN} /><Text style={styles.logBtnTxt}>{t.logMeal}</Text></>)}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 8 },
  title: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  resultsBox: { maxHeight: 260, backgroundColor: '#fff', marginHorizontal: 16, marginTop: 6, borderRadius: 14, borderWidth: 1, borderColor: '#EEF2F6' },
  resRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: '#F5F7FA' },
  resName: { flex: 1, fontSize: 14, color: '#1F2937' },
  resMacro: { fontSize: 12, color: '#64748B' },
  body: { padding: 16, gap: 10 },
  emptyWrap: { marginTop: 30, alignItems: 'stretch', justifyContent: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 12, gap: 8 },
  itemName: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  itemMacro: { fontSize: 11, color: '#64748B', marginTop: 2 },
  qtyBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  qty: { fontSize: 14, fontWeight: '700', color: '#0F172A', minWidth: 18, textAlign: 'center' },
  totalBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: GREEN, padding: 18, paddingBottom: 28, gap: 12 },
  totalKcal: { fontSize: 22, fontWeight: '900', color: '#fff' },
  totalMacro: { fontSize: 14, color: '#E7F5EC', fontWeight: '600' },
  logBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16 },
  logBtnTxt: { color: GREEN, fontWeight: '800', fontSize: 14 },
});
