// One-off: build .env from the downloaded service-account JSON + Clerk values.
// Run: node setup-env.mjs "<path-to-service-account.json>"
import fs from 'fs';
const saPath = process.argv[2];
if (!saPath || !fs.existsSync(saPath)) { console.error('Service account JSON not found:', saPath); process.exit(1); }
const sa = JSON.parse(fs.readFileSync(saPath, 'utf8'));

const env = [
  'PORT=8787',
  'CLERK_JWKS_URL=https://evident-drake-70.clerk.accounts.dev/.well-known/jwks.json',
  'CLERK_ISSUER=https://evident-drake-70.clerk.accounts.dev',
  `CLERK_SECRET_KEY=${process.env.CLERK_SECRET_KEY || 'REPLACE_ME'}`,
  `FIREBASE_SERVICE_ACCOUNT=${JSON.stringify(sa)}`,
  '',
].join('\n');

fs.writeFileSync(new URL('./.env', import.meta.url), env);
console.log('Wrote .env for project', sa.project_id, '| client_email', sa.client_email);
