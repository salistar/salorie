// Suivi du sommeil — heures dormies + qualité, avec historique.
import React, { useEffect, useState, useMemo } from 'react';
import { useTokens, type Tokens } from '../../constants/tokens';
import {
  Image,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { Moon, Check } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { FormCard, Stepper, ChipGroup } from '../../components/FormKit';
import { EmptyState, SkeletonCard } from '../../components/ui';
import { logEntry, getEntries } from '../../lib/tracking';
import { useTranslation } from '../../lib/i18n';
import { useTheme } from '../../lib/ThemeContext';
import { type } from '../../constants/theme';
import { useScreenGate } from '../../components/FeatureGate';

const QUALITY = ['😫', '😴', '😐', '🙂', '🤩'];

const TXT: any = {
  en: {
    title: 'Sleep tracker', sub: 'How many hours did you sleep?', hours: 'hours', quality: 'Quality', save: 'Save my night', last7: 'Last 7 days', empty: 'No night logged yet.',
    recovery: 'Recovery', recLow: 'Low recovery — aim for 7-9h', recGood: 'Good recovery', recHigh: 'Plenty of rest, all good', recHint: 'Sleep shapes your energy and cravings the next day.',
    disclaimer: 'Indicative only, not medical advice.',
  },
  fr: {
    title: 'Suivi du sommeil', sub: "Combien d'heures as-tu dormi ?", hours: 'heures', quality: 'Qualité', save: 'Enregistrer ma nuit', last7: '7 derniers jours', empty: 'Aucune nuit enregistrée.',
    recovery: 'Récupération', recLow: 'Récupération faible — vise 7-9h', recGood: 'Bonne récupération', recHigh: 'Repos suffisant, tout va bien', recHint: "Le sommeil influence ton énergie et tes fringales le lendemain.",
    disclaimer: 'Indicatif, pas un avis médical.',
  },
  ar: {
    title: 'تتبع النوم', sub: 'كم ساعة نمت؟', hours: 'ساعات', quality: 'الجودة', save: 'حفظ ليلتي', last7: 'آخر 7 أيام', empty: 'لم تُسجَّل أي ليلة بعد.',
    recovery: 'التعافي', recLow: 'تعافٍ ضعيف — استهدف 7-9 ساعات', recGood: 'تعافٍ جيد', recHigh: 'راحة كافية، كل شيء على ما يرام', recHint: 'النوم يؤثر على طاقتك ورغباتك في الطعام في اليوم التالي.',
    disclaimer: 'إرشادي فقط، وليس نصيحة طبية.',
  },
};

// Note de récupération non-clinique dérivée des heures saisies (présentation seulement).
function recoveryNote(t: any, h: number): { label: string; color: string } {
  if (h < 6) return { label: t.recLow, color: '#EF4444' };
  if (h <= 9) return { label: t.recGood, color: '#16A34A' }; // sens SEMANTIQUE (bon), pas l accent de marque
  return { label: t.recHigh, color: '#F59E0B' };
}

export default function SleepTrackerScreen() {
  const k = useTokens();
  const styles = useMemo(() => makeStyles(k), [k]);
  const __gate = useScreenGate('sleep-tracker');
  const { user } = useUser();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  // Accent thémé : k.accent est le vert CLAIR ; en sombre on utilise le token
  // dark officiel (contraste correct sur fond sombre).
  // L'accent vient du theme : le couple clair/sombre fige
  // n'ouvrait que deux des six palettes.
  const accent = k.accent;
  const tok = useTokens();
  const bg = tok.bg;
  const card = tok.surface;
  const text = tok.text;
  const sub = tok.textMuted;
  const align: any = { textAlign: isRTL ? 'right' : 'left' };

  const email = user?.primaryEmailAddress?.emailAddress || '';
  const [hours, setHours] = useState(7.5);
  const [quality, setQuality] = useState(3);
  const [hist, setHist] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => { setHist(await getEntries(email, 'sleep', 7)); setLoading(false); };
  useEffect(() => { load(); }, []);

  const save = async () => { setSaving(true); await logEntry(email, 'sleep', { hours, quality }); await load(); setSaving(false); };

  if (!__gate.ok) return __gate.node;

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body}>
        <Image source={require('../../assets/images/abstraits/hero-sante.jpg')} style={{ width: '100%', height: 110, borderRadius: 18, marginBottom: 14 }} resizeMode="cover" />
        <View style={styles.head}><Moon size={24} color={accent} /><Text style={[styles.title, { color: text }]}>{t.title}</Text></View>
        <Text style={[styles.sub, { color: sub }, align]}>{t.sub}</Text>

        <FormCard>
          <Stepper
            label={t.hours}
            value={String(hours)}
            onChange={(v: string) => setHours(Math.max(0, Math.min(14, Number(v) || 0)))}
            step={0.5}
            min={0}
            max={14}
            unit="h"
          />
          <ChipGroup
            label={t.quality}
            value={quality}
            onChange={setQuality}
            options={QUALITY.map((e, i) => ({ value: i + 1, label: e }))}
          />
        </FormCard>

        {(() => {
          const rec = recoveryNote(t, hours);
          return (
            <View style={[styles.recCard, { backgroundColor: card, borderColor: rec.color }]}>
              <View style={[styles.recDot, { backgroundColor: rec.color }]} />
              <View style={styles.recTextWrap}>
                <Text style={[styles.recLabel, { color: sub }, align]}>{t.recovery}</Text>
                <Text style={[styles.recValue, { color: text }, align]}>{rec.label}</Text>
                <Text style={[styles.recHint, { color: sub }, align]}>{t.recHint}</Text>
              </View>
            </View>
          );
        })()}

        <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <><Check size={20} color="#fff" /><Text style={styles.saveTxt}>{t.save}</Text></>}
        </TouchableOpacity>

        <Text style={[styles.label, { color: sub }, align]}>{t.last7}</Text>
        {loading ? <><SkeletonCard /><SkeletonCard /><SkeletonCard /></> : hist.length === 0 ? <EmptyState icon={<Moon size={26} color={accent} />} title={t.empty} /> : hist.map((h) => (
          <View key={h.id} style={[styles.histRow, { backgroundColor: card }]}>
            <Text style={[styles.histDate, { color: sub }]}>{h.date}</Text>
            <Text style={[styles.histVal, { color: text }]}>{h.hours}h {QUALITY[(h.quality || 3) - 1]}</Text>
          </View>
        ))}

        <Text style={[styles.disclaimer, { color: sub }]}>{t.disclaimer}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// Fabrique thémée : ce StyleSheet lisait des jetons alors qu'il était
// évalué UNE FOIS à l'importation, avant que le thème n'existe. Les
// couleurs y étaient donc figées sur la palette par défaut, à vie.
const makeStyles = (k: Tokens) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F7F9' },
  body: { padding: 20, paddingBottom: 100 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  title: { fontSize: 24, fontWeight: '900', color: '#0F172A', letterSpacing: -0.5 },
  sub: { fontSize: 14, color: '#64748B', marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 8 },
  recCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 16, borderLeftWidth: 4, padding: 14, marginBottom: 12 },
  recDot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  recTextWrap: { flex: 1 },
  recLabel: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  recValue: { fontSize: 15, fontWeight: '800', marginBottom: 4 },
  recHint: { fontSize: 12, fontWeight: '500', lineHeight: 17 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: k.accent, borderRadius: 16, paddingVertical: 15, marginBottom: 8 },
  saveTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  empty: { color: '#94A3B8', fontSize: 14 },
  histRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 8 },
  histDate: { fontSize: 13, color: '#64748B' },
  histVal: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  disclaimer: { ...type.micro, textAlign: 'center', marginTop: 18, opacity: 0.75 },
});
