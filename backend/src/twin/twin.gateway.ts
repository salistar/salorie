// Gateway temps-réel (WebSocket / socket.io) pour le "Live Twin" : talkie-walkie
// + état live partagé entre 2 personnes courant ensemble à distance.
// Chaque Twin = une room (max 2 uid différents). On relaie l'état (km/allure) et
// des messages audio courts (push-to-talk) sans RIEN stocker côté serveur.
// Auth : token Firebase passé dans handshake.auth.token (vérifié via admin SDK).
// SÉCU : le CODE de room est généré SERVEUR avec un CSPRNG (crypto) et rate-limité
// (anti brute-force du canal audio) ; l'audio n'est relayé qu'aux AUTRES de la room.
import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  OnGatewayConnection, OnGatewayDisconnect, MessageBody, ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as admin from 'firebase-admin';
import { FirebaseService } from '../firebase.service';

type Member = { uid: string; name: string };
type Limit = { joins: number[]; lastAudio: number };

// Alphabet sans caractères ambigus ; 32 divise 256 → tirage uniforme (pas de biais modulo).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function genCode(len = 8): string {
  const b = randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[b[i] % ALPHABET.length];
  return s;
}

@WebSocketGateway({ cors: { origin: '*' } })
export class TwinGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly log = new Logger('TwinGateway');
  // roomCode -> (socketId -> {uid,name})
  private rooms = new Map<string, Map<string, Member>>();
  // socketId -> compteurs de rate-limit (joins glissants 60s + dernier audio)
  private limits = new Map<string, Limit>();

  constructor(private readonly firebase: FirebaseService) {}

  async handleConnection(socket: Socket) {
    try {
      // Garantit que l'app Firebase par défaut est initialisée (init paresseuse de
      // FirebaseService) AVANT admin.auth() — sinon "default Firebase app does not exist".
      this.firebase.db();
      const token = (socket.handshake.auth as any)?.token || (socket.handshake.query as any)?.token;
      const decoded = await admin.auth().verifyIdToken(String(token));
      (socket.data as any).uid = decoded.uid || decoded.email || 'anon';
      this.log.log(`twin WS connect OK uid=${(socket.data as any).uid}`);
    } catch (e) {
      this.log.warn(`twin WS auth rejected: ${(e as any)?.message || e}`);
      socket.emit('twin:error', 'auth');
      socket.disconnect(true);
      return; // ne pas continuer sur un socket non authentifié
    }
  }

  handleDisconnect(socket: Socket) {
    this.limits.delete(socket.id);
    for (const [room, members] of this.rooms) {
      if (members.delete(socket.id)) {
        if (members.size === 0) this.rooms.delete(room);
        else this.broadcast(room);
      }
    }
  }

  // Rate-limit : max 20 join/create par minute par socket (anti brute-force du code).
  private allowJoin(socketId: string): boolean {
    const now = Date.now();
    const l = this.limits.get(socketId) || { joins: [], lastAudio: 0 };
    l.joins = l.joins.filter((t) => now - t < 60_000);
    const ok = l.joins.length < 20;
    if (ok) l.joins.push(now);
    this.limits.set(socketId, l);
    return ok;
  }

  // Rate-limit : 1 clip audio / 600 ms par socket (anti-flood/DoS).
  private allowAudio(socketId: string): boolean {
    const now = Date.now();
    const l = this.limits.get(socketId) || { joins: [], lastAudio: 0 };
    const ok = now - l.lastAudio >= 600;
    if (ok) l.lastAudio = now;
    this.limits.set(socketId, l);
    return ok;
  }

  // 'twin:create' : le serveur génère un code CSPRNG, fait rejoindre le créateur, renvoie le code.
  @SubscribeMessage('twin:create')
  onCreate(@ConnectedSocket() socket: Socket, @MessageBody() body: { name?: string }) {
    if (!this.allowJoin(socket.id)) { socket.emit('twin:error', 'rate'); return; }
    let room = genCode();
    let tries = 0;
    while (this.rooms.has(room) && tries++ < 5) room = genCode();
    const members = new Map<string, Member>();
    this.rooms.set(room, members);
    socket.join(room);
    members.set(socket.id, { uid: (socket.data as any).uid, name: body?.name || 'Coureur' });
    socket.emit('twin:created', { room });
    this.broadcast(room);
  }

  // 'twin:join' : rejoint une room existante (max 2 uid distincts), sinon 'twin:full'.
  @SubscribeMessage('twin:join')
  onJoin(@ConnectedSocket() socket: Socket, @MessageBody() body: { room: string; name?: string }) {
    if (!this.allowJoin(socket.id)) { socket.emit('twin:error', 'rate'); return; }
    const room = String(body?.room || '').trim().toUpperCase();
    if (!room) { socket.emit('twin:error', 'room'); return; }
    const uid = (socket.data as any).uid;
    if (!this.rooms.has(room)) this.rooms.set(room, new Map());
    const members = this.rooms.get(room)!;
    // Un Twin = 2 personnes max : refuse s'il y a déjà 2 uid différents (et que je n'en fais pas partie).
    const uids = new Set(Array.from(members.values()).map((m) => m.uid));
    if (uids.size >= 2 && !uids.has(uid)) {
      socket.emit('twin:full', { room });
      return;
    }
    socket.join(room);
    members.set(socket.id, { uid, name: body?.name || 'Coureur' });
    this.broadcast(room);
  }

  // 'twin:state' : relaie l'état live (km/allure) aux AUTRES de la room ; ne stocke pas.
  @SubscribeMessage('twin:state')
  onState(@ConnectedSocket() socket: Socket, @MessageBody() body: { room: string; km?: number; paceSec?: number }) {
    const room = String(body?.room || '').trim().toUpperCase();
    const me = this.rooms.get(room)?.get(socket.id);
    if (!me) return;
    socket.to(room).emit('twin:state', { uid: me.uid, name: me.name, km: body?.km, paceSec: body?.paceSec });
  }

  // 'twin:audio' : relaie un clip audio push-to-talk aux AUTRES uniquement ; garde-fou taille + débit ; jamais stocké.
  @SubscribeMessage('twin:audio')
  onAudio(@ConnectedSocket() socket: Socket, @MessageBody() body: { room: string; audioB64?: string; mime?: string; durMs?: number }) {
    const room = String(body?.room || '').trim().toUpperCase();
    const me = this.rooms.get(room)?.get(socket.id);
    if (!me) return;
    const audioB64 = body?.audioB64 || '';
    if (audioB64.length > 1_200_000) return; // ~900KB max, on ignore au-delà
    if (!this.allowAudio(socket.id)) return; // anti-flood : 1 clip / 600 ms
    socket.to(room).emit('twin:audio', { uid: me.uid, name: me.name, audioB64, mime: body?.mime, durMs: body?.durMs });
  }

  // 'twin:leave' : quitte la room ; broadcast roster.
  @SubscribeMessage('twin:leave')
  onLeave(@ConnectedSocket() socket: Socket, @MessageBody() body: { room: string }) {
    const room = String(body?.room || '').trim().toUpperCase();
    const members = this.rooms.get(room);
    if (members?.delete(socket.id)) {
      socket.leave(room);
      if (members.size === 0) this.rooms.delete(room);
      else this.broadcast(room);
    }
  }

  private broadcast(room: string) {
    const roster = Array.from(this.rooms.get(room)?.values() || []).map((m) => ({ uid: m.uid, name: m.name }));
    this.server.to(room).emit('twin:roster', { room, roster });
  }
}
