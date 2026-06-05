// Lists Firebase Auth users — proof that on-device signInWithCustomToken worked.
import fs from 'fs';
import admin from 'firebase-admin';
const envRaw = fs.readFileSync(new URL('./.env', import.meta.url), 'utf8');
const env = {};
for (const line of envRaw.split(/\r?\n/)) { const i = line.indexOf('='); if (i > 0) env[line.slice(0, i)] = line.slice(i + 1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT)) });
const list = await admin.auth().listUsers(100);
console.log('Firebase Auth users:', list.users.length);
for (const u of list.users) {
  console.log(' -', u.uid, '| created', u.metadata.creationTime, '| lastSignIn', u.metadata.lastSignInTime);
}
process.exit(0);
