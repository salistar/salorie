import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { MessagesSquare, Send, Check, Mail } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { db, logEvent } from '../../lib/firebase';

const GREEN = '#2E8B57';

export default function Contact() {
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress || '';
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const send = async () => {
    if (!message.trim() || busy) return;
    setBusy(true);
    try {
      await addDoc(collection(db, 'contact_messages'), {
        email, subject: subject.trim() || '(sans sujet)', message: message.trim(),
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
      <SafeAreaView style={s.safe}><ScreenTopBar />
        <View style={s.done}><Check size={48} color={GREEN} /><Text style={s.doneTxt}>Message envoyé ✅</Text>
          <Text style={s.doneSub}>Notre équipe l'a reçu (visible dans le back-office). Merci !</Text>
          <TouchableOpacity style={s.btn} onPress={() => { setSent(false); setSubject(''); setMessage(''); }}><Text style={s.btnTxt}>Nouveau message</Text></TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}><ScreenTopBar />
      <ScrollView contentContainerStyle={s.body}>
        <View style={s.head}><MessagesSquare size={26} color={GREEN} /><Text style={s.title}>Nous contacter</Text></View>
        <Text style={s.sub}>Une question, un souci, une suggestion ? Écris-nous — on te répond par e-mail.</Text>
        <Text style={s.label}>Sujet</Text>
        <TextInput style={s.input} value={subject} onChangeText={setSubject} placeholder="Ex: Problème de synchro" placeholderTextColor="#94a3b8" />
        <Text style={s.label}>Message</Text>
        <TextInput style={[s.input, { height: 140, textAlignVertical: 'top' }]} value={message} onChangeText={setMessage} placeholder="Décris ta demande…" placeholderTextColor="#94a3b8" multiline />
        <TouchableOpacity style={[s.btn, (!message.trim() || busy) && { opacity: 0.5 }]} onPress={send} disabled={!message.trim() || busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <><Send size={18} color="#fff" /><Text style={s.btnTxt}>Envoyer</Text></>}
        </TouchableOpacity>
        <TouchableOpacity style={s.mail} onPress={() => Linking.openURL('mailto:admin@salistar.com')}>
          <Mail size={15} color={GREEN} /><Text style={s.mailTxt}>Ou écris à admin@salistar.com</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f3f6f4' },
  body: { padding: 18, paddingBottom: 90 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  title: { fontSize: 24, fontWeight: '800', color: '#1B2A33' },
  sub: { fontSize: 13, color: '#667085', marginTop: 6, lineHeight: 19 },
  label: { fontSize: 13, fontWeight: '700', color: '#64748b', marginTop: 18, marginBottom: 6 },
  input: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e6ece8', padding: 14, fontSize: 15, color: '#1B2A33' },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: GREEN, borderRadius: 14, paddingVertical: 15, marginTop: 22 },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
  mail: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16 },
  mailTxt: { color: GREEN, fontWeight: '600', fontSize: 13 },
  done: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  doneTxt: { fontSize: 20, fontWeight: '800', color: '#1B2A33', marginTop: 16 },
  doneSub: { fontSize: 14, color: '#667085', textAlign: 'center', marginTop: 8, lineHeight: 20 },
});
