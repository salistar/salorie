// Auth admin custom stockée dans MongoDB (Node runtime — mongoose + bcrypt).
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { db } from './mongo';

const AdminUserSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

// Typé `any` : évite la sur-stricte inférence de types des requêtes mongoose.
export const AdminUser: any =
  mongoose.models.AdminUser || mongoose.model('AdminUser', AdminUserSchema);

export async function createUser(email: string, password: string): Promise<void> {
  if (!email || !password || password.length < 6) throw new Error('Email + mot de passe (6+ caractères) requis');
  await db();
  const e = email.toLowerCase().trim();
  if (await AdminUser.findOne({ email: e })) throw new Error('Cet email est déjà enregistré');
  const passwordHash = await bcrypt.hash(password, 10);
  await AdminUser.create({ email: e, passwordHash });
}

export async function verifyUser(email: string, password: string): Promise<boolean> {
  await db();
  const u = await AdminUser.findOne({ email: email.toLowerCase().trim() });
  if (!u) return false;
  return bcrypt.compare(password, u.passwordHash);
}

export async function countUsers(): Promise<number> {
  await db();
  return AdminUser.countDocuments();
}
