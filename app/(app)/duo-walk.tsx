// Marche à deux — deux personnes marchent ensemble, chacune chez elle.
// ---------------------------------------------------------------------------
// C'est la feature sociale que personne n'a sur ce marché : un fils à Casablanca et
// sa mère à Agadir marchent « ensemble », voient leurs kilomètres avancer côte à
// côte, et se parlent. La distance géographique cesse d'être un obstacle à
// l'habitude partagée.
//
// Deux couches, indépendantes par construction :
//   · la POSITION passe par le socket — c'est l'essentiel, et ça marche toujours ;
//   · la VOIX passe par WebRTC, dont le module natif est optionnel. Son absence
//     masque le bouton micro sans rien casser d'autre.
import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, Share } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Mic, MicOff, PhoneOff, Share2, Users, Video } from 'lucide-react-native';
import * as Location from 'expo-location';
import { useTokens } from '../../constants/tokens';
import { useTranslation } from '../../lib/i18n';
import { rowDir, txtAlign } from '../../lib/rtl';
import { haptique } from '../../lib/haptique';
import ScreenTopBar from '../../components/ScreenTopBar';
import {
  connecterSocial, rejoindreDuo, quitterDuo, envoyerPosition, socketSocial,
  type PositionDuo,
} from '../../lib/socialSocket';
import { voixDisponible, ouvrirVoix, type SessionVoix } from '../../lib/duoVoix';
import VueAppelVideo from '../../components/VueAppelVideo';

const T: Record<string, Record<string, string>> = {
  fr: {
    titre: 'Marche à deux', invite: 'Inviter un proche', enAttente: 'En attente de ton binôme…',
    connecte: 'Vous marchez ensemble', moi: 'Toi', autre: 'Ton binôme',
    parler: 'Parler', video: 'Appel vidéo', couper: 'Couper le micro', reprendre: 'Reprendre le micro', raccrocher: 'Raccrocher',
    sansRelais: 'Réseau limité : la voix peut ne pas passer.',
    sansVoix: 'La voix n’est pas disponible sur cette version.',
    permRefusee: 'Sans localisation, impossible de partager ta marche.',
    partage: 'Marche avec moi sur Salorie ! Rejoins-moi : ',
  },
  en: {
    titre: 'Walk together', invite: 'Invite someone', enAttente: 'Waiting for your partner…',
    connecte: 'You are walking together', moi: 'You', autre: 'Your partner',
    parler: 'Talk', video: 'Video call', couper: 'Mute', reprendre: 'Unmute', raccrocher: 'Hang up',
    sansRelais: 'Limited network: voice may not connect.',
    sansVoix: 'Voice is not available in this version.',
    permRefusee: 'Without location, your walk cannot be shared.',
    partage: 'Walk with me on Salorie! Join me: ',
  },
  ar: {
    titre: 'المشي معًا', invite: 'ادعُ شخصًا', enAttente: 'في انتظار شريكك…',
    connecte: 'أنتما تمشيان معًا', moi: 'أنت', autre: 'شريكك',
    parler: 'تحدّث', video: 'مكالمة فيديو', couper: 'كتم الصوت', reprendre: 'إلغاء الكتم', raccrocher: 'إنهاء',
    sansRelais: 'شبكة محدودة: قد لا يمر الصوت.',
    sansVoix: 'الصوت غير متاح في هذه النسخة.',
    permRefusee: 'بدون تحديد الموقع، لا يمكن مشاركة مشيك.',
    partage: 'امشِ معي على Salorie! انضم إليّ: ',
  },
};

