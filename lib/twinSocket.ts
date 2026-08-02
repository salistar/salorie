// Client temps-réel (socket.io) pour le JUMEAU LIVE (« Live Twin »). Se connecte
// au backend (EXPO_PUBLIC_API_URL) avec le token Firebase, rejoint une room de
// jumeau (2 personnes max) et échange l'état de course en direct + des messages
// audio push-to-talk. Même modèle que lib/fastingSocket.ts.
// NB: nécessite le backend déployé (gateway twin).
import { io, Socket } from 'socket.io-client';
import { auth } from './firebaseAuth';

const API_URL = (process.env.EXPO_PUBLIC_API_URL || '').trim();
let socket: Socket | null = null;

// Un participant de la room (toi ou ton jumeau).
export type TwinMember = { uid: string; name: string; km: number; paceSec: number };
// État live envoyé/reçu (allure en secondes par km, distance en km).
export type TwinState = { km: number; paceSec: number };
// Message audio push-to-talk (base64 + métadonnées).
export type TwinAudio = { uid: string; name: string; audioB64: string; mime: string; durMs: number };

// Établit la connexion socket avec le token Firebase (no-op si non configuré).
export async function connectTwin(): Promise<Socket | null> {
  if (!API_URL) return null;
  if (socket?.connected) return socket;
  const token = await auth.currentUser?.getIdToken().catch(() => null);
  if (!token) return null;
  socket = io(API_URL, { transports: ['websocket'], auth: { token }, forceNew: true, reconnection: true });
  return socket;
}

// L'uid Firebase LOCAL (= email sanitisé) : c'est la clé sur laquelle le serveur estampille
// roster/state. À comparer pour distinguer "moi" du "jumeau" (PAS l'id Clerk, qui diffère).
export function getMyUid(): string {
  return auth.currentUser?.uid || '';
}

// Demande au serveur de CRÉER une session : il génère un code CSPRNG et répond 'twin:created'.
export function createTwin(name: string) {
  socket?.emit('twin:create', { name });
}

// S'abonne à la création de session (le serveur renvoie le code). Renvoie un désabonnement.
export function onCreated(cb: (room: string) => void): () => void {
  const h = (p: any) => cb(String(p?.room || ''));
  socket?.on('twin:created', h);
  return () => { socket?.off('twin:created', h); };
}

// Rejoint une room de jumeau (room = code court). Le serveur répond 'twin:full' si pleine.
export function joinTwin(room: string, name: string) {
  socket?.emit('twin:join', { room, name });
}

// Diffuse ton état de course (km / allure) aux membres de la room.
export function sendState(room: string, state: TwinState) {
  socket?.emit('twin:state', { room, ...state });
}

// Envoie un message audio push-to-talk (base64) à la room.
export function sendAudio(room: string, audioB64: string, mime: string, durMs: number) {
  socket?.emit('twin:audio', { room, audioB64, mime, durMs });
}

// S'abonne au roster (liste des membres). Renvoie un désabonnement.
// NB : le serveur émet { room, roster } (clé 'roster', pas 'members').
export function onRoster(cb: (members: TwinMember[]) => void): () => void {
  const h = (p: any) => cb(p?.roster || []);
  socket?.on('twin:roster', h);
  return () => { socket?.off('twin:roster', h); };
}

// S'abonne à l'état live d'un membre (ton jumeau). Renvoie un désabonnement.
export function onState(cb: (uid: string, state: TwinState) => void): () => void {
  const h = (p: any) => cb(p?.uid, { km: p?.km ?? 0, paceSec: p?.paceSec ?? 0 });
  socket?.on('twin:state', h);
  return () => { socket?.off('twin:state', h); };
}

// S'abonne aux messages audio entrants. Renvoie un désabonnement.
export function onAudio(cb: (msg: TwinAudio) => void): () => void {
  const h = (p: any) => { if (p?.audioB64) cb(p as TwinAudio); };
  socket?.on('twin:audio', h);
  return () => { socket?.off('twin:audio', h); };
}

// S'abonne à l'événement « room pleine ». Renvoie un désabonnement.
export function onFull(cb: () => void): () => void {
  const h = () => cb();
  socket?.on('twin:full', h);
  return () => { socket?.off('twin:full', h); };
}

// Quitte la room (sans fermer la connexion).
export function leaveTwin(room: string) {
  socket?.emit('twin:leave', { room });
}

// Ferme la connexion socket.
export function disconnect() { try { socket?.disconnect(); } catch {} socket = null; }

// Accès direct au socket (debug / cas avancés).
export function getTwinSocket() { return socket; }
