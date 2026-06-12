// Templates de repas — enregistre tes repas habituels, re-logge en 1 tap.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { BookmarkPlus, Plus, Check } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { FormCard, FormInput, Stepper } from '../../components/FormKit';
import { logEntry, getEntries, todayStr } from '../../lib/tracking';
import { addNutritionLog } from '../../lib/firebase';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';

const GREEN = '#2E8B57';
const F = [{ k: 'calories', l: 'Calories', u: 'kcal' }, { k: 'protein', l: 'Prot.', u: 'g' }, { k: 'carbs', l: 'Gluc.', u: 'g' }, { k: 'fat', l: 'Lip.', u: 'g' }];

const TXT: any = {
  en: { title: 'My meal templates', sub: 'Save a usual meal, re-log it in 1 tap.', namePh: 'Name (e.g. Usual breakfast)', createBtn: 'Create template', myTemplates: 'My templates', empty: 'No templates yet. Create one above.', logBtn: 'Log', loggedTitle: 'Logged ✅', loggedMsg: 'added to today.', errTitle: 'Error', errMsg: 'Could not log.', p: 'P', c: 'C', f: 'F', fields: { calories: 'Calories', protein: 'Prot.', carbs: 'Carbs', fat: 'Fat' } },
  fr: { title: 'Mes repas types', sub: 'Enregistre un repas habituel, re-logge-le en 1 tap.', namePh: 'Nom (ex. Petit-déj habituel)', createBtn: 'Créer le template', myTemplates: 'Mes templates', empty: 'Aucun template. Crées-en un ci-dessus.', logBtn: 'Logger', loggedTitle: 'Loggé ✅', loggedMsg: "ajouté à aujourd'hui.", errTitle: 'Erreur', errMsg: 'Log impossible.', p: 'P', c: 'G', f: 'L', fields: { calories: 'Calories', protein: 'Prot.', carbs: 'Gluc.', fat: 'Lip.' } },
  ar: { title: 'وجباتي المعتادة', sub: 'احفظ وجبة معتادة وسجّلها مجدداً بلمسة واحدة.', namePh: 'الاسم (مثل فطور معتاد)', createBtn: 'إنشاء قالب', myTemplates: 'قوالبي', empty: 'لا قوالب بعد. أنشئ واحداً أعلاه.', logBtn: 'تسجيل', loggedTitle: 'تم التسجيل ✅', loggedMsg: 'أُضيف إلى اليوم.', errTitle: 'خطأ', errMsg: 'تعذر التسجيل.', p: 'ب', c: 'ك', f: 'د', fields: { calories: 'سعرات', protein: 'بروتين', carbs: 'كربوهيدرات', fat: 'دهون' } },
};

export default function MealTemplatesScreen() {
  const { resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';
  const bg = isDark ? '#0f172a' : '#F4F7F9';
  const card = isDark ? '#1e293b' : '#ffffff';
  const text = isDark ? '#f1f5f9' : '#0F172A';
  const sub = isDark ? '#94a3b8' : '#64748B';
  const align: any = { textAlign: isRTL ? 'right' : 'left' };

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

  const quickLog = async (tpl: any) => {
    try {
      await addNutritionLog({ userId: email, type: 'meal', name: tpl.name, calories: tpl.calories || 0, protein: tpl.protein || 0, carbs: tpl.carbs || 0, fat: tpl.fat || 0, date: todayStr() } as any);
      Alert.alert(t.loggedTitle, `${tpl.name} ${t.loggedMsg}`);
    } catch { Alert.alert(t.errTitle, t.errMsg); }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.head}><BookmarkPlus size={24} color={GREEN} /><Text style={[styles.title, { color: text }]}>{t.title}</Text></View>
        <Text style={[styles.sub, { color: sub }, align]}>{t.sub}</Text>

        <FormCard>
          <FormInput label={t.namePh} placeholder={t.namePh} value={name} onChangeText={setName} />
          {F.map((f) => (
            <Stepper
              key={f.k}
              label={t.fields[f.k] || f.l}
              unit={f.u}
              step={f.k === 'calories' ? 50 : 5}
              value={vals[f.k] || ''}
              onChange={(v2: string) => setVals((v) => ({ ...v, [f.k]: v2 }))}
            />
          ))}
          <TouchableOpacity style={styles.addBtn} onPress={create} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <><Plus size={18} color="#fff" /><Text style={styles.addTxt}>{t.createBtn}</Text></>}
          </TouchableOpacity>
        </FormCard>

        <Text style={[styles.label, { color: sub }]}>{t.myTemplates}</Text>
        {loading ? <ActivityIndicator color={GREEN} /> : tpls.length === 0 ? <Text style={[styles.empty, { color: sub }]}>{t.empty}</Text> : tpls.map((tp) => (
          <TouchableOpacity key={tp.id} style={[styles.tpl, { backgroundColor: card }]} onPress={() => quickLog(tp)} activeOpacity={0.85}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.tplName, { color: text }]}>{tp.name}</Text>
              <Text style={[styles.tplMacro, { color: sub }]}>{Math.round(tp.calories || 0)} kcal · {Math.round(tp.protein || 0)}{t.p}/{Math.round(tp.carbs || 0)}{t.c}/{Math.round(tp.fat || 0)}{t.f}</Text>
            </View>
            <View style={styles.logChip}><Check size={16} color="#fff" /><Text style={styles.logChipTxt}>{t.logBtn}</Text></View>
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
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: GREEN, borderRadius: 14, paddingVertical: 13, marginTop: 4 },
  addTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  label: { fontSize: 13, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  empty: { color: '#94A3B8', fontSize: 14 },
  tpl: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 10 },
  tplName: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  tplMacro: { fontSize: 13, color: '#64748B', marginTop: 3 },
  logChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: GREEN, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12 },
  logChipTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
