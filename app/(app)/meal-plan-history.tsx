import React, { useEffect, useState, useMemo } from 'react';
import {
  Image,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { ArrowLeft, History, ChevronDown } from 'lucide-react-native';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { rowDir, txtAlign } from '../../lib/rtl';
import ScreenTopBar from '../../components/ScreenTopBar';
import { EmptyState, SkeletonCard } from '../../components/ui';
import { listMealPlans, SavedMealPlan } from '../../lib/aiStore';
import { useTokens, Tokens } from '../../constants/tokens';

// Libellés locaux à cet écran (trilingues) — pas de clés ajoutées à lib/i18n.
const TXT = {
  en: {
    saved: 'Saved plans',
    empty: 'No saved plan yet. Generate a meal plan and tap “Save the whole plan”.',
    plan: 'Plan',
  },
  fr: {
    saved: 'Plans enregistrés',
    empty: 'Aucun plan enregistré pour l\'instant. Génère un plan de repas et appuie sur « Enregistrer tout le plan ».',
    plan: 'Plan',
  },
  ar: {
    saved: 'الخطط المحفوظة',
    empty: 'لا توجد خطة محفوظة بعد. أنشئ خطة وجبات واضغط على «حفظ الخطة بالكامل».',
    plan: 'خطة',
  },
} as const;

const LOCALES: Record<string, string> = { en: 'en-US', fr: 'fr-FR', ar: 'ar' };

function fmtDate(ts: any, locale: string): string {
  try {
    const d = ts?.seconds ? new Date(ts.seconds * 1000) : (ts?.toDate ? ts.toDate() : null);
    if (!d) return '';
    const date = d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
    const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    return `${date} · ${time}`;
  } catch { return ''; }
}

export default function MealPlanHistoryScreen() {
  const { user } = useUser();
  const { resolved } = useTheme();
  const k = useTokens();
  const { language, isRTL } = useTranslation() as any;
  const isDark = resolved === 'dark';
  const styles = useMemo(() => makeStyles(k), [k]);
  const tx = TXT[language as keyof typeof TXT] ?? TXT.en;
  const locale = LOCALES[language] ?? LOCALES.en;
  const savedTitle = tx.saved;
  const [plans, setPlans] = useState<SavedMealPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<number | null>(0);

  const text = k.text;
  const sub = k.textMuted;
  const card = k.surface;
  const bg = isDark ? k.surface : 'transparent';
  const accent = k.accent;

  useEffect(() => {
    (async () => {
      const email = user?.primaryEmailAddress?.emailAddress || '';
      if (!email) { setLoading(false); return; }
      setPlans(await listMealPlans(email));
      setLoading(false);
    })();
  }, [user]);

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.container, { backgroundColor: bg }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenTopBar showBack title={savedTitle} showBrand={false} showNotif={false} />
        <Image source={require('../../assets/images/illustrations/splash_bg.jpg')} style={{ width: '100%', height: 110, borderRadius: 18, marginBottom: 14 }} resizeMode="cover" />

        {loading ? (
          <View>
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : plans.length === 0 ? (
          <EmptyState icon={<History size={26} color={accent} />} title={tx.saved} subtitle={tx.empty} />
        ) : (
          plans.map((sp, i) => {
            const p = sp.plan || {};
            const isOpen = open === i;
            const totals = p.totals || {};
            return (
              <View key={sp.id || i} style={[styles.planCard, { backgroundColor: card }]}>
                <TouchableOpacity activeOpacity={0.85} style={[styles.planHead, { flexDirection: rowDir(isRTL) }]} onPress={() => setOpen(isOpen ? null : i)}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.planDate, { color: text, textAlign: txtAlign(isRTL) }]}>{fmtDate(sp.createdAt, locale) || `${tx.plan} ${i + 1}`}</Text>
                    <Text style={[styles.planTotals, { color: accent, textAlign: txtAlign(isRTL) }]}>
                      {Math.round(totals.calories || 0)} kcal · {Math.round(totals.protein || 0)}P / {Math.round(totals.carbs || 0)}C / {Math.round(totals.fat || 0)}F
                    </Text>
                  </View>
                  <View style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }, { scaleX: isRTL ? -1 : 1 }] }}><ChevronDown size={22} color={sub} /></View>
                </TouchableOpacity>
                {isOpen && (p.meals || []).map((m: any, j: number) => (
                  <View key={j} style={styles.mealRow}>
                    <Text style={[styles.mealType, { color: sub, textAlign: txtAlign(isRTL) }]}>{m.type} · {Math.round(m.calories || 0)} kcal</Text>
                    <Text style={[styles.mealTitle, { color: text, textAlign: txtAlign(isRTL) }]}>{m.title}</Text>
                    {!!m.items?.length && <Text style={[styles.mealItems, { color: sub, textAlign: txtAlign(isRTL) }]}>{m.items.join(' · ')}</Text>}
                  </View>
                ))}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// Fabrique thémée : un StyleSheet est évalué au chargement du module, où `isDark`
// n'existe pas. Le composant l'appelle via useMemo, recalculé au changement de thème.
const makeStyles = (k: Tokens) => StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 60 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: k.surfaceSunken },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  empty: { fontSize: 14, lineHeight: 20, marginTop: 30, textAlign: 'center' },
  planCard: { borderRadius: 18, padding: 16, marginTop: 14, shadowColor: k.shadow, shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  planHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  planDate: { fontSize: 15, fontWeight: '800' },
  planTotals: { fontSize: 13, fontWeight: '700', marginTop: 3 },
  mealRow: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(120,140,130,0.15)' },
  mealType: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  mealTitle: { fontSize: 15, fontWeight: '800', marginTop: 3 },
  mealItems: { fontSize: 12.5, marginTop: 3, lineHeight: 18 },
});
