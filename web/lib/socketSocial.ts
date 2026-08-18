'use client';
// Connexion temps réel au namespace /social — version navigateur.
// ---------------------------------------------------------------------------
// Reprend le protocole de `lib/socialSocket.ts` du mobile, événement par
// événement. Ce n'est pas un import : le fichier mobile dépend du SDK Firebase
// natif pour le jeton. Ce qui compte est que les NOMS D'ÉVÉNEMENTS soient
// identiques — un `race:msg` renommé ici et le web parlerait dans le vide, sans
// erreur nulle part.
//
// Le jeton est un ID token Firebase, le même que le mobile envoie. Le backend
// n'a donc rien à distinguer entre les deux clients.
import { io, type Socket } from 'socket.io-client';
import { firebaseAuth } from './firebaseClient';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || '').trim().replace(/\/$/, '');

export type MessageCourse = {
  id: string;
  auteur: string;
  auteurNom?: string;
  text?: string;
  image?: string;
  imageType?: string;
  ts: number;
};

let socket: Socket | null = null;

/** Connexion idempotente. `null` si l'API n'est pas configurée ou sans session. */
export async function connecterSocial(): Promise<Socket | null> {
  if (!API_URL) return null;
  if (socket?.connected) return socket;

  const jeton = await firebaseAuth().currentUser?.getIdToken().catch(() => null);
  if (!jeton) return null;

  socket = io(`${API_URL}/social`, {
    transports: ['websocket'],
    auth: { token: jeton },
    forceNew: true,
    reconnection: true,
  });

  // Rafraîchissement du jeton à chaque tentative de reconnexion. Sans cela, une
  // coupure dépassant l'heure de validité rendrait la reconnexion impossible et
  // la page resterait silencieuse sans que rien ne le signale — exactement le
  // piège que le mobile a déjà refermé.
  socket.io.on('reconnect_attempt', async () => {
    const frais = await firebaseAuth().currentUser?.getIdToken(true).catch(() => null);
    if (frais && socket) (socket.auth as any) = { token: frais };
  });

  return socket;
}

export function socketSocial(): Socket | null {
  return socket;
}

/** Ferme la connexion. À appeler en quittant la page : une WebSocket laissée
 *  ouverte continue de recevoir les messages d'un salon qu'on a quitté. */
export function deconnecterSocial(): void {
  socket?.disconnect();
  socket = null;
}

export function rejoindreCourse(raceId: string, langue = 'fr'): void {
  socket?.emit('race:join', { raceId, langue });
}

export function quitterCourse(raceId: string): void {
  socket?.emit('race:leave', { raceId });
}

export function envoyerMessage(raceId: string, text: string): void {
  socket?.emit('race:msg', { raceId, text });
}

export function signalerMessage(messageId: string): void {
  socket?.emit('race:signaler', { messageId });
}

export const socialConfigure = () => Boolean(API_URL);
