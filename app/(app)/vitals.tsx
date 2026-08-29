// Suivi GLYCÉMIE / TENSION — boucle santé reliée au régime médical.
// Saisie rapide (glycémie + tension), historique, mini-graphe, alertes colorées
// + conseil ("parle à ton médecin"). i18n/dark/RTL/retour. Best-effort (Firestore).
import React, { useEffect, useMemo, useState } from 'react';
import { a11y } from '../../lib/a11y';
import { useTokens } from '../../constants/tokens';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { Droplet, Heart, Check, AlertTriangle, TrendingUp, TrendingDown, Minus, Trash2 } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { useScreenGate } from '../../components/FeatureGate';
import { SkeletonCard, Skeleton, PrimaryButton } from '../../components/ui';
import { FormCard, Stepper, ChipGroup } from '../../components/FormKit';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { rowDir } from '../../lib/rtl';
import { getDietPrefs } from '../../lib/dietPrefs';
import {
  logGlucose, logBP, listGlucose, listBP,
  glucoseTrend, bpTrend, glucoseAlert, bpAlert, deleteVital,
  GlucoseEntry, BPEntry, GlucoseContext, Trend, VitalAlert,
} from '../../lib/vitals';

const AMBER = '#F59E0B';

const CTX_ORDER: GlucoseContext[] = ['fasting', 'pre_meal', 'post_meal', 'bedtime', 'random'];

// Dictionnaire local — self-contained.
const TXT: any = {
  en: {
    title: 'Glucose & blood pressure',
    sub: 'Log your readings to follow your health loop. Not a medical diagnosis.',
    glucose: 'Blood glucose', bp: 'Blood pressure',
    save: 'Save', saved: 'Saved',
    history: 'History', empty: 'No readings yet.',
    trend: 'Trend', avg: 'avg', range: 'range',
    sys: 'Systolic', dia: 'Diastolic', pulse: 'Pulse (optional)',
    seeDoctor: 'Talk to your doctor if this repeats.',
    ctx: { fasting: 'Fasting', pre_meal: 'Before meal', post_meal: 'After meal', bedtime: 'Bedtime', random: 'Random' },
    alert: {
      glucose_low: 'Low blood glucose', glucose_high: 'High blood glucose',
      bp_high: 'High blood pressure', bp_low: 'Low blood pressure',
    },
    related: 'Linked to your declared condition.',
    sodiumTip: 'Elevated reading: consider cutting back on salt and staying well hydrated.',
  },
  fr: {
    title: 'Glycémie & tension',
    sub: 'Note tes mesures pour suivre ta boucle santé. Pas un diagnostic médical.',
    glucose: 'Glycémie', bp: 'Tension artérielle',
    save: 'Enregistrer', saved: 'Enregistré',
    history: 'Historique', empty: 'Aucune mesure.',
    trend: 'Tendance', avg: 'moy', range: 'plage',
    sys: 'Systolique', dia: 'Diastolique', pulse: 'Pouls (optionnel)',
    seeDoctor: 'Parle à ton médecin si cela se répète.',
    ctx: { fasting: 'À jeun', pre_meal: 'Avant repas', post_meal: 'Après repas', bedtime: 'Coucher', random: 'Aléatoire' },
    alert: {
      glucose_low: 'Glycémie basse', glucose_high: 'Glycémie élevée',
      bp_high: 'Tension élevée', bp_low: 'Tension basse',
    },
    related: 'Reliée à ta condition déclarée.',
    sodiumTip: 'Mesure élevée : pense à réduire le sel et à bien t\'hydrater.',
  },
  ar: {
    title: 'سكر الدم والضغط',
    sub: 'سجّل قياساتك لمتابعة حلقتك الصحية. ليس تشخيصاً طبياً.',
    glucose: 'سكر الدم', bp: 'ضغط الدم',
    save: 'حفظ', saved: 'تم الحفظ',
    history: 'السجل', empty: 'لا قياسات بعد.',
    trend: 'الاتجاه', avg: 'متوسط', range: 'المدى',
    sys: 'الانقباضي', dia: 'الانبساطي', pulse: 'النبض (اختياري)',
    seeDoctor: 'تحدث مع طبيبك إذا تكرر ذلك.',
    ctx: { fasting: 'صائم', pre_meal: 'قبل الوجبة', post_meal: 'بعد الوجبة', bedtime: 'قبل النوم', random: 'عشوائي' },
    alert: {
      glucose_low: 'سكر منخفض', glucose_high: 'سكر مرتفع',
      bp_high: 'ضغط مرتفع', bp_low: 'ضغط منخفض',
    },
    related: 'مرتبطة بحالتك المعلنة.',
    sodiumTip: 'قياس مرتفع: فكّر في تقليل الملح والحرص على شرب الماء.',
  },
};