/** Distance en mètres entre deux points (Haversine). */
function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export default function MarcheADeux() {
  const router = useRouter();
  const tok = useTokens();
  const { language, isRTL } = useTranslation();
  const t = T[String(language)] || T.fr;
  const params = useLocalSearchParams<{ duoId?: string }>();

  // L'invité arrive avec un duoId dans le lien ; l'hôte en crée un.
  const [duoId] = useState(() => String(params.duoId || `duo_${Date.now().toString(36)}`));
  const initiateur = !params.duoId;

  const [monKm, setMonKm] = useState(0);
  const [autre, setAutre] = useState<PositionDuo | null>(null);
  const [voix, setVoix] = useState<SessionVoix | null>(null);
  const [fluxDistant, setFluxDistant] = useState<any>(null);
  const [micCoupe, setMicCoupe] = useState(false);
  const [camCoupee, setCamCoupee] = useState(false);
  const [erreur, setErreur] = useState('');
  const derniere = useRef<{ lat: number; lng: number } | null>(null);
  const cumul = useRef(0);

  // ── Socket : position partagée ────────────────────────────────────────────
  useEffect(() => {
    let abonnement: Location.LocationSubscription | null = null;
    let vivant = true;

    (async () => {
      const s = await connecterSocial();
      if (!s || !vivant) return;
      rejoindreDuo(duoId);
      s.on('duo:pos', (p: PositionDuo) => vivant && setAutre(p));

      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setErreur(t.permRefusee);
        return;
      }
      // Une position toutes les 3 secondes ou tous les 10 mètres : assez fin pour
      // que la progression paraisse vivante, assez lâche pour ne pas vider la
      // batterie ni saturer le socket sur une heure de marche.
      abonnement = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 3000, distanceInterval: 10 },
        (pos) => {
          const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          if (derniere.current) cumul.current += metres(derniere.current, p);
          derniere.current = p;
          const km = cumul.current / 1000;
          setMonKm(km);
          envoyerPosition(duoId, p.lat, p.lng, km);
        },
      );
    })();

    return () => {
      vivant = false;
      abonnement?.remove();
      quitterDuo(duoId);
      socketSocial()?.off('duo:pos');
    };
  }, [duoId, t.permRefusee]);

  // Raccrocher proprement si l'écran est quitté pendant un appel : sans cela, le
  // micro resterait actif en arrière-plan.
  useEffect(() => () => { voix?.raccrocher(); }, [voix]);

  const basculerVoix = async (avecVideo = false) => {
    if (voix) {
      await voix.raccrocher();
      setVoix(null);
      setFluxDistant(null);
      setCamCoupee(false);
      return;
    }
    haptique.choix();
    const s = await ouvrirVoix(duoId, initiateur, { video: avecVideo });
    if (!s) {
      setErreur(t.sansVoix);
      return;
    }
    setVoix(s);
    // Le flux de l autre arrive APRES la negociation, pas maintenant.
    s.surFluxDistant(setFluxDistant);
    if (!s.relaisDisponible) setErreur(t.sansRelais);
  };

  const inviter = () => {
    haptique.appui();
    Share.share({ message: `${t.partage}https://salorie.com/duo/${duoId}` });
  };

  const s = styles(tok);
  return (
    <SafeAreaView style={[s.safe, { backgroundColor: tok.bg }]}>
      <ScreenTopBar showBack title={t.titre} showNotif={false} />
      <ScrollView contentContainerStyle={s.corps}>
        <View style={[s.carte, { flexDirection: rowDir(isRTL) }]}>
          <View style={s.colonne}>
            <Text style={[s.etiquette, { textAlign: txtAlign(isRTL) }]}>{t.moi}</Text>
            <Text style={s.valeur}>{monKm.toFixed(2)} km</Text>
          </View>
          <View style={s.separateur} />
          <View style={s.colonne}>
            <Text style={[s.etiquette, { textAlign: txtAlign(isRTL) }]}>{t.autre}</Text>
            <Text style={s.valeur}>{autre ? `${autre.km.toFixed(2)} km` : '—'}</Text>
          </View>
        </View>

        <View style={[s.statut, { backgroundColor: autre ? tok.successSoft : tok.surfaceSunken }]}>
          <Users size={18} color={autre ? tok.successInk : tok.textMuted} />
          <Text style={[s.statutTxt, { color: autre ? tok.successInk : tok.textMuted }]}>
            {autre ? t.connecte : t.enAttente}
          </Text>
        </View>

        {erreur ? <Text style={s.erreur}>{erreur}</Text> : null}

        <TouchableOpacity
          style={[s.bouton, { backgroundColor: tok.surface, borderColor: tok.border }]}
          onPress={inviter}
          accessibilityRole="button"
          accessibilityLabel={t.invite}
        >
          <Share2 size={20} color={tok.accent} />
          <Text style={[s.boutonTxt, { color: tok.text }]}>{t.invite}</Text>
        </TouchableOpacity>

        {/* Les deux images. Ne rend rien en appel audio, ni sans le module natif. */}
        {voix ? (
          <VueAppelVideo
            fluxLocal={voix.fluxLocal}
            fluxDistant={fluxDistant}
            cameraCoupee={camCoupee}
            onCouperCamera={() => {
              const n = !camCoupee;
              setCamCoupee(n);
              voix.couperCamera(n);
            }}
            onBasculerCamera={() => voix.basculerCamera()}
          />
        ) : null}

        {/* Le bouton vocal n'apparaît que si le module natif est présent : proposer
            un micro qui ne fonctionne pas serait pire que ne rien proposer. */}
        {voixDisponible() ? (
          <>
            {/* `() => basculerVoix(false)` et non `basculerVoix` tout court : React
                Native passe l'événement tactile en premier argument, qui serait
                pris pour « avec vidéo ». Le bouton « Parler » aurait ouvert un
                appel vidéo — attrapé par le typage, invisible à la lecture. */}
            <TouchableOpacity
              style={[s.bouton, { backgroundColor: voix ? tok.dangerSoft : tok.accentSoft, borderColor: voix ? tok.danger : tok.accent }]}
              onPress={() => basculerVoix(false)}
              accessibilityRole="button"
              accessibilityLabel={voix ? t.raccrocher : t.parler}
            >
              {voix ? <PhoneOff size={20} color={tok.dangerInk} /> : <Mic size={20} color={tok.accent} />}
              <Text style={[s.boutonTxt, { color: voix ? tok.dangerInk : tok.text }]}>
                {voix ? t.raccrocher : t.parler}
              </Text>
            </TouchableOpacity>

            {/* La video est un bouton SEPARE et non une option de l appel vocal :
                elle consomme dix a vingt fois plus de donnees, et sur un forfait
                marocain une heure de video peut le vider. Le choix se fait donc
                AVANT de decrocher, en connaissance de cause. */}
            {!voix ? (
              <TouchableOpacity
                style={[s.bouton, { backgroundColor: tok.surface, borderColor: tok.border }]}
                onPress={() => basculerVoix(true)}
                accessibilityRole="button"
                accessibilityLabel={t.video}
              >
                <Video size={20} color={tok.accent} />
                <Text style={[s.boutonTxt, { color: tok.text }]}>{t.video}</Text>
              </TouchableOpacity>
            ) : null}

            {voix ? (
              <TouchableOpacity
                style={[s.bouton, { backgroundColor: tok.surface, borderColor: tok.border }]}
                onPress={() => {
                  const n = !micCoupe;
                  setMicCoupe(n);
                  voix.couperMicro(n);
                }}
                accessibilityRole="button"
                accessibilityLabel={micCoupe ? t.reprendre : t.couper}
              >
                {micCoupe ? <MicOff size={20} color={tok.textMuted} /> : <Mic size={20} color={tok.accent} />}
                <Text style={[s.boutonTxt, { color: tok.text }]}>{micCoupe ? t.reprendre : t.couper}</Text>
              </TouchableOpacity>
            ) : null}
          </>
        ) : (
          <Text style={s.note}>{t.sansVoix}</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = (tok: any) =>
  StyleSheet.create({
    safe: { flex: 1 },
    corps: { padding: 20, gap: 14 },
    carte: {
      backgroundColor: tok.surface, borderRadius: 20, padding: 20,
      borderWidth: 1, borderColor: tok.border, alignItems: 'center',
    },
    colonne: { flex: 1, gap: 4 },
    separateur: { width: 1, height: 44, backgroundColor: tok.border },
    etiquette: { fontSize: 12, fontWeight: '700', color: tok.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
    valeur: { fontSize: 28, fontWeight: '900', color: tok.text, letterSpacing: -0.8 },
    statut: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 16 },
    statutTxt: { fontSize: 14, fontWeight: '700', flex: 1 },
    bouton: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
      paddingVertical: 16, borderRadius: 18, borderWidth: 1,
    },
    boutonTxt: { fontSize: 15, fontWeight: '800' },
    erreur: { fontSize: 13, color: tok.warningInk, backgroundColor: tok.warningSoft, padding: 12, borderRadius: 12 },
    note: { fontSize: 12.5, color: tok.textMuted, textAlign: 'center', marginTop: 4 },
  });
