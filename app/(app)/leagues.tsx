// Écran LIGUES HEBDOMADAIRES (rétention façon Duolingo) — hub qui affiche le classement
// de MA ligue cette semaine, mon rang/XP, le temps restant avant clôture et les zones
// de promotion/relégation colorées. 100% Firestore via lib/leagues.ts. Trilingue + dark + RTL.
import React, { useCallback, useState, useMemo } from 'react';
import { a11y } from '../../lib/a11y';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { ArrowLeft, Trophy, ChevronUp, ChevronDown, Clock } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { SkeletonCard, Skeleton } from '../../components/ui';
import { type } from '../../constants/theme';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { rowDir, txtAlign } from '../../lib/rtl';
import {
  Tier,
  MyLeague,
  LeagueRow,
  getMyLeague,
  zoneForRank,
  PROMOTE_COUNT,
  RELEGATE_COUNT,
} from '../../lib/leagues';

import { useTokens, Tokens } from '../../constants/tokens';
type Lang = 'en' | 'fr' | 'ar';

// Chaînes LOCALES trilingues (convention : pas de clés i18n.tsx pour les NOUVELLES strings).
const S = {
  title: { en: 'League', fr: 'Ligue', ar: 'الدوري' },
  subtitle: {
    en: 'Climb the weekly ranks. Stay active to earn XP — top players get promoted, the bottom get relegated.',
    fr: 'Grimpe dans le classement hebdo. Reste actif pour gagner de l’XP — le haut monte, le bas descend.',
    ar: 'تسلّق الترتيب الأسبوعي. ابقَ نشطًا لكسب نقاط الخبرة — المتصدرون يصعدون والأخيرون ينزلون.',
  },
  tiers: {
    bronze: { en: 'Bronze', fr: 'Bronze', ar: 'برونزي' },
    silver: { en: 'Silver', fr: 'Argent', ar: 'فضي' },
    gold: { en: 'Gold', fr: 'Or', ar: 'ذهبي' },
    diamond: { en: 'Diamond', fr: 'Diamant', ar: 'ماسي' },
  } as Record<Tier, Record<Lang, string>>,
  league: { en: 'league', fr: 'ligue', ar: 'دوري' },
  closesIn: { en: 'Closes in', fr: 'Clôture dans', ar: 'يُغلق خلال' },
  xp: { en: 'XP', fr: 'XP', ar: 'خبرة' },
  you: { en: 'You', fr: 'Toi', ar: 'أنت' },
  promotionZone: { en: 'Promotion zone', fr: 'Zone de promotion', ar: 'منطقة الصعود' },
  relegationZone: { en: 'Relegation zone', fr: 'Zone de relégation', ar: 'منطقة الهبوط' },
  promotion: { en: 'Promotion', fr: 'Promotion', ar: 'صعود' },
  relegation: { en: 'Relegation', fr: 'Relégation', ar: 'هبوط' },
  empty: {
    en: 'No one has earned XP in this league yet this week. Log activity to get on the board!',
    fr: 'Personne n’a encore gagné d’XP dans cette ligue cette semaine. Enregistre une activité pour apparaître !',
    ar: 'لم يكسب أحد نقاط خبرة في هذا الدوري هذا الأسبوع بعد. سجّل نشاطًا لتظهر في الترتيب!',
  },
  myRank: { en: 'Your rank', fr: 'Ton rang', ar: 'ترتيبك' },
  notRanked: { en: 'Not ranked yet', fr: 'Pas encore classé', ar: 'غير مصنّف بعد' },
  promoLegend: {
    en: (n: number) => `Top ${n} move up`,
    fr: (n: number) => `Top ${n} montent`,
    ar: (n: number) => `أفضل ${n} يصعدون`,
  } as Record<Lang, (n: number) => string>,
  relegLegend: {
    en: (n: number) => `Bottom ${n} move down`,
    fr: (n: number) => `Derniers ${n} descendent`,
    ar: (n: number) => `آخر ${n} ينزلون`,
  } as Record<Lang, (n: number) => string>,
  days: { en: 'd', fr: 'j', ar: 'ي' },
  hours: { en: 'h', fr: 'h', ar: 'س' },
  mins: { en: 'm', fr: 'm', ar: 'د' },
};

