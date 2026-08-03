// Sports de groupe — liste des matchs par sport, filtre par discipline, bouton Créer,
// et Rejoindre/Quitter. Renvoie aussi vers la réservation de terrain. Firestore best-effort.
import ScreenTopBar from '../../components/ScreenTopBar';
import React, { useCallback, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SkeletonCard, Skeleton, PrimaryButton, SecondaryButton } from '../../components/ui';
import { router, useFocusEffect } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import {
  ArrowLeft, Plus, Users, MapPin, CalendarClock, Check, X, CalendarRange,
} from 'lucide-react-native';
import PerfList from '../../components/PerfList';
import { Colors } from '../../constants/Colors';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { rowDir, txtAlign, flipForRTL } from '../../lib/rtl';
import {
  listMatches, joinMatch, leaveMatch, SportMatch, Sport, SPORTS,
} from '../../lib/groupSports';
import { emailToDocId } from '../../lib/firebase';

const PRIMARY = Colors.light.primary;

const SPORT_EMOJI: Record<Sport, string> = {
  football: '⚽', tennis: '🎾', basketball: '🏀', volleyball: '🏐',
  badminton: '🏸', running: '🏃', padel: '🥎', other: '🤸',
};

const TXT: Record<string, any> = {
  en: {
    title: 'Group sports',
    sub: 'Find a match near you or create your own.',
    create: 'Create a match',
    reserve: 'Reserve a field',
    all: 'All',
    empty: 'No upcoming match. Be the first to create one!',
    join: 'Join', leave: 'Leave', full: 'Full', cancelled: 'Cancelled', done: 'Done',
    spots: 'spots', spotsLeft: 'spots left', host: 'Host',
    joined: 'You are in!', left: 'You left the match.', matchFull: 'This match is full.',
    error: 'Something went wrong. Please try again.',
    sports: {
      football: 'Football', tennis: 'Tennis', basketball: 'Basketball', volleyball: 'Volleyball',
      badminton: 'Badminton', running: 'Running', padel: 'Padel', other: 'Other',
    },
  },
  fr: {
    title: 'Sports de groupe',
    sub: 'Trouve un match près de chez toi ou crée le tien.',
    create: 'Créer un match',
    reserve: 'Réserver un terrain',
    all: 'Tous',
    empty: 'Aucun match à venir. Sois le premier à en créer un !',
    join: 'Rejoindre', leave: 'Quitter', full: 'Complet', cancelled: 'Annulé', done: 'Terminé',
    spots: 'places', spotsLeft: 'places restantes', host: 'Organisateur',
    joined: 'Tu es inscrit !', left: 'Tu as quitté le match.', matchFull: 'Ce match est complet.',
    error: 'Une erreur est survenue. Réessaie.',
    sports: {
      football: 'Football', tennis: 'Tennis', basketball: 'Basketball', volleyball: 'Volley-ball',
      badminton: 'Badminton', running: 'Course', padel: 'Padel', other: 'Autre',
    },
  },
  ar: {
    title: 'الرياضات الجماعية',
    sub: 'اعثر على مباراة قربك أو أنشئ مباراتك.',
    create: 'إنشاء مباراة',
    reserve: 'حجز ملعب',
    all: 'الكل',
    empty: 'لا توجد مباراة قادمة. كن أول من ينشئ واحدة!',
    join: 'انضم', leave: 'غادر', full: 'مكتمل', cancelled: 'ملغى', done: 'انتهى',
    spots: 'أماكن', spotsLeft: 'أماكن متبقية', host: 'المنظم',
    joined: 'تم تسجيلك!', left: 'غادرت المباراة.', matchFull: 'المباراة مكتملة.',
    error: 'حدث خطأ ما. حاول مرة أخرى.',
    sports: {
      football: 'كرة القدم', tennis: 'التنس', basketball: 'كرة السلة', volleyball: 'الكرة الطائرة',
      badminton: 'الريشة', running: 'الجري', padel: 'بادل', other: 'أخرى',
    },
  },
};

