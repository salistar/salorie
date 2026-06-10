// Templates de repas — enregistre tes repas habituels, re-logge en 1 tap.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { BookmarkPlus, Plus, Check } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { logEntry, getEntries, todayStr } from '../../lib/tracking';
import { addNutritionLog } from '../../lib/firebase';

const GREEN = '#2E8B57';
const F = [{ k: 'calories', l: 'Calories', u: 'kcal' }, { k: 'protein', l: 'Prot.', u: 'g' }, { k: 'carbs', l: 'Gluc.', u: 'g' }, { k: 'fat', l: 'Lip.', u: 'g' }];

export default function MealTemplatesScreen() {
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress || '';
  const [name, setName] = useState('');
  const [vals, setVals] = useState<Record<string, string>>({});
  const [tpls, setTpls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => { setTpls(await getEntries(email, 'meal_templates', 30)); setLoading(false); };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const data: any = { name: name.trim() };
    for (const f of F) data[f.k] = parseFloat(vals[f.k]) || 0;
    await logEntry(email, 'meal_templates', data);
    setName(''); setVals({}); await load(); setBusy(false);
  };

  const quickLog = async (t: any) => {
    try {
      await addNutritionLog({ userId: email, type: 'meal', name: t.name, calories: t.calories || 0, protein: t.protein || 0, carbs: t.carbs || 0, fat: t.fat || 0, date: todayStr() } as any);
      Alert.alert('Loggé ✅', `${t.name} ajouté à aujourd'hui.`);
    } catch { Alert.alert('Erreur', 'Log impossible.'); }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.head}><BookmarkPlus size={24} color={GREEN} /><Text style={styles.title}>Mes repas types</Text></View>
        <Text style={styles.sub}>Enregistre un repas habituel, re-logge-le en 1 tap.</Text>

        <View style={styles.form}>
          <TextInput style={styles.nameInput} placeholder="Nom (ex. Petit-déj habituel)" value={name} onChangeText={setName} />
          <View style={styles.macroRow}>
            {F.map((f) => (
              <View key={f.k} style={styles.macroCell}>
                <TextInput style={styles.macroInput} keyboardType="numeric" placeholder="0" value={vals[f.k] || ''} onChangeText={(t) => setVals((v) => ({ ...v, [f.k]: t }))} />
                <Text style={styles.macroLbl}>{f.l}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={create} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <><Plus size={18} color="#fff" /><Text style={styles.addTxt}>Créer le template</Text></>}
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>Mes templates</Text>
        {loading ? <ActivityIndicator color={GREEN} /> : tpls.length === 0 ? <Text style={styles.empty}>Aucun template. Crées-en un ci-dessus.</Text> : tpls.map((t) => (
          <TouchableOpacity key={t.id} style={styles.tpl} onPress={() => quickLog(t)} activeOpacity={0.85}>
            <View style={{ flex: 1 }}>
              <Text style={styles.tplName}>{t.name}</Text>
              <Text style={styles.tplMacro}>{Math.round(t.calories || 0)} kcal · {Math.round(t.protein || 0)}P/{Math.round(t.carbs || 0)}G/{Math.round(t.fat || 0)}L</Text>
            </View>
            <View style={styles.logChip}><Check size={16} color="#fff" /><Text style={styles.logChipTxt}>Logger</Text></View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F7F9' },
  body: { padding: 20, paddingBottom: 100 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  title: { fontSize: 24, fontWeight: '900', color: '#0F172A', letterSpacing: -0.5 },
  sub: { fontSize: 14, color: '#64748B', marginBottom: 18 },
  form: { backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 22 },
  nameInput: { fontSize: 16, fontWeight: '700', color: '#0F172A', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#EEF2F7', marginBottom: 12 },
  macroRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  macroCell: { flex: 1, alignItems: 'center' },
  macroInput: { fontSize: 18, fontWeight: '800', color: '#0F172A', textAlign: 'center', width: '100%' },
  macroLbl: { fontSize: 11, color: '#94A3B8', fontWeight: '700', marginTop: 2 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: GREEN, borderRadius: 14, paddingVertical: 13 },
  addTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  label: { fontSize: 13, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  empty: { color: '#94A3B8', fontSize: 14 },
  tpl: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 10 },
  tplName: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  tplMacro: { fontSize: 13, color: '#64748B', marginTop: 3 },
  logChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: GREEN, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12 },
  logChipTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