// Jetons de couleur LOCAUX de l'écran ligues (paliers + zones), regroupés en un seul
// objet à côté des tokens partagés spacing/radius/elevation/type (constants/theme.ts).
// Design-only : mêmes valeurs qu'avant, simplement consolidées en un token unique.
// ⚠ CES COULEURS NE SUIVENT PAS LE THEME, ET C'EST VOULU.
// Le bronze, l'argent, l'or et le diamant sont des IDENTITES : une ligue de
// bronze doit se reconnaitre du premier coup d'oeil, en Rose comme en Dore,
// exactement comme une medaille reste de la couleur de son metal.
//
// Une conversion automatique les avait rendues thematiques : bronze et or
// tombaient tous deux sur , c'est-a-dire la MEME couleur — la
// distinction que ces ligues existent pour porter disparaissait. Elles sont
// donc listees ici, une seule fois, plutot qu'ecrites au fil des ecrans.
const IDENTITE_LIGUES = {
  tier: {
    bronze: '#B45309',
    silver: '#64748B',
    gold: '#D97706',
    diamond: '#0EA5E9',
  } as Record<Tier, string>,
  promotion: '#22C55E',
  relegation: '#EF4444',
} as const;

const leagueColors = IDENTITE_LIGUES;

const TIER_COLOR: Record<Tier, string> = leagueColors.tier;
const PROMO_COLOR = leagueColors.promotion;
const RELEG_COLOR = leagueColors.relegation;

