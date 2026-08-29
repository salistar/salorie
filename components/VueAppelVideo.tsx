import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SwitchCamera, VideoOff, Video as VideoIcon } from 'lucide-react-native';
import { useTokens } from '../constants/tokens';
import { useTranslation } from '../lib/i18n';

/**
 * Les deux images d'un appel vidéo, et de quoi les piloter.
 *
 * ## Pourquoi ce composant existe séparément
 *
 * `RTCView` vient de `react-native-webrtc`, un module natif optionnel. L'importer
 * en haut d'un écran ferait planter cet écran sur toute build où le module est
 * absent — or l'app a vécu des mois sans lui, et une build peut le perdre.
 * On le charge donc paresseusement, comme `lib/duoVoix.ts` le fait déjà pour le
 * reste, et ce composant ne rend rien du tout si le module manque.
 *
 * ## La disposition
 *
 * L'autre en grand, soi en petit dans un coin. C'est la convention de tous les
 * appels vidéo, et ce n'est pas arbitraire : on regarde son interlocuteur, on
 * jette un œil à sa propre image pour vérifier qu'on est bien cadré.
 *
 * Tant que l'autre n'a pas répondu, sa place affiche un mot d'attente plutôt
 * qu'un rectangle noir — un noir muet se lit comme une panne.
 */

const TXT: Record<string, Record<string, string>> = {
  fr: {
    attente: 'En attente de ton binôme…',
    basculer: 'Changer de caméra',
    couper: 'Couper la caméra',
    reprendre: 'Réactiver la caméra',
    moi: 'Toi',
  },
  en: {
    attente: 'Waiting for your partner…',
    basculer: 'Switch camera',
    couper: 'Turn camera off',
    reprendre: 'Turn camera on',
    moi: 'You',
  },
  ar: {
    attente: 'في انتظار شريكك…',
    basculer: 'تبديل الكاميرا',
    couper: 'إيقاف الكاميرا',
    reprendre: 'تشغيل الكاميرا',
    moi: 'أنت',
  },
};

/** Charge `RTCView` une seule fois. `null` si le module natif n'est pas là. */
let vueCache: any;
function chargerVue(): any {
  if (vueCache !== undefined) return vueCache;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    vueCache = require('react-native-webrtc').RTCView || null;
  } catch {
    vueCache = null;
  }
  return vueCache;
}

export default function VueAppelVideo({
  fluxLocal,
  fluxDistant,
  cameraCoupee,
  onCouperCamera,
  onBasculerCamera,
}: {
  fluxLocal: any | null;
  fluxDistant: any | null;
  cameraCoupee: boolean;
  onCouperCamera: () => void;
  onBasculerCamera: () => void;
}) {
  const k = useTokens();
  const tok = useTokens();
  const { language } = useTranslation() as any;
  const t = TXT[language] || TXT.fr;
  const RTCView = chargerVue();

  // Pas de module, ou appel purement audio : rien à montrer.
  if (!RTCView || !fluxLocal) return null;

  return (
    <View style={styles.cadre}>
      {/* L'autre, en grand. */}
      {fluxDistant ? (
        <RTCView streamURL={fluxDistant.toURL()} style={styles.distant} objectFit="cover" />
      ) : (
        <View style={[styles.distant, styles.attente, { backgroundColor: tok.surfaceSunken }]}>
          <Text style={[styles.attenteTxt, { color: tok.textMuted }]} numberOfLines={2}>
            {t.attente}
          </Text>
        </View>
      )}

      {/* Soi, en petit. `mirror` : on se voit comme dans une glace, sinon on
          lève la main droite et l'image lève la gauche. */}
      {!cameraCoupee ? (
        <RTCView streamURL={fluxLocal.toURL()} style={styles.local} objectFit="cover" mirror zOrder={1} />
      ) : (
        <View style={[styles.local, styles.attente, { backgroundColor: tok.surfaceSunken }]}>
          <VideoOff size={18} color={tok.textFaint} />
        </View>
      )}

      <View style={styles.commandes}>
        <TouchableOpacity
          style={[styles.rond, { backgroundColor: tok.scrim }]}
          onPress={onBasculerCamera}
          accessibilityRole="button"
          accessibilityLabel={t.basculer}
        >
          <SwitchCamera size={20} color={k.onAccent} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.rond, { backgroundColor: cameraCoupee ? tok.danger : tok.scrim }]}
          onPress={onCouperCamera}
          accessibilityRole="button"
          accessibilityLabel={cameraCoupee ? t.reprendre : t.couper}
        >
          {cameraCoupee ? <VideoOff size={20} color={k.onAccent} /> : <VideoIcon size={20} color={k.onAccent} />}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cadre: { marginTop: 12, borderRadius: 16, overflow: 'hidden', aspectRatio: 3 / 4 },
  distant: { width: '100%', height: '100%', backgroundColor: '#000' },
  local: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    width: 92,
    height: 122,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  attente: { alignItems: 'center', justifyContent: 'center', padding: 12 },
  attenteTxt: { fontSize: 13.5, fontWeight: '700', textAlign: 'center' },
  commandes: { position: 'absolute', left: 10, bottom: 10, flexDirection: 'row', gap: 8 },
  rond: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
