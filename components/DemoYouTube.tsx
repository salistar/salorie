import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Linking } from 'react-native';
import { WebView } from 'react-native-webview';
import { Play, ExternalLink } from 'lucide-react-native';
import { useTokens } from '../constants/tokens';
import { useTranslation } from '../lib/i18n';
import { urlLecteur, urlRecherche } from '../lib/demoYouTube';
import { rowDir } from '../lib/rtl';

/**
 * La démo YouTube d'un exercice, quand il n'a pas de vidéo maison.
 *
 * ## Pourquoi une affiche avant le lecteur
 *
 * Le lecteur ne se charge qu'au premier appui. Une WebView montée d'entrée
 * télécharge le lecteur de YouTube et une image d'aperçu — sur la 4G marocaine,
 * pour une vidéo que la plupart ne regarderont pas. Elle contacterait aussi
 * YouTube dès l'ouverture de la fiche, ce qui est exactement ce qu'on veut
 * éviter dans une app de santé.
 *
 * ## Pourquoi la recherche est toujours offerte
 *
 * Tant qu'aucun identifiant n'a été relevé pour cet exercice, le bouton ouvre une
 * recherche YouTube. Ça marche pour TOUT exercice, y compris ceux qu'on ajoutera
 * demain, et ça évite d'attendre une table remplie pour que la fonction serve.
 */

const TXT: Record<string, Record<string, string>> = {
  fr: {
    titre: 'Voir la technique',
    sous: 'Démonstration vidéo sur YouTube',
    lancer: 'Lancer la vidéo',
    chercher: 'Chercher sur YouTube',
    horsApp: 'Ouvre YouTube',
  },
  en: {
    titre: 'See the form',
    sous: 'Video demonstration on YouTube',
    lancer: 'Play video',
    chercher: 'Search on YouTube',
    horsApp: 'Opens YouTube',
  },
  ar: {
    titre: 'شاهد الطريقة الصحيحة',
    sous: 'عرض بالفيديو على يوتيوب',
    lancer: 'تشغيل الفيديو',
    chercher: 'ابحث في يوتيوب',
    horsApp: 'يفتح يوتيوب',
  },
};

export default function DemoYouTube({
  exerciceId,
  libelle,
}: {
  exerciceId: string;
  /** Le nom TRADUIT de l'exercice — c'est lui qu'on cherche, pas l'identifiant. */
  libelle: string;
}) {
  const k = useTokens();
  const tok = useTokens();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.fr;
  const [joue, setJoue] = useState(false);
  const lecteur = urlLecteur(exerciceId);

  // Aucun identifiant relevé : on envoie vers une recherche. Toujours utile,
  // jamais un cadre vide.
  if (!lecteur) {
    return (
      <TouchableOpacity
        style={[styles.carte, { backgroundColor: tok.surfaceSunken, flexDirection: rowDir(isRTL) }]}
        onPress={() => Linking.openURL(urlRecherche(libelle, language)).catch(() => {})}
        accessibilityRole="button"
        accessibilityLabel={`${t.chercher} — ${libelle}`}
        activeOpacity={0.85}
      >
        <View style={[styles.pastille, { backgroundColor: tok.accentSoft }]}>
          <ExternalLink size={18} color={tok.accent} />
        </View>
        <View style={styles.textes}>
          <Text style={[styles.titre, { color: tok.text }]} numberOfLines={1}>
            {t.chercher}
          </Text>
          <Text style={[styles.sous, { color: tok.textMuted }]} numberOfLines={1}>
            {t.horsApp}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  if (!joue) {
    return (
      <TouchableOpacity
        style={[styles.carte, { backgroundColor: tok.surfaceSunken, flexDirection: rowDir(isRTL) }]}
        onPress={() => setJoue(true)}
        accessibilityRole="button"
        accessibilityLabel={`${t.lancer} — ${libelle}`}
        activeOpacity={0.85}
      >
        <View style={[styles.pastille, { backgroundColor: tok.accentSoft }]}>
          <Play size={18} color={tok.accent} fill={tok.accent} />
        </View>
        <View style={styles.textes}>
          <Text style={[styles.titre, { color: tok.text }]} numberOfLines={1}>
            {t.titre}
          </Text>
          <Text style={[styles.sous, { color: tok.textMuted }]} numberOfLines={1}>
            {t.sous}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.cadre, { backgroundColor: '#000' }]}>
      <WebView
        source={{ uri: lecteur }}
        style={styles.web}
        // Le lecteur de YouTube a besoin du plein écran natif quand on l'y envoie,
        // et de pouvoir démarrer sans un second geste puisqu'on vient d'en faire un.
        allowsFullscreenVideo
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        // Rien d'autre que YouTube ne doit s'ouvrir ici : une redirection vers un
        // domaine tiers partirait dans le navigateur, hors de l'app.
        onShouldStartLoadWithRequest={(r) => /(^|\.)youtube(-nocookie)?\.com/.test(String(r.url).replace(/^https?:\/\//, '').split('/')[0])}
        renderLoading={() => <ActivityIndicator style={styles.chargement} color={k.onAccent} />}
        startInLoadingState
      />
    </View>
  );
}

const styles = StyleSheet.create({
  carte: { alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, marginTop: 12 },
  pastille: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  textes: { flex: 1 },
  titre: { fontSize: 14.5, fontWeight: '800' },
  sous: { fontSize: 12.5, fontWeight: '600', marginTop: 1 },
  cadre: { marginTop: 12, borderRadius: 14, overflow: 'hidden', aspectRatio: 16 / 9 },
  web: { flex: 1, backgroundColor: '#000' },
  chargement: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
});