function formatLeft(ms: number, lang: Lang): string {
  const totalMin = Math.floor(ms / 60000);
  const d = Math.floor(totalMin / (60 * 24));
  const h = Math.floor((totalMin % (60 * 24)) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d}${S.days[lang]} ${h}${S.hours[lang]}`;
  if (h > 0) return `${h}${S.hours[lang]} ${m}${S.mins[lang]}`;
  return `${m}${S.mins[lang]}`;
}

export default function LeaguesScreen() {
  const { user } = useUser();
  const { resolved } = useTheme();
  const k = useTokens();
  const { language, isRTL } = useTranslation() as any;
  const lang: Lang = (['en', 'fr', 'ar'].includes(language) ? language : 'en') as Lang;
  const isDark = resolved === 'dark';
  const styles = useMemo(() => makeStyles(k), [k]);

  const email = user?.primaryEmailAddress?.emailAddress || '';

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<MyLeague | null>(null);

  const text = k.text;
  const sub = k.textMuted;
  const card = k.surface;
  const bg = isDark ? '#0f1419' : 'transparent';

  const load = useCallback(async () => {
    if (!email) { setLoading(false); return; }
    setLoading(true);
    try {
      const league = await getMyLeague(email);
      setData(league);
    } catch (e) {
      console.warn('[leagues] load failed', e);
    } finally {
      setLoading(false);
    }
  }, [email]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const tier: Tier = data?.tier || 'bronze';
  const tierColor = TIER_COLOR[tier];
  const rows: LeagueRow[] = data?.rows || [];
  const groupSize = rows.length;
  const myRank = data?.me?.rank ?? null;
  const myXp = data?.me?.xp ?? 0;

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.container, { backgroundColor: bg }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('retour')}
            style={[styles.backBtn, { backgroundColor: isDark ? 'rgba(40,50,60,0.6)' : k.surfaceSunken }]}
            onPress={() => router.back()}
          >
            <View style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}><ArrowLeft size={22} color={text} /></View>
          </TouchableOpacity>
          <View style={{ flex: 1 }}><ScreenTopBar showBrand={false} showNotif={false} /></View>
        </View>

        <View style={[styles.titleRow, { flexDirection: rowDir(isRTL) }]}>
          <Trophy size={26} color={tierColor} />
          <Text style={[styles.title, { color: text }]}>{S.title[lang]}</Text>
        </View>
        <Text style={[styles.subtitle, { color: sub, textAlign: txtAlign(isRTL) }]}>{S.subtitle[lang]}</Text>

        {loading ? (
          <View style={styles.skeletonWrap}>
            {/* Approxime le bandeau ligue (hero) */}
            <SkeletonCard height={140} />
            {/* Approxime la légende zones */}
            <View style={styles.skeletonLegend}>
              <Skeleton width={110} height={12} />
              <Skeleton width={110} height={12} />
            </View>
            {/* Approxime le classement */}
            <SkeletonCard height={120} />
          </View>
        ) : (
          <>
            {/* Bandeau ligue : palier + compte à rebours + mon rang/XP */}
            <View style={[styles.hero, { backgroundColor: card, borderColor: tierColor + '55' }]}>
              <View style={[styles.heroTop, { flexDirection: rowDir(isRTL) }]}>
                <View style={[styles.tierBadge, { backgroundColor: tierColor + '22' }]}>
                  <Trophy size={18} color={tierColor} />
                  <Text style={[styles.tierBadgeTxt, { color: tierColor }]}>
                    {S.tiers[tier][lang]}
                  </Text>
                </View>
                <View style={{ flex: 1 }} />
                <View style={[styles.clockRow, { flexDirection: rowDir(isRTL) }]}>
                  <Clock size={15} color={sub} />
                  <Text style={[styles.clockTxt, { color: sub }]}>
                    {S.closesIn[lang]} {formatLeft(data?.msLeft ?? 0, lang)}
                  </Text>
                </View>
              </View>

              <View style={[styles.heroStats, { flexDirection: rowDir(isRTL) }]}>
                <View style={styles.heroStatCell}>
                  <Text style={[styles.heroStatLabel, { color: sub }]}>{S.myRank[lang]}</Text>
                  <Text style={[styles.heroStatValue, { color: text }]}>
                    {myRank ? `#${myRank}` : S.notRanked[lang]}
                  </Text>
                </View>
                <View style={[styles.heroDivider, { backgroundColor: k.border }]} />
                <View style={styles.heroStatCell}>
                  <Text style={[styles.heroStatLabel, { color: sub }]}>{S.xp[lang]}</Text>
                  <Text style={[styles.heroStatValue, { color: text }]}>{myXp}</Text>
                </View>
              </View>
            </View>

            {/* Légende zones promotion / relégation */}
            <View style={[styles.legendRow, { flexDirection: rowDir(isRTL) }]}>
              <View style={[styles.legendItem, { flexDirection: rowDir(isRTL) }]}>
                <View style={[styles.legendDot, { backgroundColor: PROMO_COLOR }]} />
                <Text style={[styles.legendTxt, { color: sub }]}>{S.promoLegend[lang](PROMOTE_COUNT)}</Text>
              </View>
              <View style={[styles.legendItem, { flexDirection: rowDir(isRTL) }]}>
                <View style={[styles.legendDot, { backgroundColor: RELEG_COLOR }]} />
                <Text style={[styles.legendTxt, { color: sub }]}>{S.relegLegend[lang](RELEGATE_COUNT)}</Text>
              </View>
            </View>

            {/* Classement de MA ligue */}
            {groupSize === 0 ? (
              <View style={[styles.emptyBox, { backgroundColor: card }]}>
                <Text style={[styles.emptyTxt, { color: sub, textAlign: txtAlign(isRTL) }]}>{S.empty[lang]}</Text>
              </View>
            ) : (
              <View style={[styles.board, { backgroundColor: card }]}>
                {rows.map((r, i) => {
                  const zone = zoneForRank(r.rank, groupSize);
                  const zoneColor =
                    zone === 'promotion' ? PROMO_COLOR : zone === 'relegation' ? RELEG_COLOR : 'transparent';
                  const isLast = i === rows.length - 1;
                  // Séparateurs de zone façon Duolingo : un label vert 'Promotion' juste au-dessus
                  // de la 1re ligne en zone de promo, un label rouge 'Relégation' juste au-dessus
                  // de la 1re ligne en zone de relég. Présentation seule (mêmes seuils zoneForRank).
                  const prevZone = i > 0 ? zoneForRank(rows[i - 1].rank, groupSize) : null;
                  const showPromoLabel = zone === 'promotion' && prevZone !== 'promotion';
                  const showRelegLabel = zone === 'relegation' && prevZone !== 'relegation';
                  return (
                    <React.Fragment key={r.uid || i}>
                      {showPromoLabel && (
                        <View style={[styles.zoneLabelRow, { flexDirection: rowDir(isRTL) }]}>
                          <View style={[styles.zoneLabelLine, { backgroundColor: PROMO_COLOR + '55' }]} />
                          <View style={[styles.zoneLabelPill, { flexDirection: rowDir(isRTL), backgroundColor: PROMO_COLOR + '1A' }]}>
                            <ChevronUp size={13} color={PROMO_COLOR} />
                            <Text style={[styles.zoneLabelTxt, { color: PROMO_COLOR }]}>{S.promotion[lang]}</Text>
                          </View>
                          <View style={[styles.zoneLabelLine, { backgroundColor: PROMO_COLOR + '55' }]} />
                        </View>
                      )}
                      {showRelegLabel && (
                        <View style={[styles.zoneLabelRow, { flexDirection: rowDir(isRTL) }]}>
                          <View style={[styles.zoneLabelLine, { backgroundColor: RELEG_COLOR + '55' }]} />
                          <View style={[styles.zoneLabelPill, { flexDirection: rowDir(isRTL), backgroundColor: RELEG_COLOR + '1A' }]}>
                            <ChevronDown size={13} color={RELEG_COLOR} />
                            <Text style={[styles.zoneLabelTxt, { color: RELEG_COLOR }]}>{S.relegation[lang]}</Text>
                          </View>
                          <View style={[styles.zoneLabelLine, { backgroundColor: RELEG_COLOR + '55' }]} />
                        </View>
                      )}
                    <View
                      style={[
                        styles.rankRow,
                        { flexDirection: rowDir(isRTL) },
                        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: k.border },
                        zone === 'promotion' && { backgroundColor: PROMO_COLOR + '0D' },
                        zone === 'relegation' && { backgroundColor: RELEG_COLOR + '0D' },
                        r.isMe && { backgroundColor: tierColor + '14' },
                      ]}
                    >
                      {/* Barre de zone (promo/relég) sur le bord */}
                      <View style={[styles.zoneBar, { backgroundColor: zoneColor }]} />
                      <View style={[styles.rankNumWrap, { backgroundColor: k.surfaceSunken }]}>
                        <Text style={[styles.rankNum, { color: r.rank <= 3 ? tierColor : sub }]}>{r.rank}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.playerName, { color: text, textAlign: txtAlign(isRTL) }]} numberOfLines={1}>
                          {r.isMe ? S.you[lang] : r.name}
                        </Text>
                      </View>
                      {zone === 'promotion' && <ChevronUp size={16} color={PROMO_COLOR} />}
                      {zone === 'relegation' && <ChevronDown size={16} color={RELEG_COLOR} />}
                      <Text style={[styles.playerXp, { color: text }]}>
                        {r.xp} <Text style={{ color: sub, fontWeight: '700', fontSize: 12 }}>{S.xp[lang]}</Text>
                      </Text>
                    </View>
                    </React.Fragment>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// Fabrique thémée : un StyleSheet est évalué au chargement du module, où `isDark`
// n'existe pas. Le composant l'appelle via useMemo, recalculé au changement de thème.
const makeStyles = (k: Tokens) => StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 90 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  title: { fontSize: 30, fontWeight: '900', letterSpacing: -1 },
  subtitle: { ...type.body, marginTop: 8, marginBottom: 18, lineHeight: 20 },
  loadingBox: { paddingVertical: 60, alignItems: 'center' },
  skeletonWrap: { gap: 14 },
  skeletonLegend: { flexDirection: 'row', gap: 18, paddingHorizontal: 4 },

  hero: { borderRadius: 20, padding: 16, marginBottom: 14, borderWidth: 1.5 },
  heroTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  tierBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12 },
  tierBadgeTxt: { fontSize: 14, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },
  clockRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  clockTxt: { ...type.sub, fontSize: 12.5 },
  heroStats: { flexDirection: 'row', alignItems: 'center' },
  heroStatCell: { flex: 1, alignItems: 'center' },
  heroStatLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  heroStatValue: { fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  heroDivider: { width: 1.5, height: 34 },

  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 18, marginBottom: 10, paddingHorizontal: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendTxt: { ...type.micro, fontWeight: '700' },

  emptyBox: { borderRadius: 18, padding: 20 },
  emptyTxt: { ...type.body, lineHeight: 20, fontWeight: '600' },

  board: { borderRadius: 18, overflow: 'hidden' },
  zoneLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8 },
  zoneLabelLine: { flex: 1, height: StyleSheet.hairlineWidth },
  zoneLabelPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  zoneLabelTxt: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6 },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  zoneBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  rankNumWrap: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rankNum: { fontSize: 14, fontWeight: '900' },
  playerName: { ...type.sub, fontSize: 15, fontWeight: '700' },
  playerXp: { fontSize: 15, fontWeight: '900' },
});
