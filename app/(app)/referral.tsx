import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Share,
} from 'react-native';
import { Users, Share2, Gift, Check, Lock, Ticket, Hash } from 'lucide-react-native';
import { useUser } from '@clerk/clerk-expo';
import ScreenTopBar from '../../components/ScreenTopBar';
import { SkeletonCard, Skeleton, Input } from '../../components/ui';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { rowDir, txtAlign } from '../../lib/rtl';
import {
  getMyCode,
  claimReferral,
  getReferralStats,
  REWARD_TIERS,
  ClaimReason,
  ReferralStats,
} from '../../lib/referral';

type Lang = 'en' | 'fr' | 'ar';

const TXT: Record<Lang, any> = {
  en: {
    title: 'Referral',
    sub: 'Invite friends to Salorie. Each friend who joins with your code unlocks new rewards for you.',
    myCode: 'Your referral code',
    copy: 'Copy',
    copied: 'Copied',
    share: 'Share',
    shareMsg: (code: string) =>
      `Join me on Salorie and track your nutrition & workouts! Use my referral code: ${code}`,
    enterTitle: 'Have a code?',
    enterSub: 'Enter a friend’s code to credit them (one time only).',
    placeholder: 'Enter a code',
    apply: 'Apply',
    friends: 'Friends referred',
    reward: 'Unlocked reward',
    noReward: 'No reward yet',
    nextIn: (n: number, label: string) => `${n} more to unlock ${label}`,
    maxReached: 'All rewards unlocked. Amazing!',
    tiers: 'Reward tiers',
    ok: 'Referral applied! Thanks for supporting your friend.',
    err_empty: 'Please enter a code.',
    err_self: 'You can’t use your own code.',
    err_notfound: 'This code doesn’t exist.',
    err_already: 'You have already used a referral code.',
    err_error: 'Something went wrong. Please try again.',
    unlocked: 'Unlocked',
  },
  fr: {
    title: 'Parrainage',
    sub: 'Invite tes amis sur Salorie. Chaque ami qui s’inscrit avec ton code te débloque de nouvelles récompenses.',
    myCode: 'Ton code de parrainage',
    copy: 'Copier',
    copied: 'Copié',
    share: 'Partager',
    shareMsg: (code: string) =>
      `Rejoins-moi sur Salorie et suis ta nutrition et tes entraînements ! Utilise mon code de parrainage : ${code}`,
    enterTitle: 'Tu as un code ?',
    enterSub: 'Saisis le code d’un ami pour le créditer (une seule fois).',
    placeholder: 'Entrer un code',
    apply: 'Valider',
    friends: 'Filleuls parrainés',
    reward: 'Récompense débloquée',
    noReward: 'Aucune récompense pour l’instant',
    nextIn: (n: number, label: string) => `Encore ${n} pour débloquer ${label}`,
    maxReached: 'Toutes les récompenses débloquées. Bravo !',
    tiers: 'Paliers de récompense',
    ok: 'Parrainage validé ! Merci de soutenir ton ami.',
    err_empty: 'Merci de saisir un code.',
    err_self: 'Tu ne peux pas utiliser ton propre code.',
    err_notfound: 'Ce code n’existe pas.',
    err_already: 'Tu as déjà utilisé un code de parrainage.',
    err_error: 'Une erreur est survenue. Réessaie.',
    unlocked: 'Débloqué',
  },
  ar: {
    title: 'الإحالة',
    sub: 'ادعُ أصدقاءك إلى Salorie. كل صديق ينضم برمزك يفتح لك مكافآت جديدة.',
    myCode: 'رمز الإحالة الخاص بك',
    copy: 'نسخ',
    copied: 'تم النسخ',
    share: 'مشاركة',
    shareMsg: (code: string) =>
      `انضم إليّ في Salorie وتتبّع تغذيتك وتمارينك! استخدم رمز الإحالة الخاص بي: ${code}`,
    enterTitle: 'هل لديك رمز؟',
    enterSub: 'أدخل رمز صديق لتُسجّله لصالحه (مرة واحدة فقط).',
    placeholder: 'أدخل رمزًا',
    apply: 'تطبيق',
    friends: 'المُحالون',
    reward: 'المكافأة المفتوحة',
    noReward: 'لا مكافأة بعد',
    nextIn: (n: number, label: string) => `${n} آخرون لفتح ${label}`,
    maxReached: 'تم فتح جميع المكافآت. رائع!',
    tiers: 'مستويات المكافآت',
    ok: 'تمّت الإحالة! شكرًا لدعمك صديقك.',
    err_empty: 'يرجى إدخال رمز.',
    err_self: 'لا يمكنك استخدام رمزك الخاص.',
    err_notfound: 'هذا الرمز غير موجود.',
    err_already: 'لقد استخدمت رمز إحالة من قبل.',
    err_error: 'حدث خطأ ما. حاول مرة أخرى.',
    unlocked: 'مفتوح',
  },
};

