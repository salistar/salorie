// Objectifs de MOUVEMENT du jour (style "daily moves") : pompes, squats, abdos,
// gainage, fentes — chaque exo a un objectif quotidien ; tu incrémentes par séries,
// l'anneau se remplit. Stocké localement par jour. Trilingue + dark + RTL.
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useUser } from '@clerk/clerk-expo';
import { Dumbbell, Plus, Check, RotateCcw } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { logEntry } from '../../lib/tracking';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';

const GREEN = '#2E8B57';
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const TXT: any = {
  en: { title: 'Daily moves', sub: 'Hit your daily movement goals — tap to add a set.', done: 'Goals done', set: '+ set', logged: 'Day logged ✓', reset: 'Reset', kcalNote: 'Bodyweight moves — great between meals or at your desk.' },
  fr: { title: 'Mouvements du jour', sub: 'Atteins tes objectifs de mouvement — touche pour ajouter une série.', done: 'Objectifs atteints', set: '+ série', logged: 'Journée enregistrée ✓', reset: 'Réinitialiser', kcalNote: 'Mouvements au poids du corps — parfait entre les repas ou au bureau.' },
  ar: { title: 'حركات اليوم', sub: 'حقّق أهداف حركتك اليومية — اضغط لإضافة مجموعة.', done: 'الأهداف المنجزة', set: '+ مجموعة', logged: 'تم تسجيل اليوم ✓', reset: 'إعادة', kcalNote: 'تمارين وزن الجسم — مثالية بين الوجبات أو في المكتب.' },
};

// Exercices (objectif/jour, incrément par série, kcal approx par rep).
const MOVES = [
  { key: 'pushups', emoji: '💪', goal: 50, per: 10, kcal: 0.5, en: 'Push-ups', fr: 'Pompes', ar: 'ضغط' },
  { key: 'squats', emoji: '🦵', goal: 60, per: 15, kcal: 0.4, en: 'Squats', fr: 'Squats', ar: 'قرفصاء' },
  { key: 'abs', emoji: '🔥', goal: 80, per: 20, kcal: 0.3, en: 'Crunches', fr: 'Abdos', ar: 'بطن' },
  { key: 'lunges', emoji: '🏃', goal: 40, per: 10, kcal: 0.45, en: 'Lunges', fr: 'Fentes', ar: 'اندفاع' },
  { key: 'plankSec', emoji: '🧘', goal: 120, per: 30, kcal: 0.08, en: 'Plank (sec)', fr: 'Gainage (sec)', ar: 'بلانك (ث)' },
];

