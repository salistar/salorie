// DIARY — journal alimentaire chronologique par repas (colonne vertébrale des
// leaders MFP/Yazio) : 4 slots (petit-déj/déjeuner/snack/dîner) avec totaux par
// slot, suppression, « copier hier », navigation par date. Trilingue + dark + RTL.
import React, { useCallback, useEffect, useState } from 'react';
import { flipAuto } from '../../lib/rtl';
import { a11y } from '../../lib/a11y';
import { useTokens } from '../../constants/tokens';
import { numLocaleFor } from '../../lib/format';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { ChevronLeft, ChevronRight, Trash2, CopyPlus, Coffee, Sun, Cookie, Moon, Flame, Plus } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { getNutritionLogs, addNutritionLog, deleteNutritionLog, NutritionLog } from '../../lib/firebase';
import { router } from 'expo-router';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';

const GREEN = '#2E8B57';

const TXT: any = {
  en: { title: 'Food diary', today: 'Today', breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snacks', dinner: 'Dinner', other: 'Water & activity', empty: 'Nothing logged', copy: 'Copy yesterday', copied: 'meals copied!', total: 'Day total', kcal: 'kcal', add: 'Add', delTitle: 'Delete this entry?', cancel: 'Cancel', del: 'Delete' },
  fr: { title: 'Journal alimentaire', today: "Aujourd'hui", breakfast: 'Petit-déj', lunch: 'Déjeuner', snack: 'Snacks', dinner: 'Dîner', other: 'Eau & activité', empty: 'Rien de loggé', copy: 'Copier hier', copied: 'repas copiés !', total: 'Total du jour', kcal: 'kcal', add: 'Ajouter', delTitle: 'Supprimer cette entrée ?', cancel: 'Annuler', del: 'Supprimer' },
  ar: { title: 'يوميات الطعام', today: 'اليوم', breakfast: 'الفطور', lunch: 'الغداء', snack: 'وجبات خفيفة', dinner: 'العشاء', other: 'ماء ونشاط', empty: 'لا شيء مسجل', copy: 'انسخ الأمس', copied: 'وجبات نُسخت!', total: 'مجموع اليوم', kcal: 'سعرة', add: 'أضف', delTitle: 'حذف هذا الإدخال؟', cancel: 'إلغاء', del: 'حذف' },
};

const dstr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const shift = (s: string, days: number) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + days); return dstr(d); };

// Slot d'un log : champ explicite sinon heuristique sur l'heure du timestamp.
function slotOf(l: NutritionLog): string {
  if (l.slot && ['breakfast', 'lunch', 'snack', 'dinner'].includes(l.slot)) return l.slot;
  try {
    const ts: any = l.timestamp;
    const d: Date = ts?.toDate ? ts.toDate() : ts ? new Date(ts) : new Date(l.date + 'T12:00:00');
    const h = d.getHours() + d.getMinutes() / 60;
    if (h < 11) return 'breakfast';
    if (h < 16) return 'lunch';
    if (h < 18.5) return 'snack';
    return 'dinner';
  } catch { return 'lunch'; }
}

