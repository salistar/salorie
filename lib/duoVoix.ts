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
  relaisDisponible: boolean;
};

/**
 * Ouvre le canal audio avec l'autre marcheur.
 * `initiateur` : celui qui a lancé l'invitation émet l'offre ; l'autre y répond.
 * Sans cette distinction, les deux émettraient une offre en même temps et la
 * négociation ne convergerait jamais.
 */
export async function ouvrirVoix(duoId: string, initiateur: boolean): Promise<SessionVoix | null> {
  const W = charger();
  const socket = socketSocial();
  if (!W || !socket) return null;

  const { iceServers, relaisDisponible } = await serveursIce();
  const pc = new W.RTCPeerConnection({ iceServers });

  const flux = await W.mediaDevices.getUserMedia({ audio: true, video: false });
  flux.getTracks().forEach((t: any) => pc.addTrack(t, flux));

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
    couperMicro: (coupe: boolean) => flux.getAudioTracks().forEach((t: any) => (t.enabled = !coupe)),
    raccrocher: async () => {
      socket.off('webrtc:signal', surSignal);
      try {
        flux.getTracks().forEach((t: any) => t.stop());
        pc.close();
      } catch {
        /* déjà fermé */
      }
    },
  };
}
