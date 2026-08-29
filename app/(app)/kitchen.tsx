// Hub CUISINE & REPAS — regroupe toutes les features alimentaires en UN écran
// clair (3 sections) pour que l'utilisateur ne se perde pas dans 13 tuiles.
// Aucune feature supprimée : juste mieux organisées + connectées au même endroit.
import React from 'react';
import { useTokens } from '../../constants/tokens';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  BookmarkPlus, ChefHat, ScanText, Receipt, Sparkles, ShoppingCart, Refrigerator,
  Link2, Replace, Award, UtensilsCrossed, Apple, Timer, Utensils, Upload,
} from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import PhotoStrip from '../../components/PhotoStrip';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';

const GREEN = '#2E8B57';

const TXT: any = {
  en: { title: 'Kitchen & meals', sub: 'All your food tools in one place.',
    log: 'Log', plan: 'Plan', analyze: 'Analyze',
    diary: 'Food diary', build: 'Build a meal', templates: 'My meal templates', label: 'Scan label', receipt: 'Receipt scan',
    aiplan: 'AI meal plan', shopping: 'Shopping list', fridge: 'Fridge → recipes', localRecipes: 'Local recipes', importr: 'Import recipe', importData: 'Import from MFP/Yazio', subs: 'Substitutions',
    nutri: 'Nutri-Score', resto: 'Restaurant mode', nutrients: 'Daily nutrients', fasting: 'Intermittent fasting' },
  fr: { title: 'Cuisine & repas', sub: 'Tous tes outils alimentaires au même endroit.',
    log: 'Logger', plan: 'Planifier', analyze: 'Analyser',
    diary: 'Journal alimentaire', build: 'Composer un repas', templates: 'Mes repas types', label: 'Scanner étiquette', receipt: 'Ticket de caisse',
    aiplan: 'Plan repas IA', shopping: 'Liste de courses', fridge: 'Frigo → recettes', localRecipes: 'Recettes locales', importr: 'Importer recette', importData: 'Importer MFP/Yazio', subs: 'Substitutions',
    nutri: 'Nutri-Score', resto: 'Mode resto', nutrients: 'Nutriments du jour', fasting: 'Jeûne intermittent' },
  ar: { title: 'المطبخ والوجبات', sub: 'كل أدوات التغذية في مكان واحد.',
    log: 'تسجيل', plan: 'تخطيط', analyze: 'تحليل',
    diary: 'يوميات الطعام', build: 'كوّن وجبة', templates: 'وجباتي المعتادة', label: 'مسح الملصق', receipt: 'مسح الإيصال',
    aiplan: 'خطة وجبات AI', shopping: 'قائمة التسوق', fridge: 'الثلاجة ← وصفات', localRecipes: 'وصفات محلية', importr: 'استيراد وصفة', importData: 'استيراد من MFP/Yazio', subs: 'بدائل',
    nutri: 'نوتري-سكور', resto: 'وضع المطعم', nutrients: 'عناصر اليوم', fasting: 'الصيام المتقطع' },
};

export default function KitchenScreen() {
  const k = useTokens();
  const { resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';
  const tok = useTokens();
  const bg = tok.bg;
  const card = tok.surface;
  const text = tok.text;
  const sub = tok.textMuted;
  const border = isDark ? 'rgba(255,255,255,0.08)' : '#EEF2F6';
  const accent = isDark ? '#4ade80' : GREEN;
  const align: any = { textAlign: isRTL ? 'right' : 'left' };

  const SECTIONS = [
    { key: t.log, items: [
      // Journal alimentaire est en accès rapide sur l'Accueil (plus de doublon ici).
      { Icon: ChefHat, label: t.build, route: '/meal-builder' },
      { Icon: BookmarkPlus, label: t.templates, route: '/meal-templates' },
      { Icon: ScanText, label: t.label, route: '/label-scan' },
      { Icon: Receipt, label: t.receipt, route: '/receipt-ocr' },
    ]},
    { key: t.plan, items: [
      { Icon: Sparkles, label: t.aiplan, route: '/ai-meal-plan' },
      { Icon: ShoppingCart, label: t.shopping, route: '/shopping-list' },
      { Icon: Refrigerator, label: t.fridge, route: '/fridge-recipes' },
      { Icon: Utensils, label: t.localRecipes, route: '/healthy-recipes' },
      { Icon: Link2, label: t.importr, route: '/import-recipe' },
      { Icon: Upload, label: t.importData, route: '/import-data' },
      { Icon: Replace, label: t.subs, route: '/substitutions' },
    ]},
    { key: t.analyze, items: [
      { Icon: Award, label: t.nutri, route: '/nutri-score' },
      { Icon: UtensilsCrossed, label: t.resto, route: '/restaurant-mode' },
      { Icon: Apple, label: t.nutrients, route: '/nutrients' },
      { Icon: Timer, label: t.fasting, route: '/fasting' },
    ]},
  ];

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={[styles.head, isRTL && { flexDirection: 'row-reverse' }]}>
          <ChefHat size={26} color={accent} />
          <Text style={[styles.title, { color: text }, align]}>{t.title}</Text>
        </View>
        <Text style={[styles.sub, { color: sub }, align]}>{t.sub}</Text>
        <PhotoStrip category="food" showTitle={false} />

        {SECTIONS.map((sec) => (
          <View key={sec.key} style={styles.section}>
            <Text style={[styles.secTitle, { color: sub }, align]}>{sec.key}</Text>
            <View style={styles.grid}>
              {sec.items.map((it) => (
                <TouchableOpacity
                  key={it.route}
                  style={[styles.tile, { backgroundColor: card, borderColor: border }]}
                  activeOpacity={0.85}
                  onPress={() => router.push(it.route as any)}
                >
                  <View style={[styles.iconWrap, { backgroundColor: isDark ? 'rgba(74,222,128,0.16)' : '#EAF4EE' }]}>
                    <it.Icon size={26} color={accent} />
                  </View>
                  <Text style={[styles.tileLabel, { color: text }]} numberOfLines={2} ellipsizeMode="tail">{it.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { padding: 18, paddingBottom: 110 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  title: { fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  sub: { fontSize: 13.5, marginTop: 6, marginBottom: 6 },
  section: { marginTop: 14 },
  secTitle: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, paddingHorizontal: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  tile: { width: '47%', minHeight: 120, borderRadius: 20, borderWidth: 1, paddingVertical: 20, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 12 },
  iconWrap: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { fontSize: 14, fontWeight: '800', textAlign: 'center', lineHeight: 18 },
});
