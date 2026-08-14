// ÉCRAN ACTIVITÉ — historique de toutes les activités (runs solo, courses
// virtuelles/groupe, séances, pas du jour). Lecture 100% ON-DEVICE depuis le
// cache local `logs_<docId>` (type 'activity'). Groupé par jour + stats en tête.
import React, { useCallback, useState } from 'react';
import { useTokens } from '../../constants/tokens';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Activity as ActivityIcon, Footprints, Trophy, Flame, Dumbbell, Flag } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { emailToDocId, NutritionLog } from '../../lib/firebase';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';

const GREEN = '#2E8B57';

const TXT: any = {
  en: { title: 'Activity', sub: 'Your runs, races, workouts and steps.', empty: 'No activity yet. Start a run or a race!',
    sessions: 'Sessions', burned: 'Burned', week: 'This week', kcal: 'kcal', min: 'min', today: 'Today', yesterday: 'Yesterday' },
  fr: { title: 'Activité', sub: 'Tes runs, courses, séances et pas.', empty: 'Aucune activité pour l’instant. Lance un run ou une course !',
    sessions: 'Séances', burned: 'Brûlées', week: 'Cette semaine', kcal: 'kcal', min: 'min', today: "Aujourd'hui", yesterday: 'Hier' },
  ar: { title: 'النشاط', sub: 'جرياتك وسباقاتك وتمارينك وخطواتك.', empty: 'لا يوجد نشاط بعد. ابدأ جرياً أو سباقاً!',
    sessions: 'حصص', burned: 'محروقة', week: 'هذا الأسبوع', kcal: 'سعرة', min: 'د', today: 'اليوم', yesterday: 'أمس' },
};

function iconFor(name: string) {
  const n = (name || '').toLowerCase();
  if (n.includes('pas') || n.includes('step') || n.includes('خطو')) return { Icon: Footprints, bg: '#EEF2FF', color: '#6366F1' };
  if (n.includes('race') || n.includes('course') || n.includes('سباق')) return { Icon: Trophy, bg: '#FEF3E0', color: '#F59E0B' };
  if (n.includes('run') || n.includes('جري') || n.includes('gps')) return { Icon: Flag, bg: '#EAF4EE', color: GREEN };
  if (n.includes('lift') || n.includes('muscu') || n.includes('workout') || n.includes('séance') || n.includes('تمرين')) return { Icon: Dumbbell, bg: '#F5F3FF', color: '#8B5CF6' };
  return { Icon: Flame, bg: '#FFF1F2', color: '#F43F5E' };
}

