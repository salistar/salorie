'use client';
// Appel audio/vidéo depuis le navigateur — miroir de `lib/duoVoix.ts` du mobile.
// ---------------------------------------------------------------------------
// Le protocole est repris À L'IDENTIQUE : mêmes événements (`webrtc:signal`
// avec `offer` / `answer` / `ice`), même salon `duo:<id>`, mêmes serveurs ICE
// obtenus de `/social/turn-credentials`. C'est ce qui permet à un navigateur
// d'appeler un TÉLÉPHONE : s'en écarter d'un seul nom d'événement, et les deux
// ne se joindraient jamais.
//
// Ce que le navigateur simplifie : `RTCPeerConnection`, `getUserMedia` et les
// descriptions de session sont NATIFS — pas de module à charger comme
// `react-native-webrtc`. Ce qu'il complique : il n'a pas de `_switchCamera`,
// changer d'objectif y demande de renégocier la piste (fait plus bas).
//
// Le serveur ne voit JAMAIS l'audio ni l'image : il ne relaie que la
// signalisation. Le média va de pair à pair, ou passe par le relais TURN qui
// est chiffré et ignore ce qu'il transporte.
import { firebaseAuth } from './firebaseClient';
import { socketSocial, envoyerSignalWebrtc } from './socketSocial';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || '').trim().replace(/\/$/, '');

export interface SessionAppel {
  /** false = STUN seul : derrière un NAT d'opérateur, l'appel peut échouer. */
  relaisDisponible: boolean;
  fluxLocal: MediaStream | null;
  surFluxDistant: (rappel: (f: MediaStream) => void) => void;
  surEtat: (rappel: (etat: RTCPeerConnectionState) => void) => void;
  couperMicro: (coupe: boolean) => void;
  couperCamera: (coupe: boolean) => void;
  basculerCamera: () => Promise<void>;
  raccrocher: () => void;
}

/**
 * Serveurs ICE fournis par le backend. Même contrat que le mobile, y compris
 * le repli : le STUN public de Google ne relaie rien et ne voit aucune donnée,
 * il répond seulement « voici l'adresse d'où tu m'écris ».
 */
export async function serveursIce(): Promise<{ iceServers: RTCIceServer[]; relaisDisponible: boolean }> {
  const jeton = await firebaseAuth().currentUser?.getIdToken().catch(() => null);
  if (!API_URL || !jeton) return { iceServers: [], relaisDisponible: false };
  try {
    const r = await fetch(`${API_URL}/social/turn-credentials`, {
      headers: { Authorization: `Bearer ${jeton}` },
    });
    if (!r.ok) throw new Error(String(r.status));
    return await r.json();
  } catch {
    return { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }], relaisDisponible: false };
  }
}

/** Le navigateur sait-il faire un appel ? (HTTPS exigé pour getUserMedia.) */
export function appelDisponible(): boolean {
  return typeof window !== 'undefined'
    && typeof RTCPeerConnection !== 'undefined'
    && Boolean(navigator.mediaDevices?.getUserMedia);
}

/**
 * Ouvre un appel dans le duo `duoId`.
 *
 * `initiateur` : celui qui a créé le duo émet l'offre. L'invité attend —
 * si les deux émettaient, chacun répondrait à l'offre de l'autre et la
 * négociation partirait en boucle (« glare »).
 *
 * La voix reste le mode NORMAL et l'image se demande : un appel vidéo consomme
 * dix à vingt fois plus de données, ce qui n'est pas un détail sur un forfait
 * mobile — et l'autre bout de cet appel est souvent un téléphone.
 */
