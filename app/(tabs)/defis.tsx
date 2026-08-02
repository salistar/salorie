// Onglet 🏆 DÉFIS — le différenciateur de Salorie en navigation primaire (pattern
// leaders : Yazio→Jeûne, NRC→Plans). Hub qui PRÉVISUALISE et renvoie vers les
// écrans existants (zéro duplication de logique) : courses virtuelles (photos),
// mes médailles, journal/actus, agenda. Trilingue + dark + RTL.
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, Image } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { Trophy, Flag, Newspaper, ChevronRight, Award, MapPin, Users, Mountain, Ghost, Radio, Route as RouteIcon, Timer, Volleyball, Store, Moon, Swords, CalendarDays } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import Medal from '../../components/Medal';
import { getActiveRaces, getMyMedals, getNews } from '../../lib/racesApi';
import { CHALLENGES, streetViewUrl, getMyChallengeProgress } from '../../lib/races';
import { poiPhoto } from '../../assets/challenges/registry';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { useFlagsCtx } from '../../lib/FlagsContext';
import { isRouteEnabled } from '../../lib/navFlags';
import { Card, PrimaryButton, SecondaryButton, SectionHeader, EmptyState, SkeletonCard, HeroImage } from '../../components/ui';
import { spacing, radius, type } from '../../constants/theme';
import { HERO } from '../../constants/heroImages';

const TXT: any = {
  en: { title: 'Challenges', sub: 'Virtual races, medals and news.', league: 'League', races: 'Virtual races', medals: 'My medals', news: 'News', agenda: 'Sport agenda', solo: 'Solo run (GPS)', annual: 'Annual challenge', journal: 'Journal & news', social: 'Social & friends', activity: 'Activity', seeAll: 'See all', km: 'km', noMedals: 'Finish a race to earn your first medal!', join: 'Open', community: 'Community routes', ghost: 'AR ghost run', twin: 'Live twin', fasting: 'Intermittent fasting', groupSports: 'Group sports', marketplace: 'Marketplace', ramadan: 'Ramadan mode', cityChallenges: 'City vs city challenges', more: 'More' },
  fr: { title: 'Défis', sub: 'Courses virtuelles, médailles et actus.', league: 'Ligue', races: 'Courses virtuelles', medals: 'Mes médailles', news: 'Actualités', agenda: 'Agenda sport', solo: 'Course solo (GPS)', annual: 'Défi annuel', journal: 'Journal & actus', social: 'Social & amis', activity: 'Activité', seeAll: 'Voir tout', km: 'km', noMedals: 'Termine une course pour gagner ta première médaille !', join: 'Ouvrir', community: 'Parcours communautaires', ghost: 'Course fantôme AR', twin: 'Jumeau live', fasting: 'Jeûne intermittent', groupSports: 'Sports de groupe', marketplace: 'Marketplace', ramadan: 'Mode Ramadan', cityChallenges: 'Défis inter-villes', more: 'Plus' },
  ar: { title: 'التحديات', sub: 'سباقات افتراضية وميداليات وأخبار.', league: 'الدوري', races: 'سباقات افتراضية', medals: 'ميدالياتي', news: 'الأخبار', agenda: 'أجندة الرياضة', solo: 'جري فردي (GPS)', annual: 'تحدي السنة', journal: 'اليوميات والأخبار', social: 'المجتمع والأصدقاء', activity: 'النشاط', seeAll: 'عرض الكل', km: 'كلم', noMedals: 'أكمل سباقاً لتفوز بأول ميدالية!', join: 'افتح', community: 'مسارات المجتمع', ghost: 'جري الشبح AR', twin: 'التوأم المباشر', fasting: 'الصيام المتقطع', groupSports: 'الرياضات الجماعية', marketplace: 'السوق', ramadan: 'وضع رمضان', cityChallenges: 'تحديات بين المدن', more: 'المزيد' },
};

