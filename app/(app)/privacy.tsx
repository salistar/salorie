import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { ShieldCheck, Fingerprint, Trash2 } from 'lucide-react-native';
import { useUser, useAuth } from '@clerk/clerk-expo';
import { Colors } from '../../constants/Colors';
import ScreenTopBar from '../../components/ScreenTopBar';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { txtAlign, writingDir } from '../../lib/rtl';
import { deleteAllUserData } from '../../lib/firebase';
import Animated, { FadeInDown } from 'react-native-reanimated';

// Contenu long — objet local par langue (pas de clés dans lib/i18n.tsx)
const TXT = {
  en: {
    title: 'Privacy Policy',
    hero: 'Your Privacy Matters',
    updated: 'Last Updated: April 15, 2026',
    intro: 'At Salorie, your privacy is our top priority. We implement industry-leading security measures to ensure your health journey remains private and secure.',
    infoBox: 'Your logs and profile data are transmitted over encrypted connections (HTTPS) and protected by access controls.',
    collect_t: 'What We Collect',
    collect_p: "We only collect information necessary for the app's functionality: profile details (handled by Clerk), nutritional targets, and daily meal/activity logs.",
    improve_t: 'Improving Food Recognition (optional)',
    improve_p: 'If — and only if — you turn on "Help improve recognition" in Settings → Preferences (off by default), the photo of a meal you scan and the food name you keep are sent to our server to help train and improve the on-device recognition model. Your identifier is pseudonymized (irreversibly hashed) before storage, the images are used solely to improve recognition, and you can turn this off at any time or request deletion through our support channel.',
    security_t: 'Security',
    security_p: "Your data is hosted on secure Firebase infrastructure and protected by Clerk's enterprise-grade authentication system.",
    control_t: 'Control',
    control_p: 'You can delete your account and all associated data at any time — directly from this screen (button below) or through our support channel.',
    del_title: 'Delete my account',
    del_desc: 'Permanently delete your account and all associated data (profile, logs, weight history, health entries). This cannot be undone.',
    del_btn: 'Delete my account',
    del_confirm_title: 'Delete your account?',
    del_confirm_msg: 'This permanently erases your profile, logs, health data and content. Community routes you shared stay online but lose any link to you. This action is irreversible.',
    del_confirm_yes: 'Delete permanently',
    del_cancel: 'Cancel',
    del_deleting: 'Deleting…',
    del_error: 'Deletion failed. Please try again or contact support.',
  },
  fr: {
    title: 'Confidentialité',
    hero: 'Votre vie privée compte',
    updated: 'Dernière mise à jour : 15 avril 2026',
    intro: 'Chez Salorie, votre vie privée est notre priorité absolue. Nous appliquons des mesures de sécurité de pointe pour que votre parcours santé reste privé et protégé.',
    infoBox: 'Vos journaux et données de profil sont transmis via des connexions chiffrées (HTTPS) et protégés par des contrôles d’accès.',
    collect_t: 'Ce que nous collectons',
    collect_p: "Nous ne collectons que les informations nécessaires au fonctionnement de l’application : détails du profil (gérés par Clerk), objectifs nutritionnels et journaux quotidiens de repas/activité.",
    improve_t: 'Améliorer la reconnaissance des aliments (optionnel)',
    improve_p: 'Si — et seulement si — vous activez « Aider à améliorer la reconnaissance » dans Réglages → Préférences (désactivé par défaut), la photo du repas que vous scannez et le nom de l’aliment que vous conservez sont envoyés à notre serveur pour entraîner et améliorer le modèle de reconnaissance embarqué. Votre identifiant est pseudonymisé (haché de manière irréversible) avant stockage, les images servent uniquement à améliorer la reconnaissance, et vous pouvez désactiver cette option à tout moment ou demander la suppression via notre support.',
    security_t: 'Sécurité',
    security_p: "Vos données sont hébergées sur une infrastructure Firebase sécurisée et protégées par le système d’authentification professionnel de Clerk.",
    control_t: 'Contrôle',
    control_p: 'Vous pouvez supprimer votre compte et toutes les données associées à tout moment — directement depuis cet écran (bouton ci-dessous) ou via notre support.',
    del_title: 'Supprimer mon compte',
    del_desc: 'Supprime définitivement votre compte et toutes les données associées (profil, journaux, historique de poids, données santé). Cette action est irréversible.',
    del_btn: 'Supprimer mon compte',
    del_confirm_title: 'Supprimer votre compte ?',
    del_confirm_msg: 'Cela efface définitivement votre profil, vos journaux, vos données de santé et vos contenus. Les parcours que vous avez partagés restent en ligne mais ne sont plus reliés à vous. Action irréversible.',
    del_confirm_yes: 'Supprimer définitivement',
    del_cancel: 'Annuler',
    del_deleting: 'Suppression…',
    del_error: 'La suppression a échoué. Réessayez ou contactez le support.',
  },
  ar: {
    title: 'الخصوصية',
    hero: 'خصوصيتك تهمنا',
    updated: 'آخر تحديث: 15 أبريل 2026',
    intro: 'في سالوري، خصوصيتك هي أولويتنا القصوى. نطبّق إجراءات أمنية رائدة لضمان بقاء رحلتك الصحية خاصة وآمنة.',
    infoBox: 'تُنقل سجلاتك وبيانات ملفك الشخصي عبر اتصالات مشفّرة (HTTPS) ومحمية بضوابط الوصول.',
    collect_t: 'ما الذي نجمعه',
    collect_p: 'نجمع فقط المعلومات الضرورية لعمل التطبيق: تفاصيل الملف الشخصي (يديرها Clerk)، الأهداف الغذائية، وسجلات الوجبات/النشاط اليومية.',
    improve_t: 'تحسين التعرّف على الطعام (اختياري)',
    improve_p: 'إذا — وفقط إذا — فعّلت «المساعدة في تحسين التعرّف» في الإعدادات ← التفضيلات (متوقفة افتراضيًا)، تُرسل صورة الوجبة التي تمسحها واسم الطعام الذي تحتفظ به إلى خادمنا للمساعدة في تدريب نموذج التعرّف على الجهاز وتحسينه. يُجعل معرّفك مجهولًا (مُجزّأ بشكل لا رجعة فيه) قبل التخزين، وتُستخدم الصور حصريًا لتحسين التعرّف، ويمكنك إيقاف ذلك في أي وقت أو طلب الحذف عبر قناة الدعم.',
    security_t: 'الأمان',
    security_p: 'تُستضاف بياناتك على بنية Firebase الآمنة وتحميها أنظمة المصادقة الاحترافية من Clerk.',
    control_t: 'التحكم',
    control_p: 'يمكنك حذف حسابك وجميع البيانات المرتبطة به في أي وقت — مباشرة من هذه الشاشة (الزر أدناه) أو عبر قناة الدعم.',
    del_title: 'حذف حسابي',
    del_desc: 'يحذف حسابك وجميع البيانات المرتبطة به نهائيًا (الملف الشخصي، السجلات، سجل الوزن، البيانات الصحية). لا يمكن التراجع.',
    del_btn: 'حذف حسابي',
    del_confirm_title: 'حذف حسابك؟',
    del_confirm_msg: 'سيتم حذف ملفك وسجلاتك وبياناتك الصحية ومحتوياتك نهائيًا. المسارات التي شاركتها تبقى متاحة لكن دون أي ارتباط بك. إجراء لا رجعة فيه.',
    del_confirm_yes: 'حذف نهائي',
    del_cancel: 'إلغاء',
    del_deleting: 'جارٍ الحذف…',
    del_error: 'فشل الحذف. أعد المحاولة أو تواصل مع الدعم.',
  },
};

