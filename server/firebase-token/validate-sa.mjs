// Proves the service-account key can mint a Firebase custom token that Firebase
// actually accepts — by minting one and exchanging it via the Identity Toolkit
// REST API (the same exchange the app's signInWithCustomToken does).
import fs from 'fs';
import admin from 'firebase-admin';

// load .env
const envRaw = fs.readFileSync(new URL('./.env', import.meta.url), 'utf8');
const env = {};
for (const line of envRaw.split(/\r?\n/)) {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0, i)] = line.slice(i + 1);
}
// read the app's web API key (needed for the REST exchange)
let apiKey = '';
try {
  const appEnv = fs.readFileSync(new URL('../../.env', import.meta.url), 'utf8');
  const m = appEnv.match(/EXPO_PUBLIC_FIREBASE_API_KEY=(.*)/);
  if (m) apiKey = m[1].trim().replace(/^["']|["']$/g, '');
} catch {}

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT)) });
}

const uid = 'validation@salorie.app';
const custom = await admin.auth().createCustomToken(uid, { email: uid });
console.log('✓ minted custom token (len', custom.length + ')');

if (!apiKey) { console.log('No EXPO_PUBLIC_FIREBASE_API_KEY found — skipping REST exchange.'); process.exit(0); }

const res = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
  { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: custom, returnSecureToken: true }) }
);
const data = await res.json();
if (data.idToken) {
  console.log('✓✓ Firebase ACCEPTED the token. uid =', JSON.parse(Buffer.from(data.idToken.split('.')[1], 'base64').toString()).user_id);
  console.log('SERVICE ACCOUNT VALID — bridge will work.');
  process.exit(0);
} else {
  console.error('✗ Firebase rejected:', JSON.stringify(data.error || data));
  process.exit(1);
}
