// Client temps-réel (socket.io) pour les DÉFIS DE JEÛNE. Se connecte au backend
// (EXPO_PUBLIC_API_URL) avec le token Firebase, rejoint une room de défi et
// échange l'état de jeûne en direct. NB: nécessite le backend déployé (gateway).
import { io, Socket } from 'socket.io-client';
import { auth } from './firebaseAuth';

const API_URL = (process.env.EXPO_PUBLIC_API_URL || '').trim();
let socket: Socket | null = null;

export type FastParticipant = { uid: string; name: string; startTs: number | null; targetHours: number; status: 'fasting' | 'idle' };

export async function connectFasting(): Promise<Socket | null> {
  if (!API_URL) return null;
  if (socket?.connected) return socket;
  const token = await auth.currentUser?.getIdToken().catch(() => null);
  if (!token) return null;
  socket = io(API_URL, { transports: ['websocket'], auth: { token }, forceNew: true, reconnection: true });
  return socket;
}
export function joinFasting(challengeId: string, name: string, targetHours: number) {
  socket?.emit('fasting:join', { challengeId, name, targetHours });
}
export function updateFasting(challengeId: string, startTs: number | null, status: 'fasting' | 'idle', targetHours: number) {
  socket?.emit('fasting:update', { challengeId, startTs, status, targetHours });
}
export function leaveFasting(challengeId: string) {
  socket?.emit('fasting:leave', { challengeId });
}
export function disconnectFasting() { try { socket?.disconnect(); } catch {} socket = null; }
export function getFastingSocket() { return socket; }
