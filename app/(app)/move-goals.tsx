// Objectifs de MOUVEMENT du jour (style "daily moves") : pompes, squats, abdos,
// gainage, fentes — chaque exo a un objectif quotidien ; tu incrémentes par séries,
// l'anneau se remplit. Stocké localement par jour. Trilingue + dark + RTL.
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { a11y } from '../../lib/a11y';
import { useTokens, type Tokens } from '../../constants/tokens';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useUser } from '@clerk/clerk-expo';
import { Dumbbell, Plus, Check, RotateCcw } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { logEntry } from '../../lib/tracking';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';

const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const TXT: any = {
  en: { title: 'Daily moves', sub: 'Hit your daily movement goals — tap to add a set.', done: 'Goals done', set: '+ set', logged: 'Day logged ✓', reset: 'Reset', kcalNote: 'Bodyweight moves — great between meals or at your desk.' },
  fr: { title: 'Mouvements du jour', sub: 'Atteins tes objectifs de mouvement — touche pour ajouter une série.', done: 'Objectifs atteints', set: '+ série', logged: 'Journée enregistrée ✓', reset: 'Réinitialiser', kcalNote: 'Mouvements au poids du corps — parfait entre les repas ou au bureau.' },
  ar: { title: 'حركات اليوم', sub: 'حقّق أهداف حركتك اليومية — اضغط لإضافة مجموعة.', done: 'الأهداف المنجزة', set: '+ مجموعة', logged: 'تم تسجيل اليوم ✓', reset: 'إعادة', kcalNote: 'تمارين وزن الجسم — مثالية بين الوجبات أو في المكتب.' },
};

// Image de démonstration par exercice (assets locaux).
const MOVE_IMG: Record<string, any> = {
  pushups: require('../../assets/images/exercices/pushups.png'),
  squats: require('../../assets/images/exercices/squats.png'),
  abs: require('../../assets/images/exercices/abs.png'),
  lunges: require('../../assets/images/exercices/lunges.png'),
  plankSec: require('../../assets/images/exercices/plankSec.png'),
};

// Exercices (objectif/jour, incrément par série, kcal approx par rep) + description du geste.
const MOVES = [
  { key: 'pushups', emoji: '💪', goal: 50, per: 10, kcal: 0.5, en: 'Push-ups', fr: 'Pompes', ar: 'ضغط',
    descFr: 'Mains au sol largeur d’épaules, corps gainé en ligne droite. Descends la poitrine près du sol, puis pousse pour remonter.',
    descEn: 'Hands shoulder-width on the floor, body straight and tight. Lower your chest near the floor, then push back up.',
    descAr: 'اليدان على الأرض بعرض الكتفين والجسم مشدود ومستقيم. انزل بصدرك قرب الأرض ثم ادفع للأعلى.' },
  { key: 'squats', emoji: '🦵', goal: 60, per: 15, kcal: 0.4, en: 'Squats', fr: 'Squats', ar: 'قرفصاء',
    descFr: 'Pieds largeur d’épaules. Descends les hanches comme pour t’asseoir (dos droit, genoux derrière les orteils), puis remonte.',
    descEn: 'Feet shoulder-width. Lower your hips like sitting back (straight back, knees behind toes), then stand back up.',
    descAr: 'القدمان بعرض الكتفين. انزل بالوركين كأنك تجلس (الظهر مستقيم، الركبتان خلف أصابع القدم) ثم انهض.' },
  { key: 'abs', emoji: '🔥', goal: 80, per: 20, kcal: 0.3, en: 'Crunches', fr: 'Abdos', ar: 'بطن',
    descFr: 'Allongé sur le dos, genoux pliés. Décolle les épaules en contractant les abdos, sans tirer sur la nuque, puis redescends.',
    descEn: 'Lie on your back, knees bent. Lift your shoulders by contracting your abs (don’t pull your neck), then lower slowly.',
    descAr: 'استلقِ على ظهرك والركبتان مثنيتان. ارفع كتفيك بشدّ عضلات البطن دون شدّ الرقبة ثم انزل ببطء.' },
  { key: 'lunges', emoji: '🏃', goal: 40, per: 10, kcal: 0.45, en: 'Lunges', fr: 'Fentes', ar: 'اندفاع',
    descFr: 'Un grand pas en avant, plie les deux genoux à 90° (le genou arrière frôle le sol), reviens et alterne les jambes.',
    descEn: 'Take a big step forward, bend both knees to 90° (back knee near the floor), return and alternate legs.',
    descAr: 'خطوة كبيرة للأمام، اثنِ الركبتين 90° (الركبة الخلفية قرب الأرض)، عُد وبدّل الساقين.' },
  { key: 'plankSec', emoji: '🧘', goal: 120, per: 30, kcal: 0.08, en: 'Plank (sec)', fr: 'Gainage (sec)', ar: 'بلانك (ث)',
    descFr: 'Sur les avant-bras et la pointe des pieds, corps droit et gainé (ni hanches hautes ni creusées). Tiens la position.',
    descEn: 'On forearms and toes, body straight and braced (hips not too high or sagging). Hold the position.',
    descAr: 'على الساعدين وأطراف القدمين، الجسم مستقيم ومشدود (الوركان غير مرتفعين ولا منخفضين). اثبت على الوضعية.' },
];

