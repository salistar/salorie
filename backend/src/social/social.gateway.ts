// Gateway sociale temps réel — présence, chat de course, signalisation WebRTC.
// ---------------------------------------------------------------------------
// Elle vit sur le namespace `/social` de la MÊME instance socket.io que les défis
// de jeûne : un seul serveur, un seul port, une seule montée en charge à surveiller.
//
// Authentification au handshake, jamais après : un socket non authentifié est
// déconnecté avant d'avoir pu émettre quoi que ce soit. L'uid vient du jeton
// Firebase vérifié — jamais du client, qui pourrait se déclarer n'importe qui.
//
// Trois familles d'événements :
//   · présence  — qui est en ligne, pour la pastille verte du feed ;
//   · course    — salon de discussion d'une course virtuelle (filtré, limité, persisté) ;
//   · duo       — position partagée et signalisation WebRTC pour la marche à deux.
import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  OnGatewayConnection, OnGatewayDisconnect, MessageBody, ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as admin from 'firebase-admin';
import { createHash } from 'crypto';
import { RaceChatMessage, RaceChatMute } from './social.schemas';
import { RedisService } from '../redis.service';
import { FirebaseService } from '../firebase.service';
import { filtrerMessage, expliquerRefus, verifierPhoto } from './moderation-chat';

/** Hash court pour les journaux : l'uid EST l'email, il ne doit jamais s'y écrire. */
const h = (uid: string) => createHash('sha1').update(String(uid || '')).digest('hex').slice(0, 8);

type Presence = { uid: string; name: string; depuis: number };

