// Export médecin — résumé (profil + repas + poids) en CSV/texte, partagé via l'OS.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator, Share } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { FileText, Share2 } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { getUserFromFirestore } from '../../lib/firebase';
import { getEntries } from '../../lib/tracking';

const GREEN = '#2E8B57';

export default function DoctorExportScreen() {
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress || '';
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({ logs: 0, weights: 0, name: '' });
  const [csv, setCsv] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const p: any = await getUserFromFirestore(email, user?.id);
        const logs = await getEntries(email, 'logs', 90);
        const weights = await getEntries(email, 'weight_history', 60);
        const name = p?.firstName || (email ? email.split('@')[0] : 'Utilisateur');
        let out = `SALORIE — Résumé santé\nNom: ${name}\nObjectif: ${p?.goal || '—'} · Poids: ${p?.weight || '—'} kg\nCible kcal/j: ${p?.nutritionalPlan?.dailyCalories || '—'}\nGénéré le: ${new Date().toLocaleDateString('fr-FR')}\n\n`;
        out += `=== REPAS & ACTIVITÉ (date,type,nom,kcal) ===\n`;
        for (const l of logs) out += `${l.date || ''},${l.type || ''},${(l.name || '').replace(/,/g, ' ')},${Math.round(l.calories || 0)}\n`;
        out += `\n=== POIDS (date,kg) ===\n`;
        for (const w of weights) out += `${w.date || ''},${w.weight ?? ''}\n`;
        setCsv(out);
        setSummary({ logs: logs.length, weights: weights.length, name });
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  const share = async () => { try { await Share.share({ title: 'Résumé Salorie', message: csv }); } catch {} };

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.head}><FileText size={24} color={GREEN} /><Text style={styles.title}>Export pour ton médecin</Text></View>
        <Text style={styles.sub}>Un résumé de tes données (repas, activité, poids) à partager avec un professionnel de santé.</Text>

        {loading ? <ActivityIndicator color={GREEN} style={{ marginTop: 30 }} /> : (
          <>
            <View style={styles.statsRow}>
              <View style={styles.stat}><Text style={styles.statV}>{summary.logs}</Text><Text style={styles.statL}>repas/activités</Text></View>
              <View style={styles.stat}><Text style={styles.statV}>{summary.weights}</Text><Text style={styles.statL}>pesées</Text></View>
            </View>
            <TouchableOpacity style={styles.btn} onPress={share}><Share2 size={20} color="#fff" /><Text style={styles.btnTxt}>Partager le résumé (CSV)</Text></TouchableOpacity>
            <Text style={styles.note}>Format CSV — ouvrable dans Excel/Sheets, ou à envoyer par mail. Aucune donnée n'est transmise à un tiers : le partage passe par ton téléphone.</Text>
            <View style={styles.preview}><Text style={styles.previewTxt} numberOfLines={12}>{csv}</Text></View>
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
  title: { fontSize: 24, fontWeight: '900', color: '#0F172A', letterSpacing: -0.5 },
  sub: { fontSize: 14, color: '#64748B', marginBottom: 20, lineHeight: 20 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 18 },
  stat: { flex: 1, backgroundColor: '#fff', borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
  statV: { fontSize: 28, fontWeight: '900', color: GREEN },
  statL: { fontSize: 12, color: '#94A3B8', marginTop: 4 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: GREEN, borderRadius: 14, paddingVertical: 15 },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  note: { fontSize: 12.5, color: '#94A3B8', marginTop: 14, lineHeight: 18 },
  preview: { backgroundColor: '#0F172A', borderRadius: 14, padding: 14, marginTop: 16 },
  previewTxt: { color: '#94F5C0', fontSize: 11, fontFamily: 'monospace', lineHeight: 16 },
});
