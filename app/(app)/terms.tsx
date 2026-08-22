import React, { useMemo } from 'react';
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
import { ChevronLeft, Scale, ShieldCheck, ScrollText } from 'lucide-react-native';
import { Colors } from '../../constants/Colors';
import ScreenTopBar from '../../components/ScreenTopBar';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { txtAlign, writingDir } from '../../lib/rtl';
import Animated, { FadeInDown } from 'react-native-reanimated';

// Contenu long — objet local par langue (pas de clés dans lib/i18n.tsx)
const TXT = {
  en: {
    title: 'Terms of Service',
    hero: 'Our Commitment',
    updated: 'Last Updated: April 15, 2026',
    intro: 'Welcome to Salorie. By using our app, you agree to the following terms. We aim to provide the best health tracking experience possible while maintaining a professional standard.',
    data_t: '1. Data Usage',
    data_p: 'You own your data. We use your logs and profile information solely to provide personalized AI insights and nutritional tracking. We do not sell your personal health data to third parties.',
    health_t: '2. Health Disclaimer',
    health_p: 'Salorie is a tracking tool, not a medical advisor. AI insights and nutritional plans are generated based on general logic and should be reviewed by a certified healthcare professional before making significant lifestyle changes.',
    ai_t: '3. AI Accuracy',
    ai_p: 'While we use advanced models like Gemini-1.5-flash, AI insights can occasionally be inaccurate. Always use your best judgment.',
  },
  fr: {
    title: 'Conditions',
    hero: 'Notre engagement',
    updated: 'Dernière mise à jour : 15 avril 2026',
    intro: 'Bienvenue sur Salorie. En utilisant notre application, vous acceptez les conditions suivantes. Nous visons à offrir la meilleure expérience de suivi santé possible, tout en maintenant un standard professionnel.',
    data_t: '1. Utilisation des données',
    data_p: 'Vos données vous appartiennent. Nous utilisons vos journaux et informations de profil uniquement pour fournir des analyses IA personnalisées et un suivi nutritionnel. Nous ne vendons pas vos données de santé à des tiers.',
    health_t: '2. Avertissement santé',
    health_p: 'Salorie est un outil de suivi, pas un conseiller médical. Les analyses IA et les plans nutritionnels sont générés selon une logique générale et doivent être validés par un professionnel de santé certifié avant tout changement important de mode de vie.',
    ai_t: '3. Précision de l’IA',
    ai_p: 'Bien que nous utilisions des modèles avancés comme Gemini-1.5-flash, les analyses IA peuvent parfois être inexactes. Faites toujours preuve de discernement.',
  },
  ar: {
    title: 'الشروط',
    hero: 'التزامنا',
    updated: 'آخر تحديث: 15 أبريل 2026',
    intro: 'مرحبًا بك في سالوري. باستخدامك تطبيقنا، فإنك توافق على الشروط التالية. نسعى لتقديم أفضل تجربة لتتبّع الصحة مع الحفاظ على معيار احترافي.',
    data_t: '1. استخدام البيانات',
    data_p: 'بياناتك ملك لك. نستخدم سجلاتك ومعلومات ملفك الشخصي فقط لتقديم تحليلات ذكاء اصطناعي مخصصة وتتبّع غذائي. نحن لا نبيع بياناتك الصحية الشخصية لأطراف ثالثة.',
    health_t: '2. إخلاء مسؤولية صحية',
    health_p: 'سالوري أداة لتتبّع الصحة وليست مستشارًا طبيًا. تُولّد تحليلات الذكاء الاصطناعي والخطط الغذائية وفق منطق عام، ويجب مراجعتها مع أخصائي رعاية صحية معتمد قبل إجراء تغييرات كبيرة في نمط الحياة.',
    ai_t: '3. دقة الذكاء الاصطناعي',
    ai_p: 'رغم استخدامنا نماذج متقدمة مثل Gemini-1.5-flash، قد تكون تحليلات الذكاء الاصطناعي غير دقيقة أحيانًا. استخدم دائمًا حسن تقديرك.',
  },
};

export default function TermsScreen() {
  const { colors, resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const isDark = resolved === 'dark';
  const styles = useMemo(() => makeStyles(isDark), [isDark]);
  const tx = TXT[language as keyof typeof TXT] ?? TXT.en;
  const tok = useTokens();
  const bg = tok.bg;
  const tPrimary = isDark ? '#fff' : Colors.light.gray[900];
  const tMuted = isDark ? '#9BA1A6' : Colors.light.gray[500];
  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.container, { backgroundColor: bg }]}>
      <ScreenTopBar showBack title={tx.title} showBrand={false} showNotif={false} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(600)}>
          <View style={styles.iconHero}>
            <ScrollText size={64} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: tPrimary }]}>{tx.hero}</Text>
          <Text style={[styles.date, { color: tMuted }]}>{tx.updated}</Text>

          <Text style={[styles.paragraph, { color: tMuted, textAlign: txtAlign(isRTL), writingDirection: writingDir(isRTL) }]}>
            {tx.intro}
          </Text>

          <Text style={[styles.subTitle, { color: tPrimary, textAlign: txtAlign(isRTL) }]}>{tx.data_t}</Text>
          <Text style={[styles.paragraph, { color: tMuted, textAlign: txtAlign(isRTL), writingDirection: writingDir(isRTL) }]}>
            {tx.data_p}
          </Text>

          <Text style={[styles.subTitle, { color: tPrimary, textAlign: txtAlign(isRTL) }]}>{tx.health_t}</Text>
          <Text style={[styles.paragraph, { color: tMuted, textAlign: txtAlign(isRTL), writingDirection: writingDir(isRTL) }]}>
            {tx.health_p}
          </Text>

          <Text style={[styles.subTitle, { color: tPrimary, textAlign: txtAlign(isRTL) }]}>{tx.ai_t}</Text>
          <Text style={[styles.paragraph, { color: tMuted, textAlign: txtAlign(isRTL), writingDirection: writingDir(isRTL) }]}>
            {tx.ai_p}
          </Text>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Fabrique thémée : un StyleSheet est évalué au chargement du module, où `isDark`
// n'existe pas. Le composant l'appelle via useMemo, recalculé au changement de thème.
const makeStyles = (isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: isDark ? Colors.dark.card : Colors.light.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: isDark ? Colors.dark.gray[50] : Colors.light.gray[50],
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: isDark ? Colors.dark.gray[900] : Colors.light.gray[900],
  },
  content: {
    padding: 24,
    paddingBottom: 40,
  },
  iconHero: {
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: isDark ? Colors.dark.gray[900] : Colors.light.gray[900],
    textAlign: 'center',
  },
  date: {
    fontSize: 14,
    color: isDark ? Colors.dark.gray[400] : Colors.light.gray[400],
    textAlign: 'center',
    marginBottom: 32,
    fontWeight: '600',
  },
  subTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: isDark ? Colors.dark.gray[800] : Colors.light.gray[800],
    marginTop: 24,
    marginBottom: 10,
  },
  paragraph: {
    fontSize: 16,
    color: isDark ? Colors.dark.gray[500] : Colors.light.gray[500],
    lineHeight: 24,
    fontWeight: '500',
  },
});