export default function PrivacyScreen() {
  const { colors, resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const isDark = resolved === 'dark';
  const styles = useMemo(() => makeStyles(isDark), [isDark]);
  const tx = TXT[language as keyof typeof TXT] ?? TXT.en;
  const { user } = useUser();
  const { signOut } = useAuth();
  const [deleting, setDeleting] = useState(false);

  // Suppression de compte in-app (exigence Google Play). Double confirmation, puis :
  // efface les données Firestore (deleteAllUserData) → supprime l'identité Clerk → signOut.
  const handleDelete = () => {
    Alert.alert(tx.del_confirm_title, tx.del_confirm_msg, [
      { text: tx.del_cancel, style: 'cancel' },
      {
        text: tx.del_confirm_yes,
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            const email = (user as any)?.primaryEmailAddress?.emailAddress
              || (user as any)?.emailAddresses?.[0]?.emailAddress || '';
            if (email) await deleteAllUserData(email);
            try { await (user as any)?.delete(); } catch { /* identité déjà supprimée / session expirée */ }
            try { await signOut(); } catch {}
            router.replace('/welcome' as any);
          } catch {
            setDeleting(false);
            Alert.alert('', tx.del_error);
          }
        },
      },
    ]);
  };

  const bg = isDark ? '#0f1419' : '#fff';
  const tPrimary = isDark ? '#fff' : Colors.light.gray[900];
  const tMuted = isDark ? '#9BA1A6' : Colors.light.gray[500];
  const infoBoxBg = isDark ? Colors.dark.primaryLight : '#ECFDF5';
  const infoBoxBorder = isDark ? '#283241' : '#D1FAE5';
  const infoBoxText = isDark ? Colors.dark.primaryDark : '#065F46';
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <ScreenTopBar showBack title={tx.title} showBrand={false} showNotif={false} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(600)}>
          <View style={styles.iconHero}>
            <ShieldCheck size={64} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: tPrimary }]}>{tx.hero}</Text>
          <Text style={[styles.date, { color: tMuted }]}>{tx.updated}</Text>

          <Text style={[styles.paragraph, { color: tMuted, textAlign: txtAlign(isRTL), writingDirection: writingDir(isRTL) }]}>
            {tx.intro}
          </Text>

          <View style={[styles.infoBox, { backgroundColor: infoBoxBg, borderColor: infoBoxBorder, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
             <Fingerprint size={24} color={colors.primary} />
             <Text style={[styles.infoBoxText, { color: infoBoxText, textAlign: txtAlign(isRTL), writingDirection: writingDir(isRTL) }]}>{tx.infoBox}</Text>
          </View>

          <Text style={[styles.subTitle, { color: tPrimary, textAlign: txtAlign(isRTL) }]}>{tx.collect_t}</Text>
          <Text style={[styles.paragraph, { color: tMuted, textAlign: txtAlign(isRTL), writingDirection: writingDir(isRTL) }]}>
            {tx.collect_p}
          </Text>

          <Text style={[styles.subTitle, { color: tPrimary, textAlign: txtAlign(isRTL) }]}>{tx.improve_t}</Text>
          <Text style={[styles.paragraph, { color: tMuted, textAlign: txtAlign(isRTL), writingDirection: writingDir(isRTL) }]}>
            {tx.improve_p}
          </Text>

          <Text style={[styles.subTitle, { color: tPrimary, textAlign: txtAlign(isRTL) }]}>{tx.security_t}</Text>
          <Text style={[styles.paragraph, { color: tMuted, textAlign: txtAlign(isRTL), writingDirection: writingDir(isRTL) }]}>
            {tx.security_p}
          </Text>

          <Text style={[styles.subTitle, { color: tPrimary, textAlign: txtAlign(isRTL) }]}>{tx.control_t}</Text>
          <Text style={[styles.paragraph, { color: tMuted, textAlign: txtAlign(isRTL), writingDirection: writingDir(isRTL) }]}>
            {tx.control_p}
          </Text>

          {/* Zone de danger — suppression de compte in-app (exigence Google Play) */}
          <View style={[styles.dangerBox, { borderColor: isDark ? '#4C1D1D' : '#FEE2E2', backgroundColor: isDark ? '#1F1416' : '#FEF2F2' }]}>
            <Text style={[styles.dangerTitle, { textAlign: txtAlign(isRTL) }]}>{tx.del_title}</Text>
            <Text style={[styles.dangerDesc, { color: tMuted, textAlign: txtAlign(isRTL), writingDirection: writingDir(isRTL) }]}>{tx.del_desc}</Text>
            <TouchableOpacity
              style={[styles.dangerBtn, { opacity: deleting ? 0.6 : 1, flexDirection: isRTL ? 'row-reverse' : 'row' }]}
              onPress={handleDelete}
              disabled={deleting}
              accessibilityRole="button"
              accessibilityLabel={tx.del_btn}
            >
              {deleting ? <ActivityIndicator color="#fff" /> : <Trash2 size={18} color="#fff" />}
              <Text style={styles.dangerBtnText}>{deleting ? tx.del_deleting : tx.del_btn}</Text>
            </TouchableOpacity>
          </View>
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
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#ECFDF5',
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#D1FAE5',
    gap: 16,
    marginVertical: 10,
    alignItems: 'center',
  },
  infoBoxText: {
    flex: 1,
    fontSize: 14,
    color: '#065F46',
    fontWeight: '600',
    lineHeight: 20,
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
  dangerBox: {
    marginTop: 28,
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
  },
  dangerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#DC2626',
    marginBottom: 8,
  },
  dangerDesc: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    marginBottom: 16,
  },
  dangerBtn: {
    backgroundColor: '#DC2626',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  dangerBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
});
