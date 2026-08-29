// Défi annuel cumulatif (ex « Conquer 2026 ») : un grand objectif de km sur l'année.
// L'utilisateur règle son objectif (stepper + saisie), voit ses km cumulés, une
// grande barre de progression % et un message d'encouragement par paliers.
// État 100% local via lib/annualChallenge. Trilingue + dark + RTL + ScreenTopBar.
import React, { useState, useCallback } from 'react';
import { useTokens } from '../../constants/tokens';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Mountain, Minus, Plus, Flag } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { Input } from '../../components/ui';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { getAnnual, setAnnualGoal, annualProgress } from '../../lib/annualChallenge';
import { useUser } from '@clerk/clerk-expo';
// La progression (XP, cumul annuel, km totaux) ne vivait qu'en local. Elle part
// maintenant vers l'espace web, qui n'a aucun autre moyen de la connaitre — et
// qui peut, lui, reposer l'objectif de l'annee.
import { pousser, ecrireObjectifLocal, lireLocale } from '../../lib/progression';

const GREEN = '#2E8B57';
const STEP = 50; // pas du stepper (km)

const TXT: any = {
  en: {
    title: 'Annual challenge',
    sub: 'Pile up the kilometres all year — one big cumulative goal.',
    goal: 'Yearly goal',
    cumulated: 'Cumulated this year',
    remaining: 'left to reach your goal',
    reached: 'Goal reached — incredible!',
    km: 'km',
    goalReached: 'Done ✓',
    editGoal: 'Set your goal',
    note: 'Your virtual races and GPS runs add up here automatically over the year.',
    // paliers d'encouragement (0,25,50,75,100)
    m0: 'Every journey starts with a single step. Lace up!',
    m25: 'Great start — you are on your way. Keep moving!',
    m50: 'Halfway there! Your consistency is paying off.',
    m75: 'So close — the finish line is in sight. Push on!',
    m100: 'Champion! You conquered your year. 🏆',
  },
  fr: {
    title: 'Défi annuel',
    sub: 'Accumule les kilomètres toute l’année — un seul grand objectif cumulé.',
    goal: 'Objectif de l’année',
    cumulated: 'Cumulé cette année',
    remaining: 'pour atteindre ton objectif',
    reached: 'Objectif atteint — incroyable !',
    km: 'km',
    goalReached: 'Atteint ✓',
    editGoal: 'Définis ton objectif',
    note: 'Tes courses virtuelles et tes sorties GPS s’ajoutent ici automatiquement tout au long de l’année.',
    m0: 'Chaque parcours commence par un premier pas. En route !',
    m25: 'Beau départ — tu es lancé(e). Continue !',
    m50: 'À mi-chemin ! Ta régularité paie.',
    m75: 'Presque ! La ligne d’arrivée est en vue. Accroche-toi !',
    m100: 'Champion(ne) ! Tu as conquis ton année. 🏆',
  },
  ar: {
    title: 'تحدي السنة',
    sub: 'اجمع الكيلومترات طوال السنة — هدف تراكمي واحد كبير.',
    goal: 'هدف السنة',
    cumulated: 'المتراكم هذه السنة',
    remaining: 'للوصول إلى هدفك',
    reached: 'تم بلوغ الهدف — رائع!',
    km: 'كلم',
    goalReached: 'تم ✓',
    editGoal: 'حدّد هدفك',
    note: 'سباقاتك الافتراضية وجولاتك عبر GPS تُضاف هنا تلقائياً على مدار السنة.',
    m0: 'كل رحلة تبدأ بخطوة واحدة. انطلق!',
    m25: 'بداية رائعة — أنت في الطريق. واصل!',
    m50: 'في منتصف الطريق! انتظامك يؤتي ثماره.',
    m75: 'اقتربت — خط النهاية في الأفق. واصل الدفع!',
    m100: 'بطل! لقد قهرت سنتك. 🏆',
  },
};

function encourage(t: any, pct: number): string {
  if (pct >= 100) return t.m100;
  if (pct >= 75) return t.m75;
  if (pct >= 50) return t.m50;
  if (pct >= 25) return t.m25;
  return t.m0;
}

