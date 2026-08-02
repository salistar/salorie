// Liste de courses — ajoute, coche, persiste (local).
import React, { useEffect, useState } from 'react';
import { Image, View, Text, StyleSheet, SafeAreaView, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ShoppingCart, Plus, Check, Trash2 } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { EmptyState } from '../../components/ui';
import { useTranslation } from '../../lib/i18n';
import { useTheme } from '../../lib/ThemeContext';
import { useScreenGate } from '../../components/FeatureGate';

const GREEN = '#2E8B57';
const KEY = 'shopping_list_v1';
type Item = { id: string; name: string; done: boolean };

const TXT: any = {
  en: { title: 'Shopping list', to_buy: 'item(s) to buy', add_what: 'Add what you need.', placeholder: 'Add an item…', empty: 'Empty list.', clear: 'Remove checked items' },
  fr: { title: 'Liste de courses', to_buy: 'article(s) à acheter', add_what: "Ajoute ce qu'il te faut.", placeholder: 'Ajouter un article…', empty: 'Liste vide.', clear: 'Retirer les articles cochés' },
  ar: { title: 'قائمة المشتريات', to_buy: 'عنصر/عناصر للشراء', add_what: 'أضف ما تحتاجه.', placeholder: 'أضف عنصراً…', empty: 'القائمة فارغة.', clear: 'إزالة العناصر المحددة' },
};

export default function ShoppingListScreen() {
  const __gate = useScreenGate('shopping-list');
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  // Accent thémé : GREEN est le vert CLAIR ; en sombre on utilise le token
  // dark officiel (contraste correct sur fond sombre).
  const accent = isDark ? '#4ade80' : GREEN;
  const bg = isDark ? '#0f1419' : '#F4F7F9';
  const card = isDark ? '#1e293b' : '#ffffff';
  const textCol = isDark ? '#f1f5f9' : '#0F172A';
  const sub = isDark ? '#94a3b8' : '#64748B';
  const align: any = { textAlign: isRTL ? 'right' : 'left' };

  const [items, setItems] = useState<Item[]>([]);
  const [text, setText] = useState('');

  useEffect(() => { (async () => { try { const r = await AsyncStorage.getItem(KEY); if (r) setItems(JSON.parse(r)); } catch {} })(); }, []);
  const persist = (next: Item[]) => { setItems(next); AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {}); };

  const add = () => { const t2 = text.trim(); if (!t2) return; persist([{ id: String(Date.now()), name: t2, done: false }, ...items]); setText(''); };
  const toggle = (id: string) => persist(items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
  const remove = (id: string) => persist(items.filter((i) => i.id !== id));
  const clearDone = () => persist(items.filter((i) => !i.done));

  const left = items.filter((i) => !i.done).length;

  if (!__gate.ok) return __gate.node;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Image source={require('../../assets/images/photos/veggies_0.jpg')} style={{ width: '100%', height: 110, borderRadius: 18, marginBottom: 14 }} resizeMode="cover" />
        <View style={styles.head}><ShoppingCart size={24} color={accent} /><Text style={[styles.title, { color: textCol }]}>{t.title}</Text></View>
        <Text style={[styles.sub, { color: sub }, align]}>{items.length ? `${left} ${t.to_buy}` : t.add_what}</Text>

        <View style={styles.addRow}>
          <TextInput style={[styles.input, { backgroundColor: card, color: textCol, borderColor: isDark ? '#283241' : '#E2E8F0' }, align]} placeholder={t.placeholder} placeholderTextColor={isDark ? '#64748b' : '#94A3B8'} value={text} onChangeText={setText} onSubmitEditing={add} returnKeyType="done" />
          <TouchableOpacity style={styles.addBtn} onPress={add}><Plus size={22} color="#fff" /></TouchableOpacity>
        </View>

        {items.length === 0 ? (
          <EmptyState icon={<ShoppingCart size={26} color={accent} />} title={t.title} subtitle={t.empty} ctaLabel={t.add_what} />
        ) : items.map((i) => (
          <View key={i.id} style={[styles.item, { backgroundColor: card }]}>
            <TouchableOpacity style={[styles.check, i.done && styles.checkDone]} onPress={() => toggle(i.id)}>
              {i.done && <Check size={16} color="#fff" />}
            </TouchableOpacity>
            <Text style={[styles.itemName, { color: textCol }, i.done && styles.itemDone]}>{i.name}</Text>
            <TouchableOpacity onPress={() => remove(i.id)} hitSlop={8}><Trash2 size={18} color={isDark ? '#475569' : '#CBD5E1'} /></TouchableOpacity>
          </View>
        ))}

        {items.some((i) => i.done) && <TouchableOpacity style={styles.clearBtn} onPress={clearDone}><Text style={styles.clearTxt}>{t.clear}</Text></TouchableOpacity>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F7F9' },
  body: { padding: 20, paddingBottom: 100 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  title: { fontSize: 26, fontWeight: '900', color: '#0F172A', letterSpacing: -0.5 },
  sub: { fontSize: 14, color: '#64748B', marginBottom: 18 },
  addRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  input: { flex: 1, backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: '#0F172A', borderWidth: 1.5, borderColor: '#E2E8F0' },
  addBtn: { width: 52, height: 52, borderRadius: 14, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 10 },
  check: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
  checkDone: { backgroundColor: GREEN, borderColor: GREEN },
  itemName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#0F172A' },
  itemDone: { textDecorationLine: 'line-through', color: '#94A3B8' },
  clearBtn: { marginTop: 8, alignItems: 'center', paddingVertical: 12 },
  clearTxt: { color: '#E11D48', fontWeight: '700', fontSize: 14 },
});