export default function MoveGoals() {
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress || '';
  const { resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';
  const bg = isDark ? '#0f172a' : '#f7faf8';
  const card = isDark ? '#1e293b' : '#ffffff';
  const text = isDark ? '#f1f5f9' : '#0f172a';
  const sub = isDark ? '#94a3b8' : '#64748b';
  const align: any = { textAlign: isRTL ? 'right' : 'left' };
  const rowDir: any = { flexDirection: isRTL ? 'row-reverse' : 'row' };

  const key = `move_goals_${todayStr()}`;
  const [counts, setCounts] = useState<Record<string, number>>({});
  const load = useCallback(async () => {
    try { const raw = await AsyncStorage.getItem(key); setCounts(raw ? JSON.parse(raw) : {}); } catch {}
  }, [key]);
  useEffect(() => { load(); }, [load]);

  const save = async (next: Record<string, number>) => { setCounts(next); try { await AsyncStorage.setItem(key, JSON.stringify(next)); } catch {} };
  const addSet = (m: any) => { const next = { ...counts, [m.key]: Math.min(m.goal * 3, (counts[m.key] || 0) + m.per) }; save(next); };
  const reset = () => save({});

  const totalGoals = MOVES.length;
  const doneGoals = MOVES.filter((m) => (counts[m.key] || 0) >= m.goal).length;
  const kcal = Math.round(MOVES.reduce((a, m) => a + (counts[m.key] || 0) * m.kcal, 0));

  // Quand tous les objectifs sont atteints → log d'activité (calories) une fois/jour.
  useEffect(() => {
    if (doneGoals === totalGoals && totalGoals > 0 && email && kcal > 0) {
      AsyncStorage.getItem(`move_logged_${todayStr()}`).then((v) => {
        if (!v) { logEntry(email, 'logs', { type: 'activity', name: t.title, calories: kcal }); AsyncStorage.setItem(`move_logged_${todayStr()}`, '1'); }
      }).catch(() => {});
    }
  }, [doneGoals]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: bg }]}>
      <ScreenTopBar />
      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        <View style={[s.head, rowDir]}>
          <Dumbbell size={26} color={GREEN} />
          <Text style={[s.title, { color: text }]}>{t.title}</Text>
        </View>
        <Text style={[s.sub, { color: sub }, align]}>{t.sub}</Text>

        <View style={[s.summary, { backgroundColor: card }, rowDir]}>
          <Text style={[s.summaryBig, { color: GREEN }]}>{doneGoals}/{totalGoals}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[s.summaryLabel, { color: text }, align]}>{t.done}</Text>
            <Text style={[s.summaryKcal, { color: sub }, align]}>🔥 ~{kcal} kcal</Text>
          </View>
          <TouchableOpacity onPress={reset} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><RotateCcw size={18} color={sub} /></TouchableOpacity>
        </View>

        {MOVES.map((m) => {
          const c = counts[m.key] || 0;
          const pct = Math.min(100, (c / m.goal) * 100);
          const done = c >= m.goal;
          return (
            <View key={m.key} style={[s.moveCard, { backgroundColor: card }]}>
              <View style={[{ alignItems: 'center', gap: 10 }, rowDir]}>
                <Text style={{ fontSize: 26 }}>{m.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.moveName, { color: text }, align]}>{m[language] || m.en}</Text>
                  <Text style={[s.moveMeta, { color: done ? GREEN : sub }, align]}>{c} / {m.goal}{done ? ` · ${t.done}` : ''}</Text>
                </View>
                <TouchableOpacity style={[s.addBtn, { backgroundColor: done ? GREEN : '#eef2f7' }]} onPress={() => addSet(m)}>
                  {done ? <Check size={16} color="#fff" /> : <Plus size={16} color={GREEN} />}
                  <Text style={[s.addTxt, { color: done ? '#fff' : GREEN }]}>{m.per}</Text>
                </TouchableOpacity>
              </View>
              <View style={[s.track, { backgroundColor: isDark ? '#334155' : '#e2e8f0' }]}>
                <View style={[s.fill, { width: `${pct}%`, backgroundColor: done ? GREEN : '#86b8a0' }]} />
              </View>
            </View>
          );
        })}

        <Text style={[s.note, { color: sub }, align]}>{t.kcalNote}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  body: { padding: 18, paddingBottom: 40 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 24, fontWeight: '900', letterSpacing: -0.4 },
  sub: { fontSize: 13.5, marginTop: 6, lineHeight: 19 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 18, padding: 16, marginTop: 16 },
  summaryBig: { fontSize: 30, fontWeight: '900' },
  summaryLabel: { fontSize: 15, fontWeight: '800' },
  summaryKcal: { fontSize: 12.5, marginTop: 2 },
  moveCard: { borderRadius: 18, padding: 15, marginTop: 12 },
  moveName: { fontSize: 15.5, fontWeight: '800' },
  moveMeta: { fontSize: 12.5, marginTop: 2, fontWeight: '600' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  addTxt: { fontWeight: '900', fontSize: 14 },
  track: { height: 7, borderRadius: 4, marginTop: 12, overflow: 'hidden' },
  fill: { height: 7, borderRadius: 4 },
  note: { fontSize: 12, marginTop: 18, lineHeight: 17, fontStyle: 'italic' },
});
