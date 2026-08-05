// Auth admin custom stockée dans MongoDB (Node runtime — mongoose + bcrypt).
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { db } from './mongo';

const AdminUserSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  // owner  : tous les droits, y compris la gestion des comptes admin ;
  // admin  : lecture + ecriture sur les donnees ;
  // viewer : lecture seule.
  //
  // PAS de valeur par defaut au niveau du schema, et c'est deliberé : les comptes
  // crees AVANT les roles n'ont pas ce champ. `roleOf()` les traite en `owner` —
  // introduire des roles ne doit jamais retirer ses droits a un compte existant, ni
  // enfermer dehors l'unique administrateur.
  role: { type: String, enum: ['owner', 'admin', 'viewer'] },
  createdAt: { type: Date, default: Date.now },
});

export type Role = 'owner' | 'admin' | 'viewer';

/** Role d'un document utilisateur — `owner` pour les comptes anterieurs aux roles. */
export function roleOf(u: any): Role {
  const r = u?.role;
  return r === 'admin' || r === 'viewer' ? r : 'owner';
}

// Typé `any` : évite la sur-stricte inférence de types des requêtes mongoose.
export const AdminUser: any =
  mongoose.models.AdminUser || mongoose.model('AdminUser', AdminUserSchema);

export async function createUser(email: string, password: string, role: Role = 'owner'): Promise<void> {
  // Defense-in-depth : refuser tout ce qui n'est pas une chaîne (empêche l'injection
  // d'opérateurs Mongo type { $ne: null } même si un appelant oublie de caster).
  if (typeof email !== 'string' || typeof password !== 'string') throw new Error('Email + mot de passe (12+ caractères) requis');
  if (!email || !password || password.length < 12) throw new Error('Email + mot de passe (12+ caractères) requis');
  await db();
  const e = email.toLowerCase().trim();
  if (await AdminUser.findOne({ email: e })) throw new Error('Cet email est déjà enregistré');
  const passwordHash = await bcrypt.hash(password, 10);
  await AdminUser.create({ email: e, passwordHash, role });
}

/** Verifie les identifiants et rend le role, ou null. Remplace l'ancien booleen :
 *  la connexion doit inscrire le role dans le jeton. */
export async function verifyUserRole(email: string, password: string): Promise<Role | null> {
  if (typeof email !== 'string' || typeof password !== 'string') return null;
  await db();
  const u = await AdminUser.findOne({ email: email.toLowerCase().trim() });
  if (!u) return null;
  return (await bcrypt.compare(password, u.passwordHash)) ? roleOf(u) : null;
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