export default function Referral() {
  const { colors, resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const lang: Lang = (language === 'fr' || language === 'ar' ? language : 'en');
  const t = TXT[lang] || TXT.en;
  const isDark = resolved === 'dark';

  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress || '';

  const GREEN = colors.primary;
  const bg = isDark ? '#0f1419' : '#f3f6f4';
  const card = isDark ? '#1e293b' : '#ffffff';
  const text = isDark ? '#f1f5f9' : '#1B2A33';
  const sub = isDark ? '#94a3b8' : '#667085';
  const lockTint = isDark ? '#334155' : '#94a3b8';
  const codeBg = isDark ? '#14331f' : '#EAF4EE';
  const inputBg = isDark ? '#0f1419' : '#f1f5f9';
  const align: any = { textAlign: txtAlign(isRTL) };

  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState('');
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [entry, setEntry] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!email) { setLoading(false); return; }
    try {
      const [c, st] = await Promise.all([
        getMyCode(email),
        getReferralStats(email, lang),
      ]);
      setCode(c);
      setStats(st);
    } catch {
      // best-effort
    } finally {
      setLoading(false);
    }
  }, [email, lang]);

  useEffect(() => {
    let alive = true;
    (async () => {
      await load();
      if (!alive) return;
    })();
    return () => { alive = false; };
  }, [load]);

  const onShare = async () => {
    if (!code) return;
    try {
      await Share.share({ message: t.shareMsg(code) });
    } catch {
      // user cancelled / unavailable
    }
  };

  const onApply = async () => {
    const raw = entry.trim();
    if (!raw) { setMsg({ ok: false, text: t.err_empty }); return; }
    setSubmitting(true);
    setMsg(null);
    try {
      const res = await claimReferral(raw, email);
      if (res.ok) {
        setMsg({ ok: true, text: t.ok });
        setEntry('');
      } else {
        const reason: ClaimReason = res.reason || 'error';
        setMsg({ ok: false, text: t[`err_${reason}`] || t.err_error });
      }
    } catch {
      setMsg({ ok: false, text: t.err_error });
    } finally {
      setSubmitting(false);
    }
  };

  const count = stats?.count ?? 0;

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showBrand showNotif={false} />
      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={[s.head, { flexDirection: rowDir(isRTL) }]}>
          <Users size={26} color={GREEN} />
          <Text style={[s.title, { color: text }, align]}>{t.title}</Text>
        </View>
        <Text style={[s.sub, { color: sub }, align]}>{t.sub}</Text>

        {loading ? (
          <View style={{ marginTop: 14, gap: 14 }}>
            <View style={[s.card, { backgroundColor: card, gap: 12 }]}>
              <Skeleton width={140} height={13} />
              <Skeleton width="100%" height={62} />
              <Skeleton width="100%" height={46} />
            </View>
            <View style={[s.card, { backgroundColor: card, gap: 12 }]}>
              <Skeleton width={70} height={44} />
              <Skeleton width="60%" height={16} />
              <Skeleton width="45%" height={13} />
            </View>
            <SkeletonCard height={150} />
          </View>
        ) : (
          <>
            {/* Mon code */}
            <View style={[s.card, { backgroundColor: card }]}>
              <Text style={[s.cardLabel, { color: sub }, align]}>{t.myCode}</Text>
              <View style={[s.codeBox, { backgroundColor: codeBg }]}>
                <Text style={[s.code, { color: text }]} selectable>{code || '—'}</Text>
              </View>
              <TouchableOpacity
                style={[s.actionBtn, { backgroundColor: GREEN, flexDirection: rowDir(isRTL) }]}
                activeOpacity={0.85}
                onPress={onShare}
              >
                <Share2 size={17} color="#fff" />
                <Text style={[s.actionTxt, { color: '#fff' }]}>{t.share}</Text>
              </TouchableOpacity>
            </View>

            {/* Stats filleuls + récompense */}
            <View style={[s.card, { backgroundColor: card }]}>
              <View style={[s.statsRow, { flexDirection: rowDir(isRTL) }]}>
                <View style={s.statCol}>
                  <Text style={[s.statVal, { color: GREEN }]}>{count}</Text>
                  <Text style={[s.statLabel, { color: sub }, align]}>{t.friends}</Text>
                </View>
                <View style={[s.rewardCol, { borderColor: isDark ? '#334155' : '#e5e9ec' }]}>
                  <Text style={[s.cardLabel, { color: sub }, align]}>{t.reward}</Text>
                  {stats?.reward?.tier ? (
                    <Text style={[s.rewardTxt, { color: text }, align]}>
                      {stats.reward.emoji} {stats.reward.label}
                    </Text>
                  ) : (
                    <Text style={[s.rewardTxt, { color: sub }, align]}>{t.noReward}</Text>
                  )}
                </View>
              </View>
              <Text style={[s.nextTxt, { color: GREEN }, align]}>
                {stats?.nextAt != null && stats?.nextLabel
                  ? t.nextIn(Math.max(0, stats.nextAt - count), stats.nextLabel)
                  : t.maxReached}
              </Text>
            </View>

            {/* Paliers */}
            <View style={[s.card, { backgroundColor: card }]}>
              <Text style={[s.cardLabel, { color: sub }, align]}>{t.tiers}</Text>
              {REWARD_TIERS.map((tier, i) => {
                const done = count >= tier.min;
                return (
                  <View key={i} style={[s.tierRow, { flexDirection: rowDir(isRTL) }]}>
                    <View style={[s.tierIcon, { backgroundColor: done ? 'rgba(46,139,87,0.14)' : inputBg }]}>
                      {done ? <Check size={15} color={GREEN} /> : <Lock size={14} color={lockTint} />}
                    </View>
                    <Text style={[s.tierLabel, { color: done ? text : sub }, align]}>
                      {tier.emoji} {tier.label[lang]}
                    </Text>
                    <Text style={[s.tierReq, { color: done ? GREEN : lockTint }]}>{tier.min}</Text>
                  </View>
                );
              })}
            </View>

            {/* Entrer un code */}
            <View style={[s.card, { backgroundColor: card }]}>
              <View style={[s.enterHead, { flexDirection: rowDir(isRTL) }]}>
                <Gift size={18} color={GREEN} />
                <Text style={[s.enterTitle, { color: text }, align]}>{t.enterTitle}</Text>
              </View>
              <Text style={[s.enterSub, { color: sub }, align]}>{t.enterSub}</Text>
              <View style={[s.inputRow, { flexDirection: rowDir(isRTL) }]}>
                <Input
                  containerStyle={{ flex: 1, marginBottom: 0 }}
                  icon={<Hash size={18} color={sub} />}
                  placeholder={t.placeholder}
                  value={entry}
                  onChangeText={(v) => setEntry(v)}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={12}
                  editable={!submitting}
                />
                <TouchableOpacity
                  style={[s.applyBtn, { backgroundColor: GREEN, opacity: submitting ? 0.6 : 1 }]}
                  activeOpacity={0.85}
                  onPress={onApply}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={s.applyTxt}>{t.apply}</Text>
                  )}
                </TouchableOpacity>
              </View>
              {msg && (
                <View style={[s.msgBox, { backgroundColor: msg.ok ? 'rgba(46,139,87,0.12)' : (isDark ? '#3f1d1d' : '#fde8e8'), flexDirection: rowDir(isRTL) }]}>
                  {msg.ok ? <Ticket size={15} color={GREEN} /> : null}
                  <Text style={[s.msgTxt, { color: msg.ok ? GREEN : (isDark ? '#fca5a5' : '#b42318') }, align]}>{msg.text}</Text>
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f3f6f4' },
  body: { padding: 18, paddingBottom: 90 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  title: { fontSize: 26, fontWeight: '800', color: '#1B2A33' },
  sub: { fontSize: 13, color: '#667085', marginTop: 6, lineHeight: 19 },
  card: { borderRadius: 16, padding: 16, marginTop: 14 },
  cardLabel: { fontSize: 13, fontWeight: '600' },
  codeBox: { borderRadius: 14, paddingVertical: 16, marginTop: 10, alignItems: 'center' },
  code: { fontSize: 30, fontWeight: '900', letterSpacing: 4 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 12, paddingVertical: 13, marginTop: 12 },
  actionTxt: { fontSize: 14.5, fontWeight: '800' },
  statsRow: { flexDirection: 'row', alignItems: 'stretch', gap: 14, marginTop: 4 },
  statCol: { alignItems: 'center', justifyContent: 'center', paddingRight: 4 },
  statVal: { fontSize: 44, fontWeight: '900', letterSpacing: -1 },
  statLabel: { fontSize: 12, fontWeight: '600', marginTop: 2, maxWidth: 96 },
  rewardCol: { flex: 1, justifyContent: 'center', borderLeftWidth: StyleSheet.hairlineWidth, paddingLeft: 14 },
  rewardTxt: { fontSize: 17, fontWeight: '800', marginTop: 6, lineHeight: 22 },
  nextTxt: { fontSize: 13, fontWeight: '700', marginTop: 14 },
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  tierIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  tierLabel: { flex: 1, fontSize: 14.5, fontWeight: '700' },
  tierReq: { fontSize: 14, fontWeight: '900' },
  enterHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  enterTitle: { fontSize: 16, fontWeight: '800' },
  enterSub: { fontSize: 12.5, fontWeight: '600', marginTop: 5, lineHeight: 18 },
  inputRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  applyBtn: { borderRadius: 12, paddingHorizontal: 20, minWidth: 84, alignItems: 'center', justifyContent: 'center' },
  applyTxt: { color: '#fff', fontSize: 14.5, fontWeight: '800' },
  msgBox: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginTop: 12 },
  msgTxt: { flex: 1, fontSize: 13, fontWeight: '700', lineHeight: 18 },
});
