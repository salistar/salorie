import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { UserMinus, Users, Phone, Video } from 'lucide-react-native';
import { useUser } from '@clerk/clerk-expo';
import ScreenTopBar from '../../components/ScreenTopBar';
import { Input } from '../../components/ui';
import { useTokens } from '../../constants/tokens';
import { useTranslation } from '../../lib/i18n';
import { rowDir, txtAlign } from '../../lib/rtl';
import { haptique } from '../../lib/haptique';
import { listerAmis, retirerAmi, type Ami } from '../../lib/amis';
import { addFriend } from '../../lib/social';
import { useEspaceBasSimple } from '../../lib/espaceBas';

/**
 * Mes amis — la liste, et ce qu'on peut en faire.
 *
 * ## Pourquoi cet écran existe séparément du fil social
 *
 * Le fil montre l'ACTIVITÉ des amis. Il ne dit pas qui ils sont, et surtout il ne
 * permet pas d'en retirer un. Ajouter sans pouvoir retirer, c'est une porte qui
 * ne s'ouvre que dans un sens : la personne qu'on a ajoutée par erreur voit son
 * activité pour toujours et peut l'appeler.
 *
 * ## Pourquoi appeler part d'ICI et non de l'écran de marche
 *
 * Un appel s'adresse à quelqu'un, pas à un identifiant. En partant de la liste
 * d'amis, la question « ai-je le droit d'appeler cette personne ? » ne se pose
 * même pas : on ne peut choisir que parmi ses amis. Le serveur revérifie de son
 * côté — un client modifié ne passerait pas par cet écran.
 */

const T: Record<string, Record<string, string>> = {
  fr: {
    titre: 'Mes amis',
    sous: 'Seuls tes amis peuvent te rejoindre en marche à deux, te parler ou t’appeler en vidéo.',
    ajouter: 'Ajouter par e-mail',
    champ: 'adresse e-mail de ton ami',
    valider: 'Ajouter',
    vide: 'Aucun ami pour l’instant. Ajoute quelqu’un par son e-mail.',
    retirer: 'Retirer',
    retirerQ: 'Retirer de tes amis ? Vous ne verrez plus vos activités et ne pourrez plus vous appeler.',
    annuler: 'Annuler',
    parler: 'Parler',
    video: 'Vidéo',
    ajoute: 'Ajouté',
    err_self: 'C’est ta propre adresse.',
    err_notfound: 'Aucun compte Salorie avec cette adresse.',
    err_error: 'Une erreur est survenue. Réessaie.',
  },
  en: {
    titre: 'My friends',
    sous: 'Only friends can join your walk, talk to you or call you on video.',
    ajouter: 'Add by e-mail',
    champ: 'your friend’s e-mail',
    valider: 'Add',
    vide: 'No friends yet. Add someone by their e-mail.',
    retirer: 'Remove',
    retirerQ: 'Remove from your friends? You will no longer see each other’s activity or be able to call.',
    annuler: 'Cancel',
    parler: 'Talk',
    video: 'Video',
    ajoute: 'Added',
    err_self: 'That is your own address.',
    err_notfound: 'No Salorie account with that address.',
    err_error: 'Something went wrong. Try again.',
  },
  ar: {
    titre: 'أصدقائي',
    sous: 'أصدقاؤك وحدهم يمكنهم مرافقتك في المشي أو التحدث إليك أو الاتصال بك بالفيديو.',
    ajouter: 'إضافة بالبريد الإلكتروني',
    champ: 'بريد صديقك الإلكتروني',
    valider: 'إضافة',
    vide: 'لا أصدقاء بعد. أضف شخصًا ببريده الإلكتروني.',
    retirer: 'إزالة',
    retirerQ: 'إزالته من أصدقائك؟ لن تريا نشاط بعضكما ولن تتمكنا من الاتصال.',
    annuler: 'إلغاء',
    parler: 'تحدّث',
    video: 'فيديو',
    ajoute: 'تمت الإضافة',
    err_self: 'هذا عنوانك أنت.',
    err_notfound: 'لا يوجد حساب Salorie بهذا العنوان.',
    err_error: 'حدث خطأ. حاول مجددًا.',
  },
};

