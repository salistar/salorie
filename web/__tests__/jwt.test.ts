// Sécurité auth admin : round-trip signToken/verifyToken + rejet des tokens invalides.
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'test-secret-32-chars-minimum-aaaaaaaa';
import { signToken, verifyToken, AUTH_COOKIE } from '../lib/jwt';

describe('jwt (auth admin)', () => {
  it('round-trip : signToken puis verifyToken renvoie l’email', async () => {
    const token = await signToken('admin@salorie.com');
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3); // header.payload.signature
    const decoded = await verifyToken(token);
    expect(decoded?.email).toBe('admin@salorie.com');
  });

  it('verifyToken(garbage) → null (pas de crash)', async () => {
    expect(await verifyToken('pas.un.jwt')).toBeNull();
    expect(await verifyToken('')).toBeNull();
  });

  it('token signé avec un AUTRE secret → rejeté (null)', async () => {
    const token = await signToken('admin@salorie.com');
    const prev = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = 'un-secret-completement-different-bbbbbbbb';
    const decoded = await verifyToken(token); // secret différent → signature invalide
    process.env.AUTH_SECRET = prev;
    expect(decoded).toBeNull();
  });

  it('AUTH_COOKIE est le nom de cookie attendu', () => {
    expect(AUTH_COOKIE).toBe('salorie_admin');
  });

  it('signToken throw si AUTH_SECRET absent', async () => {
    const prev = process.env.AUTH_SECRET;
    delete process.env.AUTH_SECRET;
    await expect(signToken('x@y.com')).rejects.toThrow(/AUTH_SECRET/);
    process.env.AUTH_SECRET = prev;
  });
});
