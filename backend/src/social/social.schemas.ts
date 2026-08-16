import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

// Messages de chat d'une course virtuelle.
// ---------------------------------------------------------------------------
// Persistés pour qu'un coureur qui rejoint la conversation ne débarque pas dans le
// silence : on lui sert les 50 derniers messages. Au-delà, l'historique n'a plus
// d'intérêt — une course dure trente jours, et personne ne remonte un mois de
// bavardage.
//
// TTL 30 jours : la purge est faite par MONGO lui-même, pas par un cron qu'on
// oublierait de surveiller. C'est aussi une position tenable vis-à-vis du RGPD —
// on ne conserve pas indéfiniment des conversations d'utilisateurs.

@Schema({ timestamps: true, collection: 'race_chat' })
export class RaceChatMessage {
  @Prop({ index: true, default: 'default' }) tenantId: string;
  @Prop({ required: true, index: true }) raceId: string;
  /** uid = email en minuscules, comme partout ailleurs. */
  @Prop({ required: true }) uid: string;
  /** Nom d'affichage au moment de l'envoi (il peut changer ensuite). */
  @Prop({ default: '' }) name: string;
  @Prop({ required: true, maxlength: 280 }) text: string;
  /**
   * Photo jointe, en base64, ou vide.
   *
   * Stockée DANS le message et pas dans un bucket à part, pour une raison
   * précise : le TTL de 30 jours ci-dessous la purge alors toute seule. Une image
   * posée sur un disque ou un bucket survivrait à la conversation qu'elle
   * illustre, et il faudrait un cron pour la rattraper — un cron qu'on
   * oublierait de surveiller, comme toujours.
   *
   * 200 Ko après redimensionnement côté client (1024 px, JPEG). Un document
   * Mongo tient 16 Mo : on est deux ordres de grandeur en dessous, et la limite
   * est vérifiée AUSSI côté serveur — un client modifié ne s'en prive pas.
   */
  @Prop({ default: '', maxlength: 280000 }) image: string;
  /** Type de la photo. Fermé à trois valeurs : le reste ne s'affiche pas. */
  @Prop({ default: '' }) imageType: string;
  /** Horodatage serveur : jamais celui du client, qui peut mentir. */
  @Prop({ default: Date.now, index: true }) ts: number;
  /** Renseigné quand un message a été signalé (cf. S5). */
  @Prop({ default: 0 }) signalements: number;
  @Prop({ default: false }) masque: boolean;
  /** Expiration calculée à l'écriture — support de l'index TTL ci-dessous. */
  @Prop({ default: () => new Date(Date.now() + 30 * 24 * 3600 * 1000) }) expireAt: Date;
}
export const RaceChatMessageSchema = SchemaFactory.createForClass(RaceChatMessage);

// Purge automatique par Mongo. `expireAfterSeconds: 0` = supprimer quand la date
// stockée dans `expireAt` est atteinte.
RaceChatMessageSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });
// Lecture des 50 derniers d'une course : l'index couvre exactement la requête.
RaceChatMessageSchema.index({ raceId: 1, ts: -1 });

// ── Sanctions de chat ──────────────────────────────────────────────────────
// Un utilisateur signalé trois fois sur une même course est réduit au silence
// pendant 24 h. La sanction est PAR COURSE : un désaccord dans une course ne doit
// pas fermer la bouche de quelqu'un partout dans l'app.
@Schema({ timestamps: true, collection: 'race_chat_mutes' })
export class RaceChatMute {
  @Prop({ required: true, index: true }) raceId: string;
  @Prop({ required: true, index: true }) uid: string;
  @Prop({ required: true }) jusqua: number;
  @Prop({ default: '' }) motif: string;
  @Prop({ default: () => new Date(Date.now() + 7 * 24 * 3600 * 1000) }) expireAt: Date;
}
export const RaceChatMuteSchema = SchemaFactory.createForClass(RaceChatMute);
RaceChatMuteSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });
RaceChatMuteSchema.index({ raceId: 1, uid: 1 }, { unique: true });

// ── Mur : publications ecrites par les utilisateurs ────────────────────────
// Le fil existant (public_profiles.recentActivity) est AUTOMATIQUE : courses,
// medailles, jalons, avec une liste blanche stricte pour la confidentialite.
// Ceci est different : du TEXTE LIBRE que quelqu'un choisit d'ecrire.
//
// D'ou le passage par le BACKEND et non par une ecriture Firestore directe. Un
// texte libre ecrit depuis le client contournerait le filtre (liens, coordonnees,
// insultes), la limite de debit et la moderation - et Play exige que tout contenu
// visible par un autre utilisateur soit signalable.
//
// TTL 1 an et non 30 jours comme le chat : un mur est fait pour durer, alors
// qu'une conversation de course n'a plus d'interet un mois plus tard. Mais une
// borne existe quand meme - une collection sans expiration croit sans fin, et
// conserver indefiniment les ecrits de quelqu'un est difficile a defendre.

@Schema({ timestamps: true, collection: 'mur_publications' })
export class Publication {
  @Prop({ index: true, default: 'default' }) tenantId: string;
  /** uid = email en minuscules, comme partout ailleurs. */
  @Prop({ required: true, index: true }) uid: string;
  @Prop({ default: '' }) name: string;
  @Prop({ required: true, maxlength: 500 }) texte: string;
  /** Photo jointe, base64, meme borne que le chat. */
  @Prop({ default: '', maxlength: 280000 }) image: string;
  @Prop({ default: '' }) imageType: string;
  /**
   * A qui la publication s'adresse : '' = tous mes amis, sinon un identifiant de
   * groupe. Un groupe restreint l'audience, il ne l'elargit JAMAIS - un non-ami
   * ne voit rien, quel que soit le groupe.
   */
  @Prop({ default: '', index: true }) groupe: string;
  @Prop({ default: Date.now, index: true }) ts: number;
  @Prop({ default: 0 }) signalements: number;
  @Prop({ default: false }) masque: boolean;
  @Prop({ default: () => new Date(Date.now() + 365 * 24 * 3600 * 1000) }) expireAt: Date;
}
export const PublicationSchema = SchemaFactory.createForClass(Publication);
PublicationSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });
// Lecture du mur d'un groupe d'amis : l'index couvre exactement la requete.
PublicationSchema.index({ uid: 1, ts: -1 });

// ── Groupes d'amis ─────────────────────────────────────────────────────────
// Un groupe sert a RESTREINDRE l'audience d'une publication, pas a creer un
// espace commun : « mes collegues », « la famille ». Les membres doivent etre
// amis du proprietaire - sinon un groupe deviendrait un moyen de contourner la
// liste d'amis.

@Schema({ timestamps: true, collection: 'mur_groupes' })
export class GroupeAmis {
  @Prop({ index: true, default: 'default' }) tenantId: string;
  /** Le proprietaire. Lui seul peut modifier ou supprimer le groupe. */
  @Prop({ required: true, index: true }) uid: string;
  @Prop({ required: true, maxlength: 40 }) nom: string;
  /** uid des membres. Tous doivent etre amis du proprietaire. */
  @Prop({ type: [String], default: [] }) membres: string[];
}
export const GroupeAmisSchema = SchemaFactory.createForClass(GroupeAmis);
GroupeAmisSchema.index({ uid: 1, nom: 1 }, { unique: true });
