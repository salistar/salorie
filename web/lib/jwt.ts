// JWT helpers (jose) — compatibles Edge runtime (utilisables dans middleware.ts).
// Pas de mongoose ici (mongoose n'est pas Edge-safe).
import { SignJWT, jwtVerify } from 'jose';
import type { Role, Scope } from './scopes';

export const AUTH_COOKIE = 'salorie_admin';
// AUTH_SECRET est OBLIGATOIRE (pas de fallback : un secret par défaut connu
// permettrait de forger des tokens admin).
const secret = () => {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error('AUTH_SECRET manquant — définis-le dans l\'environnement du conteneur web.');
  return new TextEncoder().encode(s);
};

export type { Role, Scope };

export type SessionAdmin = { email: string; role: Role; scopes: Scope[] };

export async function signToken(email: string, role: Role = 'owner', scopes: Scope[] = []): Promise<string> {
  // Le role ET les perimetres voyagent DANS le jeton : le middleware Edge peut ainsi
  // decider sans toucher a Mongo (mongoose n'est pas Edge-safe). Contrepartie assumee :
  // un changement de droits ne prend effet qu'a la prochaine connexion, au plus tard
  // 7 jours. C'est pourquoi la page des comptes le DIT a qui modifie un collegue.
  return new SignJWT({ email, role, scopes })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret());
}

export async function verifyToken(token: string): Promise<SessionAdmin | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    // Les jetons emis AVANT l'introduction des roles n'en portent pas. Les traiter en
    // `owner` evite de degrader silencieusement les droits d'une session en cours —
    // ils expirent d'eux-memes sous 7 jours.
    const r = String(payload.role || 'owner');
    const role: Role = r === 'admin' || r === 'viewer' ? r : 'owner';
    // Meme raisonnement pour les perimetres : absents = aucune restriction (cf. la
    // migration douce documentee dans scopes.ts).
    const scopes = Array.isArray(payload.scopes) ? (payload.scopes as Scope[]) : [];
    return { email: String(payload.email || ''), role, scopes };
  } catch {
    return null;
  }
}
