// Battle nutrition 1v1 — compare ton score d'assiduité hebdo avec un ami.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Swords, Search } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { db, emailToDocId, getUserFromFirestore } from '../../lib/firebase';
import { getEntries } from '../../lib/tracking';

const GREEN = '#2E8B57';
const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function BattleScreen() {
  const { user } = useUser();
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
    if (!e || !e.includes('@')) { setErr('Entre l\'email de ton ami.'); return; }
    setErr(''); setBusy(true); setResult(null);
    try {
      const p: any = await getUserFromFirestore(e, undefined);
      if (!p) { setErr('Ami introuvable (il doit avoir un compte Salorie).'); }
      else { setResult({ name: p.firstName || e.split('@')[0], score: Number(p?.publicStats?.weeklyScore ?? -1) }); }
    } catch { setErr('Impossible de récupérer ce profil.'); } finally { setBusy(false); }
  };

  const verdict = result && result.score >= 0 ? (myScore > result.score ? 'Tu mènes ! 🏆' : myScore < result.score ? 'Tu es mené, accroche-toi ! 💪' : 'Égalité parfaite ⚖️') : null;

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.head}><Swords size={24} color={GREEN} /><Text style={styles.title}>Battle 1v1</Text></View>
        <Text style={styles.sub}>Score d'assiduité = jours actifs sur 7 jours. Défie un ami !</Text>

        {loading ? <ActivityIndicator color={GREEN} style={{ marginTop: 20 }} /> : (
          <>
            <View style={styles.myCard}>
              <Text style={styles.myLabel}>Ton score cette semaine</Text>
              <Text style={styles.myScore}>{myScore}<Text style={styles.myMax}>/7</Text></Text>
            </View>

            <View style={styles.searchRow}>
              <Search size={20} color="#94A3B8" />
              <TextInput style={styles.input} placeholder="Email de ton ami" autoCapitalize="none" keyboardType="email-address" value={friend} onChangeText={setFriend} onSubmitEditing={challenge} />
              <TouchableOpacity style={styles.go} onPress={challenge}><Text style={styles.goTxt}>Défier</Text></TouchableOpacity>
            </View>
            {!!err && <Text style={styles.err}>{err}</Text>}
            {busy && <ActivityIndicator color={GREEN} style={{ marginTop: 16 }} />}

            {result && (
              <View style={styles.vsCard}>
                <View style={styles.vsRow}>
                  <View style={styles.vsP}><Text style={styles.vsName}>Toi</Text><Text style={[styles.vsScore, { color: GREEN }]}>{myScore}</Text></View>
                  <Text style={styles.vsX}>VS</Text>
                  <View style={styles.vsP}><Text style={styles.vsName}>{result.name}</Text><Text style={styles.vsScore}>{result.score >= 0 ? result.score : '—'}</Text></View>
                </View>
                <Text style={styles.verdict}>{result.score >= 0 ? verdict : `${result.name} n'a pas encore de score publié — invite-le à ouvrir Battle.`}</Text>
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
