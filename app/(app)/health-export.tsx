// RAPPORT MÉDECIN (PDF) — écran : aperçu des sections + génération/partage du
// récapitulatif santé 30 jours (profil, conditions médicales, moyennes
// nutrition, poids, glycémie/tension). PDF via expo-print si dispo, sinon
// fallback texte via Share. i18n en/fr/ar, dark, RTL, retour.
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
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { FileText, Share2, HeartPulse, Utensils, Activity, ShieldAlert } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { useScreenGate } from '../../components/FeatureGate';
import EmptyState from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import {
  buildHealthReport,
  buildReportHtml,
  buildReportText,
  generateAndShareReport,
  REPORT_DAYS,
  HealthReport,
  ReportLabels,
} from '../../lib/healthExport';


const TXT: any = {
  en: {
    title: 'Doctor report (PDF)',
    sub: 'A 30-day health summary to share with a health professional. Generated on your device — nothing is sent to a third party.',
    generate: 'Generate the report (30 days)',
    building: 'Building your report…',
    sections: 'Included in the report',
    secProfile: 'Profile & goal',
    secConditions: 'Declared medical conditions',
    secNutrition: 'Nutrition averages (kcal, protein, carbs, fat, water)',
    secWeight: 'Weight trend',
    secVitals: 'Glucose & blood pressure (if recorded)',
    disclaimerCard:
      'This report is a summary of self-tracked data. It is not a medical diagnosis. Share it with your doctor and follow their advice.',
    empty: 'No data recorded over the last 30 days yet. Log some meals or measurements first.',
    // Labels passed to the PDF/text builder
    L: {
      title: 'Doctor report',
      subtitle: 'Health summary — last 30 days',
      profile: 'Profile',
      name: 'Name',
      goal: 'Goal',
      weight: 'Weight',
      targetKcal: 'Daily target',
      conditions: 'Medical conditions',
      noConditions: 'None declared',
      nutrition: 'Nutrition',
      basedOn: 'Averages over {n} recorded day(s)',
      calories: 'Calories / day',
      protein: 'Protein',
      carbs: 'Carbs',
      fat: 'Fat',
      water: 'Water',
      weightTrend: 'Weight trend',
      glucose: 'Glucose',
      bloodPressure: 'Blood pressure',
      avg: 'avg',
      min: 'min',
      max: 'max',
      latest: 'latest',
      measures: 'measurements',
      none: 'None',
      disclaimer:
        'This report summarizes self-tracked data and is not a medical diagnosis. Please discuss it with your healthcare professional.',
      generatedOn: 'Generated on',
      locale: 'en-US',
    },
  },
  fr: {
    title: 'Rapport médecin (PDF)',
    sub: "Un récapitulatif santé sur 30 jours à partager avec un professionnel de santé. Généré sur ton appareil — rien n'est transmis à un tiers.",
    generate: 'Générer le rapport (30 jours)',
    building: 'Construction du rapport…',
    sections: 'Contenu du rapport',
    secProfile: 'Profil & objectif',
    secConditions: 'Conditions médicales déclarées',
    secNutrition: 'Moyennes nutrition (kcal, protéines, glucides, lipides, eau)',
    secWeight: 'Évolution du poids',
    secVitals: 'Glycémie & tension (si enregistrées)',
    disclaimerCard:
      "Ce rapport résume des données auto-suivies. Ce n'est pas un diagnostic médical. Partage-le avec ton médecin et suis ses conseils.",
    empty: 'Aucune donnée enregistrée sur les 30 derniers jours. Enregistre d\'abord des repas ou des mesures.',
    L: {
      title: 'Rapport médecin',
      subtitle: 'Récapitulatif santé — 30 derniers jours',
      profile: 'Profil',
      name: 'Nom',
      goal: 'Objectif',
      weight: 'Poids',
      targetKcal: 'Cible quotidienne',
      conditions: 'Conditions médicales',
      noConditions: 'Aucune déclarée',
      nutrition: 'Nutrition',
      basedOn: 'Moyennes sur {n} jour(s) enregistré(s)',
      calories: 'Calories / jour',
      protein: 'Protéines',
      carbs: 'Glucides',
      fat: 'Lipides',
      water: 'Eau',
      weightTrend: 'Évolution du poids',
      glucose: 'Glycémie',
      bloodPressure: 'Tension artérielle',
      avg: 'moy',
      min: 'min',
      max: 'max',
      latest: 'dernier',
      measures: 'mesures',
      none: 'Aucune',
      disclaimer:
        "Ce rapport résume des données auto-suivies et ne constitue pas un diagnostic médical. Merci d'en discuter avec ton professionnel de santé.",
      generatedOn: 'Généré le',
      locale: 'fr-FR',
    },
  },
  ar: {
    title: 'تقرير للطبيب (PDF)',
    sub: 'ملخص صحي لمدة 30 يومًا لمشاركته مع أخصائي صحي. يُنشأ على جهازك — لا تُرسَل أي بيانات لطرف ثالث.',
    generate: 'إنشاء التقرير (30 يومًا)',
    building: 'جارٍ إنشاء التقرير…',
    sections: 'محتوى التقرير',
    secProfile: 'الملف الشخصي والهدف',
    secConditions: 'الحالات الطبية المُصرّح بها',
    secNutrition: 'متوسطات التغذية (سعرات، بروتين، كربوهيدرات، دهون، ماء)',
    secWeight: 'تطور الوزن',
    secVitals: 'السكر والضغط (إن سُجّلا)',
    disclaimerCard:
      'هذا التقرير يلخّص بيانات ذاتية التتبع. إنه ليس تشخيصًا طبيًا. شاركه مع طبيبك واتبع نصيحته.',
    empty: 'لا توجد بيانات مسجَّلة خلال آخر 30 يومًا. سجّل بعض الوجبات أو القياسات أولًا.',
    L: {
      title: 'تقرير للطبيب',
      subtitle: 'ملخص صحي — آخر 30 يومًا',
      profile: 'الملف الشخصي',
      name: 'الاسم',
      goal: 'الهدف',
      weight: 'الوزن',
      targetKcal: 'الهدف اليومي',
      conditions: 'الحالات الطبية',
      noConditions: 'لا شيء',
      nutrition: 'التغذية',
      basedOn: 'متوسطات على {n} يوم مُسجَّل',
      calories: 'سعرات / يوم',
      protein: 'بروتين',
      carbs: 'كربوهيدرات',
      fat: 'دهون',
      water: 'ماء',
      weightTrend: 'تطور الوزن',
      glucose: 'السكر',
      bloodPressure: 'ضغط الدم',
      avg: 'متوسط',
      min: 'أدنى',
      max: 'أعلى',
      latest: 'الأخير',
      measures: 'قياسات',
      none: 'لا شيء',
      disclaimer:
        'يلخّص هذا التقرير بيانات ذاتية التتبع وليس تشخيصًا طبيًا. يُرجى مناقشته مع أخصائيك الصحي.',
      generatedOn: 'أُنشئ في',
      locale: 'ar-MA',
    },
  },
};

