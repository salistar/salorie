// Battle nutrition 1v1 — compare ton score d'assiduité hebdo avec un ami.
import React, { useEffect, useState } from 'react';
import { useTokens } from '../../constants/tokens';
import { ymd } from '../../lib/format';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { Swords } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { FormCard, FormInput, SubmitBar } from '../../components/FormKit';
import { HeroImage } from '../../components/ui';
import { spacing, radius, elevation, type } from '../../constants/theme';
import { emailToDocId } from '../../lib/firebase';
import { readPublicProfile, writePublicProfile } from '../../lib/publicProfile';
import { getEntries } from '../../lib/tracking';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { rowDir } from '../../lib/rtl';
import { useScreenGate } from '../../components/FeatureGate';

const fmt = ymd;

const TXT: any = {
  en: {
    title: 'Battle 1v1',
    sub: 'Consistency score = active days over 7 days. Challenge a friend!',
    myLabel: 'Your score this week',
    placeholder: "Your friend's email",
    challenge: 'Challenge',
    errEmail: "Enter your friend's email.",
    errNotFound: 'Friend not found (they need a Salorie account).',
    errProfile: 'Could not fetch this profile.',
    you: 'You',
    leading: "You're leading! 🏆",
    behind: "You're behind, hang in there! 💪",
    tie: 'Perfect tie ⚖️',
    noScore: "hasn't published a score yet — invite them to open Battle.",
    gageLabel: "Loser's forfeit (optional)",
    gagePh: 'e.g. buys the coffee ☕',
    gageTitle: '🎲 The bet',
    gageYouPay: 'You lost — your forfeit:',
    gageTheyPay: 'wins! Their forfeit:',
    gageTie: 'Tie — forfeit cancelled:',
  },
  fr: {
    title: 'Battle 1v1',
    sub: "Score d'assiduité = jours actifs sur 7 jours. Défie un ami !",
    myLabel: 'Ton score cette semaine',
    placeholder: 'Email de ton ami',
    challenge: 'Défier',
    errEmail: "Entre l'email de ton ami.",
    errNotFound: 'Ami introuvable (il doit avoir un compte Salorie).',
    errProfile: 'Impossible de récupérer ce profil.',
    you: 'Toi',
    leading: 'Tu mènes ! 🏆',
    behind: 'Tu es mené, accroche-toi ! 💪',
    tie: 'Égalité parfaite ⚖️',
    noScore: "n'a pas encore de score publié — invite-le à ouvrir Battle.",
    gageLabel: 'Gage du perdant (optionnel)',
    gagePh: 'ex : offre le café ☕',
    gageTitle: '🎲 Le gage',
    gageYouPay: 'Tu as perdu — ton gage :',
    gageTheyPay: 'gagne ! Son gage :',
    gageTie: 'Égalité — gage annulé :',
  },
  ar: {
    title: 'تحدي 1 ضد 1',
    sub: 'نقاط المواظبة = أيام النشاط خلال 7 أيام. تحدَّ صديقاً!',
    myLabel: 'نقاطك هذا الأسبوع',
    placeholder: 'البريد الإلكتروني لصديقك',
    challenge: 'تحدَّ',
    errEmail: 'أدخل البريد الإلكتروني لصديقك.',
    errNotFound: 'الصديق غير موجود (يجب أن يملك حساب Salorie).',
    errProfile: 'تعذّر جلب هذا الملف الشخصي.',
    you: 'أنت',
    leading: 'أنت في المقدمة! 🏆',
    behind: 'أنت متأخر، تماسك! 💪',
    tie: 'تعادل تام ⚖️',
    noScore: 'لم ينشر نقاطاً بعد — ادعُه لفتح التحدي.',
    gageLabel: 'رهان الخاسر (اختياري)',
    gagePh: 'مثال: يدفع القهوة ☕',
    gageTitle: '🎲 الرهان',
    gageYouPay: 'لقد خسرت — رهانك:',
    gageTheyPay: 'يفوز! رهانه:',
    gageTie: 'تعادل — أُلغي الرهان:',
  },
};

