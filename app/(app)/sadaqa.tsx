import React, { useEffect, useState } from 'react';
import { useTokens } from '../../constants/tokens';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HandHeart, Utensils, Trees, ExternalLink } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { Card, PrimaryButton } from '../../components/ui';
import { type } from '../../constants/theme';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { rowDir, txtAlign } from '../../lib/rtl';
import { computeSadaqa, getTotalKm, nextMilestones, KM_PER_MEAL, KM_PER_TREE } from '../../lib/sadaqa';

const DONATE_URL = 'https://salorie.com/sadaqa';

const TXT: any = {
  en: {
    title: 'Sadaqa Jariya',
    sub: 'Turn every kilometer into an ongoing charity. Your effort feeds people and plants trees — traceable, real.',
    distance: 'Cumulative distance',
    km: 'km',
    impact: 'Your impact',
    meals: 'meals provided',
    trees: 'argan trees',
    nextMeal: 'Next meal in',
    nextTree: 'Next tree in',
    intentTitle: 'A continuing charity',
    intent: 'Sadaqa Jariya is a charity that keeps giving. Each donation is traceable: meals distributed and argan trees planted in Morocco, on your behalf.',
    rule: `1 meal every ${KM_PER_MEAL} km · 1 argan tree every ${KM_PER_TREE} km`,
    donate: 'Make a donation',
  },
  fr: {
    title: 'Sadaqa Jariya',
    sub: "Transforme chaque kilomètre en aumône continue. Ton effort nourrit des gens et plante des arbres — traçable, réel.",
    distance: 'Distance cumulée',
    km: 'km',
    impact: 'Ton impact',
    meals: 'repas distribués',
    trees: 'arganiers',
    nextMeal: 'Prochain repas dans',
    nextTree: 'Prochain arbre dans',
    intentTitle: 'Une aumône qui dure',
    intent: "La Sadaqa Jariya est une aumône qui continue de donner. Chaque don est traçable : repas distribués et arganiers plantés au Maroc, en ton nom.",
    rule: `1 repas tous les ${KM_PER_MEAL} km · 1 arganier tous les ${KM_PER_TREE} km`,
    donate: 'Faire un don',
  },
  ar: {
    title: 'صدقة جارية',
    sub: 'حوّل كل كيلومتر إلى صدقة جارية. مجهودك يُطعم الناس ويغرس الأشجار — قابل للتتبّع وحقيقي.',
    distance: 'المسافة التراكمية',
    km: 'كلم',
    impact: 'أثرك',
    meals: 'وجبات موزّعة',
    trees: 'أشجار أركان',
    nextMeal: 'الوجبة القادمة بعد',
    nextTree: 'الشجرة القادمة بعد',
    intentTitle: 'صدقة تدوم',
    intent: 'الصدقة الجارية صدقة تستمر في العطاء. كل تبرّع قابل للتتبّع: وجبات موزّعة وأشجار أركان مغروسة في المغرب باسمك.',
    rule: `وجبة كل ${KM_PER_MEAL} كلم · شجرة أركان كل ${KM_PER_TREE} كلم`,
    donate: 'تبرّع الآن',
  },
};