function TrendIcon({ dir, color }: { dir: Trend['direction']; color: string }) {
  if (dir === 'up') return <TrendingUp size={14} color={color} />;
  if (dir === 'down') return <TrendingDown size={14} color={color} />;
  return <Minus size={14} color={color} />;
}

export default function VitalsScreen() {
  const k = useTokens();
  const __gate = useScreenGate('vitals');
  const { resolved, colors } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';
  const tok = useTokens();
  const bg = tok.bg;
  const card = tok.surface;
  const text = tok.text;
  const sub = tok.textMuted;
  // L'accent vient du theme : le couple clair/sombre fige
  // n'ouvrait que deux des six palettes.
  const accent = k.accent;
  const track = isDark ? '#283241' : '#E8EDF2';
  const align: any = { textAlign: isRTL ? 'right' : 'left' };

  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress || '';

  const [gVal, setGVal] = useState('');
  const [gCtx, setGCtx] = useState<GlucoseContext>('fasting');
  const [sys, setSys] = useState('');
  const [dia, setDia] = useState('');
  const [pulse, setPulse] = useState('');

  const [glu, setGlu] = useState<GlucoseEntry[]>([]);
  const [bp, setBp] = useState<BPEntry[]>([]);
  const [conditions, setConditions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingG, setSavingG] = useState(false);
  const [savingB, setSavingB] = useState(false);

  const load = async () => {
    const [g, b] = await Promise.all([listGlucose(email, 30), listBP(email, 30)]);
    setGlu(g); setBp(b); setLoading(false);
  };
  useEffect(() => {
    load();
    getDietPrefs().then((p) => setConditions(Array.isArray(p.conditions) ? p.conditions : [])).catch(() => {});
  }, []);

  const saveG = async () => {
    const v = parseFloat(gVal);
    if (isNaN(v) || v <= 0) return;
    setSavingG(true);
    await logGlucose(email, { mgdl: v, context: gCtx });
    setGVal('');
    await load();
    setSavingG(false);
  };
  const saveB = async () => {
    const s = parseFloat(sys); const d = parseFloat(dia); const p = parseFloat(pulse);
    if (isNaN(s) || isNaN(d) || s <= 0 || d <= 0) return;
    setSavingB(true);
    await logBP(email, { systolic: s, diastolic: d, pulse: isNaN(p) ? undefined : p });
    setSys(''); setDia(''); setPulse('');
    await load();
    setSavingB(false);
  };

  const gTrend = useMemo(() => glucoseTrend(glu), [glu]);
  const bTrend = useMemo(() => bpTrend(bp), [bp]);

  // Alertes actives = calculées sur la mesure la plus récente de chaque type.
  const activeAlerts = useMemo(() => {
    const out: VitalAlert[] = [];
    if (glu[0]) { const a = glucoseAlert(glu[0].mgdl, conditions); if (a) out.push(a); }
    if (bp[0]) { const a = bpAlert(bp[0].systolic, bp[0].diastolic, conditions); if (a) out.push(a); }
    return out;
  }, [glu, bp, conditions]);

  // Note additive (présentation seulement) : si la dernière tension est élevée
  // (systolique>=140 ou diastolique>=90), on suggère de réduire le sodium et
  // de s'hydrater. N'altère aucun calcul ni alerte existante.
  const bpElevated = useMemo(
    () => !!bp[0] && (bp[0].systolic >= 140 || bp[0].diastolic >= 90),
    [bp],
  );

  const del = async (kind: 'glucose' | 'blood_pressure', id?: string) => {
    if (!id) return;
    await deleteVital(email, kind, id);
    await load();
  };

  if (!__gate.ok) return __gate.node;

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} title={t.title} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={[styles.sub, { color: sub }, align]}>{t.sub}</Text>

        {/* ALERTES colorées + conseil médecin */}
        {activeAlerts.map((a, i) => {
          const danger = a.severity === 'danger';
          const c = danger ? colors.error : AMBER;
          return (
            <View key={i} style={[styles.alert, { backgroundColor: c + '18', borderColor: c + '55', flexDirection: rowDir(isRTL) }]}>
              <AlertTriangle size={20} color={c} />
              <View style={{ flex: 1, marginHorizontal: 10 }}>
                <Text style={[styles.alertTitle, { color: c }, align]}>{t.alert[a.kind]} · {a.value}</Text>
                <Text style={[styles.alertBody, { color: sub }, align]}>
                  {a.related ? `${t.related} ` : ''}{t.seeDoctor}
                </Text>
              </View>
            </View>
          );
        })}

        {/* ---- GLYCÉMIE ---- */}
        <View style={[styles.head, { flexDirection: rowDir(isRTL) }]}>
          <Droplet size={22} color={colors.error} />
          <Text style={[styles.section, { color: text }, align]}>{t.glucose}</Text>
        </View>
        <FormCard>
          <Stepper value={gVal} onChange={setGVal} step={1} min={0} max={600} unit="mg/dL" />
          <ChipGroup value={gCtx} onChange={(v: string) => setGCtx(v as GlucoseContext)}
            options={CTX_ORDER.map((c) => ({ value: c, label: t.ctx[c] }))} />
        </FormCard>
        <PrimaryButton
          title={t.save}
          onPress={saveG}
          loading={savingG}
          disabled={savingG}
          icon={<Check size={20} color="#fff" />}
          style={{ marginBottom: 8 }}
        />

        {gTrend && (
          <TrendCard trend={gTrend} label={t.trend} avg={t.avg} range={t.range} unit="mg/dL"
            spark={glu.slice(0, 14).map((e) => e.mgdl)} {...{ card, text, sub, track, accent, isDark, isRTL }} />
        )}

        {/* Historique glycémie */}
        {loading ? (
          <View style={{ marginVertical: 8 }}>
            <Skeleton width={140} height={60} style={{ borderRadius: 16, marginBottom: 14, alignSelf: isRTL ? 'flex-end' : 'flex-start' }} />
            <SkeletonCard height={64} />
            <SkeletonCard height={64} />
            <SkeletonCard height={64} />
          </View>
        ) : glu.length === 0 ? (
          <Text style={[styles.empty, { color: sub }, align]}>{t.empty}</Text>
        ) : glu.slice(0, 12).map((h) => {
          const a = glucoseAlert(h.mgdl, conditions);
          const c = a ? (a.severity === 'danger' ? colors.error : AMBER) : accent;
          return (
            <View key={h.id} style={[styles.row, { backgroundColor: card, flexDirection: rowDir(isRTL), borderColor: isDark ? '#283241' : 'transparent' }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowV, { color: text }, align]}>{h.mgdl} mg/dL</Text>
                <Text style={[styles.rowSub, { color: sub }, align]}>{t.ctx[h.context]} · {h.date}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: c + '18' }]}><Text style={[styles.badgeTxt, { color: c }]}>{h.mgdl}</Text></View>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('supprimer')} onPress={() => del('glucose', h.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginHorizontal: 6 }}>
                <Trash2 size={16} color={sub} />
              </TouchableOpacity>
            </View>
          );
        })}

        {/* ---- TENSION ---- */}
        <View style={[styles.head, { flexDirection: rowDir(isRTL), marginTop: 22 }]}>
          <Heart size={22} color={colors.error} />
          <Text style={[styles.section, { color: text }, align]}>{t.bp}</Text>
        </View>
        <FormCard>
          <Stepper label={t.sys} value={sys} onChange={setSys} step={1} min={0} max={300} unit="mmHg" />
          <Stepper label={t.dia} value={dia} onChange={setDia} step={1} min={0} max={200} unit="mmHg" />
          <Stepper label={t.pulse} value={pulse} onChange={setPulse} step={1} min={0} max={250} unit="bpm" />
        </FormCard>
        <PrimaryButton
          title={t.save}
          onPress={saveB}
          loading={savingB}
          disabled={savingB}
          icon={<Check size={20} color="#fff" />}
          style={{ marginBottom: 8 }}
        />

        {/* Note additive discrète : sodium / hydratation si tension élevée */}
        {bpElevated && (
          <View style={[styles.sodiumNote, { flexDirection: rowDir(isRTL) }]}>
            <Droplet size={15} color={sub} />
            <Text style={[styles.sodiumNoteTxt, { color: sub }, align]}>{t.sodiumTip}</Text>
          </View>
        )}

        {bTrend.systolic && (
          <TrendCard trend={bTrend.systolic} secondary={bTrend.diastolic || undefined}
            label={t.trend} avg={t.avg} range={t.range} unit="mmHg"
            spark={bp.slice(0, 14).map((e) => e.systolic)}
            {...{ card, text, sub, track, accent, isDark, isRTL }} />
        )}

        {/* Historique tension */}
        {!loading && (bp.length === 0 ? (
          <Text style={[styles.empty, { color: sub }, align]}>{t.empty}</Text>
        ) : bp.slice(0, 12).map((h) => {
          const a = bpAlert(h.systolic, h.diastolic, conditions);
          const c = a ? (a.severity === 'danger' ? colors.error : AMBER) : accent;
          return (
            <View key={h.id} style={[styles.row, { backgroundColor: card, flexDirection: rowDir(isRTL), borderColor: isDark ? '#283241' : 'transparent' }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowV, { color: text }, align]}>{h.systolic}/{h.diastolic} mmHg{h.pulse ? ` · ${h.pulse} bpm` : ''}</Text>
                <Text style={[styles.rowSub, { color: sub }, align]}>{h.date}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: c + '18' }]}><Text style={[styles.badgeTxt, { color: c }]}>{h.systolic}/{h.diastolic}</Text></View>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('supprimer')} onPress={() => del('blood_pressure', h.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginHorizontal: 6 }}>
                <Trash2 size={16} color={sub} />
              </TouchableOpacity>
            </View>
          );
        }))}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

