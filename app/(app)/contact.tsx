import React, { useState, useMemo } from 'react';
import { useTokens, type Tokens } from '../../constants/tokens';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { MessagesSquare, Check, Mail } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { FormCard, FormInput, SubmitBar } from '../../components/FormKit';
import { db, logEvent, emailToDocId } from '../../lib/firebase';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';


const TXT: any = {
  en: {
    title: 'Contact us',
    sub: 'A question, an issue, a suggestion? Write to us — we reply by email.',
    subjectLabel: 'Subject',
    subjectPh: 'E.g. Sync issue',
    messageLabel: 'Message',
    messagePh: 'Describe your request…',
    send: 'Send',
    noSubject: '(no subject)',
    doneTxt: 'Message sent ✅',
    doneSub: 'Our team has received it (visible in the back office). Thank you!',
    newMessage: 'New message',
    orMail: 'Or write to admin@salistar.com',
  },
  fr: {
    title: 'Nous contacter',
    sub: 'Une question, un souci, une suggestion ? Écris-nous — on te répond par e-mail.',
    subjectLabel: 'Sujet',
    subjectPh: 'Ex: Problème de synchro',
    messageLabel: 'Message',
    messagePh: 'Décris ta demande…',
    send: 'Envoyer',
    noSubject: '(sans sujet)',
    doneTxt: 'Message envoyé ✅',
    doneSub: "Notre équipe l'a reçu (visible dans le back-office). Merci !",
    newMessage: 'Nouveau message',
    orMail: 'Ou écris à admin@salistar.com',
  },
  ar: {
    title: 'اتصل بنا',
    sub: 'سؤال، مشكلة، اقتراح؟ راسلنا — سنرد عليك عبر البريد الإلكتروني.',
    subjectLabel: 'الموضوع',
    subjectPh: 'مثال: مشكلة في المزامنة',
    messageLabel: 'الرسالة',
    messagePh: 'صف طلبك…',
    send: 'إرسال',
    noSubject: '(بدون موضوع)',
    doneTxt: 'تم إرسال الرسالة ✅',
    doneSub: 'استلمها فريقنا (مرئية في لوحة الإدارة). شكراً!',
    newMessage: 'رسالة جديدة',
    orMail: 'أو راسل admin@salistar.com',
  },
};

export default function Contact() {
  const k = useTokens();
  const s = useMemo(() => makeS(k), [k]);
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
  const border = tok.border;
  const align: any = { textAlign: isRTL ? 'right' : 'left' };

  const email = user?.primaryEmailAddress?.emailAddress || '';
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const send = async () => {
    if (!message.trim() || busy) return;
    setBusy(true);
    try {
      // Sous-collection owner (autorisée par les règles) ; le web lit via collectionGroup.
      const docId = emailToDocId(email);
      await addDoc(collection(db, 'users', docId, 'contact_messages'), {
        email, subject: subject.trim() || t.noSubject, message: message.trim(),
        userName: user?.fullName || '', createdAt: serverTimestamp(),
      });
      logEvent(email, 'contact_message', { subject: subject.trim() });
      setSent(true);
    } catch {
      // Repli : ouvrir l'e-mail si Firestore échoue (hors-ligne).
      Linking.openURL(`mailto:admin@salistar.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`);
    } finally { setBusy(false); }
  };

  if (sent) {
    return (
      <SafeAreaView edges={['bottom', 'left', 'right']} style={[s.safe, { backgroundColor: bg }]}><ScreenTopBar />
        <View style={s.done}><Check size={48} color={accent} /><Text style={[s.doneTxt, { color: text }]}>{t.doneTxt}</Text>
          <Text style={[s.doneSub, { color: sub }]}>{t.doneSub}</Text>
          <TouchableOpacity style={s.btn} onPress={() => { setSent(false); setSubject(''); setMessage(''); }}><Text style={s.btnTxt}>{t.newMessage}</Text></TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[s.safe, { backgroundColor: bg }]}><ScreenTopBar />
      <ScrollView contentContainerStyle={s.body}>
        <View style={s.head}><MessagesSquare size={26} color={accent} /><Text style={[s.title, { color: text }]}>{t.title}</Text></View>
        <Text style={[s.sub, { color: sub }, align]}>{t.sub}</Text>
        <FormCard style={{ marginTop: 18 }}>
          <FormInput label={t.subjectLabel} value={subject} onChangeText={setSubject} placeholder={t.subjectPh} />
          <FormInput label={t.messageLabel} value={message} onChangeText={setMessage} placeholder={t.messagePh} multiline style={{ height: 140, textAlignVertical: 'top' }} />
        </FormCard>
        <View style={{ marginHorizontal: -18, marginTop: -8 }}>
          <SubmitBar label={t.send} onPress={send} disabled={!message.trim()} loading={busy} />
        </View>
        <TouchableOpacity style={s.mail} onPress={() => Linking.openURL('mailto:admin@salistar.com')}>
          <Mail size={15} color={accent} /><Text style={s.mailTxt}>{t.orMail}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// Fabrique thémée : cette feuille lisait des jetons alors qu elle etait
// evaluee UNE FOIS a l importation, avant que le theme n existe.
const makeS = (k: Tokens) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: k.surfaceSunken },
  body: { padding: 18, paddingBottom: 90 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  title: { fontSize: 24, fontWeight: '800', color: '#1B2A33' },
  sub: { fontSize: 13, color: k.textMuted, marginTop: 6, lineHeight: 19 },
  label: { fontSize: 13, fontWeight: '700', color: k.textMuted, marginTop: 18, marginBottom: 6 },
  input: { backgroundColor: k.surface, borderRadius: 12, borderWidth: 1, borderColor: k.border, padding: 14, fontSize: 15, color: '#1B2A33' },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: k.accent, borderRadius: 14, paddingVertical: 15, marginTop: 22 },
  btnTxt: { color: k.onAccent, fontWeight: '800', fontSize: 16 },
  mail: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16 },
  mailTxt: { color: k.accent, fontWeight: '600', fontSize: 13 },
  done: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  doneTxt: { fontSize: 20, fontWeight: '800', color: '#1B2A33', marginTop: 16 },
  doneSub: { fontSize: 14, color: k.textMuted, textAlign: 'center', marginTop: 8, lineHeight: 20 },
});
