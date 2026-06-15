// Onglet 🏆 DÉFIS — le différenciateur de Salorie en navigation primaire (pattern
// leaders : Yazio→Jeûne, NRC→Plans). Hub qui PRÉVISUALISE et renvoie vers les
// écrans existants (zéro duplication de logique) : courses virtuelles (photos),
// mes médailles, journal/actus, agenda. Trilingue + dark + RTL.
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { Trophy, Flag, Newspaper, CalendarDays, ChevronRight, Award, MapPin, Users, Activity } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import Medal from '../../components/Medal';
import { getActiveRaces, getMyMedals, getNews } from '../../lib/racesApi';
import { CHALLENGES, streetViewUrl, getMyChallengeProgress } from '../../lib/races';
import { poiPhoto } from '../../assets/challenges/registry';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';

const GREEN = '#2E8B57';

const TXT: any = {
  en: { title: 'Challenges', sub: 'Virtual races, medals and news.', races: 'Virtual races', medals: 'My medals', news: 'News', agenda: 'Sport agenda', solo: 'Solo run (GPS)', journal: 'Journal & news', social: 'Social & friends', activity: 'Activity', seeAll: 'See all', km: 'km', noMedals: 'Finish a race to earn your first medal!', join: 'Open' },
  fr: { title: 'Défis', sub: 'Courses virtuelles, médailles et actus.', races: 'Courses virtuelles', medals: 'Mes médailles', news: 'Actualités', agenda: 'Agenda sport', solo: 'Course solo (GPS)', journal: 'Journal & actus', social: 'Social & amis', activity: 'Activité', seeAll: 'Voir tout', km: 'km', noMedals: 'Termine une course pour gagner ta première médaille !', join: 'Ouvrir' },
  ar: { title: 'التحديات', sub: 'سباقات افتراضية وميداليات وأخبار.', races: 'سباقات افتراضية', medals: 'ميدالياتي', news: 'الأخبار', agenda: 'أجندة الرياضة', solo: 'جري فردي (GPS)', journal: 'اليوميات والأخبار', social: 'المجتمع والأصدقاء', activity: 'النشاط', seeAll: 'عرض الكل', km: 'كلم', noMedals: 'أكمل سباقاً لتفوز بأول ميدالية!', join: 'افتح' },
};

