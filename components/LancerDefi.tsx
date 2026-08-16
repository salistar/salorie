import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MessageCircle, Send, Smartphone, Share2, Globe, Swords } from 'lucide-react-native';
import { useTokens } from '../constants/tokens';
import { useTranslation } from '../lib/i18n';
import { partager, reseauxInstalles, texteDefi, lienPartage, type Reseau } from '../lib/partage';
import { rowDir } from '../lib/rtl';

/**
 * Lancer un défi — vers tous les canaux, y compris ceux sans application.
 *
 * ## Un défi n'est pas un partage
 *
 * Partager, c'est montrer ce qu'on a fait. Défier, c'est proposer quelque chose
 * à quelqu'un : le lien CRÉE une course, un duo, un objectif commun à l'arrivée.
 * Le texte parle donc de ce qui attend la personne, pas de ce que l'expéditeur
 * a accompli.
 *
 * ## Pourquoi le SMS est là, et n'est pas un repli honteux
 *
 * C'est le seul canal qui atteint tout le monde : aucune application à
 * installer, aucun compte. Pour inviter un parent, un voisin, un collègue qui
 * n'est sur aucun réseau, c'est le seul chemin — et au Maroc ce n'est pas un cas
 * marginal. Il ne demande aucune déclaration de visibilité de paquet non plus,
 * donc il marche même là où les raccourcis échouent.
 *
 * ## Instagram et TikTok
 *
 * Ni l'un ni l'autre n'accepte de texte pré-rempli par lien : c'est une limite
 * de leur côté, pas un manque du nôtre. Ils restent atteignables par la feuille
 * du système, qui les propose et sait y coller le message. On n'affiche donc pas
 * de faux raccourci qui n'écrirait rien.
 */

const TXT: Record<string, Record<string, string>> = {
  fr: {
    titre: 'Lancer le défi',
    whatsapp: 'WhatsApp',
    telegram: 'Telegram',
    sms: 'SMS',
    autre: 'Autre',
    aide: 'Le SMS marche même sans application installée',
  },
  en: {
    titre: 'Send the challenge',
    whatsapp: 'WhatsApp',
    telegram: 'Telegram',
    sms: 'SMS',
    autre: 'More',
    aide: 'SMS works even with no app installed',
  },
  ar: {
    titre: 'أطلق التحدي',
    whatsapp: 'واتساب',
    telegram: 'تيليغرام',
    sms: 'رسالة نصية',
    autre: 'أخرى',
    aide: 'الرسالة النصية تعمل حتى بدون أي تطبيق',
  },
};

export default function LancerDefi({
  auteur,
  quoi,
  chemin,
  compact = false,
}: {
  /** Qui défie — le prénom suffit, on n'envoie pas d'e-mail dans un message. */
  auteur: string;
  /** Ce qui est proposé, en une poignée de mots : « 10 000 pas demain ». */
  quoi: string;
  /** Chemin salorie.com qui crée le défi à l'arrivée, ex. `defi/42`. */
  chemin: string;
  compact?: boolean;
}) {
  const tok = useTokens();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.fr;
  const [installes, setInstalles] = useState<string[]>([]);

  useEffect(() => {
    let vivant = true;
    reseauxInstalles().then((r) => vivant && setInstalles(r));
    return () => {
      vivant = false;
    };
  }, []);

  const envoyer = (reseau?: Reseau) =>
    partager({
      texte: texteDefi({ langue: language, auteur, quoi }),
      // La source dit par quel canal le défi est parti : c'est la seule façon de
      // savoir lequel ramène vraiment du monde.
      lien: lienPartage(chemin, reseau || 'natif'),
      titre: t.titre,
      reseau,
    });

  const Bouton = ({
    reseau,
    libelle,
    fond,
    Icone,
  }: {
    reseau?: Reseau;
    libelle: string;
    fond: string;
    Icone: any;
  }) => (
    <TouchableOpacity
      style={[styles.bouton, { flexDirection: rowDir(isRTL), backgroundColor: fond }]}
      onPress={() => envoyer(reseau)}
      accessibilityRole="button"
      accessibilityLabel={`${t.titre} — ${libelle}`}
      activeOpacity={0.85}
    >
      <Icone size={16} color="#fff" />
      {!compact && <Text style={styles.boutonTexte}>{libelle}</Text>}
    </TouchableOpacity>
  );

  return (
    <View style={styles.bloc}>
      {!compact && (
        <View style={[styles.entete, { flexDirection: rowDir(isRTL) }]}>
          <Swords size={16} color={tok.accent} />
          <Text style={[styles.titre, { color: tok.text }]}>{t.titre}</Text>
        </View>
      )}

      <View style={[styles.rangee, { flexDirection: rowDir(isRTL) }]}>
        {installes.includes('whatsapp') && (
          <Bouton reseau="whatsapp" libelle={t.whatsapp} fond="#25D366" Icone={MessageCircle} />
        )}
        {installes.includes('telegram') && (
          <Bouton reseau="telegram" libelle={t.telegram} fond="#229ED9" Icone={Send} />
        )}
        {/* Le SMS n'est JAMAIS conditionné : c'est justement celui qui doit rester
            quand rien n'est installé. */}
        <Bouton reseau="sms" libelle={t.sms} fond={tok.accent} Icone={Smartphone} />
        {installes.includes('facebook') && (
          <Bouton reseau="facebook" libelle="Facebook" fond="#1877F2" Icone={Globe} />
        )}
        <TouchableOpacity
          style={[styles.bouton, { flexDirection: rowDir(isRTL), backgroundColor: tok.surfaceSunken }]}
          onPress={() => envoyer()}
          accessibilityRole="button"
          accessibilityLabel={`${t.titre} — ${t.autre}`}
          activeOpacity={0.85}
        >
          <Share2 size={16} color={tok.text} />
          {!compact && <Text style={[styles.boutonTexte, { color: tok.text }]}>{t.autre}</Text>}
        </TouchableOpacity>
      </View>

      {!compact && (
        <Text style={[styles.aide, { color: tok.textFaint }]} numberOfLines={2}>
          {t.aide}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bloc: { marginTop: 14, gap: 8 },
  entete: { alignItems: 'center', gap: 7 },
  titre: { fontSize: 14.5, fontWeight: '800' },
  rangee: { alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  bouton: { alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 13, borderRadius: 12 },
  boutonTexte: { fontSize: 13, fontWeight: '800', color: '#fff' },
  aide: { fontSize: 11.5, fontWeight: '600' },
});
