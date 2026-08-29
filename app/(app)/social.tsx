import React, { useCallback, useState, useMemo, useEffect } from 'react';
import { a11y } from '../../lib/a11y';
import { connecterSocial, socketSocial, type Presence } from '../../lib/socialSocket';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { ArrowLeft, Trophy, UserPlus, Flame, MoreVertical } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { useFormTheme } from '../../components/FormKit';
import PerfList from '../../components/PerfList';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { loadEngagement } from '../../lib/engagement';
import { publishStats, inviterAmi, getLeaderboard, LeaderRow } from '../../lib/social';
import { getFriendsFeed, getKudosStatesBatch, toggleKudos, FeedItem } from '../../lib/socialFeed';
import { rowDir, txtAlign, flipAuto } from '../../lib/rtl';
import { SkeletonCard, Skeleton } from '../../components/ui';
import { useScreenGate } from '../../components/FeatureGate';
import ModerationSheet from '../../components/ModerationSheet';
import { getBlockedSet } from '../../lib/moderation';
import { useTokens, Tokens } from '../../constants/tokens';

const MEDAL = ['🥇', '🥈', '🥉'];

// Chaînes LOCALES trilingues (convention : pas de clés i18n.tsx pour les NOUVELLES strings).
const FEED_STR = {
  section: { en: 'Activity feed', fr: "Fil d'actualité", ar: 'آخر الأنشطة' },
  empty: {
    en: "No recent friend activity yet. They'll appear here once your friends start logging.",
    fr: "Aucune activité récente. Elle apparaîtra ici dès que tes amis commencent à logger.",
    ar: 'لا توجد أنشطة حديثة بعد. ستظهر هنا بمجرد أن يبدأ أصدقاؤك التسجيل.',
  },
  // Libellés par type d'event (verbe d'action). Fallback générique sinon.
  types: {
    meal_logged: { en: 'logged a meal', fr: 'a loggé un repas', ar: 'سجّل وجبة' },
    activity_logged: { en: 'logged an activity', fr: 'a loggé une activité', ar: 'سجّل نشاطًا' },
    weight_logged: { en: 'logged a weigh-in', fr: 'a pesé', ar: 'سجّل وزنه' },
    run_completed: { en: 'finished a run', fr: 'a terminé une course', ar: 'أنهى جريًا' },
    race_completed: { en: 'finished a race', fr: 'a terminé une course', ar: 'أنهى سباقًا' },
    race_joined: { en: 'joined a race', fr: 'a rejoint une course', ar: 'انضم إلى سباق' },
    challenge_joined: { en: 'joined a challenge', fr: 'a rejoint un défi', ar: 'انضم إلى تحدٍّ' },
    fast_completed: { en: 'completed a fast', fr: 'a terminé un jeûne', ar: 'أكمل صيامًا' },
    activity: { en: 'was active', fr: 'a été actif', ar: 'كان نشطًا' },
  } as Record<string, { en: string; fr: string; ar: string }>,
  ago: {
    now: { en: 'just now', fr: "à l'instant", ar: 'الآن' },
    m: { en: 'm ago', fr: 'min', ar: 'د' },
    h: { en: 'h ago', fr: 'h', ar: 'س' },
    d: { en: 'd ago', fr: 'j', ar: 'ي' },
  },
};

// "il y a …" très léger, trilingue.
function timeAgo(ms: number, lang: 'en' | 'fr' | 'ar'): string {
  if (!ms) return '';
  const diff = Math.max(0, Date.now() - ms);
  const min = Math.floor(diff / 60000);
  if (min < 1) return FEED_STR.ago.now[lang];
  if (min < 60) return lang === 'en' ? `${min}${FEED_STR.ago.m.en}` : `${min} ${FEED_STR.ago.m[lang]}`;
  const h = Math.floor(min / 60);
  if (h < 24) return lang === 'en' ? `${h}${FEED_STR.ago.h.en}` : `${h} ${FEED_STR.ago.h[lang]}`;
  const d = Math.floor(h / 24);
  return lang === 'en' ? `${d}${FEED_STR.ago.d.en}` : `${d} ${FEED_STR.ago.d[lang]}`;
}