export default function BattleScreen() {
  const k = useTokens();
  const { user } = useUser();
  const { colors, resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';
  const GREEN = colors.primary;
  const tok = useTokens();
  const bg = tok.bg;
  const card = tok.surface;
  const text = tok.text;
  const sub = tok.textMuted;
  const align: any = { textAlign: isRTL ? 'right' : 'left' };
  const __gate = useScreenGate('battle');

  const email = user?.primaryEmailAddress?.emailAddress || '';
  const [myScore, setMyScore] = useState(0);
  const [gage, setGage] = useState('');
  const [friend, setFriend] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ name: string; score: number; gage: string } | null>(null);
  const [err, setErr] = useState('');

  // Score = nombre de jours actifs (logs) sur les 7 derniers jours (0-7).
  const computeMyScore = async () => {
    const logs = await getEntries(email, 'logs', 200);
    const since = fmt(new Date(Date.now() - 7 * 86400000));
    const days = new Set(logs.filter((l: any) => l.date && l.date >= since).map((l: any) => l.date));
    return days.size;
  };

  useEffect(() => {
    (async () => {
      try {
        const s = await computeMyScore();
        setMyScore(s);
        const id = emailToDocId(email);
        // Restaure le gage déjà publié depuis MON profil public.
        const mine: any = await readPublicProfile(id);
        const savedGage = mine?.gage;
        if (typeof savedGage === 'string') setGage(savedGage);
        // Publie le score dans public_profiles pour que les amis puissent te défier.
        if (id) await writePublicProfile(id, { weeklyScore: s });
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  // Persiste le gage du perdant avec le battle (même profil public que le score).
  const persistGage = async (g: string) => {
    try {
      const id = emailToDocId(email);
      if (id) await writePublicProfile(id, { gage: g });
    } catch {}
  };

  const challenge = async () => {
    const e = friend.trim().toLowerCase();
    if (!e || !e.includes('@')) { setErr(t.errEmail); return; }
    setErr(''); setBusy(true); setResult(null);
    try {
      await persistGage(gage.trim());
      // Lecture du profil PUBLIC de l'adversaire (score + gage), jamais son doc user privé.
      const p: any = await readPublicProfile(emailToDocId(e));
      if (!p) { setErr(t.errNotFound); }
      else { setResult({ name: p.name || e.split('@')[0], score: Number(p?.weeklyScore ?? -1), gage: typeof p?.gage === 'string' ? p.gage : '' }); }
    } catch { setErr(t.errProfile); } finally { setBusy(false); }
  };

  const verdict = result && result.score >= 0 ? (myScore > result.score ? t.leading : myScore < result.score ? t.behind : t.tie) : null;

  if (!__gate.ok) return __gate.node;

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <HeroImage source={require('../../assets/images/abstraits/hero-duel.jpg')} height={140} title={t.title} />
        </View>
        <View style={[styles.head, { flexDirection: rowDir(isRTL) }]}><Swords size={24} color={GREEN} /><Text style={[styles.sub, { color: sub, flex: 1 }, align]}>{t.sub}</Text></View>

        {loading ? <ActivityIndicator color={GREEN} style={{ marginTop: 20 }} /> : (
          <>
            <View style={[styles.myCard, { backgroundColor: GREEN }]}>
              <Text style={styles.myLabel}>{t.myLabel}</Text>
              <Text style={styles.myScore}>{myScore}<Text style={styles.myMax}>/7</Text></Text>
            </View>

            <FormCard>
              <FormInput
                label={t.placeholder}
                placeholder={t.placeholder}
                autoCapitalize="none"
                keyboardType="email-address"
                value={friend}
                onChangeText={setFriend}
                onSubmitEditing={challenge}
                error={err || undefined}
              />
              <FormInput
                label={t.gageLabel}
                placeholder={t.gagePh}
                value={gage}
                onChangeText={setGage}
                onSubmitEditing={challenge}
              />
            </FormCard>
            <View style={{ marginHorizontal: -spacing.xl, marginTop: -spacing.sm }}>
              <SubmitBar label={t.challenge} onPress={challenge} loading={busy} />
            </View>

            {result && (
              <View style={[styles.vsCard, { backgroundColor: card, borderWidth: 1, borderColor: isDark ? '#283241' : 'transparent' }, !isDark && { shadowColor: '#000' }]}>
                <View style={[styles.vsRow, { flexDirection: rowDir(isRTL) }]}>
                  <View style={styles.vsP}><Text style={[styles.vsName, { color: text }]}>{t.you}</Text><Text style={[styles.vsScore, { color: GREEN }]}>{myScore}</Text></View>
                  <Text style={styles.vsX}>VS</Text>
                  <View style={styles.vsP}><Text style={[styles.vsName, { color: text }]}>{result.name}</Text><Text style={styles.vsScore}>{result.score >= 0 ? result.score : '—'}</Text></View>
                </View>
                <Text style={[styles.verdict, { color: text }]}>{result.score >= 0 ? verdict : `${result.name} ${t.noScore}`}</Text>
                {result.score >= 0 && (() => {
                  // Le gage du PERDANT s'applique : si je perds -> mon gage, s'il perd -> son gage.
                  const iLose = myScore < result.score;
                  const theyLose = myScore > result.score;
                  const loserGage = iLose ? gage.trim() : theyLose ? result.gage : (gage.trim() || result.gage);
                  if (!loserGage) return null;
                  const line = iLose ? t.gageYouPay : theyLose ? `${result.name} ${t.gageTheyPay}` : t.gageTie;
                  return (
                    <View style={[styles.gageBox, { backgroundColor: k.surfaceSunken, borderColor: k.border }]}>
                      <Text style={[styles.gageTitle, { color: k.text }, align]}>{t.gageTitle}</Text>
                      <Text style={[styles.gageLine, { color: k.text }, align]}>{line}</Text>
                      <Text style={[styles.gageText, { color: text }, align]}>{loserGage}</Text>
                    </View>
                  );
                })()}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { padding: spacing.xl, paddingBottom: 100 },
  hero: { marginBottom: spacing.lg },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xl },
  sub: { ...type.body, lineHeight: 20 },
  myCard: { borderRadius: radius.xl, padding: spacing.xxl, alignItems: 'center', marginBottom: spacing.lg },
  myLabel: { color: '#E7F5EC', ...type.sub },
  myScore: { color: '#fff', ...type.hero, fontSize: 48, letterSpacing: -2, marginTop: spacing.xs / 2 },
  myMax: { fontSize: 22, fontWeight: '700' },
  vsCard: { borderRadius: radius.xl, padding: spacing.xl, marginTop: spacing.lg, ...elevation.sm },
  vsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  vsP: { alignItems: 'center', flex: 1 },
  vsName: { ...type.body, fontWeight: '700' },
  vsScore: { fontSize: 38, fontWeight: '900', color: '#94A3B8', marginTop: spacing.xs },
  vsX: { fontSize: 16, fontWeight: '900', color: '#CBD5E1' },
  verdict: { textAlign: 'center', fontSize: 15, fontWeight: '800', marginTop: spacing.md },
  gageBox: { borderRadius: radius.md, borderWidth: 1, padding: spacing.md, marginTop: spacing.md },
  gageTitle: { ...type.sub, fontWeight: '900', marginBottom: spacing.xs },
  gageLine: { ...type.sub, fontWeight: '700', marginBottom: 2 },
  gageText: { fontSize: 16, fontWeight: '800', lineHeight: 22 },
});