export default function MesAmis() {
  const tok = useTokens();
  const { language, isRTL } = useTranslation() as any;
  const t = T[String(language)] || T.fr;
  const espaceBas = useEspaceBasSimple();
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress || '';

  const [amis, setAmis] = useState<Ami[]>([]);
  const [chargement, setChargement] = useState(true);
  const [saisie, setSaisie] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);

  const charger = useCallback(async () => {
    if (!email) {
      setChargement(false);
      return;
    }
    setAmis(await listerAmis(email));
    setChargement(false);
  }, [email]);

  useEffect(() => {
    charger();
  }, [charger]);

  const ajouter = async () => {
    const v = saisie.trim();
    if (!v || occupe) return;
    setOccupe(true);
    setMessage(null);
    const r = await addFriend(email, v);
    if (r.ok) {
      setSaisie('');
      setMessage({ ok: true, texte: `${t.ajoute} : ${r.name}` });
      haptique.succes();
      await charger();
    } else {
      setMessage({ ok: false, texte: t[`err_${r.reason || 'error'}`] || t.err_error });
      haptique.alerte();
    }
    setOccupe(false);
  };

  const retirer = (ami: Ami) => {
    Alert.alert(ami.nom, t.retirerQ, [
      { text: t.annuler, style: 'cancel' },
      {
        text: t.retirer,
        style: 'destructive',
        onPress: async () => {
          // On retire de la liste affichée AVANT la réponse du serveur : attendre
          // l'aller-retour laisserait la ligne en place et donnerait l'impression
          // que l'appui n'a rien fait. En cas d'échec, `charger()` la remet.
          setAmis((prev) => prev.filter((a) => a.email !== ami.email));
          const r = await retirerAmi(email, ami.email);
          if (!r.ok) await charger();
        },
      },
    ]);
  };

  /**
   * Ouvre une marche à deux avec cet ami.
   *
   * L'identifiant du duo est dérivé des DEUX e-mails, triés : les deux personnes
   * calculent donc le même salon sans avoir à s'échanger quoi que ce soit, et
   * personne ne peut le deviner sans connaître les deux adresses.
   */
  const appeler = (ami: Ami) => {
    const paire = [email.toLowerCase(), ami.email].sort().join('|');
    let h = 0;
    for (let i = 0; i < paire.length; i++) h = (h * 31 + paire.charCodeAt(i)) | 0;
    router.push(`/duo-walk?duoId=duo_${Math.abs(h).toString(36)}` as any);
  };

  const s = styles(tok);
  return (
    <SafeAreaView style={[s.safe, { backgroundColor: tok.bg }]}>
      <ScreenTopBar showBack title={t.titre} showNotif={false} />
      <ScrollView
        contentContainerStyle={[s.corps, { paddingBottom: espaceBas }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[s.sous, { textAlign: txtAlign(isRTL) }]}>{t.sous}</Text>

        <Text style={[s.section, { textAlign: txtAlign(isRTL) }]}>{t.ajouter}</Text>
        <View style={[s.ligneAjout, { flexDirection: rowDir(isRTL) }]}>
          <View style={s.champ}>
            <Input
              value={saisie}
              onChangeText={setSaisie}
              placeholder={t.champ}
              autoCapitalize="none"
              keyboardType="email-address"
              onSubmitEditing={ajouter}
            />
          </View>
          <TouchableOpacity
            style={[s.bouton, { backgroundColor: tok.accent, opacity: saisie.trim() ? 1 : 0.5 }]}
            onPress={ajouter}
            disabled={!saisie.trim() || occupe}
            accessibilityRole="button"
            accessibilityLabel={t.valider}
          >
            <Text style={s.boutonTxt}>{t.valider}</Text>
          </TouchableOpacity>
        </View>

        {message ? (
          <Text style={[s.message, { color: message.ok ? tok.success : tok.danger }]}>{message.texte}</Text>
        ) : null}

        {chargement ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={tok.accent} />
        ) : amis.length === 0 ? (
          <View style={s.vide}>
            <Users size={30} color={tok.textFaint} />
            <Text style={[s.videTxt, { textAlign: 'center' }]}>{t.vide}</Text>
          </View>
        ) : (
          amis.map((a) => (
            <View key={a.email} style={[s.carte, { flexDirection: rowDir(isRTL) }]}>
              <View style={s.identite}>
                <Text style={[s.nom, { textAlign: txtAlign(isRTL) }]} numberOfLines={1}>{a.nom}</Text>
                <Text style={[s.mail, { textAlign: txtAlign(isRTL) }]} numberOfLines={1}>{a.email}</Text>
              </View>
              <TouchableOpacity
                style={[s.rond, { backgroundColor: tok.accentSoft }]}
                onPress={() => appeler(a)}
                accessibilityRole="button"
                accessibilityLabel={`${t.parler} — ${a.nom}`}
              >
                <Phone size={17} color={tok.accent} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.rond, { backgroundColor: tok.accentSoft }]}
                onPress={() => appeler(a)}
                accessibilityRole="button"
                accessibilityLabel={`${t.video} — ${a.nom}`}
              >
                <Video size={17} color={tok.accent} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.rond, { backgroundColor: tok.dangerSoft }]}
                onPress={() => retirer(a)}
                accessibilityRole="button"
                accessibilityLabel={`${t.retirer} — ${a.nom}`}
              >
                <UserMinus size={17} color={tok.dangerInk} />
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = (tok: any) =>
  StyleSheet.create({
    safe: { flex: 1 },
    corps: { padding: 16, gap: 10 },
    sous: { color: tok.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 4 },
    section: { color: tok.text, fontSize: 15, fontWeight: '800', marginTop: 8 },
    ligneAjout: { alignItems: 'center', gap: 8 },
    champ: { flex: 1 },
    bouton: { paddingVertical: 12, paddingHorizontal: 18, borderRadius: 12 },
    boutonTxt: { color: '#fff', fontSize: 14, fontWeight: '800' },
    message: { fontSize: 13, fontWeight: '700' },
    vide: { alignItems: 'center', gap: 10, marginTop: 34 },
    videTxt: { color: tok.textMuted, fontSize: 14, maxWidth: 260 },
    carte: {
      alignItems: 'center', gap: 8, backgroundColor: tok.surface,
      borderRadius: 14, padding: 12, borderWidth: 1, borderColor: tok.border,
    },
    identite: { flex: 1 },
    nom: { color: tok.text, fontSize: 15, fontWeight: '800' },
    mail: { color: tok.textFaint, fontSize: 12, marginTop: 1 },
    rond: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  });
