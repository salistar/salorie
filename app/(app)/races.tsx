import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, TextInput, ActivityIndicator, Image } from 'react-native';
import { router } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { ArrowLeft, Trophy, Users, Plus, ChevronRight, MapPin, CheckCircle2 } from 'lucide-react-native';
import { poiPhoto } from '../../assets/challenges/registry';
import Medal from '../../components/Medal';

// Thème de cadre médaille par défi (couleurs variées ; sinon l'id → palette défaut).
const CH_FRAME: Record<string, string> = { 'casa-loop': 'casablanca', 'paris-marathon': 'rabat', 'great-wall': 'meknes', 'route66': 'merzouga' };
import { Colors } from '../../constants/Colors';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import {
  listenOpenRaces, createRace, joinRace,
  CHALLENGES, getMyChallengeProgress, joinChallenge,
  Race, streetViewUrl,
} from '../../lib/races';
import { getActiveRaces } from '../../lib/racesApi';

const PRIMARY = Colors.light.primary;

const TXT: Record<string, any> = {
  en: {
    title: 'Races',
    tabGroup: 'Group races',
    tabChallenges: 'Virtual challenges',
    createRace: '+ Create race',
    raceName: 'Race name',
    raceNamePh: 'e.g. Morning sprint',
    goal: 'Goal',
    km: 'km',
    create: 'Create',
    cancel: 'Cancel',
    join: 'Join',
    open: 'Open',
    live: 'Live',
    done: 'Done',
    by: 'by',
    progress: 'Progress',
    notStarted: 'Not started',
    emptyRaces: 'No open races yet. Create one and invite your friends!',
    emptyChallenges: 'No challenges available.',
  },
  fr: {
    title: 'Courses',
    tabGroup: 'Courses de groupe',
    tabChallenges: 'Défis virtuels',
    createRace: '+ Créer une course',
    raceName: 'Nom de la course',
    raceNamePh: 'ex. Sprint du matin',
    goal: 'Objectif',
    km: 'km',
    create: 'Créer',
    cancel: 'Annuler',
    join: 'Rejoindre',
    open: 'Ouverte',
    live: 'En direct',
    done: 'Terminée',
    by: 'par',
    progress: 'Progression',
    notStarted: 'Pas commencé',
    emptyRaces: 'Aucune course ouverte. Crées-en une et invite tes amis !',
    emptyChallenges: 'Aucun défi disponible.',
  },
  ar: {
    title: 'السباقات',
    tabGroup: 'سباقات جماعية',
    tabChallenges: 'تحديات افتراضية',
    createRace: '+ إنشاء سباق',
    raceName: 'اسم السباق',
    raceNamePh: 'مثال: سباق الصباح',
    goal: 'الهدف',
    km: 'كم',
    create: 'إنشاء',
    cancel: 'إلغاء',
    join: 'انضمام',
    open: 'مفتوح',
    live: 'مباشر',
    done: 'منتهٍ',
    by: 'بواسطة',
    progress: 'التقدّم',
    notStarted: 'لم يبدأ',
    emptyRaces: 'لا توجد سباقات مفتوحة بعد. أنشئ واحداً وادعُ أصدقاءك!',
    emptyChallenges: 'لا توجد تحديات متاحة.',
  },
};

