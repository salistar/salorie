// Canal vocal de la marche à deux (WebRTC).
// ---------------------------------------------------------------------------
// `react-native-webrtc` est un module NATIF : il ne s'installe pas à chaud et
// alourdit l'APK. Il est donc chargé PARESSEUSEMENT, et toute cette couche se
// comporte proprement en son absence — `voixDisponible()` rend false, l'écran de
// marche à deux masque simplement le bouton micro et continue de partager les
// positions, qui sont l'essentiel.
//
// Ce choix est délibéré : ajouter un module natif non testé juste avant une
// soumission au Play Store est un risque qui ne se voit qu'après le refus. Le jour
// où le module est installé, la voix s'allume sans changer une ligne ici.
//
// Le serveur ne voit JAMAIS l'audio : il relaie seulement offres, réponses et
// candidats ICE. Le flux va de pair à pair, ou passe par le relais TURN — qui est
// chiffré et ignore ce qu'il transporte.
import { envoyerSignalWebrtc, serveursIce, socketSocial } from './socialSocket';

type ModuleWebrtc = any;
let mod: ModuleWebrtc | null | undefined;

/** Charge le module natif une seule fois. `null` s'il n'est pas installé. */
function charger(): ModuleWebrtc | null {
  if (mod !== undefined) return mod;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    mod = require('react-native-webrtc');
  } catch {
    mod = null;
  }
  return mod;
}

export function voixDisponible(): boolean {
  return charger() !== null;
}

export type SessionVoix = {
  raccrocher: () => Promise<void>;
  couperMicro: (coupe: boolean) => void;
  /** Coupe la caméra sans raccrocher. Sans vidéo, ne fait rien. */
  couperCamera: (coupe: boolean) => void;
  /** Bascule entre l'objectif avant et arrière. Sans vidéo, ne fait rien. */
  basculerCamera: () => void;
  relaisDisponible: boolean;
  /** Le flux à afficher dans un `<RTCView>` local. Nul en audio seul. */
  fluxLocal: any | null;
  /** Le flux de l'autre. Arrive APRÈS la connexion, d'où le rappel ci-dessous. */
  surFluxDistant: (rappel: (flux: any) => void) => void;
};

/**
 * Ouvre le canal avec l'autre marcheur — voix seule, ou voix et image.
 *
 * `initiateur` : celui qui a lancé l'invitation émet l'offre ; l'autre y répond.
 * Sans cette distinction, les deux émettraient une offre en même temps et la
 * négociation ne convergerait jamais.
 *
 * ## Pourquoi la vidéo est une OPTION et non le défaut
 *
 * Un appel vidéo consomme dix à vingt fois plus de données qu'un appel audio.
 * Pendant une marche à deux, sur un forfait marocain, ce n'est pas un détail :
 * une heure de vidéo peut vider un forfait mensuel. La voix reste donc le mode
 * normal, et l'image se demande.
 *
 * ## Pourquoi le flux distant passe par un rappel
 *
 * Il n'existe pas au moment où cette fonction rend la main : il arrive quand la
 * négociation aboutit, une à plusieurs secondes plus tard. Le renvoyer
 * directement obligerait l'appelant à interroger en boucle un champ qui reste
 * nul — le rappel dit exactement quand l'image est là.
 */
export async function ouvrirVoix(
  duoId: string,
  initiateur: boolean,
  options?: { video?: boolean },
): Promise<SessionVoix | null> {
  const W = charger();
  const socket = socketSocial();
  if (!W || !socket) return null;

  const avecVideo = Boolean(options?.video);
  const { iceServers, relaisDisponible } = await serveursIce();
  const pc = new W.RTCPeerConnection({ iceServers });

  const flux = await W.mediaDevices.getUserMedia({
    audio: true,
    // `facingMode: 'user'` : on se filme soi, pas le paysage. C'est ce qu'on
    // attend d'un appel, et ça évite d'ouvrir l'objectif arrière par surprise.
    video: avecVideo ? { facingMode: 'user' } : false,
  });
  flux.getTracks().forEach((t: any) => pc.addTrack(t, flux));

  // Le flux de l'autre. `ontrack` est appelé une fois par piste — audio puis
  // vidéo — mais toutes appartiennent au même flux, d'où le garde.
  let fluxDistant: any = null;
  let rappelDistant: ((f: any) => void) | null = null;
  pc.ontrack = (e: any) => {
    const f = e?.streams?.[0];
    if (!f || f === fluxDistant) return;
    fluxDistant = f;
    rappelDistant?.(f);
  };

  pc.onicecandidate = (e: any) => {
    if (e.candidate) envoyerSignalWebrtc(duoId, 'ice', e.candidate);
  };

  const surSignal = async (m: any) => {
    try {
      if (m?.type === 'offer') {
        await pc.setRemoteDescription(new W.RTCSessionDescription(m.data));
        const rep = await pc.createAnswer();
        await pc.setLocalDescription(rep);
        envoyerSignalWebrtc(duoId, 'answer', rep);
      } else if (m?.type === 'answer') {
        await pc.setRemoteDescription(new W.RTCSessionDescription(m.data));
      } else if (m?.type === 'ice') {
        await pc.addIceCandidate(new W.RTCIceCandidate(m.data));
      }
    } catch {
      /* un candidat tardif ou en double n'a pas à interrompre l'appel */
    }
  };
  socket.on('webrtc:signal', surSignal);

  if (initiateur) {
    const offre = await pc.createOffer({});
    await pc.setLocalDescription(offre);
    envoyerSignalWebrtc(duoId, 'offer', offre);
  }

  return {
    relaisDisponible,
    fluxLocal: avecVideo ? flux : null,
    surFluxDistant: (rappel) => {
      rappelDistant = rappel;
      // Si le flux est DÉJÀ arrivé avant qu'on s'abonne, on le sert tout de
      // suite : sinon l'image de l'autre ne s'afficherait jamais, et le défaut
      // ne se verrait que sur une connexion rapide.
      if (fluxDistant) rappel(fluxDistant);
    },
    couperMicro: (coupe: boolean) => flux.getAudioTracks().forEach((t: any) => (t.enabled = !coupe)),
    couperCamera: (coupe: boolean) => flux.getVideoTracks().forEach((t: any) => (t.enabled = !coupe)),
    basculerCamera: () => {
      // `_switchCamera` est propre à react-native-webrtc : il change d'objectif
      // sans renégocier la session, donc sans coupure d'image.
      flux.getVideoTracks().forEach((t: any) => t._switchCamera?.());
    },
    raccrocher: async () => {
      socket.off('webrtc:signal', surSignal);
      rappelDistant = null;
      try {
        // Arrêter les pistes AVANT de fermer la connexion : sinon la diode de la
        // caméra peut rester allumée après l'appel, ce qui inquiète à juste titre.
        flux.getTracks().forEach((t: any) => t.stop());
        pc.close();
      } catch {
        /* déjà fermé */
      }
    },
  };
}