export default function DefisTab() {
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress || '';
  const { resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';
  const bg = isDark ? '#0B0E12' : '#f7faf8';
  const card = isDark ? '#1e293b' : '#ffffff';
  const text = isDark ? '#f1f5f9' : '#0f172a';
  const sub = isDark ? '#94a3b8' : '#64748b';
  const align: any = { textAlign: isRTL ? 'right' : 'left' };
  const rowDir: any = { flexDirection: isRTL ? 'row-reverse' : 'row' };

  const [races, setRaces] = useState<any[]>([]);
  const [medals, setMedals] = useState<any[]>([]);
  const [news, setNews] = useState<any[]>([]);
  const [progress, setProgress] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    let alive = true;
    Promise.allSettled([
      getActiveRaces(), getMyMedals(), getNews(),
      Promise.all(CHALLENGES.map(async (c) => [c.id, await getMyChallengeProgress(c.id, email).catch(() => null)] as const)),
    ]).then(([r, m, n, p]) => {
      if (!alive) return;
      if (r.status === 'fulfilled' && Array.isArray(r.value)) setRaces(r.value);
      if (m.status === 'fulfilled' && Array.isArray(m.value)) setMedals(m.value);
      if (n.status === 'fulfilled' && Array.isArray(n.value)) setNews(n.value.slice(0, 3));
      if (p.status === 'fulfilled') { const o: any = {}; p.value.forEach(([id, v]) => { o[id] = v; }); setProgress(o); }
    }).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [email]));

  const Section = ({ icon: Icon, label, onSeeAll }: any) => (
    <View style={[s.secHead, rowDir]}>
      <Icon size={17} color={GREEN} />
      <Text style={[s.secTitle, { color: text }]}>{label}</Text>
      <View style={{ flex: 1 }} />
      {onSeeAll && <TouchableOpacity onPress={onSeeAll}><Text style={s.seeAll}>{t.seeAll}</Text></TouchableOpacity>}
    </View>
  );

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: bg }]}>
      <ScreenTopBar />
      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        <View style={[s.head, rowDir]}>
          <Trophy size={26} color={GREEN} />
          <Text style={[s.title, { color: text }]}>{t.title}</Text>
        </View>
        <Text style={[s.sub, { color: sub }, align]}>{t.sub}</Text>

        {loading ? <ActivityIndicator size="large" color={GREEN} style={{ marginTop: 36 }} /> : (
          <>
            {/* Courses virtuelles — cartes photo horizontales */}
            <Section icon={Flag} label={t.races} onSeeAll={() => router.push('/races' as any)} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 4 }}>
              {races.map((r) => {
                const w0 = (r.waypoints || [])[0];
                return (
                  <TouchableOpacity key={r._id} activeOpacity={0.9} onPress={() => router.push(('/challenge?id=' + r._id + '&src=mongo') as any)}>
                    <View style={s.raceCard}>
                      {w0 ? <Image source={{ uri: streetViewUrl(w0.lat, w0.lng, 400, 300) }} style={s.raceImg} /> : <View style={[s.raceImg, { backgroundColor: '#cbd5e1' }]} />}
                      <View style={s.raceShade} />
                      <View style={{ position: 'absolute', top: 6, left: 6 }}>
                        <Medal width={46} {...(r.medalSpec || {})} title={r.name} km={r.totalKm} mode="template" />
                      </View>
                      <View style={s.raceTxtWrap}>
                        <Text style={s.raceName} numberOfLines={1}>{r.name}</Text>
                        <Text style={s.raceMeta}>{r.totalKm} {t.km}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
              {/* (Anciens défis intégrés migrés en base → déjà dans `races` ci-dessus) */}
            </ScrollView>

            {/* Mes médailles — bande horizontale */}
            <Section icon={Award} label={t.medals} onSeeAll={() => router.push('/medals' as any)} />
            {medals.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                {medals.slice(0, 6).map((m, i) => (
                  <TouchableOpacity key={m._id || i} onPress={() => router.push('/medals' as any)}>
                    <Medal width={92} frame={m.frame} {...(m.spec || {})} title={m.raceName} km={m.distanceKm} rank={m.rank} time={m.timeLabel} name={m.userName} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <Text style={[{ color: sub, fontSize: 13 }, align]}>{t.noMedals}</Text>
            )}

            {/* Actus */}
            {news.length > 0 && (
              <>
                <Section icon={Newspaper} label={t.news} onSeeAll={() => router.push('/journal' as any)} />
                {news.map((n) => (
                  <TouchableOpacity key={n._id} style={[s.newsRow, { backgroundColor: card }, rowDir]} activeOpacity={0.85} onPress={() => router.push('/journal' as any)}>
                    {n.imageUrl ? <Image source={{ uri: n.imageUrl }} style={s.newsThumb} /> : <View style={[s.newsThumb, { backgroundColor: 'rgba(46,139,87,0.12)', alignItems: 'center', justifyContent: 'center' }]}><Newspaper size={18} color={GREEN} /></View>}
                    <View style={{ flex: 1 }}>
                      <Text style={[{ color: text, fontWeight: '800', fontSize: 13.5 }, align]} numberOfLines={1}>{n.title}</Text>
                      {n.body ? <Text style={[{ color: sub, fontSize: 12, marginTop: 2 }, align]} numberOfLines={1}>{n.body}</Text> : null}
                    </View>
                    <ChevronRight size={16} color={sub} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
                  </TouchableOpacity>
                ))}
              </>
            )}

            {/* Course solo (GPS) — déplacée depuis Coach pour regrouper le sport ici */}
            <TouchableOpacity style={[s.soloCta, rowDir]} activeOpacity={0.85} onPress={() => router.push('/run' as any)}>
              <MapPin size={20} color={GREEN} />
              <Text style={[s.soloTxt, { color: text }]}>{t.solo}</Text>
              <ChevronRight size={18} color={sub} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
            </TouchableOpacity>

            {/* Agenda */}
            <TouchableOpacity style={[s.agendaCta, rowDir]} activeOpacity={0.85} onPress={() => router.push('/sport-agenda' as any)}>
              <CalendarDays size={20} color="#fff" />
              <Text style={s.agendaTxt}>{t.agenda}</Text>
              <ChevronRight size={18} color="#fff" style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
            </TouchableOpacity>

            {/* Journal & actus + Social & amis (Activité a été déplacée dans l'Accueil) */}
            <View style={[s.dualRow, rowDir]}>
              <TouchableOpacity style={[s.dualCard, { backgroundColor: card }]} activeOpacity={0.85} onPress={() => router.push('/journal' as any)}>
                <Newspaper size={22} color={GREEN} />
                <Text style={[s.dualTxt, { color: text }]} numberOfLines={2}>{t.journal}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.dualCard, { backgroundColor: card }]} activeOpacity={0.85} onPress={() => router.push('/social' as any)}>
                <Users size={22} color={GREEN} />
                <Text style={[s.dualTxt, { color: text }]} numberOfLines={2}>{t.social}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  body: { padding: 18, paddingBottom: 130 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 24, fontWeight: '900', letterSpacing: -0.4 },
  sub: { fontSize: 13.5, marginTop: 6, lineHeight: 19 },
  secHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22, marginBottom: 12 },
  secTitle: { fontSize: 16, fontWeight: '800' },
  seeAll: { color: GREEN, fontWeight: '800', fontSize: 12.5 },
  raceCard: { width: 190, height: 130, borderRadius: 18, overflow: 'hidden' },
  raceImg: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  raceShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.30)' },
  raceTxtWrap: { position: 'absolute', left: 10, right: 10, bottom: 8 },
  raceName: { color: '#fff', fontWeight: '900', fontSize: 13.5, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 },
  raceMeta: { color: 'rgba(255,255,255,0.9)', fontWeight: '700', fontSize: 11.5, marginTop: 1 },
  newsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, padding: 10, marginBottom: 8 },
  newsThumb: { width: 44, height: 44, borderRadius: 10 },
  agendaCta: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: GREEN, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16, marginTop: 12 },
  agendaTxt: { color: '#fff', fontWeight: '800', fontSize: 14.5, flex: 1 },
  soloCta: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16, marginTop: 22, borderWidth: 1.5, borderColor: GREEN },
  soloTxt: { fontWeight: '800', fontSize: 14.5, flex: 1 },
  dualRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  dualCard: { flex: 1, borderRadius: 16, paddingVertical: 18, paddingHorizontal: 14, alignItems: 'center', gap: 8, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  dualTxt: { fontWeight: '800', fontSize: 13.5, textAlign: 'center' },
});
