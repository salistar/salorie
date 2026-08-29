// Macros par objectif — répartition Protéines / Glucides / Lipides : cible (selon
// le plan/objectif) vs consommé du jour, avec progression. Réutilise useNutritionData.
// Theme-aware (light/dark) + trilingue (en/fr/ar).
import React, { useMemo } from 'react';
import { useTokens, type Tokens } from '../constants/tokens';
import { View, Text, StyleSheet } from 'react-native';
import { Target } from 'lucide-react-native';
import { useNutritionData } from '../hooks/useNutritionData';
import { useTranslation } from '../lib/i18n';
import { useTheme } from '../lib/ThemeContext';

// Les trois macros ont chacune leur teinte. Elle vient des jetons, donc du
// theme : ecrite au niveau du module, elle serait figee a l importation.
const macros = (k: Tokens) => [
  { key: 'protein', color: k.accent },
  { key: 'carbs', color: k.info },
  { key: 'fat', color: k.warning },
] as const;

const TXT: any = {
  en: { title: 'Macros by goal', perDay: 'kcal/day', protein: 'Protein', carbs: 'Carbs', fat: 'Fats', footer: 'Targets derived from your goal & nutrition plan.' },
  fr: { title: 'Macros par objectif', perDay: 'kcal/j', protein: 'Protéines', carbs: 'Glucides', fat: 'Lipides', footer: 'Cibles dérivées de ton objectif & plan nutritionnel.' },
  ar: { title: 'الماكروز حسب الهدف', perDay: 'سعرة/يوم', protein: 'بروتين', carbs: 'كربوهيدرات', fat: 'دهون', footer: 'أهداف مشتقة من هدفك وخطتك الغذائية.' },
};

function MacroTargets() {
  const k = useTokens();
  const styles = useMemo(() => makeStyles(k), [k]);
  const { language, isRTL } = useTranslation() as any;
  const tx = TXT[language] || TXT.en;
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  const tok = useTokens();
  const cardBg = tok.surface;
  const titleColor = tok.text;
  const labelColor = isDark ? '#cbd5e1' : '#334155';
  const valColor = tok.textMuted;
  const trackBg = tok.surfaceSunken;
  const footerColor = isDark ? '#475569' : '#CBD5E1';

  const data: any = useNutritionData(new Date().toISOString().split('T')[0]);
  const goals = data?.goals || { protein: 0, carbs: 0, fat: 0, calories: 0 };
  const consumed = data?.consumed || { protein: 0, carbs: 0, fat: 0 };

  return (
    <View style={[styles.card, { backgroundColor: cardBg }]}>
      <View style={[styles.header, isRTL && { flexDirection: 'row-reverse' }]}>
        <Target size={18} color={k.accent} />
        <Text style={[styles.title, { color: titleColor }, isRTL && { marginLeft: 0, marginRight: 8, textAlign: 'right' }]}>{tx.title}</Text>
        {goals.calories ? <Text style={[styles.kcal, { color: valColor }]}>{Math.round(goals.calories)} {tx.perDay}</Text> : null}
      </View>
      {macros(k).map((m) => {
        const target = Math.round(Number(goals[m.key]) || 0);
        const cur = Math.round(Number(consumed[m.key]) || 0);
        const pct = target > 0 ? Math.min(100, (cur / target) * 100) : 0;
        return (
          <View key={m.key} style={styles.row}>
            <View style={[styles.rowTop, isRTL && { flexDirection: 'row-reverse' }]}>
              <Text style={[styles.label, { color: labelColor }]}>{tx[m.key]}</Text>
              <Text style={[styles.val, { color: valColor }]}><Text style={{ color: m.color, fontWeight: '800' }}>{cur}</Text> / {target} g</Text>
            </View>
            <View style={[styles.track, { backgroundColor: trackBg }]}><View style={[styles.fill, { width: `${pct}%`, backgroundColor: m.color }]} /></View>
          </View>
        );
      })}
      <Text style={[styles.footer, { color: footerColor, textAlign: isRTL ? 'right' : 'left' }]}>{tx.footer}</Text>
    </View>
  );
}

// Présentational / props-driven (aucune prop) : mémoïsé pour éviter les re-renders
// inutiles quand le parent se re-render ; ne re-render que sur changement d'état des hooks.
export default React.memo(MacroTargets);

// Fabrique thémée : ce StyleSheet lisait des jetons alors qu'il était
// évalué UNE FOIS à l'importation, avant que le thème n'existe. Les
// couleurs y étaient donc figées sur la palette par défaut, à vie.
const makeStyles = (k: Tokens) => StyleSheet.create({
  card: { backgroundColor: k.surface, borderRadius: 18, padding: 16, marginHorizontal: 16, marginVertical: 8,
    shadowColor: k.shadow, shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  title: { fontSize: 16, fontWeight: '700', color: k.text, marginStart: 8, flex: 1 },
  kcal: { fontSize: 12, color: k.textFaint, fontWeight: '600' },
  row: { marginBottom: 12 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  label: { fontSize: 13, color: k.textMuted, fontWeight: '600' },
  val: { fontSize: 13, color: k.textMuted },
  track: { height: 8, borderRadius: 5, backgroundColor: k.surfaceSunken, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 5 },
  footer: { fontSize: 10, color: k.textFaint, marginTop: 2 },
});