export default function DefisTab() {
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress || '';
  const { colors, resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  // Feature-flags lus UNE fois (pas de hook dans les .map) — masque les tuiles OFF.
  const { flags } = useFlagsCtx();
  const routeOn = (route: string) => isRouteEnabled(flags, route);
  const t = TXT[language] || TXT.en;
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

  // Tuile compacte 2 colonnes (grille) — un seul langage pour tous les modes du hub.
  const Tile = ({ icon: Icon, label, onPress }: any) => (
    <TouchableOpacity style={{ flex: 1 }} activeOpacity={0.85} onPress={onPress}>
      <Card variant="raised" padded={false} style={{ padding: spacing.lg, gap: spacing.sm, alignItems: 'center', minHeight: 96, justifyContent: 'center' }}>
        <View style={{ width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={20} color={colors.primary} />
        </View>
        <Text style={{ ...(type.sub as any), color: colors.gray[900], textAlign: 'center' }} numberOfLines={2}>{label}</Text>
      </Card>
    </TouchableOpacity>
  );

  // Grille 2 colonnes construite depuis un tableau (déjà filtré par flag). La section
  // ENTIÈRE (titre inclus) disparaît si aucune tuile ne reste ; on ajoute un intercalaire
  // vide quand une ligne n'a qu'une tuile → la grille ne casse pas (Tile = flex:1).
  const renderTileGrid = (
    title: string,
    HeaderIcon: any,
    tiles: { icon: any; label: string; route: string }[],
    headerIconNode?: React.ReactNode,
  ) => {
    if (!tiles.length) return null;
    const rows: (typeof tiles)[] = [];
    for (let i = 0; i < tiles.length; i += 2) rows.push(tiles.slice(i, i + 2));
    return (
      <>
        <SectionHeader title={title} icon={headerIconNode || <HeaderIcon size={18} color={colors.primary} />} />
        <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md }}>
          {rows.map((row, ri) => (
            <View key={ri} style={[s.tileRow, rowDir]}>
              {row.map((tl) => (
                <Tile key={tl.route} icon={tl.icon} label={tl.label} onPress={() => router.push(tl.route as any)} />
              ))}
              {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
            </View>
          ))}
        </View>
      </>
    );
  };

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.gray[50] }]}>
      <ScreenTopBar />
      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: spacing.xl }}>
          <HeroImage source={HERO.defis} height={170} eyebrow={t.sub} title={t.title} />
        </View>

        {loading ? (
          <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.xl }}>
            <SkeletonCard height={120} />
            <SkeletonCard height={96} />
          </View>
        ) : (
          <>
            {/* CTA phares : Ligue (rétention → flag 'social') + Course solo (sport → flag 'run') */}
            {(routeOn('/leagues') || routeOn('/run')) && (
              <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.xl, gap: spacing.md }}>
                {routeOn('/leagues') && <PrimaryButton title={t.league} icon={<Trophy size={20} color="#fff" />} onPress={() => router.push('/leagues' as any)} />}
                {routeOn('/run') && <SecondaryButton title={t.solo} icon={<MapPin size={20} color={colors.primary} />} onPress={() => router.push('/run' as any)} />}
              </View>
            )}

            {/* Courses virtuelles — cartes photo horizontales (flag 'races') */}
            {routeOn('/races') && (<>
            <SectionHeader title={t.races} icon={<Flag size={18} color={colors.primary} />} actionLabel={t.seeAll} onAction={() => router.push('/races' as any)} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xs, paddingHorizontal: spacing.xl }}>
              {races.map((r) => {
                const w0 = (r.waypoints || [])[0];
                return (
                  <TouchableOpacity key={r._id} activeOpacity={0.9} onPress={() => router.push(('/challenge?id=' + r._id + '&src=mongo') as any)}>
                    <View style={s.raceCard}>
                      {w0 ? <Image source={{ uri: streetViewUrl(w0.lat, w0.lng, 400, 300) }} style={s.raceImg} /> : <View style={[s.raceImg, { backgroundColor: colors.gray[200] }]} />}
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
            </>)}

            {/* Mes médailles — bande horizontale (flag 'medals') */}
            {routeOn('/medals') && (<>
            <SectionHeader title={t.medals} icon={<Award size={18} color={colors.primary} />} actionLabel={t.seeAll} onAction={() => router.push('/medals' as any)} />
            {medals.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.xl }}>
                {medals.slice(0, 6).map((m, i) => (
                  <TouchableOpacity key={m._id || i} onPress={() => router.push('/medals' as any)}>
                    <Medal width={92} frame={m.frame} {...(m.spec || {})} title={m.raceName} km={m.distanceKm} rank={m.rank} time={m.timeLabel} name={m.userName} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <View style={{ paddingHorizontal: spacing.xl }}>
                <EmptyState icon={<Award size={26} color={colors.primary} />} title={t.medals} subtitle={t.noMedals} ctaLabel={t.races} onCta={() => router.push('/races' as any)} />
              </View>
            )}
            </>)}

            {/* Actus */}
            {news.length > 0 && (
              <>
                <SectionHeader title={t.news} icon={<Newspaper size={18} color={colors.primary} />} actionLabel={t.seeAll} onAction={() => router.push('/journal' as any)} />
                <View style={{ paddingHorizontal: spacing.xl, gap: spacing.sm }}>
                  {news.map((n) => (
                    <TouchableOpacity key={n._id} activeOpacity={0.85} onPress={() => router.push('/journal' as any)}>
                      <Card variant="flat" padded={false} style={[{ padding: spacing.md, alignItems: 'center', gap: spacing.md }, rowDir]}>
                        {n.imageUrl ? <Image source={{ uri: n.imageUrl }} style={s.newsThumb} /> : <View style={[s.newsThumb, { backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' }]}><Newspaper size={18} color={colors.primary} /></View>}
                        <View style={{ flex: 1 }}>
                          <Text style={[{ ...(type.cardTitle as any), color: colors.gray[900], fontSize: 13.5 }, align]} numberOfLines={1}>{n.title}</Text>
                          {n.body ? <Text style={[{ ...(type.micro as any), color: colors.gray[500], marginTop: 2 }, align]} numberOfLines={1}>{n.body}</Text> : null}
                        </View>
                        <ChevronRight size={16} color={colors.gray[400]} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
                      </Card>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* Sport solo & modes avancés — grille compacte 2 colonnes (tuiles OFF masquées) */}
            {(() => {
              const tiles = [
                { icon: Mountain, label: t.annual, route: '/annual-challenge' },
                { icon: Timer, label: t.fasting, route: '/fasting' },
                { icon: Ghost, label: t.ghost, route: '/ar-ghost' },
                { icon: Radio, label: t.twin, route: '/live-twin' },
                { icon: Moon, label: t.ramadan, route: '/ramadan' },
                { icon: CalendarDays, label: t.agenda, route: '/sport-agenda' },
              ].filter((tl) => routeOn(tl.route));
              return renderTileGrid(t.activity, Mountain, tiles);
            })()}

            {/* Communauté & social — grille compacte 2 colonnes (tuiles OFF masquées) */}
            {(() => {
              const tiles = [
                { icon: RouteIcon, label: t.community, route: '/community-routes' },
                { icon: Swords, label: t.cityChallenges, route: '/city-challenges' },
                { icon: Volleyball, label: t.groupSports, route: '/group-sports' },
                { icon: Store, label: t.marketplace, route: '/marketplace' },
                { icon: Newspaper, label: t.journal, route: '/journal' },
                { icon: Users, label: t.social, route: '/social' },
              ].filter((tl) => routeOn(tl.route));
              return renderTileGrid(t.social, Users, tiles, <Users size={18} color={colors.primary} />);
            })()}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  body: { paddingTop: spacing.md, paddingBottom: 130 },
  tileRow: { flexDirection: 'row', gap: spacing.md },
  raceCard: { width: 190, height: 130, borderRadius: radius.lg, overflow: 'hidden' },
  raceImg: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  raceShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.30)' },
  raceTxtWrap: { position: 'absolute', left: 10, right: 10, bottom: 8 },
  raceName: { color: '#fff', fontWeight: '900', fontSize: 13.5, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 },
  raceMeta: { color: 'rgba(255,255,255,0.9)', fontWeight: '700', fontSize: 11.5, marginTop: 1 },
  newsThumb: { width: 44, height: 44, borderRadius: radius.sm },
});
