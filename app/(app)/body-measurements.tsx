// Mesures corporelles — tour de taille/hanches/bras/poitrine + historique.
import React, { useEffect, useState, useMemo } from 'react';
import { useTokens, type Tokens } from '../../constants/tokens';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { Ruler } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { FormCard, Stepper, SubmitBar } from '../../components/FormKit';
import { logEntry, getEntries } from '../../lib/tracking';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { useScreenGate } from '../../components/FeatureGate';

const FIELDS = [
  { key: 'waist' },
  { key: 'hips' },
  { key: 'chest' },
  { key: 'arms' },
];

const TXT: any = {
  en: {
    title: 'Body measurements',
    sub: "Track your body's progress (cm).",
    waist: 'Waist', hips: 'Hips', chest: 'Chest', arms: 'Arms',
    save: 'Save',
    lastEntry: 'Last entry',
  },
  fr: {
    title: 'Mesures corporelles',
    sub: "Suis l'évolution de ton corps (cm).",
    waist: 'Tour de taille', hips: 'Hanches', chest: 'Poitrine', arms: 'Bras',
    save: 'Enregistrer',
    lastEntry: 'Dernière saisie',
  },
  ar: {
    title: 'قياسات الجسم',
    sub: 'تابع تطور جسمك (سم).',
    waist: 'محيط الخصر', hips: 'الوركان', chest: 'الصدر', arms: 'الذراعان',
    save: 'حفظ',
    lastEntry: 'آخر إدخال',
  },
};

export default function BodyMeasurementsScreen() {
  const k = useTokens();
  const styles = useMemo(() => makeStyles(k), [k]);
  const __gate = useScreenGate('body-measurements');
  const { user } = useUser();
  const { resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';
  // Accent thémé : k.accent est le vert CLAIR ; en sombre on utilise le token
  // dark officiel (contraste correct sur fond sombre).
  // L'accent vient du theme : le couple clair/sombre fige
  // n'ouvrait que deux des six palettes.
  const accent = k.accent;
  const tok = useTokens();
  const bg = tok.bg;
  const text = tok.text;
  const sub = tok.textMuted;
  const align: any = { textAlign: isRTL ? 'right' : 'left' };

  const email = user?.primaryEmailAddress?.emailAddress || '';
  const [vals, setVals] = useState<Record<string, string>>({});
  const [last, setLast] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const e = await getEntries(email, 'measurements', 1);
    setLast(e[0] || null); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    const data: Record<string, number> = {};
    for (const f of FIELDS) { const n = parseFloat(vals[f.key]); if (!isNaN(n)) data[f.key] = n; }
    if (!Object.keys(data).length) return;
    setSaving(true);
    await logEntry(email, 'measurements', data);
    setVals({}); await load(); setSaving(false);
  };

  if (!__gate.ok) return __gate.node;

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.head}><Ruler size={24} color={accent} /><Text style={[styles.title, { color: text }]}>{t.title}</Text></View>
        <Text style={[styles.sub, { color: sub }, align]}>{t.sub}</Text>
        <FormCard>
          {FIELDS.map((f) => (
            <Stepper
              key={f.key}
              label={t[f.key]}
              value={vals[f.key] || ''}
              onChange={(v: string) => setVals((prev) => ({ ...prev, [f.key]: v }))}
              step={0.5}
              min={0}
              max={300}
              unit="cm"
            />
          ))}
        </FormCard>
        {loading ? <ActivityIndicator color={accent} style={{ marginTop: 20 }} /> : last && (
          <Text style={[styles.lastNote, { color: sub }, align]}>{t.lastEntry} ({last.date}) : {FIELDS.filter((f) => last[f.key] != null).map((f) => `${t[f.key]} ${last[f.key]}cm`).join(' · ') || '—'}</Text>
        )}
      </ScrollView>
      <SubmitBar label={t.save} onPress={save} loading={saving} />
    </SafeAreaView>
  );
}

// Fabrique thémée : ce StyleSheet lisait des jetons alors qu'il était
// évalué UNE FOIS à l'importation, avant que le thème n'existe. Les
// couleurs y étaient donc figées sur la palette par défaut, à vie.
const makeStyles = (k: Tokens) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: k.surfaceSunken },
  body: { padding: 20, paddingBottom: 100 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  title: { fontSize: 24, fontWeight: '900', color: k.text, letterSpacing: -0.5 },
  sub: { fontSize: 14, color: k.textMuted, marginBottom: 20 },
  lastNote: { fontSize: 13, color: k.textMuted, marginTop: 16, lineHeight: 19 },
});
