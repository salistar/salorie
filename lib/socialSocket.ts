// Client temps réel de l'espace social (namespace /social du backend).
// ---------------------------------------------------------------------------
// Une SEULE connexion pour tout le social : présence, chat de course et marche à
// deux. Ouvrir un socket par écran multiplierait les handshakes et les
// vérifications de jeton pour rien.
//
// Le jeton Firebase est passé au handshake. À la reconnexion, socket.io réutilise
// l'objet `auth` d'origine — or un jeton Firebase expire au bout d'une heure. On le
// rafraîchit donc AVANT chaque tentative, sinon une coupure de réseau d'une heure
// se solderait par une reconnexion refusée et un écran muet.
import { io, Socket } from 'socket.io-client';
import { auth } from './firebaseAuth';

const API_URL = (process.env.EXPO_PUBLIC_API_URL || '').trim();

let socket: Socket | null = null;

export type MessageCourse = {
  id: string;
  raceId: string;
  auteur: string;
  name: string;
  text: string;
  /** Photo jointe, en base64. Vide quand le message est purement textuel. */
  image?: string;
  imageType?: string;
  ts: number;
};

export type PositionDuo = { auteur: string; lat: number; lng: number; km: number; ts: number };

export type Presence = { id: string; name: string; depuis: number };

/** Connexion (idempotente). Rend `null` si l'API n'est pas configurée ou sans session. */
export async function connecterSocial(): Promise<Socket | null> {
  if (!API_URL) return null;
  if (socket?.connected) return socket;
  const jeton = await auth.currentUser?.getIdToken().catch(() => null);
  if (!jeton) return null;

  socket = io(`${API_URL}/social`, {
    transports: ['websocket'],
    auth: { token: jeton },
    forceNew: true,
    reconnection: true,
  });

  // Rafraîchissement du jeton à chaque tentative de reconnexion : sans cela, une
  // coupure dépassant l'heure de validité rendrait la reconnexion impossible et
  // l'écran resterait silencieux sans que rien ne le signale.
  socket.io.on('reconnect_attempt', async () => {
    const frais = await auth.currentUser?.getIdToken(true).catch(() => null);
    if (frais && socket) (socket.auth as any) = { token: frais };
  });

  return socket;
}

export function socketSocial(): Socket | null {
  return socket;
}

export function deconnecterSocial(): void {
  try {
    socket?.disconnect();
  } catch {
    /* déjà fermé */
  }
  socket = null;
}

// ── Chat de course ──────────────────────────────────────────────────────────
export function rejoindreCourse(raceId: string, langue = 'fr'): void {
  socket?.emit('race:join', { raceId, langue });
}
export function quitterCourse(raceId: string): void {
  socket?.emit('race:leave', { raceId });
}
export function envoyerMessage(
  raceId: string,
  text: string,
  photo?: { base64: string; type: string } | null,
): void {
  // La photo voyage DANS le message : c'est ce qui la rend signalable et purgée
  // par le meme TTL de 30 jours que la conversation qu'elle illustre. Posee
  // ailleurs, elle survivrait au fil et il faudrait un cron pour la rattraper.
  socket?.emit('race:msg', photo ? { raceId, text, image: photo.base64, imageType: photo.type } : { raceId, text });
}
export function signalerMessage(messageId: string): void {
  socket?.emit('race:signaler', { messageId });
}

// ── Marche à deux ───────────────────────────────────────────────────────────
export function rejoindreDuo(duoId: string): void {
  socket?.emit('duo:join', { duoId });
}
export function quitterDuo(duoId: string): void {
  socket?.emit('duo:leave', { duoId });
}
export function envoyerPosition(duoId: string, lat: number, lng: number, km: number): void {
  socket?.emit('duo:pos', { duoId, lat, lng, km });
}
export function envoyerSignalWebrtc(duoId: string, type: 'offer' | 'answer' | 'ice', data: unknown): void {
  socket?.emit('webrtc:signal', { duoId, type, data });
}

/**
 * Serveurs ICE (STUN + TURN éphémère) fournis par le backend.
 * `relaisDisponible: false` = seul le STUN est offert ; l'appel peut alors échouer
 * derrière un NAT d'opérateur, et l'écran doit le dire plutôt que tourner dans le vide.
 */
export async function serveursIce(): Promise<{ iceServers: any[]; relaisDisponible: boolean }> {
  const jeton = await auth.currentUser?.getIdToken().catch(() => null);
  if (!API_URL || !jeton) return { iceServers: [], relaisDisponible: false };
  try {
    const r = await fetch(`${API_URL}/social/turn-credentials`, {
      headers: { Authorization: `Bearer ${jeton}` },
    });
    if (!r.ok) throw new Error(String(r.status));
    return await r.json();
  } catch {
    // Repli : le STUN public permet au moins les réseaux simples.
    return { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }], relaisDisponible: false };
  }
}