export default function GroupSportsScreen() {
  const { user } = useUser();
  const { resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';
  const styles = useMemo(() => makeStyles(isDark), [isDark]);

  const email = user?.primaryEmailAddress?.emailAddress || '';
  const myUid = emailToDocId(email);

  const [filter, setFilter] = useState<Sport | 'all'>('all');
  const [matches, setMatches] = useState<SportMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const align = txtAlign(isRTL);
  const dir = rowDir(isRTL);

  const text = isDark ? '#fff' : Colors.light.gray[900];
  const sub = isDark ? '#9BA1A6' : Colors.light.gray[500];
  const card = isDark ? Colors.dark.card : '#fff';
  const bg = isDark ? '#0f1419' : '#fff';
  const chipBg = isDark ? Colors.dark.gray[100] : Colors.light.gray[100];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listMatches({
        sport: filter === 'all' ? undefined : filter,
        upcoming: true,
      });
      setMatches(rows);
    } catch (e) {
      console.warn('[group-sports] load failed', e);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onJoin = async (m: SportMatch) => {
    if (busy) return;
    setNotice(null);
    setBusy(m.id);
    try {
      const res = await joinMatch(email, m.id);
      if (res.ok) setNotice(t.joined);
      else if (res.reason === 'full') setNotice(t.matchFull);
      else setNotice(t.error);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const onLeave = async (m: SportMatch) => {
    if (busy) return;
    setNotice(null);
    setBusy(m.id);
    try {
      const res = await leaveMatch(email, m.id);
      if (res.ok) setNotice(t.left);
      else setNotice(t.error);
      await load();
    } finally {
      setBusy(null);
    }
  };

  const dateLabel = (ts: number) => {
    try {
      const d = new Date(ts);
      const locale = language === 'ar' ? 'ar' : language === 'fr' ? 'fr-FR' : 'en-US';
      return d.toLocaleString(locale, {
        weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  const filters: Array<Sport | 'all'> = ['all', ...SPORTS];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <ScreenTopBar />
      <View style={[styles.header, { flexDirection: dir }]}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: card }]} onPress={() => router.back()}>
          <ArrowLeft size={22} color={text} style={flipForRTL(isRTL)} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: text }]} numberOfLines={1}>{t.title}</Text>
        <View style={styles.backBtn} />
      </View>

      {/* PerfList : la grille de matchs était rendue par `.map()` DANS un ScrollView,
          donc sans aucune virtualisation — les 100 matchs (limite Firestore) étaient
          montés d'un coup. Tout ce qui précédait la liste devient ListHeaderComponent :
          on garde un seul conteneur défilant, sans imbriquer de liste virtualisée. */}
      <PerfList
        data={loading ? [] : matches}
        keyExtractor={(m: SportMatch) => m.id}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
        <Text style={[styles.sub, { color: sub, textAlign: align }]}>{t.sub}</Text>

        {/* Actions : Créer un match + Réserver un terrain */}
        <View style={[styles.actionsRow, { flexDirection: dir }]}>
          <PrimaryButton
            title={t.create}
            icon={<Plus size={18} color="#fff" />}
            full
            onPress={() => router.push('/match-create' as any)}
            style={{ flex: 1 }}
          />
          <SecondaryButton
            title={t.reserve}
            icon={<CalendarRange size={18} color={PRIMARY} />}
            full
            onPress={() => router.push('/field-reserve' as any)}
            style={{ flex: 1 }}
          />
        </View>

        {/* Filtre par sport */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow}>
          {filters.map((f) => {
            const active = filter === f;
            const label = f === 'all' ? t.all : `${SPORT_EMOJI[f]} ${t.sports[f]}`;
            return (
              <TouchableOpacity
                key={f}
                style={[styles.chip, { backgroundColor: active ? PRIMARY : chipBg }]}
                activeOpacity={0.85}
                onPress={() => setFilter(f)}
              >
                <Text style={[styles.chipTxt, { color: active ? '#fff' : text }]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {notice && (
          <View style={[styles.noticeBox, { backgroundColor: isDark ? Colors.dark.primaryLight : Colors.light.primaryLight }]}>
            <Text style={[styles.noticeTxt, { textAlign: align }]}>{notice}</Text>
          </View>
        )}
          </>
        }
        ListEmptyComponent={
          loading ? (
          <View style={{ marginTop: 8 }}>
            <Skeleton width="45%" height={14} style={{ marginBottom: 12 }} />
            <SkeletonCard height={150} />
            <SkeletonCard height={150} />
            <SkeletonCard height={150} />
          </View>
          ) : (
          <View style={[styles.emptyBox, { backgroundColor: card }]}>
            <Users size={34} color={isDark ? Colors.dark.gray[300] : Colors.light.gray[300]} />
            <Text style={[styles.emptySub, { color: sub }]}>{t.empty}</Text>
          </View>
          )
        }
        renderItem={({ item: m }: { item: SportMatch }) => {
            const joined = m.participants.includes(myUid);
            const isHost = m.hostUid === myUid;
            const spotsLeft = Math.max(0, m.capacity - m.participants.length);
            const isFull = m.status === 'full' || spotsLeft <= 0;
            return (
              <View key={m.id} style={[styles.matchCard, { backgroundColor: card }]}>
                <View style={[styles.matchTop, { flexDirection: dir }]}>
                  <View style={[styles.sportBadge, { backgroundColor: isDark ? Colors.dark.primaryLight : Colors.light.primaryLight }]}>
                    <Text style={styles.sportEmoji}>{SPORT_EMOJI[m.sport]}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.matchTitle, { color: text, textAlign: align }]} numberOfLines={1}>{m.title}</Text>
                    <Text style={[styles.matchSport, { color: PRIMARY, textAlign: align }]} numberOfLines={1}>
                      {t.sports[m.sport]}{isHost ? ` · ${t.host}` : ''}
                    </Text>
                  </View>
                </View>

                <View style={[styles.metaRow, { flexDirection: dir }]}>
                  <CalendarClock size={15} color={sub} />
                  <Text style={[styles.metaTxt, { color: sub, textAlign: align }]} numberOfLines={1}>
                    {dateLabel(m.dateTs)} · {m.durationMin} min
                  </Text>
                </View>
                <View style={[styles.metaRow, { flexDirection: dir }]}>
                  <MapPin size={15} color={sub} />
                  <Text style={[styles.metaTxt, { color: sub, textAlign: align }]} numberOfLines={1}>{m.placeName}</Text>
                </View>
                <View style={[styles.metaRow, { flexDirection: dir }]}>
                  <Users size={15} color={sub} />
                  <Text style={[styles.metaTxt, { color: sub, textAlign: align }]} numberOfLines={1}>
                    {m.participants.length}/{m.capacity} {t.spots}
                    {!isFull ? ` · ${spotsLeft} ${t.spotsLeft}` : ''}
                  </Text>
                </View>

                {/* Bouton d'action */}
                {joined ? (
                  <TouchableOpacity
                    style={[styles.leaveBtn, { flexDirection: dir }]}
                    activeOpacity={0.85}
                    disabled={busy === m.id}
                    onPress={() => onLeave(m)}
                  >
                    {busy === m.id
                      ? <ActivityIndicator size="small" color="#ef4444" />
                      : (<><X size={16} color="#ef4444" /><Text style={styles.leaveTxt}>{t.leave}</Text></>)}
                  </TouchableOpacity>
                ) : isFull ? (
                  <View style={[styles.fullPill, { flexDirection: dir }]}>
                    <Text style={styles.fullTxt}>{t.full}</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.joinBtn, { flexDirection: dir }]}
                    activeOpacity={0.85}
                    disabled={busy === m.id}
                    onPress={() => onJoin(m)}
                  >
                    {busy === m.id
                      ? <ActivityIndicator size="small" color="#fff" />
                      : (<><Check size={16} color="#fff" /><Text style={styles.joinTxt}>{t.join}</Text></>)}
                  </TouchableOpacity>
                )}
              </View>
            );
        }}
      />
    </SafeAreaView>
  );
}

