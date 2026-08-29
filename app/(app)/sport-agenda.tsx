import React, { useEffect, useState, useCallback } from 'react';
import { a11y } from '../../lib/a11y';
import { useTokens } from '../../constants/tokens';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { router } from 'expo-router';
import { CalendarDays, Plus, Trash2, Flag, Dumbbell } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ScreenTopBar from '../../components/ScreenTopBar';
import PhotoStrip from '../../components/PhotoStrip';
import { FormCard, FormInput } from '../../components/FormKit';
import { logEntry, getEntries, deleteEntry } from '../../lib/tracking';
import { getActiveRaces } from '../../lib/racesApi';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';

const GREEN = '#2E8B57';

const TXT: any = {
  en: { title: 'Sport agenda', sub: 'Plan your workouts and see upcoming virtual races.', plan: 'Plan a workout', what: 'Workout (e.g. Run 5 km)', when: 'Date (YYYY-MM-DD)', add: 'Add', planned: 'Planned workouts', races: 'Upcoming virtual races', empty: 'Nothing planned yet.', km: 'km', logIt: 'Log a workout now' },
  fr: { title: 'Agenda sport', sub: 'Planifie tes séances et vois les courses virtuelles à venir.', plan: 'Planifier une séance', what: 'Séance (ex. Course 5 km)', when: 'Date (AAAA-MM-JJ)', add: 'Ajouter', planned: 'Séances planifiées', races: 'Courses virtuelles à venir', empty: 'Rien de planifié pour l\'instant.', km: 'km', logIt: 'Enregistrer une séance maintenant' },
  ar: { title: 'أجندة الرياضة', sub: 'خطط لتمارينك وشاهد السباقات الافتراضية القادمة.', plan: 'خطط لتمرين', what: 'التمرين (مثال: جري 5 كلم)', when: 'التاريخ (سنة-شهر-يوم)', add: 'أضف', planned: 'تمارين مخططة', races: 'سباقات افتراضية قادمة', empty: 'لا شيء مخطط حالياً.', km: 'كلم', logIt: 'سجّل تمريناً الآن' },
};

export default function SportAgenda() {
  const k = useTokens();
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

  const [what, setWhat] = useState('');
  const [when, setWhen] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [races, setRaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ag, rs] = await Promise.allSettled([getEntries(email, 'sport_agenda', 100), getActiveRaces()]);
      if (ag.status === 'fulfilled') setItems((ag.value || []).sort((a: any, b: any) => String(a.when).localeCompare(String(b.when))));
      if (rs.status === 'fulfilled' && Array.isArray(rs.value)) setRaces(rs.value);
    } finally { setLoading(false); }
  }, [email]);
  useEffect(() => { if (email) load(); }, [email, load]);

  const add = async () => {
    if (!what.trim() || !email) return;
    setBusy(true);
    const date = when.trim() || new Date().toISOString().slice(0, 10);
    await logEntry(email, 'sport_agenda', { what: what.trim(), when: date });
    setWhat(''); setWhen(''); setBusy(false); load();
  };
  const remove = async (id: string) => {
    await deleteEntry(email, 'sport_agenda', id);
    load();
  };

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[s.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Bandeau héro visuel */}
        <LinearGradient colors={[accent, '#1d6440']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.heroBanner}>
          <CalendarDays size={30} color="#fff" />
          <View style={{ flex: 1 }}>
            <Text style={[s.heroTitle, align]}>{t.title}</Text>
            <Text style={[s.heroSub, align]}>{t.sub}</Text>
          </View>
        </LinearGradient>
        <PhotoStrip category="sport" />

        {/* Planifier — champs FormKit (label au-dessus, carte) */}
        <FormCard style={{ marginTop: 18, marginBottom: 0 }}>
          <Text style={[s.secTitle, { color: text, marginBottom: 12 }, align]}>{t.plan}</Text>
          <FormInput label={t.what} value={what} onChangeText={setWhat} />
          <FormInput label={t.when} value={when} onChangeText={setWhen} />
          <TouchableOpacity style={s.addBtn} onPress={add} disabled={busy || !what.trim()}>
            {busy ? <ActivityIndicator size="small" color="#fff" /> : (<><Plus size={17} color="#fff" /><Text style={s.addTxt}>{t.add}</Text></>)}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/log-exercise' as any)}>
            <Text style={{ color: accent, fontWeight: '700', fontSize: 13, marginTop: 10, textAlign: 'center' }}>{t.logIt} →</Text>
          </TouchableOpacity>
        </FormCard>

        {/* Séances planifiées */}
        <View style={[s.secHead, rowDir]}><Dumbbell size={17} color={accent} /><Text style={[s.secTitle, { color: text }]}>{t.planned}</Text></View>
        {loading ? <ActivityIndicator color={accent} /> : items.length === 0 ? (
          <Text style={[{ color: sub, fontSize: 13 }, align]}>{t.empty}</Text>
        ) : items.map((it) => (
          <View key={it.id} style={[s.row, { backgroundColor: card }, rowDir]}>
            <View style={{ flex: 1 }}>
              <Text style={[{ color: text, fontWeight: '700', fontSize: 14 }, align]}>{it.what}</Text>
              <Text style={[{ color: sub, fontSize: 12, marginTop: 2 }, align]}>{it.when}</Text>
            </View>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('supprimer')} onPress={() => remove(it.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Trash2 size={17} color="#e11d48" />
            </TouchableOpacity>
          </View>
        ))}

        {/* Courses à venir */}
        <View style={[s.secHead, rowDir]}><Flag size={17} color={accent} /><Text style={[s.secTitle, { color: text }]}>{t.races}</Text></View>
        {races.map((r) => (
          <TouchableOpacity key={r._id} style={[s.row, { backgroundColor: card }, rowDir]} activeOpacity={0.85}
            onPress={() => router.push(('/challenge?id=' + r._id + '&src=mongo') as any)}>
            <View style={{ flex: 1 }}>
              <Text style={[{ color: text, fontWeight: '700', fontSize: 14 }, align]} numberOfLines={1}>{r.name}</Text>
              <Text style={[{ color: sub, fontSize: 12, marginTop: 2 }, align]}>{r.totalKm} {t.km}{r.startDate ? ` · ${String(r.startDate).slice(0, 10)}` : ''}</Text>
            </View>
          </TouchableOpacity>
        ))}
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
  heroBanner: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 20, padding: 18 },
  heroTitle: { color: '#fff', fontSize: 21, fontWeight: '900', letterSpacing: -0.3 },
  heroSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12.5, marginTop: 4, lineHeight: 17 },
  secHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22, marginBottom: 10 },
  secTitle: { fontSize: 15.5, fontWeight: '800' },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: GREEN, borderRadius: 12, paddingVertical: 12, marginTop: 4 },
  addTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, padding: 13, marginBottom: 8 },
});
