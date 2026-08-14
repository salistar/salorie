// Salon de discussion d'une course virtuelle.
// ---------------------------------------------------------------------------
// Ce qui fait tenir une course de trente jours, ce n'est pas le compteur de
// kilomètres, c'est de savoir que d'autres courent en même temps. Le chat est donc
// une fonction de rétention autant qu'une fonction sociale.
//
// Modération : tout est décidé par le SERVEUR (cf. backend/src/social). L'écran ne
// filtre rien — il se contente d'afficher le refus dans la langue de l'utilisateur.
// Un filtre côté client ne protégerait personne, puisqu'il suffirait d'appeler le
// socket directement pour le contourner.
import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, FlatList, TouchableOpacity,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { Send, Flag } from 'lucide-react-native';
import { useTokens } from '../constants/tokens';
import { useTranslation } from '../lib/i18n';
import { rowDir, txtAlign } from '../lib/rtl';
import { haptique } from '../lib/haptique';
import {
  connecterSocial, rejoindreCourse, quitterCourse, envoyerMessage,
  signalerMessage, socketSocial, type MessageCourse,
} from '../lib/socialSocket';

const T: Record<string, Record<string, string>> = {
  fr: { vide: 'Personne n’a encore écrit. Lance la conversation !', champ: 'Écris un message…',
        signaler: 'Signaler', signalerQ: 'Signaler ce message aux modérateurs ?', annuler: 'Annuler',
        signale: 'Signalé. Merci.', envoyer: 'Envoyer' },
  en: { vide: 'Nobody has written yet. Start the conversation!', champ: 'Write a message…',
        signaler: 'Report', signalerQ: 'Report this message to the moderators?', annuler: 'Cancel',
        signale: 'Reported. Thank you.', envoyer: 'Send' },
  ar: { vide: 'لم يكتب أحد بعد. ابدأ المحادثة!', champ: 'اكتب رسالة…',
        signaler: 'إبلاغ', signalerQ: 'الإبلاغ عن هذه الرسالة للمشرفين؟', annuler: 'إلغاء',
        signale: 'تم الإبلاغ. شكرًا.', envoyer: 'إرسال' },
};

export default function RaceChat({ raceId }: { raceId: string }) {
  const tok = useTokens();
  const { language, isRTL } = useTranslation();
  const t = T[String(language)] || T.fr;

  const [messages, setMessages] = useState<MessageCourse[]>([]);
  const [texte, setTexte] = useState('');
  const [refus, setRefus] = useState('');
  const liste = useRef<FlatList<MessageCourse>>(null);

  useEffect(() => {
    if (!raceId) return;
    let vivant = true;

    (async () => {
      const s = await connecterSocial();
      if (!s || !vivant) return;
      rejoindreCourse(raceId, String(language));

      s.on('race:historique', (d: { raceId: string; messages: MessageCourse[] }) => {
        if (d.raceId === raceId && vivant) setMessages(d.messages || []);
      });
      s.on('race:msg', (m: MessageCourse) => {
        if (m.raceId === raceId && vivant) setMessages((prev) => [...prev, m]);
      });
      // Un message masqué par la modération disparaît chez TOUT LE MONDE, pas
      // seulement chez celui qui l'a signalé.
      s.on('race:retire', (d: { id: string }) => {
        if (vivant) setMessages((prev) => prev.filter((m) => m.id !== d.id));
      });
      s.on('race:refus', (d: { message: string }) => {
        if (!vivant) return;
        haptique.alerte();
        setRefus(d.message);
        setTimeout(() => vivant && setRefus(''), 4000);
      });
    })();

    return () => {
      vivant = false;
      quitterCourse(raceId);
      const s = socketSocial();
      s?.off('race:historique');
      s?.off('race:msg');
      s?.off('race:retire');
      s?.off('race:refus');
    };
  }, [raceId, language]);

  const envoyer = () => {
    const v = texte.trim();
    if (!v) return;
    // On vide le champ IMMÉDIATEMENT : attendre l'aller-retour donnerait l'impression
    // que l'app n'a pas réagi. Si le serveur refuse, il le dira juste au-dessus.
    setTexte('');
    envoyerMessage(raceId, v);
  };

  const signaler = (m: MessageCourse) => {
    Alert.alert(t.signaler, t.signalerQ, [
      { text: t.annuler, style: 'cancel' },
      {
        text: t.signaler,
        style: 'destructive',
        onPress: () => {
          signalerMessage(m.id);
          haptique.succes();
          Alert.alert(t.signale);
        },
      },
    ]);
  };

  const s = styles(tok);
  return (
    <KeyboardAvoidingView
      style={s.conteneur}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <FlatList
        ref={liste}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={s.fil}
        onContentSizeChange={() => liste.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={<Text style={s.vide}>{t.vide}</Text>}
        renderItem={({ item }) => (
          <View style={[s.ligne, { flexDirection: rowDir(isRTL) }]}>
            <View style={s.bulle}>
              <Text style={[s.auteur, { textAlign: txtAlign(isRTL) }]}>{item.name || '—'}</Text>
              <Text style={[s.texte, { textAlign: txtAlign(isRTL) }]}>{item.text}</Text>
            </View>
            <TouchableOpacity
              onPress={() => signaler(item)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t.signaler}
            >
              <Flag size={14} color={tok.textFaint} />
            </TouchableOpacity>
          </View>
        )}
      />

      {refus ? <Text style={s.refus}>{refus}</Text> : null}

      <View style={[s.saisie, { flexDirection: rowDir(isRTL) }]}>
        <TextInput
          style={[s.champ, { textAlign: txtAlign(isRTL) }]}
          value={texte}
          onChangeText={setTexte}
          placeholder={t.champ}
          placeholderTextColor={tok.textFaint}
          maxLength={280}
          onSubmitEditing={envoyer}
          returnKeyType="send"
        />
        <TouchableOpacity
          style={s.envoi}
          onPress={envoyer}
          disabled={!texte.trim()}
          accessibilityRole="button"
          accessibilityLabel={t.envoyer}
        >
          <Send size={18} color={tok.onAccent} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = (tok: any) =>
  StyleSheet.create({
    conteneur: { flex: 1, backgroundColor: tok.bg },
    fil: { padding: 14, gap: 8, flexGrow: 1 },
    vide: { color: tok.textMuted, fontSize: 13.5, textAlign: 'center', marginTop: 30 },
    ligne: { alignItems: 'center', gap: 8 },
    bulle: {
      flex: 1, backgroundColor: tok.surface, borderRadius: 16,
      padding: 12, borderWidth: 1, borderColor: tok.border, gap: 3,
    },
    auteur: { fontSize: 11.5, fontWeight: '800', color: tok.accent },
    texte: { fontSize: 14.5, color: tok.text, lineHeight: 20 },
    refus: {
      marginHorizontal: 14, marginBottom: 6, padding: 10, borderRadius: 12,
      backgroundColor: tok.warningSoft, color: tok.warningInk, fontSize: 13, fontWeight: '600',
    },
    saisie: { padding: 12, gap: 8, alignItems: 'center', borderTopWidth: 1, borderTopColor: tok.border },
    champ: {
      flex: 1, backgroundColor: tok.surfaceSunken, borderRadius: 20,
      paddingHorizontal: 16, paddingVertical: 11, fontSize: 14.5, color: tok.text,
    },
    envoi: {
      width: 42, height: 42, borderRadius: 21, backgroundColor: tok.accent,
      alignItems: 'center', justifyContent: 'center',
    },
  });