export default function Sadaqa() {
  const { colors, resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';
  const GREEN = colors.primary;
  const tok = useTokens();
  const bg = tok.bg;
  const text = tok.text;
  const sub = tok.textMuted;
  const track = tok.border;
  const align: any = { textAlign: txtAlign(isRTL) };

  const [loading, setLoading] = useState(true);
  const [km, setKm] = useState(0);

  useEffect(() => {
    let alive = true;
    getTotalKm(0).then((v) => { if (alive) { setKm(v); setLoading(false); } }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const impact = computeSadaqa(km);
  const ms = nextMilestones(km);

  const openDonate = () => { Linking.openURL(DONATE_URL).catch(() => {}); };

  const Progress = ({ label, frac, remain }: { label: string; frac: number; remain: number }) => (
    <View style={{ marginTop: 12 }}>
      <View style={[s.progRow, { flexDirection: rowDir(isRTL) }]}>
        <Text style={[s.progLabel, { color: sub }, align]}>{label}</Text>
        <Text style={[s.progRemain, { color: GREEN }]}>{remain.toFixed(1)} {t.km}</Text>
      </View>
      <View style={[s.bar, { backgroundColor: track }]}>
        <View style={[s.barFill, { backgroundColor: GREEN, width: `${Math.max(2, Math.min(100, frac * 100))}%` }]} />
      </View>
    </View>
  );

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[s.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showBrand showNotif={false} />
      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        <View style={[s.head, { flexDirection: rowDir(isRTL) }]}>
          <HandHeart size={26} color={GREEN} />
          <Text style={[s.title, { color: text }, align]}>{t.title}</Text>
        </View>
        <Text style={[s.sub, { color: sub }, align]}>{t.sub}</Text>

        {loading ? (
          <ActivityIndicator color={GREEN} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Distance cumulée */}
            <Card style={s.card}>
              <Text style={[s.kmLabel, { color: sub }, align]}>{t.distance}</Text>
              <View style={[s.kmRow, { flexDirection: rowDir(isRTL) }]}>
                <Text style={[s.kmValue, { color: GREEN }]}>{km.toFixed(1)}</Text>
                <Text style={[s.kmUnit, { color: sub }]}>{t.km}</Text>
              </View>
            </Card>

            {/* Impact : repas + arganiers */}
            <Text style={[s.secTitle, { color: text }, align]}>{t.impact}</Text>
            <View style={[s.impactRow, { flexDirection: rowDir(isRTL) }]}>
              <Card variant="flat" style={s.impactCard}>
                <View style={[s.iconWrap, { backgroundColor: 'rgba(46,139,87,0.12)' }]}><Utensils size={22} color={GREEN} /></View>
                <Text style={[type.h2, s.impactValue, { color: text }]}>{impact.meals}</Text>
                <Text style={[type.body, s.impactCaption, { color: sub }]} numberOfLines={2}>{t.meals}</Text>
              </Card>
              <Card variant="flat" style={s.impactCard}>
                <View style={[s.iconWrap, { backgroundColor: 'rgba(46,139,87,0.12)' }]}><Trees size={22} color={GREEN} /></View>
                <Text style={[type.h2, s.impactValue, { color: text }]}>{impact.trees}</Text>
                <Text style={[type.body, s.impactCaption, { color: sub }]} numberOfLines={2}>{t.trees}</Text>
              </Card>
            </View>

            {/* Progression vers les prochains paliers */}
            <Card style={s.card}>
              <Progress label={t.nextMeal} frac={ms.mealProgress} remain={ms.kmToNextMeal} />
              <Progress label={t.nextTree} frac={ms.treeProgress} remain={ms.kmToNextTree} />
              <Text style={[s.rule, { color: sub }, align]}>{t.rule}</Text>
            </Card>

            {/* Intention : aumône traçable */}
            <Card style={s.card}>
              <Text style={[s.intentTitle, { color: text }, align]}>{t.intentTitle}</Text>
              <Text style={[s.intent, { color: sub }, align]}>{t.intent}</Text>
            </Card>

            {/* Bouton don */}
            <PrimaryButton
              title={t.donate}
              onPress={openDonate}
              style={s.donate}
              icon={<View style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}><ExternalLink size={18} color="#fff" /></View>}
            />
          </>
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
  card: { borderRadius: 16, padding: 16, marginTop: 14 },
  kmLabel: { fontSize: 13, fontWeight: '600' },
  kmRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 6 },
  kmValue: { fontSize: 40, fontWeight: '900', letterSpacing: -1 },
  kmUnit: { fontSize: 16, fontWeight: '700', marginBottom: 7 },
  secTitle: { fontSize: 16, fontWeight: '800', marginTop: 22 },
  impactRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  impactCard: { flex: 1, borderRadius: 16, padding: 16, alignItems: 'center' },
  iconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  impactValue: { letterSpacing: -0.5 },
  impactCaption: { marginTop: 4, textAlign: 'center' },
  progRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progLabel: { fontSize: 13, fontWeight: '600', flex: 1 },
  progRemain: { fontSize: 13, fontWeight: '800' },
  bar: { height: 8, borderRadius: 4, marginTop: 6, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  rule: { fontSize: 12, marginTop: 14, lineHeight: 17, fontStyle: 'italic' },
  intentTitle: { fontSize: 15, fontWeight: '800' },
  intent: { fontSize: 13, marginTop: 8, lineHeight: 20 },
  donate: { marginTop: 22 },
});
