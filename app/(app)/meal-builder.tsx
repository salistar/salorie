// Meal-builder / recettes — compose un repas en cherchant des ingrédients
// (searchFood / OpenFoodFacts) → total des macros en direct. Réutilise la recherche existante.
import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, SafeAreaView, ActivityIndicator, FlatList } from 'react-native';
import { Search, Plus, Minus, Trash2, ChefHat } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { searchFood } from '../../lib/fatsecret';

const GREEN = '#2E8B57';

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
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Item[]>([]);

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

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenTopBar showBack showBrand showNotif={false} />
      <View style={styles.head}><ChefHat size={22} color={GREEN} /><Text style={styles.title}>Composer un repas</Text></View>

      <View style={styles.searchRow}>
        <Search size={18} color="#94A3B8" />
        <TextInput style={styles.search} placeholder="Rechercher un ingrédient…" value={q} onChangeText={doSearch} />
        {loading && <ActivityIndicator color={GREEN} />}
      </View>

      {results.length > 0 && (
        <View style={styles.resultsBox}>
          <FlatList data={results.slice(0, 8)} keyExtractor={(r) => String(r.food_id)} keyboardShouldPersistTaps="handled"
            renderItem={({ item: r }) => {
              const m = parseDescription(r.food_description);
              return (
                <TouchableOpacity style={styles.resRow} onPress={() => add(r)}>
                  <Text style={styles.resName} numberOfLines={1}>{r.food_name}</Text>
                  <Text style={styles.resMacro}>{m.calories} kcal</Text>
                  <Plus size={18} color={GREEN} />
                </TouchableOpacity>
              );
            }} />
        </View>
      )}

      <ScrollView contentContainerStyle={styles.body}>
        {items.length === 0 && results.length === 0 && (
          <Text style={styles.empty}>Cherche des ingrédients pour composer ta recette. Le total des macros se calcule en direct.</Text>
        )}
        {items.map((x) => (
          <View key={x.id} style={styles.item}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName} numberOfLines={1}>{x.name}</Text>
              <Text style={styles.itemMacro}>{Math.round(x.calories * x.qty)} kcal · {Math.round(x.protein * x.qty)}g P · {Math.round(x.carbs * x.qty)}g G · {Math.round(x.fat * x.qty)}g L</Text>
            </View>
            <TouchableOpacity onPress={() => setQty(x.id, -1)} style={styles.qtyBtn}><Minus size={16} color="#475569" /></TouchableOpacity>
            <Text style={styles.qty}>{x.qty}</Text>
            <TouchableOpacity onPress={() => setQty(x.id, 1)} style={styles.qtyBtn}><Plus size={16} color="#475569" /></TouchableOpacity>
            <TouchableOpacity onPress={() => remove(x.id)} style={{ marginLeft: 8 }}><Trash2 size={18} color="#E11D48" /></TouchableOpacity>
          </View>
        ))}
      </ScrollView>

      {items.length > 0 && (
        <View style={styles.totalBar}>
          <Text style={styles.totalKcal}>{Math.round(total.calories)} kcal</Text>
          <Text style={styles.totalMacro}>{Math.round(total.protein)}g P · {Math.round(total.carbs)}g G · {Math.round(total.fat)}g L</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 8 },
  title: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 4, borderWidth: 1, borderColor: '#EEF2F6' },
  search: { flex: 1, paddingVertical: 11, fontSize: 14 },
  resultsBox: { maxHeight: 260, backgroundColor: '#fff', marginHorizontal: 16, marginTop: 6, borderRadius: 14, borderWidth: 1, borderColor: '#EEF2F6' },
  resRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: '#F5F7FA' },
  resName: { flex: 1, fontSize: 14, color: '#1F2937' },
  resMacro: { fontSize: 12, color: '#64748B' },
  body: { padding: 16, gap: 10 },
  empty: { fontSize: 14, color: '#94A3B8', textAlign: 'center', marginTop: 30, lineHeight: 20 },
  item: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 12, gap: 8 },
  itemName: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  itemMacro: { fontSize: 11, color: '#64748B', marginTop: 2 },
  qtyBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  qty: { fontSize: 14, fontWeight: '700', color: '#0F172A', minWidth: 18, textAlign: 'center' },
  totalBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: GREEN, padding: 18, paddingBottom: 28 },
  totalKcal: { fontSize: 22, fontWeight: '900', color: '#fff' },
  totalMacro: { fontSize: 14, color: '#E7F5EC', fontWeight: '600' },
});
