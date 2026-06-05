// Verifies the secured rules: anonymous read DENIED, owner read ALLOWED.
import fs from 'fs';
import admin from 'firebase-admin';
const envRaw = fs.readFileSync(new URL('./.env', import.meta.url), 'utf8');
const env = {};
for (const l of envRaw.split(/\r?\n/)) { const i = l.indexOf('='); if (i > 0) env[l.slice(0, i)] = l.slice(i + 1); }
const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
const project = sa.project_id;
let apiKey = '';
try { const a = fs.readFileSync(new URL('../../.env', import.meta.url), 'utf8').match(/EXPO_PUBLIC_FIREBASE_API_KEY=(.*)/); if (a) apiKey = a[1].trim().replace(/^["']|["']$/g, ''); } catch {}
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });

const email = 'salistarcompany@gmail.com';
const docUrl = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/users/${encodeURIComponent(email)}`;

// A) anonymous read -> expect 403
let r = await fetch(docUrl);
console.log(`A) anonymous read  -> HTTP ${r.status}  ${r.status === 403 ? '✓ DENIED (good)' : '✗ NOT denied!'}`);

// B) owner read -> mint custom token, exchange for idToken, read
const custom = await admin.auth().createCustomToken(email, { email });
const ex = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: custom, returnSecureToken: true }),
});
const exj = await ex.json();
if (!exj.idToken) { console.log('B) could not get idToken:', JSON.stringify(exj.error || exj)); process.exit(1); }
r = await fetch(docUrl, { headers: { Authorization: `Bearer ${exj.idToken}` } });
console.log(`B) owner read      -> HTTP ${r.status}  ${r.status === 200 ? '✓ ALLOWED (good)' : '✗ blocked!'}`);
process.exit(0);
