// Export médecin — résumé (profil + repas + poids) en CSV/texte, partagé via l'OS.
import React, { useEffect, useState } from 'react';
import { Image, View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator, Share } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { FileText, Share2 } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { getUserFromFirestore } from '../../lib/firebase';
import { getEntries } from '../../lib/tracking';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';

const GREEN = '#2E8B57';

const TXT: any = {
  en: {
    title: 'Export for your doctor',
    sub: 'A summary of your data (meals, activity, weight) to share with a health professional.',
    statLogs: 'meals/activities',
    statWeights: 'weigh-ins',
    btn: 'Share the summary (CSV)',
    note: 'CSV format — opens in Excel/Sheets, or send it by email. No data is sent to any third party: sharing goes through your phone.',
    csvHeader: 'SALORIE — Health summary',
    csvName: 'Name', csvGoal: 'Goal', csvWeight: 'Weight', csvTarget: 'Target kcal/day', csvGenerated: 'Generated on',
    csvMeals: 'MEALS & ACTIVITY (date,type,name,kcal)',
    csvWeights: 'WEIGHT (date,kg)',
    defaultUser: 'User',
    shareTitle: 'Salorie summary',
  },
  fr: {
    title: 'Export pour ton médecin',
    sub: 'Un résumé de tes données (repas, activité, poids) à partager avec un professionnel de santé.',
    statLogs: 'repas/activités',
    statWeights: 'pesées',
    btn: 'Partager le résumé (CSV)',
    note: "Format CSV — ouvrable dans Excel/Sheets, ou à envoyer par mail. Aucune donnée n'est transmise à un tiers : le partage passe par ton téléphone.",
    csvHeader: 'SALORIE — Résumé santé',
    csvName: 'Nom', csvGoal: 'Objectif', csvWeight: 'Poids', csvTarget: 'Cible kcal/j', csvGenerated: 'Généré le',
    csvMeals: 'REPAS & ACTIVITÉ (date,type,nom,kcal)',
    csvWeights: 'POIDS (date,kg)',
    defaultUser: 'Utilisateur',
    shareTitle: 'Résumé Salorie',
  },
  ar: {
    title: 'تصدير لطبيبك',
    sub: 'ملخص لبياناتك (الوجبات، النشاط، الوزن) لمشاركته مع أخصائي صحي.',
    statLogs: 'وجبات/أنشطة',
    statWeights: 'وزنات',
    btn: 'شارك الملخص (CSV)',
    note: 'صيغة CSV — يمكن فتحها في Excel/Sheets أو إرسالها بالبريد. لا تُرسَل أي بيانات لطرف ثالث: المشاركة تتم عبر هاتفك.',
    csvHeader: 'SALORIE — ملخص صحي',
    csvName: 'الاسم', csvGoal: 'الهدف', csvWeight: 'الوزن', csvTarget: 'الهدف سعرة/يوم', csvGenerated: 'أُنشئ في',
    csvMeals: 'الوجبات والنشاط (التاريخ,النوع,الاسم,سعرة)',
    csvWeights: 'الوزن (التاريخ,كغ)',
    defaultUser: 'مستخدم',
    shareTitle: 'ملخص Salorie',
  },
};

export default function DoctorExportScreen() {
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
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({ logs: 0, weights: 0, name: '' });
  const [csv, setCsv] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const p: any = await getUserFromFirestore(email, user?.id);
        const logs = await getEntries(email, 'logs', 90);
        const weights = await getEntries(email, 'weight_history', 60);
        const name = p?.firstName || (email ? email.split('@')[0] : t.defaultUser);
        let out = `${t.csvHeader}\n${t.csvName}: ${name}\n${t.csvGoal}: ${p?.goal || '—'} · ${t.csvWeight}: ${p?.weight || '—'} kg\n${t.csvTarget}: ${p?.nutritionalPlan?.dailyCalories || '—'}\n${t.csvGenerated}: ${new Date().toLocaleDateString('fr-FR')}\n\n`;
        out += `=== ${t.csvMeals} ===\n`;
        for (const l of logs) out += `${l.date || ''},${l.type || ''},${(l.name || '').replace(/,/g, ' ')},${Math.round(l.calories || 0)}\n`;
        out += `\n=== ${t.csvWeights} ===\n`;
        for (const w of weights) out += `${w.date || ''},${w.weight ?? ''}\n`;
        setCsv(out);
        setSummary({ logs: logs.length, weights: weights.length, name });
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  const share = async () => { try { await Share.share({ title: t.shareTitle, message: csv }); } catch {} };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body}>
        <Image source={require('../../assets/images/illustrations/analytics_cover.jpg')} style={{ width: '100%', height: 110, borderRadius: 18, marginBottom: 14 }} resizeMode="cover" />
        <View style={styles.head}><FileText size={24} color={GREEN} /><Text style={[styles.title, { color: text }]}>{t.title}</Text></View>
        <Text style={[styles.sub, { color: sub }, align]}>{t.sub}</Text>

        {loading ? <ActivityIndicator color={GREEN} style={{ marginTop: 30 }} /> : (
          <>
            <View style={styles.statsRow}>
              <View style={[styles.stat, { backgroundColor: card }]}><Text style={styles.statV}>{summary.logs}</Text><Text style={styles.statL}>{t.statLogs}</Text></View>
              <View style={[styles.stat, { backgroundColor: card }]}><Text style={styles.statV}>{summary.weights}</Text><Text style={styles.statL}>{t.statWeights}</Text></View>
            </View>
            <TouchableOpacity style={styles.btn} onPress={share}><Share2 size={20} color="#fff" /><Text style={styles.btnTxt}>{t.btn}</Text></TouchableOpacity>
            <Text style={[styles.note, align]}>{t.note}</Text>
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
