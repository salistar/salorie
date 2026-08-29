import ScreenTopBar from '../../components/ScreenTopBar';
import { a11y } from '../../lib/a11y';
import { useTokens, Tokens } from '../../constants/tokens';
import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import {
  ArrowLeft, Trophy, MapPin, Plus, Send, Users, Swords,
} from 'lucide-react-native';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { rowDir, txtAlign, flipForRTL } from '../../lib/rtl';
import {
  listCityChallenges, joinCityChallenge, addContribution, cityStandings,
  CityChallenge, CityStandings, CityMetric,
} from '../../lib/cityChallenges';
import { SkeletonCard, Skeleton, EmptyState } from '../../components/ui';


// NOUVELLES chaînes = objet LOCAL trilingue {en,fr,ar}.
const TXT: Record<string, any> = {
  en: {
    title: 'City challenges',
    intro: 'Two cities go head to head. Pick your side and add your effort.',
    metricKm: 'km',
    metricWorkouts: 'workouts',
    metricLogs: 'logs',
    contributors: 'participants',
    join: 'Join',
    joinCityA: 'Team',
    myContribution: 'My contribution',
    add: 'Add',
    addPh: 'Amount',
    joined: 'Joined',
    leading: 'Leading',
    tie: 'Tied',
    joinFirst: 'Join a side first to contribute.',
    badcity: 'Pick one of the two cities.',
    error: 'Something went wrong. Please try again.',
    emptyTitle: 'No city challenges yet',
    emptySub: 'Inter-city challenges will appear here when they start. Check back soon!',
  },
  fr: {
    title: 'Défis inter-villes',
    intro: 'Deux villes s’affrontent. Choisis ton camp et ajoute ton effort.',
    metricKm: 'km',
    metricWorkouts: 'séances',
    metricLogs: 'repas',
    contributors: 'participants',
    join: 'Rejoindre',
    joinCityA: 'Équipe',
    myContribution: 'Ma contribution',
    add: 'Ajouter',
    addPh: 'Quantité',
    joined: 'Rejoint',
    leading: 'En tête',
    tie: 'Égalité',
    joinFirst: 'Rejoins un camp d’abord pour contribuer.',
    badcity: 'Choisis l’une des deux villes.',
    error: 'Une erreur est survenue. Réessaie.',
    emptyTitle: 'Aucun défi inter-villes',
    emptySub: 'Les défis entre villes apparaîtront ici dès leur lancement. Reviens bientôt !',
  },
  ar: {
    title: 'تحديات المدن',
    intro: 'مدينتان تتنافسان. اختر فريقك وأضف مجهودك.',
    metricKm: 'كم',
    metricWorkouts: 'تمارين',
    metricLogs: 'وجبات',
    contributors: 'مشارك',
    join: 'انضمام',
    joinCityA: 'فريق',
    myContribution: 'مساهمتي',
    add: 'إضافة',
    addPh: 'الكمية',
    joined: 'منضم',
    leading: 'المتصدر',
    tie: 'تعادل',
    joinFirst: 'انضم إلى فريق أولاً للمساهمة.',
    badcity: 'اختر إحدى المدينتين.',
    error: 'حدث خطأ ما. حاول مرة أخرى.',
    emptyTitle: 'لا توجد تحديات بين المدن',
    emptySub: 'ستظهر تحديات المدن هنا عند انطلاقها. عد قريباً!',
  },
};