export default function RacesScreen() {
  const { user } = useUser();
  const { resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';

  const email = user?.primaryEmailAddress?.emailAddress || '';
  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || (email ? email.split('@')[0] : '');

  const [tab, setTab] = useState<'group' | 'challenges'>('group');

  // Group races
  const [races, setRaces] = useState<Race[]>([]);
  const [loadingRaces, setLoadingRaces] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [raceName, setRaceName] = useState('');
  const [goalKm, setGoalKm] = useState('5');
  const [creating, setCreating] = useState(false);

  // Challenges
  const [progress, setProgress] = useState<Record<string, number | null>>({});
  const [loadingChallenges, setLoadingChallenges] = useState(true);
  const [activeRaces, setActiveRaces] = useState<any[]>([]); // courses admin (Mongo)
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setLoadingRaces(true);
    const unsub = listenOpenRaces((list) => {
      setRaces(list);
      setLoadingRaces(false);
    });
    return () => { unsub && unsub(); };
  }, []);

  const loadProgress = useCallback(async () => {
    if (!email) { setLoadingChallenges(false); return; }
    try {
      const entries = await Promise.all(
        CHALLENGES.map(async (c) => [c.id, await getMyChallengeProgress(c.id, email)] as const)
      );
      const next: Record<string, number | null> = {};
      entries.forEach(([id, p]) => { next[id] = p; });
      setProgress(next);
    } catch (e) {
      console.warn('[races] challenge progress failed', e);
    } finally {
      setLoadingChallenges(false);
    }
  }, [email]);

  useEffect(() => { loadProgress(); }, [loadProgress]);
  // Courses créées depuis l'admin (Mongo) — jouables via le MÊME écran défi.
  useEffect(() => { getActiveRaces().then((r: any) => { if (Array.isArray(r)) setActiveRaces(r); }).catch(() => {}); }, []);

  const onCreate = async () => {
    if (!raceName.trim() || creating) return;
    setCreating(true);
    try {
      const goal = Math.max(1, Number(goalKm) || 5);
      const id = await createRace(email, displayName, raceName.trim(), goal);
      setShowForm(false); setRaceName(''); setGoalKm('5');
      router.push('/race-live?id=' + id);
    } catch (e) {
      console.warn('[races] create failed', e);
    } finally {
      setCreating(false);
    }
  };

  const onJoinRace = async (race: Race) => {
    try {
      await joinRace(race.id, email, displayName);
      router.push('/race-live?id=' + race.id);
    } catch (e) {
      console.warn('[races] join failed', e);
    }
  };

  const onJoinChallenge = async (id: string) => {
    if (busy[id]) return;
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      await joinChallenge(id, email, displayName);
      setProgress((p) => ({ ...p, [id]: 0 }));
    } catch (e) {
      console.warn('[races] join challenge failed', e);
    } finally {
      setBusy((b) => ({ ...b, [id]: false }));
    }
  };

  const text = isDark ? '#fff' : Colors.light.gray[900];
  const sub = isDark ? '#9BA1A6' : Colors.light.gray[500];
  const card = isDark ? Colors.dark.card : '#fff';
  const bg = isDark ? '#000' : '#fff';
  const track = isDark ? Colors.dark.gray[100] : Colors.light.gray[200];
  const rowDir = isRTL ? 'row-reverse' : 'row';
  const align: any = isRTL ? 'right' : 'left';

  const statusLabel = (s: Race['status']) => (s === 'live' ? t.live : s === 'done' ? t.done : t.open);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      {/* Header */}
      <View style={[styles.header, { flexDirection: rowDir }]}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: card }]} onPress={() => router.back()}>
          <ArrowLeft size={22} color={text} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: text }]}>{t.title}</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Tabs */}
      <View style={[styles.tabs, { flexDirection: rowDir }]}>
        <TouchableOpacity style={[styles.tab, tab === 'group' && styles.tabActive]} onPress={() => setTab('group')}>
          <Users size={18} color={tab === 'group' ? PRIMARY : sub} />
          <Text style={[styles.tabTxt, { color: tab === 'group' ? PRIMARY : sub }]} numberOfLines={1}>{t.tabGroup}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === 'challenges' && styles.tabActive]} onPress={() => setTab('challenges')}>
          <Trophy size={18} color={tab === 'challenges' ? PRIMARY : sub} />
          <Text style={[styles.tabTxt, { color: tab === 'challenges' ? PRIMARY : sub }]} numberOfLines={1}>{t.tabChallenges}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {tab === 'group' ? (
          <>
            {/* Création de courses désormais UNIQUEMENT depuis le back-office web. */}

            {/* Race list */}
            {loadingRaces ? (
              <View style={styles.loadingBox}><ActivityIndicator size="large" color={PRIMARY} /></View>
            ) : races.length === 0 ? (
              <View style={[styles.emptyBox, { backgroundColor: card }]}>
                <Users size={36} color={Colors.light.gray[300]} />
                <Text style={[styles.emptySub, { color: sub }]}>{t.emptyRaces}</Text>
              </View>
            ) : (
              races.map((r) => (
                <TouchableOpacity key={r.id} style={[styles.raceRow, { backgroundColor: card, flexDirection: rowDir }]} onPress={() => onJoinRace(r)}>
                  {/* Visuel : pastille dégradée avec icône (cartes plus vivantes) */}
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: r.status === 'live' ? '#dcfce7' : '#EAF4EE', alignItems: 'center', justifyContent: 'center' }}>
                    <Users size={20} color={PRIMARY} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.raceName, { color: text, textAlign: align }]} numberOfLines={1}>{r.name}</Text>
                    <Text style={[styles.raceMeta, { color: sub, textAlign: align }]} numberOfLines={1}>
                      {r.createdByName ? `${t.by} ${r.createdByName} · ` : ''}{t.goal} {r.goalKm} {t.km}
                    </Text>
                  </View>
                  <View style={[styles.badge, r.status === 'live' && styles.badgeLive]}>
                    <Text style={[styles.badgeTxt, r.status === 'live' && { color: '#fff' }]}>{statusLabel(r.status)}</Text>
                  </View>
                  <ChevronRight size={20} color={sub} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
                </TouchableOpacity>
              ))
            )}
          </>
        ) : (
          <>
            {/* Challenges */}
            {/* Courses créées depuis l'admin (Mongo) — médaille = le modèle conçu */}
            {activeRaces.map((r) => {
              const stops = (r.waypoints || []).length;
              const w0 = (r.waypoints || [])[0];
              return (
                <TouchableOpacity key={r._id} activeOpacity={0.9} style={[styles.challengeCard, { backgroundColor: card }]} onPress={() => router.push('/challenge?id=' + r._id + '&src=mongo')}>
                  <View style={styles.heroWrap}>
                    {/* Photo héro = Street View du départ ; badge = la MÉDAILLE (pas d'émoji). */}
                    {w0 ? <Image source={{ uri: streetViewUrl(w0.lat, w0.lng, 640, 400) }} style={styles.hero} resizeMode="cover" /> : <View style={[styles.hero, { backgroundColor: '#dbe4ee' }]} />}
                    <View style={styles.heroShade} />
                    <View style={{ position: 'absolute', top: 6, left: 8 }}>
                      <Medal width={62} {...(r.medalSpec || {})} title={r.name} km={r.totalKm} />
                    </View>
                    <View style={[styles.heroBottom, { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.heroName} numberOfLines={1}>{r.name}</Text>
                        <View style={styles.heroChips}>
                          <View style={styles.heroChip}><Text style={styles.heroChipTxt}>{r.totalKm} {t.km}</Text></View>
                          {stops > 0 && (<View style={styles.heroChip}><MapPin size={11} color="#fff" /><Text style={styles.heroChipTxt}> {stops}</Text></View>)}
                        </View>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
            {loadingChallenges ? (
              <View style={styles.loadingBox}><ActivityIndicator size="large" color={PRIMARY} /></View>
            ) : CHALLENGES.length === 0 ? (
              <View style={[styles.emptyBox, { backgroundColor: card }]}>
                <Trophy size={36} color={Colors.light.gray[300]} />
                <Text style={[styles.emptySub, { color: sub }]}>{t.emptyChallenges}</Text>
              </View>
            ) : (
              CHALLENGES.map((c) => {
                const p = progress[c.id];
                const joined = p != null;
                const pct = joined ? Math.min(1, (p as number) / c.totalKm) : 0;
                const done = pct >= 1;
                const hero = poiPhoto(c.id, 0);
                const stops = (c.pois as any[])?.length || 0;
                return (
                  <TouchableOpacity key={c.id} activeOpacity={0.9} style={[styles.challengeCard, { backgroundColor: card }]} onPress={() => router.push('/challenge?id=' + c.id)}>
                    {/* GRANDE photo du lieu + médaille en BADGE (coin) */}
                    <View style={styles.heroWrap}>
                      {hero ? <Image source={hero} style={styles.hero} resizeMode="cover" /> : <View style={[styles.hero, { backgroundColor: '#cbd5e1' }]} />}
                      <View style={styles.heroShade} />
                      {/* Logo (emoji) REMPLACÉ par la médaille — photo du lieu conservée */}
                      <View style={{ position: 'absolute', top: 6, left: 8 }}>
                        <Medal width={62} frame={CH_FRAME[c.id] || c.id} title={c.name} km={c.totalKm} rank={done ? 1 : undefined} />
                      </View>
                      <View style={[styles.heroBottom, { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.heroName} numberOfLines={1}>{c.name}</Text>
                          <View style={styles.heroChips}>
                            <View style={styles.heroChip}><Text style={styles.heroChipTxt}>{c.totalKm} {t.km}</Text></View>
                            {stops > 0 && (<View style={styles.heroChip}><MapPin size={11} color="#fff" /><Text style={styles.heroChipTxt}> {stops}</Text></View>)}
                            {done && (<View style={[styles.heroChip, { backgroundColor: 'rgba(34,197,94,0.9)' }]}><CheckCircle2 size={11} color="#fff" /><Text style={styles.heroChipTxt}> 100%</Text></View>)}
                          </View>
                        </View>
                      {!joined && (
                        <TouchableOpacity style={styles.joinSmall} onPress={(e) => { e.stopPropagation?.(); onJoinChallenge(c.id); }} disabled={!!busy[c.id]}>
                          {busy[c.id] ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.joinBtnTxt}>{t.join}</Text>}
                        </TouchableOpacity>
                      )}
                      </View>
                    </View>
                    {joined && (
                      <View style={styles.progressWrap}>
                        <View style={[styles.progressTrack, { backgroundColor: track }]}>
                          <View style={[styles.progressFill, { width: `${pct * 100}%`, backgroundColor: done ? '#22c55e' : PRIMARY }]} />
                        </View>
                        <Text style={[styles.progressTxt, { color: sub, textAlign: align }]}>
                          {t.progress}: {(p as number).toFixed(1)} / {c.totalKm} {t.km} · {Math.round(pct * 100)}%
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  tabs: { paddingHorizontal: 16, gap: 10, marginBottom: 6 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
  tabActive: { borderColor: PRIMARY, backgroundColor: Colors.light.primaryLight },
  tabTxt: { fontSize: 13, fontWeight: '800' },
  content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 60 },
  createBtn: { alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: PRIMARY, paddingVertical: 15, borderRadius: 16, marginBottom: 14 },
  createBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
  formCard: { borderRadius: 18, padding: 16, marginBottom: 14 },
  formLabel: { fontSize: 13, fontWeight: '700', marginBottom: 6 },
  input: { height: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, fontSize: 15, fontWeight: '600' },
  formBtns: { gap: 10, marginTop: 16 },
  ghostBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 12, borderWidth: 1.5 },
  ghostBtnTxt: { fontSize: 15, fontWeight: '800' },
  primaryBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 12, backgroundColor: PRIMARY },
  primaryBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  loadingBox: { paddingVertical: 50, alignItems: 'center' },
  emptyBox: { borderRadius: 18, padding: 28, alignItems: 'center', gap: 14, marginTop: 8 },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  raceRow: { alignItems: 'center', gap: 12, borderRadius: 16, padding: 14, marginBottom: 10 },
  raceName: { fontSize: 16, fontWeight: '800' },
  raceMeta: { fontSize: 12, marginTop: 3 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: Colors.light.primaryLight },
  badgeLive: { backgroundColor: PRIMARY },
  badgeTxt: { fontSize: 11, fontWeight: '800', color: PRIMARY },
  challengeCard: { borderRadius: 20, marginBottom: 14, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  heroWrap: { height: 150, width: '100%', justifyContent: 'flex-end' },
  hero: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  heroShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.28)' },
  heroEmoji: { position: 'absolute', top: 12, left: 12, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' },
  heroBottom: { padding: 14 },
  heroMedalWrap: { alignItems: 'center', paddingVertical: 14, backgroundColor: '#EAF4EE' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  infoName: { fontSize: 16, fontWeight: '800' },
  chipLite: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#eef2f7', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipLiteTxt: { fontSize: 12, fontWeight: '700', color: '#475569' },
  joinSmall: { backgroundColor: '#2E8B57', borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 },
  heroName: { color: '#fff', fontSize: 19, fontWeight: '900', letterSpacing: -0.3, textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 6 },
  heroChips: { flexDirection: 'row', gap: 8, marginTop: 8 },
  heroChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  heroChipTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },
  heroJoin: { position: 'absolute', top: 12, right: 12, backgroundColor: PRIMARY, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 12, minWidth: 64, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 30 },
  challengeName: { fontSize: 16, fontWeight: '800' },
  challengeMeta: { fontSize: 12, marginTop: 3 },
  joinBtn: { backgroundColor: PRIMARY, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 12, minWidth: 64, alignItems: 'center', justifyContent: 'center' },
  joinBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '800' },
  progressWrap: { padding: 14, paddingTop: 12 },
  progressTrack: { height: 10, borderRadius: 5, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 5, backgroundColor: PRIMARY },
  progressTxt: { fontSize: 12, fontWeight: '700', marginTop: 6 },
});