export default function Diary() {
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress || '';
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
  const rowDir: any = { flexDirection: isRTL ? 'row-reverse' : 'row' };
  // i18n #90 : formatage localisé des nombres affichés (totaux/macros) — additif,
  // n'altère pas les calculs. Fallback sûr si toLocaleString indisponible.
  const numLocale = numLocaleFor(language);
  const fmt = (n: number) => {
    const v = Number(n) || 0;
    try { return v.toLocaleString(numLocale); } catch { return String(v); }
  };

  const [date, setDate] = useState(dstr(new Date()));
  const [logs, setLogs] = useState<NutritionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!email) { setLoading(false); return; }
    setLoading(true);
    try { setLogs(await getNutritionLogs(email, date)); } finally { setLoading(false); }
  }, [email, date]);
  useEffect(() => { load(); }, [load]);

  const meals = logs.filter((l) => l.type === 'meal');
  const others = logs.filter((l) => l.type !== 'meal');
  const SLOTS = [
    { key: 'breakfast', Icon: Coffee }, { key: 'lunch', Icon: Sun },
    { key: 'snack', Icon: Cookie }, { key: 'dinner', Icon: Moon },
  ];
  const bySlot: Record<string, NutritionLog[]> = { breakfast: [], lunch: [], snack: [], dinner: [] };
  meals.forEach((l) => bySlot[slotOf(l)].push(l));
  const dayKcal = Math.round(meals.reduce((a, l) => a + (Number(l.calories) || 0), 0));
  const dayP = Math.round(meals.reduce((a, l) => a + (Number(l.protein) || 0), 0));
  const dayC = Math.round(meals.reduce((a, l) => a + (Number(l.carbs) || 0), 0));
  const dayF = Math.round(meals.reduce((a, l) => a + (Number(l.fat) || 0), 0));

  const removeLog = (l: NutritionLog) => {
    Alert.alert(t.delTitle, l.name, [
      { text: t.cancel, style: 'cancel' },
      { text: t.del, style: 'destructive', onPress: async () => { if (l.id) { await deleteNutritionLog(email, l.id); load(); } } },
    ]);
  };

  // Copie les repas d'HIER vers la date affichée (en conservant le slot).
  const copyYesterday = async () => {
    if (busy || !email) return;
    setBusy(true);
    try {
      const yest = await getNutritionLogs(email, shift(date, -1));
      const ymeals = yest.filter((l) => l.type === 'meal');
      for (const l of ymeals) {
        await addNutritionLog({
          userId: email, type: 'meal', name: l.name, calories: l.calories,
          protein: l.protein || 0, carbs: l.carbs || 0, fat: l.fat || 0,
          date, serving: l.serving, slot: slotOf(l),
        } as any);
      }
      Alert.alert('✅', `${ymeals.length} ${t.copied}`);
      load();
    } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack />
      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        {/* Navigation par date */}
        <View style={[s.dateRow, rowDir]}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('retour')} style={[s.dateBtn, { backgroundColor: card }]} onPress={() => setDate(shift(date, -1))}>
            <View style={flipAuto()}><ChevronLeft size={20} color={text} /></View>
          </TouchableOpacity>
          <TouchableOpacity style={{ flex: 1, alignItems: 'center' }} onPress={() => setDate(dstr(new Date()))}>
            <Text style={[s.dateTxt, { color: text }]}>{date === dstr(new Date()) ? t.today : date}</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('suivant')} style={[s.dateBtn, { backgroundColor: card }]} onPress={() => setDate(shift(date, 1))}>
            <View style={flipAuto()}><ChevronRight size={20} color={text} /></View>
          </TouchableOpacity>
        </View>

        {/* Total du jour */}
        <View style={[s.totalCard, { backgroundColor: card }, rowDir]}>
          <Flame size={20} color={accent} />
          <Text style={[s.totalTxt, { color: text }]}>{t.total} : <Text style={{ color: accent }}>{fmt(dayKcal)} {t.kcal}</Text></Text>
          <Text style={[s.macroTxt, { color: sub }]}>P{fmt(dayP)} · C{fmt(dayC)} · F{fmt(dayF)}</Text>
        </View>

        {/* Copier hier */}
        <TouchableOpacity style={[s.copyBtn, rowDir]} onPress={copyYesterday} disabled={busy}>
          {busy ? <ActivityIndicator size="small" color={accent} /> : <CopyPlus size={16} color={accent} />}
          <Text style={s.copyTxt}>{t.copy}</Text>
        </TouchableOpacity>

        {loading ? <ActivityIndicator size="large" color={accent} style={{ marginTop: 30 }} /> : (
          <>
            {SLOTS.map(({ key, Icon }) => {
              const items = bySlot[key];
              const slotKcal = Math.round(items.reduce((a, l) => a + (Number(l.calories) || 0), 0));
              return (
                <View key={key} style={[s.slotCard, { backgroundColor: card }]}>
                  <View style={[s.slotHead, rowDir]}>
                    <Icon size={17} color={accent} />
                    <Text style={[s.slotTitle, { color: text }]}>{t[key]}</Text>
                    <View style={{ flex: 1 }} />
                    <Text style={[s.slotKcal, { color: slotKcal ? accent : sub }]}>{fmt(slotKcal)} {t.kcal}</Text>
                    <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('ajouter')} style={s.addBtn} onPress={() => router.push({ pathname: '/food-database', params: { slot: key } } as any)}>
                      <Plus size={15} color="#fff" />
                    </TouchableOpacity>
                  </View>
                  {items.length === 0 ? (
                    <Text style={[{ color: sub, fontSize: 12.5, paddingBottom: 4 }, align]}>{t.empty}</Text>
                  ) : items.map((l) => (
                    <View key={l.id} style={[s.itemRow, rowDir]}>
                      {/* Badge note santé (grade) si présent */}
                      {(l as any).note?.grade ? (
                        <View style={[s.gradeBadge, { backgroundColor: (l as any).note.color || accent }]}>
                          <Text style={s.gradeTxt}>{(l as any).note.grade}</Text>
                        </View>
                      ) : null}
                      <View style={{ flex: 1 }}>
                        <Text style={[{ color: text, fontWeight: '700', fontSize: 13.5 }, align]} numberOfLines={1}>{l.name}</Text>
                        <Text style={[{ color: sub, fontSize: 11.5, marginTop: 1 }, align]}>
                          {fmt(Math.round(l.calories))} {t.kcal}{l.protein ? ` · P${fmt(Math.round(l.protein))}` : ''}{l.carbs ? ` C${fmt(Math.round(l.carbs))}` : ''}{l.fat ? ` F${fmt(Math.round(l.fat))}` : ''}{l.serving ? ` · ${l.serving}` : ''}
                        </Text>
                        {(l as any).description ? (
                          <Text style={[{ color: sub, fontSize: 11, marginTop: 3, lineHeight: 15, opacity: 0.9 }, align]} numberOfLines={3}>{(l as any).description}</Text>
                        ) : null}
                      </View>
                      <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('supprimer')} onPress={() => removeLog(l)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Trash2 size={16} color="#e11d48" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              );
            })}

            {/* Eau & activité du jour */}
            {others.length > 0 && (
              <View style={[s.slotCard, { backgroundColor: card }]}>
                <View style={[s.slotHead, rowDir]}>
                  <Flame size={17} color="#0ea5e9" />
                  <Text style={[s.slotTitle, { color: text }]}>{t.other}</Text>
                </View>
                {others.map((l) => (
                  <View key={l.id} style={[s.itemRow, rowDir]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[{ color: text, fontWeight: '700', fontSize: 13.5 }, align]} numberOfLines={1}>{l.name}</Text>
                      <Text style={[{ color: sub, fontSize: 11.5 }, align]}>{l.type === 'water' ? `${Math.round(l.calories)} ml` : `-${Math.round(l.calories)} ${t.kcal}`}</Text>
                    </View>
                    <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('supprimer')} onPress={() => removeLog(l)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Trash2 size={16} color="#e11d48" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  body: { padding: 18, paddingBottom: 40 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dateBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  dateTxt: { fontSize: 17, fontWeight: '900' },
  totalCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, padding: 14, marginTop: 14 },
  totalTxt: { fontSize: 14.5, fontWeight: '800', flex: 1 },
  macroTxt: { fontSize: 12, fontWeight: '700' },
  copyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 10 },
  copyTxt: { color: GREEN, fontWeight: '800', fontSize: 13 },
  slotCard: { borderRadius: 18, padding: 14, marginBottom: 12 },
  slotHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  slotTitle: { fontSize: 15, fontWeight: '800' },
  slotKcal: { fontSize: 12.5, fontWeight: '800', marginEnd: 8 },
  addBtn: { backgroundColor: GREEN, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(148,163,184,0.25)' },
  gradeBadge: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  gradeTxt: { color: '#fff', fontSize: 14, fontWeight: '900' },
});