@WebSocketGateway({
  namespace: '/social',
  // Même politique que l'API HTTP (cf. main.ts) : les clients natifs n'envoient
  // pas d'Origin et passent ; seuls les navigateurs sont contraints, et l'espace
  // /me est servi depuis un sous-domaine de salorie.com.
  cors: { origin: [/\.salorie\.com$/, /\.salistar\.com$/, 'http://localhost:3000', 'http://localhost:8081'] },
})
export class SocialGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly log = new Logger('SocialGateway');

  /** uid -> présence. Un même compte peut avoir plusieurs onglets ou appareils. */
  private enLigne = new Map<string, Presence>();
  /** socketId -> uid, pour retrouver qui part à la déconnexion. */
  private parSocket = new Map<string, string>();

  constructor(
    @InjectModel(RaceChatMessage.name) private messages: Model<RaceChatMessage>,
    @InjectModel(RaceChatMute.name) private mutes: Model<RaceChatMute>,
    private redis: RedisService,
    private fb: FirebaseService,
  ) {}

  // ── Connexion ─────────────────────────────────────────────────────────────
  async handleConnection(socket: Socket) {
    try {
      const jeton = (socket.handshake.auth as any)?.token || (socket.handshake.query as any)?.token;
      const decode = await admin.auth().verifyIdToken(String(jeton));
      const uid = String(decode.uid || decode.email || '').toLowerCase();
      if (!uid) throw new Error('uid absent');
      (socket.data as any).uid = uid;
      (socket.data as any).name = String((decode as any).name || '').slice(0, 40);
      (socket.data as any).langue = 'fr';
      this.parSocket.set(socket.id, uid);
      this.enLigne.set(uid, { uid, name: (socket.data as any).name, depuis: Date.now() });
      // On ne diffuse que des uid HACHÉS : le feed a besoin de savoir QUI est en
      // ligne parmi ses amis, pas de recevoir la liste des emails de l'app.
      this.server.emit('presence:maj', { enLigne: this.presencePublique() });
    } catch {
      socket.emit('social:erreur', { motif: 'auth' });
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: Socket) {
    const uid = this.parSocket.get(socket.id);
    this.parSocket.delete(socket.id);
    if (!uid) return;
    // Ne retirer la présence que si PLUS AUCUN socket de ce compte n'est ouvert :
    // fermer un onglet ne doit pas faire disparaître quelqu'un qui a l'app ouverte
    // sur son téléphone.
    const encore = [...this.parSocket.values()].includes(uid);
    if (!encore) {
      this.enLigne.delete(uid);
      this.server.emit('presence:maj', { enLigne: this.presencePublique() });
    }
  }

  private presencePublique() {
    return [...this.enLigne.values()].map((p) => ({ id: h(p.uid), name: p.name, depuis: p.depuis }));
  }

  // ── Chat de course ────────────────────────────────────────────────────────
  @SubscribeMessage('race:join')
  async rejoindreCourse(@ConnectedSocket() socket: Socket, @MessageBody() body: { raceId?: string; langue?: string }) {
    const raceId = String(body?.raceId || '').trim();
    // Le salon d'une course porte son fil de discussion : y entrer sans compte
    // reviendrait a lire les messages des participants.
    if (!raceId || !(socket.data as any).uid) return;
    if (body?.langue) (socket.data as any).langue = String(body.langue).slice(0, 2);
    socket.join(`race:${raceId}`);
    // Arriver dans un salon vide de tout historique donne l'impression que personne
    // n'y parle. On sert les 50 derniers messages, du plus ancien au plus récent.
    const recents = await this.messages
      .find({ raceId, masque: false })
      .sort({ ts: -1 })
      .limit(50)
      .lean();
    socket.emit('race:historique', { raceId, messages: recents.reverse() });
  }

  @SubscribeMessage('race:leave')
  quitterCourse(@ConnectedSocket() socket: Socket, @MessageBody() body: { raceId?: string }) {
    const raceId = String(body?.raceId || '').trim();
    if (raceId && (socket.data as any).uid) socket.leave(`race:${raceId}`);
  }

  @SubscribeMessage('race:msg')
  async messageCourse(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { raceId?: string; text?: string; image?: string; imageType?: string },
  ) {
    const uid = (socket.data as any).uid as string;
    const langue = (socket.data as any).langue || 'fr';
    const raceId = String(body?.raceId || '').trim();
    if (!uid || !raceId) return;

    const refuser = (motif: string) => socket.emit('race:refus', { raceId, motif, message: expliquerRefus(motif, langue) });

    // 1. Débit : 10 messages par minute. Redis, donc partagé entre instances.
    const passe = await this.redis.rateLimit(`chat:${raceId}:${uid}`, 10, 60);
    if (!passe) return refuser('debit');

    // 2. Sanction en cours sur CETTE course.
    const mute = await this.mutes.findOne({ raceId, uid }).lean();
    if (mute && Number((mute as any).jusqua) > Date.now()) return refuser('muet');

    // 3. Photo jointe, s'il y en a une.
    //
    // Vérifiée AVANT le texte : un message sans texte mais avec photo est légitime,
    // et il ne faut pas le refuser pour « message vide ».
    //
    // Les trois contrôles sont faits ICI et non côté client. Un client modifié
    // enverrait une image de 15 Mo, ou un type qui n'est pas une image du tout —
    // c'est le serveur qui décide de ce qui entre en base.
    const photo = String(body?.image || '');
    const type = String(body?.imageType || '');
    const refusPhoto = verifierPhoto(photo, type);
    if (refusPhoto) return refuser(refusPhoto);

    // 4. Contenu textuel. Une légende vide est acceptée QUAND une photo
    //    l'accompagne — sinon un message vide n'a rien à faire dans le fil.
    const brut = String(body?.text || '');
    if (!brut.trim() && !photo) return;
    const verdict = brut.trim() ? filtrerMessage(brut) : { ok: true as const, texte: '' };
    if (!verdict.ok) return refuser((verdict as any).motif || 'insulte');

    const doc = await this.messages.create({
      raceId,
      uid,
      name: (socket.data as any).name || '',
      text: verdict.texte || '',
      image: photo,
      imageType: photo ? type : '',
      ts: Date.now(),
    });

    // On diffuse l'uid HACHÉ : le chat d'une course est public entre participants,
    // les adresses e-mail ne le sont pas.
    this.server.to(`race:${raceId}`).emit('race:msg', {
      id: String(doc._id),
      raceId,
      auteur: h(uid),
      name: doc.name,
      text: doc.text,
      image: doc.image || '',
      imageType: doc.imageType || '',
      ts: doc.ts,
    });
  }

  @SubscribeMessage('race:signaler')
  async signalerMessage(@ConnectedSocket() socket: Socket, @MessageBody() body: { messageId?: string }) {
    const uid = (socket.data as any).uid as string;
    const id = String(body?.messageId || '');
    if (!uid || !id) return;
    // Un signalement par personne et par message : sans cette borne, un seul
    // utilisateur pourrait faire taire n'importe qui en signalant trois fois.
    const unique = await this.redis.rateLimit(`signal:${id}:${uid}`, 1, 24 * 3600);
    if (!unique) return;

    const doc = await this.messages.findByIdAndUpdate(id, { $inc: { signalements: 1 } }, { new: true });
    if (!doc) return;
    if (doc.signalements >= 3 && !doc.masque) {
      doc.masque = true;
      await doc.save();
      await this.mutes.updateOne(
        { raceId: doc.raceId, uid: doc.uid },
        { $set: { jusqua: Date.now() + 24 * 3600 * 1000, motif: 'trois signalements' } },
        { upsert: true },
      );
      this.server.to(`race:${doc.raceId}`).emit('race:retire', { id });
      this.log.warn(`message masqué course=${doc.raceId} auteur=${h(doc.uid)}`);
    }
  }

  // ── Marche à deux : position et signalisation WebRTC ──────────────────────

  /**
   * Ces deux comptes sont-ils amis ?
   *
   * La liste vit dans Firestore (`users/{docId}.friends`), écrite par l'app. Le
   * serveur la RELIT lui-même plutôt que de croire le client : une vérification
   * faite dans l'app protège l'usage normal, pas quelqu'un qui parle au socket
   * directement — et c'est précisément celui-là qu'il faut arrêter.
   *
   * En cas d'erreur de lecture on répond FAUX. Devant une incertitude, on refuse
   * l'appel : un appel manqué se rejoue, un appel avec un inconnu non.
   */
  private async sontAmis(a: string, b: string): Promise<boolean> {
    if (!a || !b || a === b) return false;
    try {
      // Même transformation que `emailToDocId` côté app — VÉRIFIÉE dans
      // `lib/firebase.ts` : c'est `trim().toLowerCase()`, et RIEN d'autre. Aucun
      // remplacement de caractère. Une transformation inventée lirait un document
      // inexistant, donc une liste d'amis vide, donc un refus de TOUS les duos —
      // une panne totale qui aurait l'air d'une sécurité qui marche.
      const docId = String(a).trim().toLowerCase();
      const snap = await this.fb.db().collection('users').doc(docId).get();
      const amis: string[] = (snap.data()?.friends as string[]) || [];
      return amis.map((x) => String(x).toLowerCase()).includes(String(b).toLowerCase());
    } catch (e) {
      this.log.warn(`lecture des amis impossible pour ${h(a)} : ${(e as any)?.message}`);
      return false;
    }
  }

  @SubscribeMessage('duo:join')
  async rejoindreDuo(@ConnectedSocket() socket: Socket, @MessageBody() body: { duoId?: string }) {
    const duoId = String(body?.duoId || '').trim();
    const uid = (socket.data as any).uid as string;
    if (!duoId || !uid) return;

    const salon = `duo:${duoId}`;
    const dedans = await this.server.in(salon).fetchSockets();

    // Un duo est un DUO : deux personnes, pas un salon ouvert. Sans cette borne,
    // un identifiant deviné ouvrirait le micro et la caméra de deux inconnus à un
    // troisième — et ce sont souvent des mineurs qui utilisent une app de sport.
    const autres = dedans.filter((s) => (s.data as any)?.uid && (s.data as any).uid !== uid);
    if (autres.length >= 1) {
      const hote = (autres[0].data as any).uid as string;
      if (!(await this.sontAmis(hote, uid))) {
        socket.emit('duo:refus', { duoId, motif: 'pas_ami' });
        this.log.warn(`duo refusé : ${h(uid)} n'est pas ami avec ${h(hote)}`);
        return;
      }
    }

    socket.join(salon);
    socket.to(salon).emit('duo:arrivee', { auteur: h(uid) });

    // Et l'inverse : dire au NOUVEAU VENU qui est deja la. Sans cette ligne,
    // `duo:arrivee` ne prevenait que les personnes deja dans le salon — celui qui
    // arrivait en dernier restait donc sur « En attente de l'autre… » alors que
    // l'autre etait devant lui, et ne pouvait pas savoir qu'il pouvait appeler.
    // Invisible dans le parcours habituel (celui qui cree le duo entre en premier),
    // le defaut apparaissait des que l'invite ouvrait le lien le premier.
    // Constate a l'ecran le 20/08/2026, entre deux onglets.
    for (const s of autres) {
      socket.emit('duo:arrivee', { auteur: h((s.data as any).uid) });
    }
  }

  @SubscribeMessage('duo:pos')
  positionDuo(@ConnectedSocket() socket: Socket, @MessageBody() body: { duoId?: string; lat?: number; lng?: number; km?: number }) {
    const duoId = String(body?.duoId || '').trim();
    const lat = Number(body?.lat);
    const lng = Number(body?.lng);
    // L'authentification a lieu dans `handleConnection`, donc APRES que la
    // connexion soit etablie, et `verifyIdToken` est asynchrone : il existe une
    // fenetre (mesuree a 2-3 ms le 20/08/2026) pendant laquelle une socket sans
    // jeton valide est connectee et peut emettre. `socket.data.uid` n'est pose
    // QUE sur un jeton verifie — le tester ferme la fenetre pour de bon.
    // A noter : `socket.to(salon)` diffuse sans que l'emetteur soit DANS le
    // salon. Sans ce garde, un identifiant de duo devine suffisait a injecter
    // de la signalisation dans un appel en cours.
    if (!(socket.data as any).uid) return;
    if (!duoId || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    // Diffusion aux AUTRES seulement : renvoyer sa position à l'émetteur doublerait
    // le trafic sans rien apporter.
    socket.to(`duo:${duoId}`).emit('duo:pos', {
      auteur: h((socket.data as any).uid),
      lat, lng,
      km: Number(body?.km) || 0,
      ts: Date.now(),
    });
  }

  // Signalisation WebRTC : le serveur ne fait que RELAYER offres, réponses et
  // candidats ICE. Il ne voit jamais l'audio — celui-ci va de pair à pair, ou passe
  // par le relais TURN, qui est chiffré et ne sait pas ce qu'il transporte.
  @SubscribeMessage('webrtc:signal')
  signalWebrtc(@ConnectedSocket() socket: Socket, @MessageBody() body: { duoId?: string; type?: string; data?: unknown }) {
    const duoId = String(body?.duoId || '').trim();
    const type = String(body?.type || '');
    if (!(socket.data as any).uid) return;
    if (!duoId || !['offer', 'answer', 'ice'].includes(type)) return;
    socket.to(`duo:${duoId}`).emit('webrtc:signal', {
      auteur: h((socket.data as any).uid),
      type,
      data: body?.data,
    });
  }

  @SubscribeMessage('duo:leave')
  quitterDuo(@ConnectedSocket() socket: Socket, @MessageBody() body: { duoId?: string }) {
    const duoId = String(body?.duoId || '').trim();
    if (!duoId || !(socket.data as any).uid) return;
    socket.to(`duo:${duoId}`).emit('duo:depart', { auteur: h((socket.data as any).uid) });
    socket.leave(`duo:${duoId}`);
  }
}
