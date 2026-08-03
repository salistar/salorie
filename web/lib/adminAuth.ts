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
  // Defense-in-depth : refuser tout ce qui n'est pas une chaîne (empêche l'injection
  // d'opérateurs Mongo type { $ne: null } même si un appelant oublie de caster).
  if (typeof email !== 'string' || typeof password !== 'string') throw new Error('Email + mot de passe (12+ caractères) requis');
  if (!email || !password || password.length < 12) throw new Error('Email + mot de passe (12+ caractères) requis');
  await db();
  const e = email.toLowerCase().trim();
  if (await AdminUser.findOne({ email: e })) throw new Error('Cet email est déjà enregistré');
  const passwordHash = await bcrypt.hash(password, 10);
  await AdminUser.create({ email: e, passwordHash });
}

export async function verifyUser(email: string, password: string): Promise<boolean> {
  // Defense-in-depth : ne pas dépendre uniquement du cast dans la route ; refuser
  // toute valeur non-string pour bloquer une injection d'opérateur Mongo.
  if (typeof email !== 'string' || typeof password !== 'string') return false;
  await db();
  const u = await AdminUser.findOne({ email: email.toLowerCase().trim() });
  if (!u) return false;
  return bcrypt.compare(password, u.passwordHash);
}

export async function countUsers(): Promise<number> {
  await db();
  return AdminUser.countDocuments();
}