export default function SocialScreen() {
  const { user } = useUser();
  const { resolved } = useTheme();
  const k = useTokens();
  const { t, language, isRTL } = useTranslation() as any;
  const isDark = resolved === 'dark';
  const styles = useMemo(() => makeStyles(k), [k]);
  const th = useFormTheme(); // couleurs FormKit (bordure input harmonisée)
  const __gate = useScreenGate('social');

  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Feed social + kudos
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [kudos, setKudos] = useState<Record<string, { count: number; mine: boolean }>>({});
  const [kudosBusy, setKudosBusy] = useState<Record<string, boolean>>({});
  const [modTarget, setModTarget] = useState<FeedItem | null>(null); // item en cours de signalement/blocage

  // Presence temps reel (S4). Le fil montrait qui avait bouge HIER ; il montre
  // desormais qui est la MAINTENANT. C'est la difference entre un journal et une
  // place de village — et c'est ce qui donne envie de revenir.
  const [enLigne, setEnLigne] = useState<Presence[]>([]);
  useEffect(() => {
    let vivant = true;
    (async () => {
      const sock = await connecterSocial();
      if (!sock || !vivant) return;
      sock.on('presence:maj', (d: { enLigne: Presence[] }) => {
        if (vivant) setEnLigne(d?.enLigne || []);
      });
    })();
    return () => {
      vivant = false;
      socketSocial()?.off('presence:maj');
    };
  }, []);

  const email = user?.primaryEmailAddress?.emailAddress || '';

  const load = useCallback(async () => {
    if (!email) { setLoading(false); setFeedLoading(false); return; }
    try {
      const eng = await loadEngagement(email, language);
      const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.fullName || email.split('@')[0];
      await publishStats(email, { name, imageUrl: user?.imageUrl, streak: eng.streak, daysTracked: eng.daysTracked });
      setRows(await getLeaderboard(email));
    } catch (e) {
      console.warn('[social] load failed', e);
    } finally {
      setLoading(false);
    }
    // Feed (indépendant du leaderboard pour ne rien casser si l'un échoue).
    try {
      const blk = await getBlockedSet(email); // masque le contenu des utilisateurs bloqués
      const items = (await getFriendsFeed(email)).filter((it) => !blk.has(it.ownerDocId));
      setFeed(items);
      // Charge l'état kudos de chaque item (best-effort, en parallèle).
      // Lecture GROUPEE (fix N+1) : ~1 requete par tranche de 10 activites au lieu de
      // 2 requetes par activite (60 requetes pour 30 items, a chaque focus de l'ecran).
      setKudos(await getKudosStatesBatch(items, email));
    } catch (e) {
      console.warn('[social] feed load failed', e);
    } finally {
      setFeedLoading(false);
    }
  }, [email, language, user]);

  const onKudos = async (it: FeedItem) => {
    if (kudosBusy[it.id]) return;
    const cur = kudos[it.id] || { count: 0, mine: false };
    setKudosBusy((b) => ({ ...b, [it.id]: true }));
    // Optimiste : on bascule immédiatement l'UI.
    setKudos((k) => ({
      ...k,
      [it.id]: { count: Math.max(0, cur.count + (cur.mine ? -1 : 1)), mine: !cur.mine },
    }));
    try {
      const next = await toggleKudos(it.ownerDocId, it.id, email, cur.mine);
      setKudos((k) => ({ ...k, [it.id]: next }));
    } catch {
      setKudos((k) => ({ ...k, [it.id]: cur })); // rollback
    } finally {
      setKudosBusy((b) => ({ ...b, [it.id]: false }));
    }
  };

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onAdd = async () => {
    if (!input.trim()) return;
    setAdding(true); setMsg(null);
    const r = await inviterAmi(email, input);
    setAdding(false);
    if (r.ok) {
      setInput(''); setMsg(`${t('social.added')} ✓`);
      load();
    } else {
      // L'invitation remplace l'ajout : deux refus de plus a nommer, sinon
      // « une erreur est survenue » ferait croire a une panne alors qu'on a
      // simplement deja invite la personne.
      const dits: Record<string, string> = {
        self: t('social.self'),
        notfound: t('social.not_found'),
        deja: t('social.already'),
        envoyee: t('social.requested'),
      };
      setMsg(dits[String(r.reason)] || t('social.error'));
    }
  };

  const text = k.text;
  const sub = k.textMuted;
  const card = k.surface;
  const bg = isDark ? '#0f1419' : 'transparent';

  if (!__gate.ok) return __gate.node;

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.container, { backgroundColor: bg }]}>
      {/* PerfList : le fil était rendu par `.map()` dans un ScrollView — aucune
          virtualisation, et chaque ligne porte un avatar distant. Le CLASSEMENT (liste
          courte, bornée aux amis) passe en ListHeaderComponent : on garde ainsi un seul
          conteneur défilant au lieu d'imbriquer deux listes, ce que React Native
          déconseille explicitement. */}
      <PerfList
        data={feedLoading ? [] : feed}
        keyExtractor={(it: FeedItem) => `${it.ownerDocId}_${it.id}`}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
        <View style={styles.topRow}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('retour')} style={styles.backBtn} onPress={() => router.back()}>
            <View style={flipAuto()}><ArrowLeft size={22} color={text} /></View>
          </TouchableOpacity>
          <View style={{ flex: 1 }}><ScreenTopBar showBrand={false} showNotif={false} /></View>
        </View>

        <View style={styles.titleRow}>
          <Trophy size={26} color={k.accent} />
          <Text style={[styles.title, { color: text }]}>{t('social.title')}</Text>
        </View>
        <Text style={[styles.subtitle, { color: sub }]}>{t('social.subtitle')}</Text>
        <Image source={require('../../assets/images/abstraits/hero-seance.jpg')} style={styles.hero} resizeMode="cover" />

        {/* Add friend */}
        <Text style={[styles.section, { color: text }]}>{t('social.add_friend')}</Text>
        <View style={styles.addRow}>
          <TextInput
            style={[styles.input, { backgroundColor: card, color: text, borderWidth: 1.5, borderColor: th.border }]}
            placeholder={t('social.email_ph')}
            placeholderTextColor={sub}
            value={input}
            onChangeText={setInput}
            autoCapitalize="none"
            keyboardType="email-address"
            onSubmitEditing={onAdd}
          />
          <TouchableOpacity style={styles.addBtn} onPress={onAdd} disabled={adding}>
            {adding ? <ActivityIndicator size="small" color="#fff" /> : <><UserPlus size={18} color="#fff" /><Text style={styles.addBtnText}>{t('social.add')}</Text></>}
          </TouchableOpacity>
        </View>
        {!!msg && <Text style={[styles.msg, { color: sub }]}>{msg}</Text>}
        <Text style={[styles.code, { color: sub }]}>{t('social.your_code')}{email ? `:  ${email}` : ''}</Text>

        {/* Leaderboard */}
        {loading ? (
          <View style={{ marginTop: 8 }}>
            <SkeletonCard height={72} />
            <SkeletonCard height={72} />
            <SkeletonCard height={72} />
          </View>
        ) : rows.length <= 1 ? (
          <View style={[styles.emptyBox, { backgroundColor: card }]}>
            <Trophy size={36} color={k.textFaint} />
            <Text style={[styles.emptySub, { color: sub }]}>{t('social.empty')}</Text>
          </View>
        ) : (
          <View style={{ marginTop: 8 }}>
            {rows.map((r, i) => (
              <View key={r.email} style={[styles.row, { backgroundColor: card }, r.isMe && styles.rowMe]}>
                <Text style={styles.rank}>{i < 3 ? MEDAL[i] : `${i + 1}`}</Text>
                {r.imageUrl ? (
                  <Image source={{ uri: r.imageUrl }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarPh]}><Text style={styles.avatarTxt}>{(r.name || '?').charAt(0).toUpperCase()}</Text></View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: text }]} numberOfLines={1}>{r.isMe ? t('social.you') : r.name}</Text>
                  <Text style={[styles.daysTracked, { color: sub }]}>{r.daysTracked} {t('coach.days_tracked')}</Text>
                </View>
                <View style={styles.streakWrap}>
                  <Flame size={18} color="#f59e0b" />
                  <Text style={[styles.streakNum, { color: text }]}>{r.streak}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Fil d'actualité / آخر الأنشطة */}
        <Text style={[styles.section, { color: text, marginTop: 26 }]}>{FEED_STR.section[language as 'en' | 'fr' | 'ar']}</Text>
          </>
        }
        ListEmptyComponent={
          feedLoading ? (
          <View style={{ marginTop: 8 }}>
            <SkeletonCard height={72} />
            <SkeletonCard height={72} />
          </View>
          ) : (
          <View style={[styles.emptyBox, { backgroundColor: card }]}>
            <Text style={[styles.emptySub, { color: sub }]}>{FEED_STR.empty[language as 'en' | 'fr' | 'ar']}</Text>
          </View>
          )
        }
        renderItem={({ item: it }: { item: FeedItem }) => {
              const kd = kudos[it.id] || { count: 0, mine: false };
              const label = (FEED_STR.types[it.type] || FEED_STR.types.activity)[language as 'en' | 'fr' | 'ar'];
              const when = timeAgo(it.at, language as 'en' | 'fr' | 'ar');
              return (
                <View key={`${it.ownerDocId}_${it.id}`} style={[styles.feedRow, { backgroundColor: card, flexDirection: rowDir(isRTL) }]}>
                  {it.imageUrl ? (
                    <Image source={{ uri: it.imageUrl }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarPh]}><Text style={styles.avatarTxt}>{(it.name || '?').charAt(0).toUpperCase()}</Text></View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.feedName, { color: text, textAlign: txtAlign(isRTL) }]} numberOfLines={1}>
                      {it.name} <Text style={{ color: sub, fontWeight: '600' }}>{label}</Text>
                    </Text>
                    {!!when && <Text style={[styles.feedTime, { color: sub, textAlign: txtAlign(isRTL) }]}>{when}</Text>}
                  </View>
                  <TouchableOpacity
                    style={[styles.kudosBtn, { borderColor: kd.mine ? k.accent : th.border, backgroundColor: kd.mine ? k.accentSoft : 'transparent', flexDirection: rowDir(isRTL) }]}
                    onPress={() => onKudos(it)}
                    disabled={!!kudosBusy[it.id]}
                  >
                    <Text style={styles.kudosEmoji}>👏</Text>
                    <Text style={[styles.kudosCount, { color: kd.mine ? k.accent : sub }]}>{kd.count}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setModTarget(it)} hitSlop={8} style={{ paddingHorizontal: 4, paddingVertical: 6 }} accessibilityLabel="Signaler ou bloquer">
                    <MoreVertical size={18} color={sub} />
                  </TouchableOpacity>
                </View>
              );
        }}
      />
      <ModerationSheet
        visible={!!modTarget}
        onClose={() => setModTarget(null)}
        targetType="feed"
        targetId={modTarget?.id || ''}
        targetOwnerDocId={modTarget?.ownerDocId}
        targetName={modTarget?.name}
        reporterEmail={email}
        onBlocked={(owner) => setFeed((f) => f.filter((x) => x.ownerDocId !== owner))}
      />
    </SafeAreaView>
  );
}

