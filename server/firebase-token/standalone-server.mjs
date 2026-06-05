// Standalone Clerk → Firebase custom-token endpoint.
// ---------------------------------------------------------------------------
// Zero-framework alternative to the NestJS module: a single Node file you can
// run on any VPS (pm2 / systemd / docker) WITHOUT touching another project.
//
//   npm i express firebase-admin jose cors
//   node standalone-server.mjs              # listens on PORT (default 8787)
//
// Env (see .env.example):
//   PORT=8787
//   CLERK_JWKS_URL=https://<your-clerk-domain>/.well-known/jwks.json
//   CLERK_ISSUER=https://<your-clerk-domain>
//   CLERK_SECRET_KEY=sk_...
//   FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}   (stringified JSON)
//
// Then point the app at it:  EXPO_PUBLIC_FIREBASE_TOKEN_URL=https://api.yourhost.com/firebase-token
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import admin from 'firebase-admin';
import { createRemoteJWKSet, jwtVerify } from 'jose';

// Load .env from this folder (self-contained; no dotenv dependency needed).
try {
  const envRaw = fs.readFileSync(new URL('./.env', import.meta.url), 'utf8');
  for (const line of envRaw.split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i > 0 && !process.env[line.slice(0, i)]) {
      process.env[line.slice(0, i)] = line.slice(i + 1);
    }
  }
} catch {
  /* rely on real environment variables */
}

const {
  PORT = 8787,
  CLERK_JWKS_URL,
  CLERK_ISSUER,
  CLERK_SECRET_KEY,
  FIREBASE_SERVICE_ACCOUNT,
} = process.env;

// CLERK_SECRET_KEY is OPTIONAL: only used as a fallback to resolve the email
// when the session token does not carry an `email` claim. Preferred path is the
// signed `email` claim (configured in Clerk → Sessions → customize token).
for (const [k, v] of Object.entries({
  CLERK_JWKS_URL, CLERK_ISSUER, FIREBASE_SERVICE_ACCOUNT,
})) {
  if (!v) { console.error(`Missing env ${k}`); process.exit(1); }
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(FIREBASE_SERVICE_ACCOUNT)),
  });
}
const jwks = createRemoteJWKSet(new URL(CLERK_JWKS_URL));

async function resolveEmail(userId) {
  const res = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
    headers: { Authorization: `Bearer ${CLERK_SECRET_KEY}` },
  });
  if (!res.ok) throw new Error('clerk-user');
  const u = await res.json();
  const primary = (u.email_addresses || []).find((e) => e.id === u.primary_email_address_id);
  const email = primary?.email_address || u.email_addresses?.[0]?.email_address;
  if (!email) throw new Error('no-email');
  return String(email).trim().toLowerCase();
}

const app = express();
app.use(cors());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/firebase-token', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return res.status(401).json({ error: 'missing-token' });

    const { payload } = await jwtVerify(token, jwks, { issuer: CLERK_ISSUER });
    if (!payload.sub) return res.status(401).json({ error: 'invalid-token' });

    // Prefer the signed `email` claim (not spoofable — Clerk signed it).
    // Fall back to the Clerk Backend API only if a secret key is configured.
    let email = payload.email ? String(payload.email).trim().toLowerCase() : '';
    if (!email && CLERK_SECRET_KEY) email = await resolveEmail(payload.sub);
    if (!email) return res.status(401).json({ error: 'no-email-claim' });

    const customToken = await admin.auth().createCustomToken(email, { email });
    return res.json({ token: customToken, uid: email });
  } catch (e) {
    console.warn('[firebase-token]', e?.message || e);
    return res.status(401).json({ error: 'unauthorized' });
  }
});

app.listen(PORT, () => console.log(`firebase-token listening on :${PORT}`));
