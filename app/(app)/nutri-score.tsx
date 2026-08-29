// Nutri-Score — note nutritionnelle A→E d'un aliment (pour 100 g).
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { partager, lienPartage } from '../../lib/partage';
import { useTokens, type Tokens } from '../../constants/tokens';
import {
  Image,
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  Easing,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Award, Share2 } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { FormCard, Stepper } from '../../components/FormKit';
import { SecondaryButton } from '../../components/ui/Button';
import { nutriScore, GRADE_COLOR, NutriGrade } from '../../lib/nutriScore';
import { useTranslation } from '../../lib/i18n';
import { useTheme } from '../../lib/ThemeContext';
import { useScreenGate } from '../../components/FeatureGate';

const FIELDS = [
  { k: 'energyKcal', tk: 'f_energy', u: 'kcal' },
  { k: 'sugars', tk: 'f_sugars', u: 'g' },
  { k: 'satFat', tk: 'f_satfat', u: 'g' },
  { k: 'sodiumMg', tk: 'f_sodium', u: 'mg' },
  { k: 'fiber', tk: 'f_fiber', u: 'g' },
  { k: 'protein', tk: 'f_protein', u: 'g' },
];

const TXT: any = {
  en: {
    title: 'Nutri-Score', sub: 'Enter the values per 100 g → live A→E grade.',
    grade: 'Grade', score: 'score',
    f_energy: 'Energy', f_sugars: 'Sugars', f_satfat: 'Sat. fat', f_sodium: 'Sodium', f_fiber: 'Fiber', f_protein: 'Protein',
    tip: '💡 Find these values on the nutrition label ("per 100 g" table).',
    share: 'Share', product: 'Product',
    scaleTitle: 'What the scale means',
    scaleHint: 'A = best nutritional quality, E = lowest. Grade computed from the values per 100 g.',
    verdict: { A: 'Excellent nutritional quality', B: 'Good nutritional quality', C: 'Average nutritional quality', D: 'Poor nutritional quality', E: 'Low nutritional quality' } as Record<NutriGrade, string>,
    shareMsg: (g: NutriGrade, s: number, verd: string) => `Nutri-Score ${g} · score ${s} — ${verd}. (Salorie)`,
  },
  fr: {
    title: 'Nutri-Score', sub: 'Saisis les valeurs pour 100 g → note A→E en direct.',
    grade: 'Note', score: 'score',
    f_energy: 'Énergie', f_sugars: 'Sucres', f_satfat: 'Graisses sat.', f_sodium: 'Sodium', f_fiber: 'Fibres', f_protein: 'Protéines',
    tip: '💡 Trouve ces valeurs sur l\'étiquette nutritionnelle (tableau « pour 100 g »).',
    share: 'Partager', product: 'Produit',
    scaleTitle: 'Ce que signifie l\'échelle',
    scaleHint: 'A = meilleure qualité nutritionnelle, E = la plus faible. Note calculée à partir des valeurs pour 100 g.',
    verdict: { A: 'Excellente qualité nutritionnelle', B: 'Bonne qualité nutritionnelle', C: 'Qualité nutritionnelle moyenne', D: 'Qualité nutritionnelle médiocre', E: 'Faible qualité nutritionnelle' } as Record<NutriGrade, string>,
    shareMsg: (g: NutriGrade, s: number, verd: string) => `Nutri-Score ${g} · score ${s} — ${verd}. (Salorie)`,
  },
  ar: {
    title: 'نوتري-سكور', sub: 'أدخل القيم لكل 100 غ ← تقييم A→E مباشر.',
    grade: 'التقييم', score: 'النقاط',
    f_energy: 'الطاقة', f_sugars: 'السكريات', f_satfat: 'دهون مشبعة', f_sodium: 'الصوديوم', f_fiber: 'الألياف', f_protein: 'البروتين',
    tip: '💡 ستجد هذه القيم على الملصق الغذائي (جدول «لكل 100 غ»).',
    share: 'مشاركة', product: 'المنتج',
    verdict: { A: 'جودة غذائية ممتازة', B: 'جودة غذائية جيدة', C: 'جودة غذائية متوسطة', D: 'جودة غذائية ضعيفة', E: 'جودة غذائية منخفضة' } as Record<NutriGrade, string>,
    shareMsg: (g: NutriGrade, s: number, verd: string) => `Nutri-Score ${g} · ${s} — ${verd}. (Salorie)`,
  },
};

