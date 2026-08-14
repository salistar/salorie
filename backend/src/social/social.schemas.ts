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
