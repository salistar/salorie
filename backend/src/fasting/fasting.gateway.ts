// Gateway temps-réel (WebSocket / socket.io) pour les DÉFIS DE JEÛNE entre users.
// Chaque défi = une room. Les participants émettent leur état de jeûne (début,
// cible, statut) et reçoivent en direct l'état de tous les autres.
// Auth : token Firebase passé dans handshake.auth.token (vérifié via admin SDK).
import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  OnGatewayConnection, OnGatewayDisconnect, MessageBody, ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { FirebaseService } from '../firebase.service';

type FastState = { uid: string; name: string; startTs: number | null; targetHours: number; status: 'fasting' | 'idle' };

@WebSocketGateway({ cors: { origin: '*' } })
export class FastingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly log = new Logger('FastingGateway');

  // ⚠ CE CONSTRUCTEUR N'EXISTAIT PAS, et c'etait un bug latent.
  //
  // `handleConnection` appelait `admin.auth()` en direct. Or `FirebaseService`
  // initialise l'application Firebase PARESSEUSEMENT : tant que personne n'a
  // touche a Firestore, `admin.auth()` leve « default Firebase app does not
  // exist ». L'exception tombait dans le `catch` juste en dessous, qui la
  // traite comme un echec d'authentification et deconnecte.
  //
  // Consequence : sur un demarrage a froid, si la premiere connexion au defi de
  // jeune en direct precede tout acces a Firestore, TOUS les participants sont
  // rejetes — et le journal dit « auth », ce qui envoie chercher au mauvais
  // endroit.
  //
  // Exactement le meme defaut que celui deja corrige dans `social.gateway.ts` ;
  // `twin.gateway.ts` s'en premunit en appelant `this.firebase.db()` d'abord.
  // `FirebaseService.auth()` existe pour cela : il appelle `ensure()` avant.
  constructor(private readonly firebase: FirebaseService) {}
  // challengeId -> (socketId -> état)
  private rooms = new Map<string, Map<string, FastState>>();

  async handleConnection(socket: Socket) {
    try {
      const token = (socket.handshake.auth as any)?.token || (socket.handshake.query as any)?.token;
      const decoded = await this.firebase.auth().verifyIdToken(String(token));
      (socket.data as any).uid = decoded.uid || decoded.email || 'anon';
    } catch (e) {
      // On dit POURQUOI. Un « auth » muet ne distingue pas un jeton invalide
      // d'une application Firebase non initialisee — et c'est precisement la
      // confusion qui rendait ce bug invisible.
      this.log.warn(`jeune WS refuse : ${(e as any)?.message || e}`);
      socket.emit('fasting:error', 'auth');
      socket.disconnect(true);
      return; // ne pas continuer sur un socket non authentifie
    }
  }

  handleDisconnect(socket: Socket) {
    for (const [cid, members] of this.rooms) {
      if (members.delete(socket.id)) this.broadcast(cid);
    }
  }

  @SubscribeMessage('fasting:join')
  onJoin(@ConnectedSocket() socket: Socket, @MessageBody() body: { challengeId: string; name?: string; targetHours?: number }) {
    const cid = String(body?.challengeId || 'global').trim().toLowerCase();
    socket.join(cid);
    if (!this.rooms.has(cid)) this.rooms.set(cid, new Map());
    this.rooms.get(cid)!.set(socket.id, {
      uid: (socket.data as any).uid, name: body?.name || 'User',
      startTs: null, targetHours: body?.targetHours || 16, status: 'idle',
    });
    this.broadcast(cid);
  }

  @SubscribeMessage('fasting:update')
  onUpdate(@ConnectedSocket() socket: Socket, @MessageBody() body: { challengeId: string; startTs: number | null; targetHours?: number; status?: 'fasting' | 'idle' }) {
    const cid = String(body?.challengeId || 'global').trim().toLowerCase();
    const m = this.rooms.get(cid)?.get(socket.id);
    if (m) {
      if (body.startTs !== undefined) m.startTs = body.startTs;
      if (body.targetHours) m.targetHours = body.targetHours;
      if (body.status) m.status = body.status;
      this.broadcast(cid);
    }
  }

  @SubscribeMessage('fasting:leave')
  onLeave(@ConnectedSocket() socket: Socket, @MessageBody() body: { challengeId: string }) {
    const cid = String(body?.challengeId || 'global').trim().toLowerCase();
    this.rooms.get(cid)?.delete(socket.id);
    socket.leave(cid);
    this.broadcast(cid);
  }

  private broadcast(cid: string) {
    const participants = Array.from(this.rooms.get(cid)?.values() || []);
    this.server.to(cid).emit('fasting:participants', { challengeId: cid, participants });
  }
}
