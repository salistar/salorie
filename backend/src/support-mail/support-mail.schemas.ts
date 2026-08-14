import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

// Emails reçus sur support@salorie.com : l'Email Worker Cloudflare poste le MIME
// brut sur /support-mail/ingest ; on le parse (mailparser) et on le stocke pour
// l'écran « Emails support » du back-office.
@Schema({ timestamps: true })
export class SupportEmail {
  @Prop({ required: true }) from: string;
  @Prop({ default: '' }) fromName: string;
  @Prop({ default: '' }) to: string;
  @Prop({ default: '(sans sujet)' }) subject: string;
  // Date déclarée par l'expéditeur (l'heure de réception réelle est createdAt).
  @Prop() date?: Date;
  @Prop({ default: '' }) text: string;
  // Conservé pour référence mais JAMAIS rendu tel quel dans l'admin (XSS).
  @Prop({ default: '' }) html: string;
  // Pas de valeur par défaut : '' est une VALEUR pour un index unique sparse —
  // deux mails sans Message-ID entreraient en collision. Absent = non indexé.
  @Prop() messageId?: string;
  @Prop({ default: 0 }) size: number;
  @Prop({ default: false }) read: boolean;
}
export const SupportEmailSchema = SchemaFactory.createForClass(SupportEmail);
SupportEmailSchema.index({ createdAt: -1 });
// Le worker peut relivrer le même message (retry Cloudflare) : l'upsert par
// Message-ID rend l'ingestion idempotente.
SupportEmailSchema.index({ messageId: 1 }, { unique: true, sparse: true });