export default function ActivityScreen() {
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
  const border = isDark ? 'rgba(255,255,255,0.08)' : '#EEF2F6';
  const align: any = { textAlign: isRTL ? 'right' : 'left' };
  const rowDir: any = { flexDirection: isRTL ? 'row-reverse' : 'row' };

  const [items, setItems] = useState<NutritionLog[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!email) { setLoading(false); return; }
    try {
      const raw = await AsyncStorage.getItem(`logs_${emailToDocId(email)}`);
      const all: NutritionLog[] = raw ? JSON.parse(raw) : [];
      const acts = all
        .filter((l) => l?.type === 'activity')
        .sort((a: any, b: any) => {
          const ta = (a.timestamp?.seconds || 0) * 1000 || new Date(a.date || 0).getTime();
          const tb = (b.timestamp?.seconds || 0) * 1000 || new Date(b.date || 0).getTime();
          return tb - ta;
        });
      setItems(acts);
    } catch { setItems([]); }
    finally { setLoading(false); }
  }, [email]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  // Stats en tête
  const totalSessions = items.length;
  const totalKcal = items.reduce((s, l) => s + (Math.round(l.calories) || 0), 0);
  const ds = (d: Date) => d.toISOString().slice(0, 10);
  const today = new Date();
  const weekStart = new Date(today); weekStart.setDate(today.getDate() - 6);
  const weekKcal = items.filter((l: any) => l.date && new Date(l.date) >= weekStart).reduce((s, l) => s + (Math.round(l.calories) || 0), 0);

  // Groupage par jour
  const groups: { date: string; label: string; logs: NutritionLog[] }[] = [];
  const fmtDay = (dstr: string) => {
    if (dstr === ds(today)) return t.today;
    const y = new Date(today); y.setDate(today.getDate() - 1);
    if (dstr === ds(y)) return t.yesterday;
    try { return new Date(dstr).toLocaleDateString(language === 'fr' ? 'fr-FR' : language === 'ar' ? 'ar' : 'en-US', { weekday: 'short', day: 'numeric', month: 'short' }); }
    catch { return dstr; }
  };
  for (const l of items) {
    const d = (l as any).date || ds(today);
    let g = groups.find((x) => x.date === d);
    if (!g) { g = { date: d, label: fmtDay(d), logs: [] }; groups.push(g); }
    g.logs.push(l);
  }

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        <View style={[s.head, rowDir]}>
          <ActivityIcon size={26} color={accent} />
          <Text style={[s.title, { color: text }]}>{t.title}</Text>
        </View>
        <Text style={[s.sub, { color: sub }, align]}>{t.sub}</Text>

        {/* Stats */}
        <View style={[s.statsRow, rowDir]}>
          <View style={[s.statCard, { backgroundColor: card, borderColor: border }]}>
            <Text style={[s.statVal, { color: text }]}>{totalSessions}</Text>
            <Text style={[s.statLbl, { color: sub }]}>{t.sessions}</Text>
          </View>
          <View style={[s.statCard, { backgroundColor: card, borderColor: border }]}>
            <Text style={[s.statVal, { color: accent }]}>{totalKcal}</Text>
            <Text style={[s.statLbl, { color: sub }]}>{t.burned} ({t.kcal})</Text>
          </View>
          <View style={[s.statCard, { backgroundColor: card, borderColor: border }]}>
            <Text style={[s.statVal, { color: text }]}>{weekKcal}</Text>
            <Text style={[s.statLbl, { color: sub }]}>{t.week}</Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={accent} style={{ marginTop: 40 }} />
        ) : items.length === 0 ? (
          <Text style={[s.empty, { color: sub }]}>{t.empty}</Text>
        ) : (
          groups.map((g) => (
            <View key={g.date} style={{ marginTop: 18 }}>
              <Text style={[s.dayLabel, { color: sub }, align]}>{g.label}</Text>
              {g.logs.map((l, i) => {
                const { Icon, bg: ibg, color } = iconFor(l.name);
                const meta = [l.intensity, l.duration ? `${l.duration} ${t.min}` : null].filter(Boolean).join(' • ');
                return (
                  <View key={(l.id || '') + i} style={[s.item, { backgroundColor: card, borderColor: border }, rowDir]}>
                    <View style={[s.itemIcon, { backgroundColor: ibg }]}><Icon size={22} color={color} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.itemName, { color: text }, align]} numberOfLines={1}>{l.name}</Text>
                      {meta ? <Text style={[s.itemMeta, { color: sub }, align]}>{meta}</Text> : null}
                    </View>
                    <Text style={[s.itemKcal, { color: accent }]}>{Math.round(l.calories)} {t.kcal}</Text>
                  </View>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  body: { padding: 18, paddingBottom: 110 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  title: { fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  sub: { fontSize: 13.5, marginTop: 6, marginBottom: 14 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, borderRadius: 18, borderWidth: 1, paddingVertical: 16, paddingHorizontal: 8, alignItems: 'center', gap: 4 },
  statVal: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  statLbl: { fontSize: 10.5, fontWeight: '700', textAlign: 'center' },
  dayLabel: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 18, borderWidth: 1, padding: 14, marginBottom: 10 },
  itemIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  itemName: { fontSize: 15.5, fontWeight: '800' },
  itemMeta: { fontSize: 12.5, fontWeight: '600', marginTop: 2 },
  itemKcal: { fontSize: 15, fontWeight: '900' },
  empty: { fontSize: 14, textAlign: 'center', marginTop: 40, paddingHorizontal: 30, lineHeight: 20 },
});
