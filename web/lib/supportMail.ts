// Accès aux emails reçus sur support@salorie.com (écrits par le backend via
// /support-mail/ingest). Modèle mongoose LOCAL sur la MÊME collection que le
// backend NestJS ('SupportEmail' → 'supportemails') : l'admin lit Mongo en
// direct (MONGO_URI est dans l'environnement du conteneur web, contrairement à
// ADMIN_API_KEY — le détour par l'API backend échouerait en prod).
import mongoose from 'mongoose';
import { db } from './mongo';

const schema = new mongoose.Schema(
  {
    from: String,
    fromName: String,
    to: String,
    subject: String,
    date: Date,
    text: String,
    html: String,
    messageId: String,
    size: Number,
    read: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export type SupportEmailRow = {
  _id: string;
  from: string;
  fromName?: string;
  to?: string;
  subject?: string;
  date?: string;
  text?: string;
  html?: string;
  size?: number;
  read?: boolean;
  createdAt?: string;
};

function model(): mongoose.Model<any> {
  return (mongoose.models.SupportEmail as mongoose.Model<any>)
    || (mongoose.model('SupportEmail', schema, 'supportemails') as mongoose.Model<any>);
}

export async function listEmails(limit = 200): Promise<SupportEmailRow[]> {
  await db();
  // html exclu de la liste : lourd et inutile avant d'ouvrir le détail.
  const rows = await model().find({}, { html: 0, text: 0 }).sort({ createdAt: -1 }).limit(limit).lean();
  return JSON.parse(JSON.stringify(rows));
}

export async function getEmail(id: string): Promise<SupportEmailRow | null> {
  await db();
  if (!mongoose.isValidObjectId(id)) return null;
  const row = await model().findById(id).lean();
  return row ? JSON.parse(JSON.stringify(row)) : null;
}

export async function setRead(id: string, read: boolean): Promise<void> {
  await db();
  if (!mongoose.isValidObjectId(id)) return;
  await model().updateOne({ _id: id }, { $set: { read } });
}