/** Carte tendance : moyenne/min-max/direction + mini-graphe en barres (Views only). */
function TrendCard({ trend, secondary, label, avg, range, unit, spark, card, text, sub, track, accent, isDark, isRTL }: any) {
  const dirColor = trend.direction === 'up' ? AMBER : trend.direction === 'down' ? '#3B82F6' : sub;
  const align: any = { textAlign: isRTL ? 'right' : 'left' };
  // Mini-graphe : barres normalisées entre min et max de la fenêtre. On inverse
  // l'ordre pour lire chrono (ancien→récent). Barres RTL-safe (le conteneur suit isRTL).
  const vals: number[] = (spark || []).slice().reverse();
  const mn = Math.min(...vals, trend.min);
  const mx = Math.max(...vals, trend.max);
  const span = mx - mn || 1;
  const k = useTokens();
  return (
    <View style={[styles.trendCard, { backgroundColor: card, borderColor: k.border }]}>
      <View style={[styles.trendTop, { flexDirection: rowDir(isRTL) }]}>
        <Text style={[styles.trendLabel, { color: sub }, align]}>{label}</Text>
        <View style={[styles.trendDir, { flexDirection: rowDir(isRTL) }]}>
          <TrendIcon dir={trend.direction} color={dirColor} />
          <Text style={[styles.trendLatest, { color: text }]}>{trend.latest}{secondary ? `/${secondary.latest}` : ''} {unit}</Text>
        </View>
      </View>
      <Text style={[styles.trendMeta, { color: sub }, align]}>
        {avg} {trend.avg}{secondary ? `/${secondary.avg}` : ''} · {range} {trend.min}–{trend.max} {unit} · n={trend.count}
      </Text>
      <View style={[styles.spark, { flexDirection: rowDir(isRTL) }]}>
        {vals.map((v, i) => {
          const h = 6 + Math.round(((v - mn) / span) * 36);
          return <View key={i} style={[styles.sparkBar, { height: h, backgroundColor: accent + 'cc' }]} />;
        })}
        {vals.length === 0 && <View style={[styles.sparkBar, { height: 6, backgroundColor: track }]} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F7F9' },
  body: { padding: 20, paddingBottom: 100 },
  sub: { fontSize: 14, color: '#64748B', marginBottom: 16, lineHeight: 20 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  section: { fontSize: 20, fontWeight: '900', color: '#0F172A', letterSpacing: -0.4 },
  empty: { color: '#94A3B8', fontSize: 14, marginVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1 },
  rowV: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  rowSub: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  badge: { borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10 },
  badgeTxt: { fontSize: 12, fontWeight: '800' },
  alert: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  sodiumNote: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10, paddingHorizontal: 2 },
  sodiumNoteTxt: { flex: 1, fontSize: 12.5, lineHeight: 17 },
  alertTitle: { fontSize: 14, fontWeight: '800' },
  alertBody: { fontSize: 12.5, marginTop: 3, lineHeight: 17 },
  trendCard: { borderRadius: 16, borderWidth: 1, padding: 14, marginTop: 4, marginBottom: 14 },
  trendTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  trendLabel: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  trendDir: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  trendLatest: { fontSize: 15, fontWeight: '900' },
  trendMeta: { fontSize: 12, marginTop: 6 },
  spark: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, marginTop: 12, height: 44 },
  sparkBar: { flex: 1, borderRadius: 3, minWidth: 4 },
});
