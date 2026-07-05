// JWT helpers (jose) — compatibles Edge runtime (utilisables dans middleware.ts).
// Pas de mongoose ici (mongoose n'est pas Edge-safe).
import { SignJWT, jwtVerify } from 'jose';

export const AUTH_COOKIE = 'salorie_admin';
// AUTH_SECRET est OBLIGATOIRE (pas de fallback : un secret par défaut connu
// permettrait de forger des tokens admin).
const secret = () => {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error('AUTH_SECRET manquant — définis-le dans l\'environnement du conteneur web.');
  return new TextEncoder().encode(s);
};

export async function signToken(email: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret());
}

export async function verifyToken(token: string): Promise<{ email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return { email: String(payload.email || '') };
  } catch {
    return null;
  }
}
