// Deploy Firestore rules via the Firebase Rules REST API, authenticated with the
// service account (no firebase login needed). Usage:
//   node deploy-rules.mjs ../../firestore.secured.rules
import fs from 'fs';
import admin from 'firebase-admin';

const rulesPath = process.argv[2];
if (!rulesPath) { console.error('usage: node deploy-rules.mjs <rules-file>'); process.exit(1); }
const rules = fs.readFileSync(new URL(rulesPath, import.meta.url), 'utf8');

const envRaw = fs.readFileSync(new URL('./.env', import.meta.url), 'utf8');
const env = {};
for (const line of envRaw.split(/\r?\n/)) { const i = line.indexOf('='); if (i > 0) env[line.slice(0, i)] = line.slice(i + 1); }
const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
const project = sa.project_id;

const cred = admin.credential.cert(sa);
const { access_token } = await cred.getAccessToken();
const H = { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' };
const base = 'https://firebaserules.googleapis.com/v1';

// 1) Create a ruleset from the source.
let r = await fetch(`${base}/projects/${project}/rulesets`, {
  method: 'POST', headers: H,
  body: JSON.stringify({ source: { files: [{ name: 'firestore.rules', content: rules }] } }),
});
let body = await r.json();
if (!r.ok) { console.error('create ruleset failed', r.status, JSON.stringify(body)); process.exit(1); }
const rulesetName = body.name;
console.log('✓ ruleset created:', rulesetName);

// 2) Point the cloud.firestore release at the new ruleset (update, else create).
const releaseName = `projects/${project}/releases/cloud.firestore`;
r = await fetch(`${base}/${releaseName}`, {
  method: 'PATCH', headers: H,
  body: JSON.stringify({ release: { name: releaseName, rulesetName } }),
});
if (r.status === 404) {
  // No release yet → create it.
  r = await fetch(`${base}/projects/${project}/releases`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ name: releaseName, rulesetName }),
  });
}
body = await r.json();
if (!r.ok) { console.error('release update failed', r.status, JSON.stringify(body)); process.exit(1); }
console.log('✓✓ SECURED RULES DEPLOYED. release ->', body.rulesetName || rulesetName);
process.exit(0);