// Fabrique thémée : un StyleSheet est évalué au chargement du module, où `isDark`
// n'existe pas. Le composant l'appelle via useMemo, recalculé au changement de thème.
const makeStyles = (k: Tokens) => StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 60 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: k.surfaceSunken },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  title: { fontSize: 30, fontWeight: '900', letterSpacing: -1 },
  subtitle: { fontSize: 14, marginTop: 8, marginBottom: 14, lineHeight: 20 },
  hero: { width: '100%', height: 130, borderRadius: 18, marginBottom: 18 },
  section: { fontSize: 16, fontWeight: '800', marginBottom: 10 },
  addRow: { flexDirection: 'row', gap: 10 },
  input: { flex: 1, height: 50, borderRadius: 14, paddingHorizontal: 16, fontSize: 15, fontWeight: '600' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: k.accent, paddingHorizontal: 18, borderRadius: 14, justifyContent: 'center' },
  addBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  msg: { fontSize: 13, marginTop: 8, fontWeight: '600' },
  code: { fontSize: 12, marginTop: 10, marginBottom: 18, lineHeight: 17 },
  loadingBox: { paddingVertical: 50, alignItems: 'center' },
  emptyBox: { borderRadius: 18, padding: 26, alignItems: 'center', gap: 12 },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 12, marginBottom: 10 },
  rowMe: { borderWidth: 2, borderColor: k.accent },
  rank: { width: 30, textAlign: 'center', fontSize: 18, fontWeight: '900', color: '#64748B' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: k.border },
  avatarPh: { alignItems: 'center', justifyContent: 'center', backgroundColor: k.accentSoft },
  avatarTxt: { fontSize: 18, fontWeight: '800', color: k.accent },
  name: { fontSize: 16, fontWeight: '800' },
  daysTracked: { fontSize: 12, marginTop: 2 },
  streakWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  streakNum: { fontSize: 18, fontWeight: '900' },
  feedRow: { alignItems: 'center', gap: 12, borderRadius: 16, padding: 12, marginBottom: 10 },
  feedName: { fontSize: 15, fontWeight: '800' },
  feedTime: { fontSize: 12, marginTop: 2 },
  kudosBtn: { alignItems: 'center', gap: 6, borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  kudosEmoji: { fontSize: 16 },
  kudosCount: { fontSize: 14, fontWeight: '800' },
});