export default function NutriScoreScreen() {
  const k = useTokens();
  const styles = useMemo(() => makeStyles(k), [k]);
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

  const __gate = useScreenGate('nutri-score');

  const [v, setV] = useState<Record<string, string>>({});
  const num = (k: string) => parseFloat(v[k]) || 0;
  const { grade, score } = useMemo(() => nutriScore({
    energyKcal: num('energyKcal'), sugars: num('sugars'), satFat: num('satFat'),
    sodiumMg: num('sodiumMg'), fiber: num('fiber'), protein: num('protein'),
  }), [v]);
  const hasInput = Object.values(v).some((x) => x);

  // #199 (parité verdict) — quand le verdict/note s'affiche (ou change de note),
  // retour haptique Success + apparition (fade + léger scale-in). Additif :
  // n'altère ni le calcul du Nutri-Score ni la logique de saisie.
  const verdictAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (hasInput) {
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      verdictAnim.setValue(0);
      Animated.timing(verdictAnim, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      verdictAnim.setValue(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasInput, grade]);

  const verdictAnimStyle = {
    opacity: verdictAnim,
    transform: [
      { scale: verdictAnim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
    ],
  };

  // #100 — partage d'un résumé texte (note + score + verdict) via l'API Share.
  // Additif : ne touche ni le calcul du Nutri-Score ni l'haptique/anim ci-dessus.
  const onShare = async () => {
    try {
      const verd = t.verdict?.[grade] || '';
      await partager({ texte: t.shareMsg(grade, score, verd), lien: lienPartage('nutri-score', 'nutriscore') });
    } catch {}
  };

  if (!__gate.ok) return __gate.node;

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Image source={require('../../assets/images/illustrations/healthy_food.jpg')} style={{ width: '100%', height: 110, borderRadius: 18, marginBottom: 14 }} resizeMode="cover" />
        <View style={styles.head}><Award size={24} color={accent} /><Text style={[styles.title, { color: text }]}>{t.title}</Text></View>
        <Text style={[styles.sub, { color: sub }, align]}>{t.sub}</Text>

        <View style={styles.scaleRow}>
          {(['A', 'B', 'C', 'D', 'E'] as NutriGrade[]).map((g) => (
            <View key={g} style={[styles.scaleItem, { backgroundColor: GRADE_COLOR[g] }, hasInput && grade === g && styles.scaleActive]}>
              <Text style={styles.scaleTxt}>{g}</Text>
            </View>
          ))}
        </View>

        {/* #107 — clarification/légende du Nutri-Score déjà affiché (A→E).
            NOVA (nova_group) non disponible sur cet écran de saisie manuelle → voir skipped.
            Additif : n'altère ni le calcul, ni le partage (#100), ni l'haptique/anim (#199). */}
        <View style={styles.legendRow}>
          <Text style={[styles.legendGrade, { color: GRADE_COLOR.A }]}>A</Text>
          <Text style={[styles.legendArrow, { color: sub }]}>→</Text>
          <Text style={[styles.legendGrade, { color: GRADE_COLOR.E }]}>E</Text>
          <Text style={[styles.legendHint, { color: sub }, align]} numberOfLines={2}>{t.scaleHint}</Text>
        </View>
        {hasInput && (
          <Animated.View style={verdictAnimStyle}>
            <Text style={[styles.scoreNote, { color: sub }]}>{t.grade} <Text style={{ color: GRADE_COLOR[grade], fontWeight: '900' }}>{grade}</Text> · {t.score} {score}</Text>
            <View style={styles.shareRow}>
              <SecondaryButton title={t.share} onPress={onShare} full={false} size="sm" icon={<Share2 size={16} color={accent} />} />
            </View>
          </Animated.View>
        )}

        <FormCard>
          {FIELDS.map((f) => (
            <Stepper
              key={f.k}
              label={t[f.tk]}
              unit={f.u}
              step={1}
              value={v[f.k] || ''}
              onChange={(t2: string) => setV((s) => ({ ...s, [f.k]: t2 }))}
            />
          ))}
        </FormCard>
        <Text style={[styles.tip, { color: sub }, align]}>{t.tip}</Text>
      </ScrollView>
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
  title: { fontSize: 26, fontWeight: '900', color: k.text, letterSpacing: -0.5 },
  sub: { fontSize: 14, color: k.textMuted, marginBottom: 20 },
  scaleRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 8 },
  scaleItem: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', opacity: 0.4 },
  scaleActive: { opacity: 1, transform: [{ scale: 1.18 }], shadowColor: k.shadow, shadowOpacity: 0.2, shadowRadius: 6, elevation: 4 },
  scaleTxt: { color: k.onAccent, fontSize: 22, fontWeight: '900' },
  legendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 12, flexWrap: 'wrap' },
  legendGrade: { fontSize: 15, fontWeight: '900' },
  legendArrow: { fontSize: 13, fontWeight: '700' },
  legendHint: { flexShrink: 1, fontSize: 12, lineHeight: 17, fontWeight: '500', maxWidth: 260 },
  scoreNote: { textAlign: 'center', fontSize: 15, color: k.textMuted, marginBottom: 10, fontWeight: '600' },
  shareRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 18 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: k.surface, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 4, marginBottom: 10 },
  label: { fontSize: 15, fontWeight: '600', color: k.text },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  input: { fontSize: 17, fontWeight: '800', color: k.text, minWidth: 64, textAlign: 'right', paddingVertical: 12 },
  unit: { fontSize: 13, color: k.textFaint, fontWeight: '700', width: 34 },
  tip: { fontSize: 13, color: k.textFaint, marginTop: 14, lineHeight: 19 },
});
