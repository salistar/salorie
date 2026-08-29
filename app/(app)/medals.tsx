import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useTokens, type Tokens } from '../../constants/tokens';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { Award, HandHeart, ChevronRight, Gift } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import Medal from '../../components/Medal';
import { getMyMedals } from '../../lib/racesApi';
import { CHALLENGES, getMyChallengeProgress, streetViewUrl } from '../../lib/races';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { rowDir, txtAlign } from '../../lib/rtl';
import { useScreenGate } from '../../components/FeatureGate';

const TXT: any = {
  en: { title: 'My medals', sub: 'Finish a virtual race to earn its medal, with your rank, your time and your photo.', empty: 'No medals yet.', emptyHint: 'Here is what your first medal will look like:', you: 'You', sadaqa: 'Sadaqa Jariya', rewards: 'Local rewards' },
  fr: { title: 'Mes médailles', sub: 'Termine une course virtuelle pour gagner sa médaille, avec ton classement, ton temps et ta photo.', empty: "Aucune médaille pour l'instant.", emptyHint: 'Voici à quoi ressemblera ta première médaille :', you: 'Toi', sadaqa: 'Sadaqa Jariya', rewards: 'Récompenses locales' },
  ar: { title: 'ميدالياتي', sub: 'أكمل سباقاً افتراضياً لتفوز بميداليته، مع ترتيبك ووقتك وصورتك.', empty: 'لا ميداليات حتى الآن.', emptyHint: 'هكذا ستبدو ميداليتك الأولى:', you: 'أنت', sadaqa: 'صدقة جارية', rewards: 'مكافآت محلية' },
};
const CHALLENGE_FRAME: Record<string, string> = { 'casa-loop': 'casablanca' };

function fmt(d?: any): string {
  if (!d) return '';
  try {
    const dt = new Date(d);
    return `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}.${dt.getFullYear()}`;
  } catch { return ''; }
}

export default function Medals() {
  const k = useTokens();
  const s = useMemo(() => makeS(k), [k]);
  const { colors, resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';
  const GREEN = colors.primary;
  const tok = useTokens();
  const bg = tok.bg;
  const text = tok.text;
  const sub = tok.textMuted;
  const hint = tok.textFaint;
  const align: any = { textAlign: txtAlign(isRTL) };
  const __gate = useScreenGate('medals');

  const [loading, setLoading] = useState(true);
  const [medals, setMedals] = useState<any[]>([]);
  const [err, setErr] = useState('');

  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress || '';
  const uname = user?.fullName || user?.firstName || '';

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    // Médailles serveur (courses Mongo) + médailles des défis Firestore terminés.
    const mongo = await getMyMedals().catch(() => { setErr(''); return []; });
    let chMedals: any[] = [];
    if (email) {
      const res = await Promise.all(CHALLENGES.map(async (c) => {
        const km = await getMyChallengeProgress(c.id, email).catch(() => null);
        if (km != null && km >= c.totalKm) {
          const last = c.pois && c.pois.length ? c.pois[c.pois.length - 1] : null;
          return { _id: 'ch_' + c.id, raceName: c.name, distanceKm: c.totalKm,
            frame: CHALLENGE_FRAME[c.id], userName: uname,
            photoUrl: last ? streetViewUrl(last.lat, last.lng, 300, 300) : undefined };
        }
        return null;
      }));
      chMedals = res.filter(Boolean) as any[];
    }
    setMedals([...(mongo || []), ...chMedals]);
    setLoading(false);
  }, [email, uname]);
  useEffect(() => { load(); }, [load]);

  if (!__gate.ok) return __gate.node;

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[s.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={s.body}>
        <View style={[s.head, { flexDirection: rowDir(isRTL) }]}><Award size={26} color={GREEN} /><Text style={[s.title, { color: text }, align]}>{t.title}</Text></View>
        <Text style={[s.sub, { color: sub }, align]}>{t.sub}</Text>

        {/* Lien discret vers Sadaqa Jariya (effort → don traçable). */}
        <TouchableOpacity style={[s.sadaqaLink, { flexDirection: rowDir(isRTL) }]} activeOpacity={0.7} onPress={() => router.push('/sadaqa')}>
          <HandHeart size={16} color={GREEN} />
          <Text style={[s.sadaqaTxt, { color: GREEN }]}>{t.sadaqa}</Text>
          <View style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}><ChevronRight size={15} color={GREEN} /></View>
        </TouchableOpacity>

        {/* Lien vers les Récompenses commerçants locaux (O2O : effort → bon partenaire). */}
        <TouchableOpacity style={[s.sadaqaLink, { flexDirection: rowDir(isRTL) }]} activeOpacity={0.7} onPress={() => router.push('/rewards')}>
          <Gift size={16} color={GREEN} />
          <Text style={[s.sadaqaTxt, { color: GREEN }]}>{t.rewards}</Text>
          <View style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}><ChevronRight size={15} color={GREEN} /></View>
        </TouchableOpacity>

        {loading ? <ActivityIndicator color={GREEN} style={{ marginTop: 40 }} />
          : medals.length ? (
            <View style={s.grid}>
              {medals.map((m, i) => (
                <View key={m._id || i} style={s.cell}>
                  <Medal width={150} frame={m.frame} {...(m.spec || {})} title={m.raceName} km={m.distanceKm}
                    time={m.timeLabel} name={m.userName} rank={m.rank} photoUrl={m.photoUrl}
                    dates={m.startDate ? `${fmt(m.startDate)} — ${fmt(m.endDate)}` : ''} />
                </View>
              ))}
            </View>
          ) : (
            <View>
              <View style={s.empty}>
                <Text style={[s.emptyTxt, { color: sub }]}>{t.empty}{err ? `\n(${err})` : ''}</Text>
                <Text style={[s.emptyHint, { color: hint }]}>{t.emptyHint}</Text>
              </View>
              <View style={{ alignItems: 'center', marginTop: 8 }}>
                <Medal width={200} frame="rabat" title="Rabat" km={91} time="4h 28min" name={t.you} rank={3} dates="01.03.2025 — 28.05.2025" />
              </View>
            </View>
          )}
      </ScrollView>
    </SafeAreaView>
  );
}

// Fabrique thémée : ce StyleSheet lisait des jetons alors qu'il était
// évalué UNE FOIS à l'importation, avant que le thème n'existe. Les
// couleurs y étaient donc figées sur la palette par défaut, à vie.
const makeS = (k: Tokens) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: k.surfaceSunken },
  body: { padding: 18, paddingBottom: 90 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  title: { fontSize: 26, fontWeight: '800', color: '#1B2A33' },
  sub: { fontSize: 13, color: k.textMuted, marginTop: 6, lineHeight: 19 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 16 },
  cell: { width: '48%', alignItems: 'center', marginBottom: 16 },
  sadaqaLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, alignSelf: 'flex-start' },
  sadaqaTxt: { fontSize: 13.5, fontWeight: '800' },
  empty: { marginTop: 30, alignItems: 'center' },
  emptyTxt: { fontSize: 14, color: k.textMuted, textAlign: 'center', fontWeight: '600' },
  emptyHint: { fontSize: 12, color: k.textFaint, marginTop: 14 },
});
