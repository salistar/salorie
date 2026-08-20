import React, { useEffect, useState } from 'react';
import { useTokens } from '../../constants/tokens';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, ActivityIndicator, TouchableOpacity, Image } from 'react-native';
import { router } from 'expo-router';
import { Newspaper, Flag, Trophy, Sparkles, ChevronRight } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { getNews, getActiveRaces } from '../../lib/racesApi';
import { CHALLENGES, streetViewUrl } from '../../lib/races';
import { poiPhoto } from '../../assets/challenges/registry';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';

const GREEN = '#2E8B57';

const TXT: any = {
  en: { title: 'Journal', sub: 'News, upcoming races and challenges.', news: 'News', races: 'Virtual races', challenges: 'Challenges', empty: 'Nothing new for now — come back soon!', open: 'Open', km: 'km' },
  fr: { title: 'Journal', sub: 'Actualités, courses à venir et défis.', news: 'Actualités', races: 'Courses virtuelles', challenges: 'Défis', empty: 'Rien de neuf pour le moment — reviens bientôt !', open: 'Ouvrir', km: 'km' },
  ar: { title: 'اليوميات', sub: 'الأخبار والسباقات القادمة والتحديات.', news: 'الأخبار', races: 'سباقات افتراضية', challenges: 'تحديات', empty: 'لا جديد حالياً — عد قريباً!', open: 'افتح', km: 'كلم' },
};
const KIND_ICON: any = { news: Newspaper, race: Flag, challenge: Trophy, update: Sparkles };

export default function Journal() {
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

  const [news, setNews] = useState<any[]>([]);
  const [races, setRaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([getNews(), getActiveRaces()]).then(([n, r]) => {
      if (n.status === 'fulfilled' && Array.isArray(n.value)) setNews(n.value);
      if (r.status === 'fulfilled' && Array.isArray(r.value)) setRaces(r.value);
    }).finally(() => setLoading(false));
  }, []);

  const Section = ({ icon: Icon, label }: any) => (
    <View style={[s.secHead, rowDir]}>
      <Icon size={18} color={accent} />
      <Text style={[s.secTitle, { color: text }]}>{label}</Text>
    </View>
  );

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack />
      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        <View style={[s.head, rowDir]}>
          <Newspaper size={26} color={accent} />
          <Text style={[s.title, { color: text }]}>{t.title}</Text>
        </View>
        <Text style={[s.sub, { color: sub }, align]}>{t.sub}</Text>

        {loading ? <ActivityIndicator size="large" color={accent} style={{ marginTop: 30 }} /> : (
          <>
            {/* Actus publiées depuis le back-office */}
            {news.length > 0 && (
              <>
                <Section icon={Newspaper} label={t.news} />
                {news.map((n) => {
                  const Icon = KIND_ICON[n.kind] || Newspaper;
                  return (
                    <View key={n._id} style={[s.card, { backgroundColor: card, flexDirection: 'column', alignItems: 'stretch' }]}>
                      {/* Image de l'actu si fournie depuis le back-office */}
                      {n.imageUrl ? <Image source={{ uri: n.imageUrl }} style={s.newsImg} resizeMode="cover" /> : null}
                      <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 12 }, isRTL && { flexDirection: 'row-reverse' }]}>
                        <View style={s.iconWrap}><Icon size={18} color={accent} /></View>
                        <View style={{ flex: 1 }}>
                          <Text style={[s.cardTitle, { color: text }, align]}>{n.title}</Text>
                          {n.body ? <Text style={[s.cardBody, { color: sub }, align]}>{n.body}</Text> : null}
                        </View>
                      </View>
                    </View>
                  );
                })}
              </>
            )}

            {/* Courses virtuelles actives / à venir */}
            {races.length > 0 && (
              <>
                <Section icon={Flag} label={t.races} />
                {races.map((r) => {
                  const w0 = (r.waypoints || [])[0];
                  return (
                    <TouchableOpacity key={r._id} style={[s.card, { backgroundColor: card }, rowDir]} activeOpacity={0.85}
                      onPress={() => router.push(('/challenge?id=' + r._id + '&src=mongo') as any)}>
                      {w0 ? <Image source={{ uri: streetViewUrl(w0.lat, w0.lng, 200, 200) }} style={s.thumb} /> : <View style={[s.thumb, { backgroundColor: '#cbd5e1' }]} />}
                      <View style={{ flex: 1 }}>
                        <Text style={[s.cardTitle, { color: text }, align]} numberOfLines={1}>{r.name}</Text>
                        <Text style={[s.cardBody, { color: sub }, align]}>{r.totalKm} {t.km} · {(r.waypoints || []).length} pts</Text>
                      </View>
                      <View style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}><ChevronRight size={18} color={sub} /></View>
                    </TouchableOpacity>
                  );
                })}
              </>
            )}

            {/* (Anciens défis intégrés migrés en base → inclus dans la section courses) */}
            {!news.length && !races.length && <Text style={[s.cardBody, { color: sub, marginTop: 18, textAlign: 'center' }]}>{t.empty}</Text>}
          </>
        )}
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
  secHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22, marginBottom: 10 },
  secTitle: { fontSize: 16, fontWeight: '800' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 13, marginBottom: 9 },
  iconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(46,139,87,0.12)', alignItems: 'center', justifyContent: 'center' },
  thumb: { width: 52, height: 52, borderRadius: 12 },
  newsImg: { width: '100%', height: 130, borderRadius: 12, marginBottom: 10 },
  cardTitle: { fontSize: 14.5, fontWeight: '800' },
  cardBody: { fontSize: 12.5, marginTop: 3, lineHeight: 17 },
});