export default function HealthExportScreen() {
  const k = useTokens();
  const styles = useMemo(() => makeStyles(k), [k]);
  const __gate = useScreenGate('health-export');
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
  const card = tok.surface;
  const text = tok.text;
  const sub = tok.textMuted;
  const align: any = { textAlign: isRTL ? 'right' : 'left' };
  const rowDir: any = { flexDirection: isRTL ? 'row-reverse' : 'row' };

  const email = user?.primaryEmailAddress?.emailAddress || '';
  const [report, setReport] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await buildHealthReport(email, user?.id, REPORT_DAYS);
        if (alive) setReport(r);
      } catch {
        /* best-effort */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [email, user?.id]);

  const labels: ReportLabels = { ...t.L, rtl: isRTL };

  const onGenerate = async () => {
    if (!report || generating) return;
    setGenerating(true);
    try {
      const html = buildReportHtml(report, labels);
      const txt = buildReportText(report, labels);
      const res = await generateAndShareReport(html, txt, t.L.title);
      // Fallback texte : si aucun PDF/partage natif, on partage via RN Share.
      if (res.mode === 'text' && res.text) {
        await Share.share({ title: t.L.title, message: res.text });
      }
    } catch {
      /* silencieux — l'utilisateur peut réessayer */
    } finally {
      setGenerating(false);
    }
  };

  const hasData =
    !!report &&
    (report.nutrition.days > 0 ||
      report.weightSeries.length > 0 ||
      !!report.glucose ||
      !!report.bpSystolic ||
      report.conditions.length > 0);

  const Section = ({ icon, label }: { icon: React.ReactNode; label: string }) => (
    <View style={[styles.secRow, rowDir, { backgroundColor: card }]}>
      <View style={styles.secIcon}>{icon}</View>
      <Text style={[styles.secTxt, { color: text }, align]}>{label}</Text>
    </View>
  );

  if (!__gate.ok) return __gate.node;

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showNotif={false} />
      <ScrollView contentContainerStyle={styles.body}>
        <Image
          source={require('../../assets/images/abstraits/hero-progression.jpg')}
          style={styles.cover}
          resizeMode="cover"
        />
        <View style={[styles.head, rowDir]}>
          <FileText size={24} color={accent} />
          <Text style={[styles.title, { color: text }, align]}>{t.title}</Text>
        </View>
        <Text style={[styles.sub, { color: sub }, align]}>{t.sub}</Text>

        {loading ? (
          <ActivityIndicator color={accent} style={{ marginTop: 30 }} />
        ) : (
          <>
            <Text style={[styles.h2, { color: text }, align]}>{t.sections}</Text>
            <Section icon={<FileText size={18} color={accent} />} label={t.secProfile} />
            <Section icon={<ShieldAlert size={18} color={accent} />} label={t.secConditions} />
            <Section icon={<Utensils size={18} color={accent} />} label={t.secNutrition} />
            <Section icon={<Activity size={18} color={accent} />} label={t.secWeight} />
            <Section icon={<HeartPulse size={18} color={accent} />} label={t.secVitals} />

            {!hasData && (
              <View style={{ marginTop: 12 }}>
                <EmptyState icon={<FileText size={24} color={accent} />} title={t.empty} />
              </View>
            )}

            <TouchableOpacity
              style={[styles.btn, generating && { opacity: 0.6 }]}
              onPress={onGenerate}
              disabled={generating}
            >
              {generating ? (
                <ActivityIndicator color={k.onAccent} />
              ) : (
                <>
                  <Share2 size={20} color={k.onAccent} />
                  <Text style={styles.btnTxt}>{t.generate}</Text>
                </>
              )}
            </TouchableOpacity>
            {generating && (
              <View style={styles.building}>
                <Skeleton width={200} height={40} />
                <Text style={styles.buildingTxt}>{t.building}</Text>
              </View>
            )}

            <View style={[styles.disc, rowDir]}>
              <ShieldAlert size={18} color="#B42318" />
              <Text style={[styles.discTxt, align]}>{t.disclaimerCard}</Text>
            </View>
          </>
        )}
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
  cover: { width: '100%', height: 110, borderRadius: 18, marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  title: { fontSize: 24, fontWeight: '900', color: k.text, letterSpacing: -0.5, flexShrink: 1 },
  sub: { fontSize: 14, color: k.textMuted, marginBottom: 20, lineHeight: 20 },
  h2: { fontSize: 15, fontWeight: '800', marginBottom: 10 },
  secRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: k.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },
  secIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: k.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secTxt: { fontSize: 13.5, fontWeight: '600', flexShrink: 1 },
  building: { alignItems: 'center', gap: 10, marginTop: 14 },
  buildingTxt: { fontSize: 13, color: k.textFaint, textAlign: 'center' },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: k.accent,
    borderRadius: 14,
    paddingVertical: 15,
    marginTop: 16,
  },
  btnTxt: { color: k.onAccent, fontWeight: '800', fontSize: 15 },
  disc: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: k.dangerSoft,
    borderRadius: 14,
    padding: 14,
    marginTop: 18,
  },
  discTxt: { flex: 1, fontSize: 12.5, color: k.dangerInk, lineHeight: 18 },
});