export default function AnnualChallenge() {
  const k = useTokens();
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

  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [goalKm, setGoalKm] = useState<number>(0);
  const [km, setKm] = useState<number>(0);
  const [draft, setDraft] = useState<string>('');

  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress || '';

  const refresh = useCallback(async () => {
    // On pousse D'ABORD : `pousser` redescend au passage un objectif qui aurait
    // ete change depuis le web, et l'affichage doit montrer celui-la, pas
    // l'ancien. Sans compte, on lit simplement le local.
    if (email) await pousser(email);
    const p = await annualProgress();
    setYear(p.year);
    setGoalKm(p.goalKm);
    setKm(p.km);
    setDraft(String(p.goalKm));
  }, [email]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const commitGoal = async (next: number) => {
    const c = await setAnnualGoal(next);
    setGoalKm(c.goalKm);
    setDraft(String(c.goalKm));
    // L'objectif est le SEUL champ que les deux cotes peuvent ecrire : il porte
    // donc son propre horodatage. Sans lui, le telephone — qui se synchronise
    // bien plus souvent — ramenerait l'objectif a son ancienne valeur a chaque
    // passage, et un objectif fixe depuis le web ne tiendrait jamais.
    const l = await lireLocale(c.year);
    await ecrireObjectifLocal({ ...l, objectifKm: c.goalKm, objectifTs: Date.now() });
    if (email) await pousser(email);
  };

  const onStep = (delta: number) => commitGoal(Math.max(1, goalKm + delta));
  const onSubmitDraft = () => {
    const n = parseInt(draft, 10);
    if (Number.isFinite(n) && n > 0) commitGoal(n);
    else setDraft(String(goalKm));
  };

  const pct = goalKm > 0 ? Math.min(100, Math.round((km / goalKm) * 100)) : 0;
  const remaining = Math.max(0, Math.round((goalKm - km) * 10) / 10);
  const reached = pct >= 100;

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[s.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        <View style={[s.head, rowDir]}>
          <Mountain size={26} color={accent} />
          <Text style={[s.title, { color: text }]}>{t.title} {year}</Text>
        </View>
        <Text style={[s.sub, { color: sub }, align]}>{t.sub}</Text>

        {/* Carte progression — grand % + barre */}
        <View style={[s.progCard, { backgroundColor: card }]}>
          <View style={[{ alignItems: 'baseline', gap: 8 }, rowDir]}>
            <Text style={[s.bigKm, { color: accent }]}>{km}</Text>
            <Text style={[s.bigUnit, { color: sub }]}>/ {goalKm} {t.km}</Text>
            <View style={{ flex: 1 }} />
            <Text style={[s.pctBadge, { color: accent, backgroundColor: isDark ? 'rgba(74,222,128,0.14)' : '#eaf4ee' }]}>{pct}%</Text>
          </View>
          <Text style={[s.cumLabel, { color: sub }, align]}>{t.cumulated}</Text>

          <View style={[s.track, { backgroundColor: k.surfaceSunken }]}>
            <View style={[s.fill, { width: `${pct}%`, backgroundColor: accent }]} />
          </View>

          <Text style={[s.remaining, { color: reached ? accent : sub }, align]}>
            {reached ? t.reached : `${remaining} ${t.km} ${t.remaining}`}
          </Text>
        </View>

        {/* Message d'encouragement par palier */}
        <View style={[s.encourage, { backgroundColor: isDark ? 'rgba(74,222,128,0.10)' : '#eaf4ee' }]}>
          <Flag size={18} color={accent} />
          <Text style={[s.encourageTxt, { color: k.text }, align]}>{encourage(t, pct)}</Text>
        </View>

        {/* Réglage de l'objectif : stepper + saisie */}
        <Text style={[s.secLabel, { color: text }, align]}>{t.editGoal}</Text>
        <View style={[s.goalRow, { backgroundColor: card }, rowDir]}>
          <TouchableOpacity
            style={[s.stepBtn, { borderColor: accent }]}
            onPress={() => onStep(-STEP)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={`${t.goal} −${STEP} ${t.km}`}
          >
            <Minus size={20} color={accent} />
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <Input
              label={t.goal}
              value={draft}
              onChangeText={setDraft}
              onBlur={onSubmitDraft}
              onSubmitEditing={onSubmitDraft}
              keyboardType="number-pad"
              returnKeyType="done"
              textAlign="center"
              maxLength={6}
              accessibilityLabel={t.goal}
              containerStyle={s.goalField}
              style={s.goalInput}
              right={<Text style={[s.goalUnit, { color: sub }]}>{t.km}</Text>}
            />
          </View>

          <TouchableOpacity
            style={[s.stepBtn, { borderColor: accent }]}
            onPress={() => onStep(STEP)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={`${t.goal} +${STEP} ${t.km}`}
          >
            <Plus size={20} color={accent} />
          </TouchableOpacity>
        </View>

        <Text style={[s.note, { color: sub }, align]}>{t.note}</Text>
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
  progCard: { borderRadius: 20, padding: 18, marginTop: 18 },
  bigKm: { fontSize: 40, fontWeight: '900', letterSpacing: -1 },
  bigUnit: { fontSize: 16, fontWeight: '800' },
  pctBadge: { fontSize: 15, fontWeight: '900', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
  cumLabel: { fontSize: 12.5, marginTop: 2, fontWeight: '600' },
  track: { height: 14, borderRadius: 8, marginTop: 16, overflow: 'hidden' },
  fill: { height: 14, borderRadius: 8 },
  remaining: { fontSize: 13, marginTop: 12, fontWeight: '700' },
  encourage: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, padding: 14, marginTop: 14 },
  encourageTxt: { flex: 1, fontSize: 13.5, fontWeight: '700', lineHeight: 19 },
  secLabel: { fontSize: 15, fontWeight: '800', marginTop: 22, marginBottom: 10 },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 16 },
  stepBtn: { width: 46, height: 46, minWidth: 44, minHeight: 44, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  goalField: { marginBottom: 0 },
  goalInput: { fontSize: 24, fontWeight: '900' },
  goalUnit: { fontSize: 15, fontWeight: '800' },
  note: { fontSize: 12, marginTop: 18, lineHeight: 17, fontStyle: 'italic' },
});