// Fabrique thémée : un StyleSheet est évalué au chargement du module, où `isDark`
// n'existe pas. Le composant l'appelle via useMemo, recalculé au changement de thème.
const makeStyles = (isDark: boolean) => StyleSheet.create({
  container: { flex: 1 },
  header: { alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 20, fontWeight: '900', letterSpacing: -0.5, textAlign: 'center' },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 60 },
  sub: { fontSize: 13.5, lineHeight: 19, marginBottom: 14 },
  actionsRow: { gap: 10, marginBottom: 12 },
  primaryBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 13 },
  primaryTxt: { color: '#fff', fontSize: 14.5, fontWeight: '800', flexShrink: 1, textAlign: 'center' },
  ghostBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 8 },
  ghostTxt: { color: PRIMARY, fontSize: 14.5, fontWeight: '800', flexShrink: 1, textAlign: 'center' },
  filtersRow: { gap: 8, paddingVertical: 4, paddingBottom: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  chipTxt: { fontSize: 13, fontWeight: '800' },
  noticeBox: { borderRadius: 12, padding: 12, marginTop: 6, marginBottom: 8 },
  noticeTxt: { color: PRIMARY, fontSize: 13, fontWeight: '700' },
  loadingBox: { paddingVertical: 40, alignItems: 'center' },
  emptyBox: { borderRadius: 18, padding: 26, alignItems: 'center', gap: 12, marginTop: 8 },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  matchCard: { borderRadius: 16, padding: 14, marginBottom: 12 },
  matchTop: { alignItems: 'center', gap: 12, marginBottom: 10 },
  sportBadge: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  sportEmoji: { fontSize: 22 },
  matchTitle: { fontSize: 16, fontWeight: '900', letterSpacing: -0.3 },
  matchSport: { fontSize: 12.5, fontWeight: '800', marginTop: 2 },
  metaRow: { alignItems: 'center', gap: 8, marginTop: 4 },
  metaTxt: { flex: 1, fontSize: 13, fontWeight: '600' },
  joinBtn: { alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: PRIMARY, borderRadius: 12, paddingVertical: 11, marginTop: 12 },
  joinTxt: { color: '#fff', fontSize: 14, fontWeight: '800' },
  leaveBtn: { alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: '#ef4444', borderRadius: 12, paddingVertical: 11, marginTop: 12 },
  leaveTxt: { color: '#ef4444', fontSize: 14, fontWeight: '800' },
  fullPill: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(148,163,184,0.18)', borderRadius: 12, paddingVertical: 11, marginTop: 12 },
  fullTxt: { color: '#94a3b8', fontSize: 14, fontWeight: '800' },
});
