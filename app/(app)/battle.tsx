// Battle nutrition 1v1 — compare ton score d'assiduité hebdo avec un ami.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Swords, Search } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { db, emailToDocId, getUserFromFirestore } from '../../lib/firebase';
import { getEntries } from '../../lib/tracking';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';

const GREEN = '#2E8B57';
const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

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
  },
};

export default function BattleScreen() {
  const { user } = useUser();
  const { resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';
  const bg = isDark ? '#0f172a' : '#F4F7F9';
  const card = isDark ? '#1e293b' : '#ffffff';
  const text = isDark ? '#f1f5f9' : '#0F172A';
  const sub = isDark ? '#94a3b8' : '#64748B';
  const align: any = { textAlign: isRTL ? 'right' : 'left' };

  const email = user?.primaryEmailAddress?.emailAddress || '';
  const [myScore, setMyScore] = useState(0);
  const [friend, setFriend] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ name: string; score: number } | null>(null);
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
        // Publie le score pour que les amis puissent te défier.
        const id = emailToDocId(email);
        if (id) await setDoc(doc(db, 'users', id), { publicStats: { weeklyScore: s, updatedAt: serverTimestamp() } }, { merge: true });
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  const challenge = async () => {
    const e = friend.trim().toLowerCase();
    if (!e || !e.includes('@')) { setErr(t.errEmail); return; }
    setErr(''); setBusy(true); setResult(null);
    try {
      const p: any = await getUserFromFirestore(e, undefined);
      if (!p) { setErr(t.errNotFound); }
      else { setResult({ name: p.firstName || e.split('@')[0], score: Number(p?.publicStats?.weeklyScore ?? -1) }); }
    } catch { setErr(t.errProfile); } finally { setBusy(false); }
  };

  const verdict = result && result.score >= 0 ? (myScore > result.score ? t.leading : myScore < result.score ? t.behind : t.tie) : null;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.head}><Swords size={24} color={GREEN} /><Text style={[styles.title, { color: text }]}>{t.title}</Text></View>
        <Text style={[styles.sub, { color: sub }, align]}>{t.sub}</Text>

        {loading ? <ActivityIndicator color={GREEN} style={{ marginTop: 20 }} /> : (
          <>
            <View style={styles.myCard}>
              <Text style={styles.myLabel}>{t.myLabel}</Text>
              <Text style={styles.myScore}>{myScore}<Text style={styles.myMax}>/7</Text></Text>
            </View>

            <View style={[styles.searchRow, { backgroundColor: card }]}>
              <Search size={20} color={sub} />
              <TextInput
                style={[styles.input, { color: text }]}
                placeholder={t.placeholder}
                placeholderTextColor={sub}
                autoCapitalize="none"
                keyboardType="email-address"
                value={friend}
                onChangeText={setFriend}
                onSubmitEditing={challenge}
              />
              <TouchableOpacity style={styles.go} onPress={challenge}><Text style={styles.goTxt}>{t.challenge}</Text></TouchableOpacity>
            </View>
            {!!err && <Text style={[styles.err, align]}>{err}</Text>}
            {busy && <ActivityIndicator color={GREEN} style={{ marginTop: 16 }} />}

            {result && (
              <View style={[styles.vsCard, { backgroundColor: card }]}>
                <View style={styles.vsRow}>
                  <View style={styles.vsP}><Text style={[styles.vsName, { color: text }]}>{t.you}</Text><Text style={[styles.vsScore, { color: GREEN }]}>{myScore}</Text></View>
                  <Text style={styles.vsX}>VS</Text>
                  <View style={styles.vsP}><Text style={[styles.vsName, { color: text }]}>{result.name}</Text><Text style={styles.vsScore}>{result.score >= 0 ? result.score : '—'}</Text></View>
                </View>
                <Text style={[styles.verdict, { color: text }]}>{result.score >= 0 ? verdict : `${result.name} ${t.noScore}`}</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F7F9' },
  body: { padding: 20, paddingBottom: 100 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  title: { fontSize: 26, fontWeight: '900', color: '#0F172A', letterSpacing: -0.5 },
  sub: { fontSize: 14, color: '#64748B', marginBottom: 20, lineHeight: 20 },
  myCard: { backgroundColor: GREEN, borderRadius: 20, padding: 22, alignItems: 'center', marginBottom: 18 },
  myLabel: { color: '#E7F5EC', fontSize: 13, fontWeight: '600' },
  myScore: { color: '#fff', fontSize: 48, fontWeight: '900', letterSpacing: -2, marginTop: 2 },
  myMax: { fontSize: 22, fontWeight: '700' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 4 },
  input: { flex: 1, fontSize: 15, color: '#0F172A', paddingVertical: 12 },
  go: { backgroundColor: GREEN, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 },
  goTxt: { color: '#fff', fontWeight: '800' },
  err: { color: '#E11D48', fontSize: 13, marginTop: 10 },
  vsCard: { backgroundColor: '#fff', borderRadius: 20, padding: 20, marginTop: 18, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  vsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  vsP: { alignItems: 'center', flex: 1 },
  vsName: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  vsScore: { fontSize: 38, fontWeight: '900', color: '#94A3B8', marginTop: 4 },
  vsX: { fontSize: 16, fontWeight: '900', color: '#CBD5E1' },
  verdict: { textAlign: 'center', fontSize: 15, fontWeight: '800', color: '#0F172A', marginTop: 14 },
});
