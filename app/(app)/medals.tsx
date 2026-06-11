import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, ActivityIndicator } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { Award } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import Medal from '../../components/Medal';
import { getMyMedals } from '../../lib/racesApi';
import { CHALLENGES, getMyChallengeProgress, streetViewUrl } from '../../lib/races';

const GREEN = '#2E8B57';
const CHALLENGE_FRAME: Record<string, string> = { 'casa-loop': 'casablanca' };

function fmt(d?: any): string {
  if (!d) return '';
  try {
    const dt = new Date(d);
    return `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}.${dt.getFullYear()}`;
  } catch { return ''; }
}

export default function Medals() {
  const [loading, setLoading] = useState(true);
  const [medals, setMedals] = useState<any[]>([]);
  const [err, setErr] = useState('');

  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress || '';
  const uname = user?.fullName || user?.firstName || '';

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    // Médailles serveur (courses Mongo) + médailles des défis Firestore terminés.
    const mongo = await getMyMedals().catch(() => { setErr(''); return []; });
    let chMedals: any[] = [];
    if (email) {
      const res = await Promise.all(CHALLENGES.map(async (c) => {
        const km = await getMyChallengeProgress(c.id, email).catch(() => null);
        if (km != null && km >= c.totalKm) {
          const last = c.pois && c.pois.length ? c.pois[c.pois.length - 1] : null;
          return { _id: 'ch_' + c.id, raceName: c.name, distanceKm: c.totalKm,
            frame: CHALLENGE_FRAME[c.id], userName: uname,
            photoUrl: last ? streetViewUrl(last.lat, last.lng, 300, 300) : undefined };
        }
        return null;
      }));
      chMedals = res.filter(Boolean) as any[];
    }
    setMedals([...(mongo || []), ...chMedals]);
    setLoading(false);
  }, [email, uname]);
  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={s.safe}>
      <ScreenTopBar />
      <ScrollView contentContainerStyle={s.body}>
        <View style={s.head}><Award size={26} color={GREEN} /><Text style={s.title}>Mes médailles</Text></View>
        <Text style={s.sub}>Termine une course virtuelle pour gagner sa médaille, avec ton classement, ton temps et ta photo.</Text>

        {loading ? <ActivityIndicator color={GREEN} style={{ marginTop: 40 }} />
          : medals.length ? (
            <View style={s.grid}>
              {medals.map((m, i) => (
                <View key={m._id || i} style={s.cell}>
                  <Medal width={150} frame={m.frame} title={m.raceName} km={m.distanceKm}
                    time={m.timeLabel} name={m.userName} rank={m.rank} photoUrl={m.photoUrl}
                    dates={m.startDate ? `${fmt(m.startDate)} — ${fmt(m.endDate)}` : ''} />
                </View>
              ))}
            </View>
          ) : (
            <View>
              <View style={s.empty}>
                <Text style={s.emptyTxt}>Aucune médaille pour l'instant.{err ? `\n(${err})` : ''}</Text>
                <Text style={s.emptyHint}>Voici à quoi ressemblera ta première médaille :</Text>
              </View>
              <View style={{ alignItems: 'center', marginTop: 8 }}>
                <Medal width={200} frame="rabat" title="Rabat" km={91} time="4h 28min" name="Toi" rank={3} dates="01.03.2025 — 28.05.2025" />
              </View>
            </View>
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 16 },
  cell: { width: '48%', alignItems: 'center', marginBottom: 16 },
  empty: { marginTop: 30, alignItems: 'center' },
  emptyTxt: { fontSize: 14, color: '#667085', textAlign: 'center', fontWeight: '600' },
  emptyHint: { fontSize: 12, color: '#94a3b8', marginTop: 14 },
});
