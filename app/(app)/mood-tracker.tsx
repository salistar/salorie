// Suivi de l'humeur & énergie — emoji quotidien + historique.
import React, { useEffect, useState } from 'react';
import { useEspaceBasSimple } from '../../lib/espaceBas';
import { useTokens } from '../../constants/tokens';
import { Image, View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { Smile, Check, Zap } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { Card, EmptyState, SkeletonCard } from '../../components/ui';
import { logEntry, getEntries } from '../../lib/tracking';
import { useTranslation } from '../../lib/i18n';
import { useTheme } from '../../lib/ThemeContext';
import { rowDir, txtAlign } from '../../lib/rtl';
import { useScreenGate } from '../../components/FeatureGate';

const GREEN = '#2E8B57';
const MOODS = ['😞', '😕', '😐', '🙂', '😄'];

const TXT: any = {
  en: { title: 'Mood & energy', sub: 'How are you feeling today?', mood: 'Mood', energy: 'Energy', save: 'Save', last7: 'Last 7 days', empty: 'Nothing yet.', insightTitle: 'Insight', insightMore: 'Keep logging — a few more days and patterns start to show.', insightHigh: 'You logged solid energy this week. A steady, protein-rich diet often helps keep it up.', insightLow: 'Energy dipped a little lately. Regular meals and enough protein can help pick it back up.', insightNeutral: 'Nice steady week. Balanced meals help keep your energy on track.' },
  fr: { title: 'Humeur & énergie', sub: "Comment te sens-tu aujourd'hui ?", mood: 'Humeur', energy: 'Énergie', save: 'Enregistrer', last7: '7 derniers jours', empty: 'Rien encore.', insightTitle: 'À retenir', insightMore: 'Continue de noter — encore quelques jours et des tendances apparaîtront.', insightHigh: "Belle énergie cette semaine. Une alimentation régulière et riche en protéines aide souvent à la maintenir.", insightLow: "L'énergie a un peu baissé ces jours-ci. Des repas réguliers et assez de protéines peuvent aider à la relancer.", insightNeutral: 'Semaine bien stable. Des repas équilibrés aident à garder ton énergie sur la bonne voie.' },
  ar: { title: 'المزاج والطاقة', sub: 'كيف تشعر اليوم؟', mood: 'المزاج', energy: 'الطاقة', save: 'حفظ', last7: 'آخر 7 أيام', empty: 'لا شيء بعد.', insightTitle: 'ملاحظة', insightMore: 'واصل التسجيل — بضعة أيام أخرى وستظهر الأنماط.', insightHigh: 'سجّلت طاقة جيدة هذا الأسبوع. نظام غذائي منتظم وغني بالبروتين يساعد غالبًا على الحفاظ عليها.', insightLow: 'انخفضت الطاقة قليلاً مؤخرًا. وجبات منتظمة وبروتين كافٍ يمكن أن يساعدا على استعادتها.', insightNeutral: 'أسبوع مستقر جميل. الوجبات المتوازنة تساعد على إبقاء طاقتك في المسار الصحيح.' },
};

export default function MoodTrackerScreen() {
  const __gate = useScreenGate('mood-tracker');
  const { user } = useUser();
  const espaceBas = useEspaceBasSimple();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  const accent = isDark ? '#4ade80' : GREEN;
  const tok = useTokens();
  const bg = tok.bg;
  const card = tok.surface;
  const text = tok.text;
  const sub = tok.textMuted;
  const align: any = { textAlign: txtAlign(isRTL) };

  const email = user?.primaryEmailAddress?.emailAddress || '';
  const [mood, setMood] = useState(4);
  const [energy, setEnergy] = useState(3);
  const [hist, setHist] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => { setHist(await getEntries(email, 'mood', 7)); setLoading(false); };
  useEffect(() => { load(); }, []);

  // FEATURE #198 — note simple, non-clinique, sur l'énergie de la semaine (à partir des
  // données déjà chargées). Les totaux nutritionnels du jour ne sont pas dérivables ici
  // (le fichier ne lit que la collection `mood`), donc corrélation nutrition en skipped :
  // on reste sur un encart générique motivant.
  const energyVals = hist.map((h) => Number(h?.energy)).filter((n) => Number.isFinite(n) && n > 0);
  const avgEnergy = energyVals.length ? energyVals.reduce((a, b) => a + b, 0) / energyVals.length : 0;
  const insightMsg = energyVals.length < 3 ? t.insightMore : avgEnergy >= 3.75 ? t.insightHigh : avgEnergy <= 2.25 ? t.insightLow : t.insightNeutral;
  const save = async () => { setSaving(true); await logEntry(email, 'mood', { mood, energy }); await load(); setSaving(false); };

  if (!__gate.ok) return __gate.node;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: espaceBas }]}>
        <Image source={require('../../assets/images/illustrations/running.jpg')} style={{ width: '100%', height: 110, borderRadius: 18, marginBottom: 14 }} resizeMode="cover" />
        <View style={[styles.head, { flexDirection: rowDir(isRTL) }]}><Smile size={24} color={accent} /><Text style={[styles.title, { color: text }]}>{t.title}</Text></View>
        <Text style={[styles.sub, { color: sub }, align]}>{t.sub}</Text>

        <Text style={[styles.label, { color: sub }, align]}>{t.mood}</Text>
        <View style={[styles.row, { flexDirection: rowDir(isRTL) }]}>
          {MOODS.map((e, i) => (
            <TouchableOpacity key={i} style={[styles.btn, { backgroundColor: card }, mood === i + 1 && { borderColor: accent, backgroundColor: isDark ? '#173a26' : '#EAF4EE' }]} onPress={() => setMood(i + 1)}><Text style={styles.emoji}>{e}</Text></TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.label, { color: sub }, align]}><Zap size={13} color={sub} /> {t.energy}</Text>
        <View style={[styles.row, { flexDirection: rowDir(isRTL) }]}>
          {[1, 2, 3, 4, 5].map((n) => (
            <TouchableOpacity key={n} style={[styles.lvl, { backgroundColor: card }, energy >= n && { backgroundColor: accent }]} onPress={() => setEnergy(n)}><Text style={[styles.lvlTxt, energy >= n && { color: '#fff' }]}>{n}</Text></TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={[styles.saveBtn, { backgroundColor: accent }]} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <><Check size={20} color="#fff" /><Text style={styles.saveTxt}>{t.save}</Text></>}
        </TouchableOpacity>

        <Text style={[styles.label, { color: sub }, align]}>{t.last7}</Text>
        {loading ? <><SkeletonCard height={64} /><SkeletonCard height={64} /><SkeletonCard height={64} /></> : hist.length === 0 ? <EmptyState icon={<Smile size={26} color={accent} />} title={t.empty} /> : hist.map((h) => (
          <View key={h.id} style={[styles.histRow, { backgroundColor: card, flexDirection: rowDir(isRTL) }]}>
            <Text style={[styles.histDate, { color: sub }]}>{h.date}</Text>
            <Text style={[styles.histVal, { color: text }]}>{MOODS[(h.mood || 3) - 1]}  ⚡{h.energy || '—'}/5</Text>
          </View>
        ))}

        {!loading ? (
          <Card variant="outline" style={styles.insightCard}>
            <View style={[styles.insightHead, { flexDirection: rowDir(isRTL) }]}>
              <Zap size={16} color={accent} />
              <Text style={[styles.insightTitle, { color: text }, align]}>{t.insightTitle}</Text>
            </View>
            <Text style={[styles.insightBody, { color: sub }, align]}>{insightMsg}</Text>
          </Card>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F7F9' },
  body: { padding: 20, paddingBottom: 100 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  title: { fontSize: 24, fontWeight: '900', color: '#0F172A', letterSpacing: -0.5 },
  sub: { fontSize: 14, color: '#64748B', marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
  btn: { width: 56, height: 56, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  emoji: { fontSize: 26 },
  lvl: { width: 56, height: 48, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  lvlTxt: { fontSize: 16, fontWeight: '800', color: '#94A3B8' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: GREEN, borderRadius: 16, paddingVertical: 15, marginBottom: 8 },
  saveTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  empty: { color: '#94A3B8', fontSize: 14 },
  histRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 8 },
  histDate: { fontSize: 13, color: '#64748B' },
  histVal: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  insightCard: { marginTop: 16 },
  insightHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  insightTitle: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  insightBody: { fontSize: 14, lineHeight: 20 },
});
