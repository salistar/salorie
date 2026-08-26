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
  // Perimetres d'un `admin`. VIDE ou absent = aucune restriction, exactement comme
  // `role` absent vaut `owner` : introduire une granularite ne doit jamais retirer
  // silencieusement l'acces d'un compte qui existait avant elle. La restriction ne
  // commence qu'a la premiere attribution explicite (cf. lib/scopes.ts).
  scopes: { type: [String], default: undefined },
  createdAt: { type: Date, default: Date.now },
});

export type { Role, Scope } from './scopes';
import type { Role, Scope } from './scopes';

/** Role d'un document utilisateur — `owner` pour les comptes anterieurs aux roles. */
export function roleOf(u: any): Role {
  const r = u?.role;
  return r === 'admin' || r === 'viewer' ? r : 'owner';
}

// Typé `any` : évite la sur-stricte inférence de types des requêtes mongoose.
export const AdminUser: any =
  mongoose.models.AdminUser || mongoose.model('AdminUser', AdminUserSchema);

export async function createUser(
  email: string,
  password: string,
  role: Role = 'owner',
  scopes: Scope[] = [],
): Promise<void> {
  // Defense-in-depth : refuser tout ce qui n'est pas une chaîne (empêche l'injection
  // d'opérateurs Mongo type { $ne: null } même si un appelant oublie de caster).
  if (typeof email !== 'string' || typeof password !== 'string') throw new Error('Email + mot de passe (12+ caractères) requis');
  if (!email || !password || password.length < 12) throw new Error('Email + mot de passe (12+ caractères) requis');
  await db();
  const e = email.toLowerCase().trim();
  if (await AdminUser.findOne({ email: e })) throw new Error('Cet email est déjà enregistré');
  const passwordHash = await bcrypt.hash(password, 10);
  // Perimetres seulement pour un `admin` : un super-admin voit tout, un lecteur ne
  // modifie rien — dans les deux cas la liste serait sans effet et donc trompeuse.
  await AdminUser.create({
    email: e,
    passwordHash,
    role,
    scopes: role === 'admin' && scopes.length ? scopes : undefined,
  });
}

/** Verifie les identifiants et rend le role, ou null. Remplace l'ancien booleen :
 *  la connexion doit inscrire le role dans le jeton. */
export async function verifyUserRole(
  email: string,
  password: string,
): Promise<{ role: Role; scopes: Scope[] } | null> {
  if (typeof email !== 'string' || typeof password !== 'string') return null;
  await db();
  const u = await AdminUser.findOne({ email: email.toLowerCase().trim() });
  if (!u) return null;
  if (!(await bcrypt.compare(password, u.passwordHash))) return null;
  return { role: roleOf(u), scopes: Array.isArray(u.scopes) ? (u.scopes as Scope[]) : [] };
}

/**
 * Le role d'un compte EXISTANT, retrouve par son seul e-mail.
 *
 * ⚠ CETTE FONCTION NE VERIFIE AUCUN MOT DE PASSE. Elle n'a qu'un seul appelant
 * legitime : la connexion Google, ou la preuve d'identite a DEJA ete faite par
 * Google puis verifiee par Firebase. L'appeler ailleurs reviendrait a ouvrir le
 * back-office a qui connait une adresse.
 *
 * ⚠ ET ELLE NE CREE RIEN. Un compte Google inconnu reçoit `null`, jamais un
 * compte neuf : sans cela, toute personne possedant une adresse Gmail
 * s'inviterait dans l'administration. C'est LE garde-fou de ce chemin.
 */
export async function trouverCompte(
  email: string,
): Promise<{ role: Role; scopes: Scope[] } | null> {
  if (typeof email !== 'string' || !email.trim()) return null;
  await db();
  const u = await AdminUser.findOne({ email: email.toLowerCase().trim() });
  if (!u) return null;
  return { role: roleOf(u), scopes: Array.isArray(u.scopes) ? (u.scopes as Scope[]) : [] };
}

/** Comptes du back-office, sans jamais exposer d'empreinte de mot de passe. */
export async function listerComptes(): Promise<
  { email: string; role: Role; scopes: Scope[]; createdAt?: Date }[]
> {
  await db();
  const docs = await AdminUser.find({}).sort({ createdAt: 1 }).lean();
  return docs.map((u: any) => ({
    email: u.email,
    role: roleOf(u),
    scopes: Array.isArray(u.scopes) ? u.scopes : [],
    createdAt: u.createdAt,
  }));
}

/** Nombre de super-admins — sert a refuser la suppression du DERNIER d'entre eux. */
export async function compterSuperadmins(): Promise<number> {
  await db();
  // Les comptes anterieurs aux roles n'ont pas de champ `role` et valent `owner`
  // (cf. roleOf) : ils doivent donc compter ici, sans quoi on autoriserait a retirer
  // le dernier acces complet d'une installation historique.
  return AdminUser.countDocuments({ $or: [{ role: 'owner' }, { role: { $exists: false } }, { role: null }] });
}

export async function modifierCompte(
  email: string,
  champs: { role?: Role; scopes?: Scope[] },
): Promise<void> {
  await db();
  const e = String(email || '').toLowerCase().trim();
  const u = await AdminUser.findOne({ email: e });
  if (!u) throw new Error('Compte introuvable');
  // Retrograder le dernier super-admin fermerait la porte a clef de l'interieur :
  // plus personne ne pourrait creer de comptes ni gerer les cles.
  if (champs.role && champs.role !== 'owner' && roleOf(u) === 'owner' && (await compterSuperadmins()) <= 1) {
    throw new Error('Impossible : ce compte est le dernier super-admin');
  }
  if (champs.role) u.role = champs.role;
  if (champs.scopes) u.scopes = champs.scopes.length ? champs.scopes : undefined;
  // Un super-admin voit tout par construction : lui attribuer des perimetres ne
  // ferait que laisser une donnee trompeuse en base.
  if ((champs.role || roleOf(u)) === 'owner') u.scopes = undefined;
  await u.save();
}

export async function supprimerCompte(email: string): Promise<void> {
  await db();
  const e = String(email || '').toLowerCase().trim();
  const u = await AdminUser.findOne({ email: e });
  if (!u) throw new Error('Compte introuvable');
  if (roleOf(u) === 'owner' && (await compterSuperadmins()) <= 1) {
    throw new Error('Impossible : ce compte est le dernier super-admin');
  }
  await AdminUser.deleteOne({ email: e });
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
