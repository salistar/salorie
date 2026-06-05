// Enable / initialize Firebase Authentication (Identity Platform) on the project
// programmatically, using the service-account credentials.
import fs from 'fs';
import admin from 'firebase-admin';

const envRaw = fs.readFileSync(new URL('./.env', import.meta.url), 'utf8');
const env = {};
for (const line of envRaw.split(/\r?\n/)) { const i = line.indexOf('='); if (i > 0) env[line.slice(0, i)] = line.slice(i + 1); }
const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
const project = sa.project_id;

const cred = admin.credential.cert(sa);
const { access_token } = await cred.getAccessToken();

async function call(method, url, body) {
  const r = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  return { status: r.status, text };
}

// 1) Try to initialize Identity Platform / Firebase Auth for the project.
let res = await call('POST', `https://identitytoolkit.googleapis.com/v2/projects/${project}/identityPlatform:initializeAuth`, {});
console.log('initializeAuth ->', res.status, res.text.slice(0, 300));

// 2) Read back the auth config to confirm it now exists.
//    (Custom-token sign-in only needs Authentication to be initialized — no
//    provider needs to be enabled, so we do NOT touch any sign-in provider.)
res = await call('GET', `https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`);
console.log('get config ->', res.status, res.text.slice(0, 300));
