import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Share2, MessageCircle, Globe } from 'lucide-react-native';
import { useTokens } from '../constants/tokens';
import { useTranslation } from '../lib/i18n';
import { partager, reseauxInstalles, type Reseau } from '../lib/partage';
import { rowDir } from '../lib/rtl';

/**
 * La rangée de partage, posée sous un résultat qu'on a envie de montrer.
 *
 * Les neuf écrans qui partageaient déjà ouvraient tous la feuille du système :
 * deux gestes de plus que le canal réellement utilisé au Maroc. WhatsApp est
 * donc mis en avant, et n'apparaît QUE s'il est installé — un raccourci qui
 * retombe sur une page web fait plus de mal que pas de raccourci du tout.
 *
 * La feuille du système reste toujours visible : elle couvre Instagram, TikTok,
 * Telegram, la copie, le mail. On ajoute des raccourcis, on ne retire aucune
 * destination.
 */

const TXT: Record<string, Record<string, string>> = {
  fr: { partager: 'Partager', whatsapp: 'WhatsApp', autre: 'Autre' },
  en: { partager: 'Share', whatsapp: 'WhatsApp', autre: 'More' },
  ar: { partager: 'مشاركة', whatsapp: 'واتساب', autre: 'أخرى' },
};

export default function BoutonsPartage({
  texte,
  lien,
  titre,
  compact = false,
}: {
  /** Le message. Court : il sera lu dans une conversation, pas sur un écran. */
  texte: string;
  /** Lien vers salorie.com — c'est lui qui porte l'aperçu riche. */
  lien?: string;
  titre?: string;
  /** Sans le libellé « Partager », pour une carte déjà chargée. */
  compact?: boolean;
}) {
  const k = useTokens();
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

  const lancer = (reseau?: Reseau) => partager({ texte, lien, titre, reseau });

  return (
    <View style={[styles.rangee, { flexDirection: rowDir(isRTL) }]}>
      {!compact && (
        <Text style={[styles.libelle, { color: tok.textMuted }]} numberOfLines={1}>
          {t.partager}
        </Text>
      )}

      {installes.includes('whatsapp') && (
        <TouchableOpacity
          style={[styles.bouton, { flexDirection: rowDir(isRTL), backgroundColor: '#25D366' }]}
          onPress={() => lancer('whatsapp')}
          accessibilityRole="button"
          accessibilityLabel={`${t.partager} — ${t.whatsapp}`}
          activeOpacity={0.85}
        >
          {/* Aucun logo de marque : lucide les a d'ailleurs tous retirés de cette
              version, et reproduire une marque déposée dans une app qu'on publie
              serait un risque inutile. Le mot et la couleur suffisent. */}
          <MessageCircle size={16} color="#fff" />
          <Text style={styles.boutonTexte}>{t.whatsapp}</Text>
        </TouchableOpacity>
      )}

      {installes.includes('facebook') && lien && (
        <TouchableOpacity
          style={[styles.bouton, { flexDirection: rowDir(isRTL), backgroundColor: '#1877F2' }]}
          onPress={() => lancer('facebook')}
          accessibilityRole="button"
          accessibilityLabel={`${t.partager} — Facebook`}
          activeOpacity={0.85}
        >
          <Globe size={16} color="#fff" />
          <Text style={styles.boutonTexte}>Facebook</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={[styles.bouton, { flexDirection: rowDir(isRTL), backgroundColor: tok.surfaceSunken }]}
        onPress={() => lancer()}
        accessibilityRole="button"
        accessibilityLabel={`${t.partager} — ${t.autre}`}
        activeOpacity={0.85}
      >
        <Share2 size={16} color={tok.text} />
        {!compact && <Text style={[styles.boutonTexte, { color: tok.text }]}>{t.autre}</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  rangee: { alignItems: 'center', gap: 8, marginTop: 12 },
  libelle: { fontSize: 13, fontWeight: '700', flex: 1 },
  bouton: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  boutonTexte: { fontSize: 13, fontWeight: '800', color: '#fff' },
});