export default function MoveGoals() {
  const k = useTokens();
  const s = useMemo(() => makeS(k), [k]);
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress || '';
  const { resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';
  // Accent thémé : k.accent est le vert CLAIR ; en sombre on utilise le token
  // dark officiel (contraste correct sur fond sombre).
  // L'accent vient du theme : le couple clair/sombre fige
  // n'ouvrait que deux des six palettes.
  const accent = k.accent;
  const tok = useTokens();
  const bg = tok.bg;
  const card = tok.surface;
  const text = tok.text;
  const sub = tok.textMuted;
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
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[s.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        <View style={[s.head, rowDir]}>
          <Dumbbell size={26} color={accent} />
          <Text style={[s.title, { color: text }]}>{t.title}</Text>
        </View>
        <Text style={[s.sub, { color: sub }, align]}>{t.sub}</Text>

        <View style={[s.summary, { backgroundColor: card }, rowDir]}>
          <Text style={[s.summaryBig, { color: accent }]}>{doneGoals}/{totalGoals}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[s.summaryLabel, { color: text }, align]}>{t.done}</Text>
            <Text style={[s.summaryKcal, { color: sub }, align]}>🔥 ~{kcal} kcal</Text>
          </View>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('recommencer')} onPress={reset} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><RotateCcw size={18} color={sub} /></TouchableOpacity>
        </View>

        {MOVES.map((m) => {
          const c = counts[m.key] || 0;
          const pct = Math.min(100, (c / m.goal) * 100);
          const done = c >= m.goal;
          return (
            <View key={m.key} style={[s.moveCard, { backgroundColor: card }]}>
              <View style={[{ alignItems: 'center', gap: 12 }, rowDir]}>
                <Image source={MOVE_IMG[m.key]} style={[s.moveImg, { backgroundColor: k.surfaceRaised }]} resizeMode="cover" />
                <View style={{ flex: 1 }}>
                  <Text style={[s.moveName, { color: text }, align]}>{(m as any)[language] || m.en}</Text>
                  <Text style={[s.moveMeta, { color: done ? accent : sub }, align]}>{c} / {m.goal}{done ? ` · ${t.done}` : ''}</Text>
                </View>
                <TouchableOpacity style={[s.addBtn, { backgroundColor: done ? accent : k.surfaceSunken }]} onPress={() => addSet(m)}>
                  {done ? <Check size={16} color={k.onAccent} /> : <Plus size={16} color={accent} />}
                  <Text style={[s.addTxt, { color: done ? k.onAccent : accent }]}>{m.per}</Text>
                </TouchableOpacity>
              </View>
              <Text style={[s.moveDesc, { color: sub }, align]}>{language === 'fr' ? m.descFr : language === 'ar' ? m.descAr : m.descEn}</Text>
              <View style={[s.track, { backgroundColor: k.surfaceSunken }]}>
                <View style={[s.fill, { width: `${pct}%`, backgroundColor: done ? accent : '#86b8a0' }]} />
              </View>
            </View>
          );
        })}

        <Text style={[s.note, { color: sub }, align]}>{t.kcalNote}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// Fabrique thémée : ce StyleSheet lisait des jetons alors qu'il était
// évalué UNE FOIS à l'importation, avant que le thème n'existe. Les
// couleurs y étaient donc figées sur la palette par défaut, à vie.
const makeS = (k: Tokens) => StyleSheet.create({
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
  moveImg: { width: 58, height: 58, borderRadius: 14, backgroundColor: k.surfaceSunken },
  moveDesc: { fontSize: 12.5, lineHeight: 18, marginTop: 11 },
  moveName: { fontSize: 15.5, fontWeight: '800' },
  moveMeta: { fontSize: 12.5, marginTop: 2, fontWeight: '600' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  addTxt: { fontWeight: '900', fontSize: 14 },
  track: { height: 7, borderRadius: 4, marginTop: 12, overflow: 'hidden' },
  fill: { height: 7, borderRadius: 4 },
  note: { fontSize: 12, marginTop: 18, lineHeight: 17, fontStyle: 'italic' },
});