export default function CityChallengesScreen() {
  const { user } = useUser();
  const { resolved } = useTheme();
  const k = useTokens();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';
  const styles = useMemo(() => makeStyles(k), [k]);

  const email = user?.primaryEmailAddress?.emailAddress || '';

  const [challenges, setChallenges] = useState<CityChallenge[]>([]);
  const [standings, setStandings] = useState<Record<string, CityStandings>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null); // id en cours d'action
  const [addVal, setAddVal] = useState<Record<string, string>>({});
  const [rowErr, setRowErr] = useState<Record<string, string>>({});

  const align = txtAlign(isRTL);
  const dir = rowDir(isRTL);

  const text = isDark ? '#fff' : k.text;
  const sub = isDark ? '#9BA1A6' : k.textMuted;
  const card = isDark ? k.surface : '#fff';
  const tok = useTokens();
  const bg = tok.bg;
  const field = k.border;

  const metricLabel = (m: CityMetric) =>
    m === 'workouts' ? t.metricWorkouts : m === 'logs' ? t.metricLogs : t.metricKm;

  const loadStandings = useCallback(async (list: CityChallenge[]) => {
    const entries = await Promise.all(
      list.map(async (c) => [c.id, await cityStandings(c.id, email)] as const)
    );
    setStandings((prev) => {
      const next = { ...prev };
      entries.forEach(([id, s]) => { next[id] = s; });
      return next;
    });
  }, [email]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listCityChallenges();
      setChallenges(list);
      await loadStandings(list);
    } catch (e) {
      console.warn('[city-challenges] load failed', e);
    } finally {
      setLoading(false);
    }
  }, [loadStandings]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const refreshOne = useCallback(async (id: string) => {
    const s = await cityStandings(id, email);
    setStandings((prev) => ({ ...prev, [id]: s }));
  }, [email]);

  const onJoin = async (c: CityChallenge, city: string) => {
    if (busy) return;
    setRowErr((e) => ({ ...e, [c.id]: '' }));
    setBusy(c.id);
    try {
      const res = await joinCityChallenge(c.id, email, city);
      if (!res.ok) {
        setRowErr((e) => ({ ...e, [c.id]: res.reason === 'badcity' ? t.badcity : t.error }));
      } else {
        await refreshOne(c.id);
      }
    } catch (err) {
      console.warn('[city-challenges] join failed', err);
      setRowErr((e) => ({ ...e, [c.id]: t.error }));
    } finally {
      setBusy(null);
    }
  };

  const onAdd = async (c: CityChallenge) => {
    if (busy) return;
    const st = standings[c.id];
    setRowErr((e) => ({ ...e, [c.id]: '' }));
    if (!st?.myCity) { setRowErr((e) => ({ ...e, [c.id]: t.joinFirst })); return; }
    const raw = (addVal[c.id] || '').replace(',', '.');
    const val = parseFloat(raw);
    if (!(val > 0)) return;
    setBusy(c.id);
    try {
      const ok = await addContribution(c.id, email, st.myCity, val);
      if (!ok) {
        setRowErr((e) => ({ ...e, [c.id]: t.error }));
      } else {
        setAddVal((v) => ({ ...v, [c.id]: '' }));
        await refreshOne(c.id);
      }
    } catch (err) {
      console.warn('[city-challenges] add failed', err);
      setRowErr((e) => ({ ...e, [c.id]: t.error }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.container, { backgroundColor: bg }]}>
      <ScreenTopBar />
      {/* Header */}
      <View style={[styles.header, { flexDirection: dir }]}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('retour')} style={[styles.backBtn, { backgroundColor: card }]} onPress={() => router.back()}>
          <ArrowLeft size={22} color={text} style={flipForRTL(isRTL)} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: text }]} numberOfLines={1}>{t.title}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={[styles.intro, { color: sub, textAlign: align }]}>{t.intro}</Text>

        {loading ? (
          <View style={styles.skeletonWrap}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={[styles.card, { backgroundColor: card }]}>
                <View style={[styles.cardHead, { flexDirection: dir }]}>
                  <Skeleton width={40} height={40} round={20} />
                  <View style={{ flex: 1 }}>
                    <Skeleton width={'70%'} height={16} />
                    <Skeleton width={90} height={12} style={{ marginTop: 8 }} />
                  </View>
                </View>
                <View style={[styles.scoreRow, { flexDirection: dir }]}>
                  <View style={{ flex: 1 }}>
                    <Skeleton width={'55%'} height={14} />
                    <Skeleton width={70} height={18} style={{ marginTop: 6 }} />
                  </View>
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <Skeleton width={'55%'} height={14} />
                    <Skeleton width={70} height={18} style={{ marginTop: 6 }} />
                  </View>
                </View>
                <Skeleton width={'100%'} height={10} round={999} style={{ marginBottom: 14 }} />
                <View style={[styles.joinRow, { flexDirection: dir }]}>
                  <Skeleton width={'48%'} height={42} round={12} />
                  <Skeleton width={'48%'} height={42} round={12} />
                </View>
              </View>
            ))}
          </View>
        ) : challenges.length === 0 ? (
          <EmptyState
            icon={<Swords size={26} color={k.accent} />}
            title={t.emptyTitle}
            subtitle={t.emptySub}
          />
        ) : (
          challenges.map((c) => {
            const st = standings[c.id];
            const totalA = st?.totalA ?? 0;
            const totalB = st?.totalB ?? 0;
            const sum = totalA + totalB;
            const pctA = sum > 0 ? Math.round((totalA / sum) * 100) : 50;
            const myCity = st?.myCity ?? null;
            const unit = metricLabel(c.metric);
            const err = rowErr[c.id];
            const rowBusy = busy === c.id;
            const leadA = totalA > totalB;
            const leadB = totalB > totalA;

            return (
              <View key={c.id} style={[styles.card, { backgroundColor: card }]}>
                {/* Titre + métrique */}
                <View style={[styles.cardHead, { flexDirection: dir }]}>
                  <View style={styles.cardIcon}>
                    <Trophy size={18} color={k.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: text, textAlign: align }]} numberOfLines={2}>{c.title}</Text>
                    <View style={[styles.metaRow, { flexDirection: dir }]}>
                      <Users size={12} color={sub} />
                      <Text style={[styles.metaTxt, { color: sub }]}>
                        {st?.contributors ?? 0} {t.contributors}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Scores Ville A vs Ville B */}
                <View style={[styles.scoreRow, { flexDirection: dir }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cityName, { color: leadA ? k.accent : text, textAlign: isRTL ? 'right' : 'left' }]} numberOfLines={1}>
                      {c.cityA}
                    </Text>
                    <Text style={[styles.cityScore, { color: leadA ? k.accent : text, textAlign: isRTL ? 'right' : 'left' }]}>
                      {totalA} {unit}
                    </Text>
                  </View>
                  <Text style={[styles.vs, { color: sub }]}>
                    {leadA ? t.leading : leadB ? '' : t.tie}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cityName, { color: leadB ? k.warning : text, textAlign: isRTL ? 'left' : 'right' }]} numberOfLines={1}>
                      {c.cityB}
                    </Text>
                    <Text style={[styles.cityScore, { color: leadB ? k.warning : text, textAlign: isRTL ? 'left' : 'right' }]}>
                      {totalB} {unit}
                    </Text>
                  </View>
                </View>

                {/* Barre de score A vs B */}
                <View style={[styles.barTrack, { backgroundColor: k.warning + '33' }]}>
                  <View style={[styles.barFill, { width: `${pctA}%`, backgroundColor: k.accent }]} />
                </View>

                {/* Rejoindre : deux boutons de camp (ou badge "rejoint") */}
                <View style={[styles.joinRow, { flexDirection: dir }]}>
                  {[c.cityA, c.cityB].map((city) => {
                    const mine = myCity === city;
                    return (
                      <TouchableOpacity
                        key={city}
                        style={[
                          styles.joinBtn,
                          { flexDirection: dir },
                          mine
                            ? { backgroundColor: k.accent }
                            : { borderWidth: 1.5, borderColor: k.accent },
                          rowBusy && { opacity: 0.5 },
                        ]}
                        onPress={() => onJoin(c, city)}
                        disabled={rowBusy}
                        activeOpacity={0.85}
                      >
                        <MapPin size={14} color={mine ? '#fff' : k.accent} />
                        <Text style={[styles.joinTxt, { color: mine ? '#fff' : k.accent }]} numberOfLines={1}>
                          {mine ? t.joined : `${t.join} ${city}`}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Ma contribution + ajout */}
                {myCity && (
                  <View style={styles.contribBox}>
                    <Text style={[styles.contribLabel, { color: sub, textAlign: align }]}>
                      {t.myContribution}: {st?.myValue ?? 0} {unit} · {myCity}
                    </Text>
                    <View style={[styles.addRow, { flexDirection: dir }]}>
                      <TextInput
                        value={addVal[c.id] || ''}
                        onChangeText={(v) => setAddVal((s) => ({ ...s, [c.id]: v }))}
                        keyboardType="numeric"
                        placeholder={t.addPh}
                        placeholderTextColor={sub}
                        style={[styles.addInput, { color: text, backgroundColor: field, textAlign: align }]}
                      />
                      <TouchableOpacity
                        style={[styles.addBtn, { flexDirection: dir }, rowBusy && { opacity: 0.5 }]}
                        onPress={() => onAdd(c)}
                        disabled={rowBusy}
                        activeOpacity={0.85}
                      >
                        {rowBusy
                          ? <ActivityIndicator size="small" color="#fff" />
                          : (<><Plus size={16} color="#fff" /><Text style={styles.addBtnTxt}>{t.add}</Text></>)}
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {!!err && <Text style={[styles.errTxt, { textAlign: align }]}>{err}</Text>}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// Fabrique thémée : un StyleSheet est évalué au chargement du module, où `isDark`
// n'existe pas. Le composant l'appelle via useMemo, recalculé au changement de thème.
const makeStyles = (k: Tokens) => StyleSheet.create({
  container: { flex: 1 },
  header: { alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 20, fontWeight: '900', letterSpacing: -0.5, textAlign: 'center' },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 60 },
  intro: { fontSize: 13, lineHeight: 19, marginBottom: 16 },
  skeletonWrap: {},
  card: { borderRadius: 18, padding: 16, marginBottom: 16 },
  cardHead: { alignItems: 'center', gap: 12, marginBottom: 14 },
  cardIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: k.accentSoft, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  metaRow: { alignItems: 'center', gap: 5, marginTop: 4 },
  metaTxt: { fontSize: 12, fontWeight: '600' },
  scoreRow: { alignItems: 'flex-end', gap: 8, marginBottom: 8 },
  cityName: { fontSize: 14, fontWeight: '800' },
  cityScore: { fontSize: 18, fontWeight: '900', marginTop: 2, letterSpacing: -0.5 },
  vs: { fontSize: 11, fontWeight: '800', paddingBottom: 2, textTransform: 'uppercase' },
  barTrack: { height: 10, borderRadius: 999, overflow: 'hidden', marginBottom: 14 },
  barFill: { height: '100%', borderRadius: 999 },
  joinRow: { gap: 10 },
  joinBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 8 },
  joinTxt: { fontSize: 13, fontWeight: '800' },
  contribBox: { marginTop: 14 },
  contribLabel: { fontSize: 13, fontWeight: '700', marginBottom: 8 },
  addRow: { gap: 10, alignItems: 'center' },
  addInput: { flex: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15 },
  addBtn: { alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: k.accent, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 18 },
  addBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '800' },
  errTxt: { color: '#ef4444', fontSize: 13, fontWeight: '700', marginTop: 12 },
});