export async function ouvrirAppel(
  duoId: string,
  initiateur: boolean,
  options?: { video?: boolean },
): Promise<SessionAppel | null> {
  const socket = socketSocial();
  if (!socket || !appelDisponible()) return null;

  const avecVideo = Boolean(options?.video);
  const { iceServers, relaisDisponible } = await serveursIce();
  const pc = new RTCPeerConnection({ iceServers });

  const flux = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: avecVideo ? { facingMode: 'user' } : false,
  });
  flux.getTracks().forEach((t) => pc.addTrack(t, flux));

  // `ontrack` est appelé une fois PAR PISTE — audio puis vidéo — mais toutes
  // appartiennent au même flux, d'où le garde.
  let fluxDistant: MediaStream | null = null;
  let rappelDistant: ((f: MediaStream) => void) | null = null;
  pc.ontrack = (e) => {
    const f = e.streams?.[0];
    if (!f || f === fluxDistant) return;
    fluxDistant = f;
    rappelDistant?.(f);
  };

  let rappelEtat: ((etat: RTCPeerConnectionState) => void) | null = null;
  pc.onconnectionstatechange = () => rappelEtat?.(pc.connectionState);
  pc.onicecandidate = (e) => {
    if (e.candidate) envoyerSignalWebrtc(duoId, 'ice', e.candidate.toJSON());
  };

  const surSignal = async (m: any) => {
    try {
      if (m?.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(m.data));
        const rep = await pc.createAnswer();
        await pc.setLocalDescription(rep);
        envoyerSignalWebrtc(duoId, 'answer', rep);
      } else if (m?.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(m.data));
      } else if (m?.type === 'ice') {
        await pc.addIceCandidate(new RTCIceCandidate(m.data));
      }
    } catch {
      /* un candidat tardif ou en double n'a pas à interrompre l'appel */
    }
  };
  socket.on('webrtc:signal', surSignal);

  if (initiateur) {
    const offre = await pc.createOffer();
    await pc.setLocalDescription(offre);
    envoyerSignalWebrtc(duoId, 'offer', offre);
  }

  let deFace = true;

  return {
    relaisDisponible,
    fluxLocal: avecVideo ? flux : null,
    surFluxDistant: (rappel) => {
      rappelDistant = rappel;
      // Si le flux est DÉJÀ arrivé avant l'abonnement, on le sert tout de
      // suite : sinon l'image de l'autre ne s'afficherait jamais, et le défaut
      // ne se verrait que sur une connexion rapide.
      if (fluxDistant) rappel(fluxDistant);
    },
    surEtat: (rappel) => {
      rappelEtat = rappel;
      rappel(pc.connectionState);
    },
    couperMicro: (coupe) => flux.getAudioTracks().forEach((t) => (t.enabled = !coupe)),
    couperCamera: (coupe) => flux.getVideoTracks().forEach((t) => (t.enabled = !coupe)),
    basculerCamera: async () => {
      // Le navigateur n'a pas de `_switchCamera` : on ouvre une nouvelle piste
      // sur l'autre objectif et on la SUBSTITUE via `replaceTrack`, ce qui
      // évite une renégociation complète — donc sans coupure d'image.
      const ancienne = flux.getVideoTracks()[0];
      if (!ancienne) return;
      try {
        const neuf = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: deFace ? 'environment' : 'user' },
        });
        const piste = neuf.getVideoTracks()[0];
        const emetteur = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (emetteur && piste) {
          await emetteur.replaceTrack(piste);
          flux.removeTrack(ancienne);
          ancienne.stop();
          flux.addTrack(piste);
          deFace = !deFace;
        }
      } catch {
        /* un seul objectif, ou refus : on garde celui en cours */
      }
    },
    raccrocher: () => {
      socket.off('webrtc:signal', surSignal);
      rappelDistant = null;
      rappelEtat = null;
      try {
        // Arrêter les pistes AVANT de fermer la connexion : sinon le voyant de
        // la caméra peut rester allumé après l'appel, ce qui inquiète à juste
        // titre.
        flux.getTracks().forEach((t) => t.stop());
        pc.close();
      } catch {
        /* déjà fermé */
      }
    },
  };
}
