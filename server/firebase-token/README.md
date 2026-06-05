# Salorie — Clerk → Firebase token endpoint

Clerk removed its native Firebase integration, so we mint Firebase **custom
tokens** ourselves. This tiny service:

1. verifies the **Clerk** session token (JWKS signature + issuer),
2. resolves the user's **primary email** via the Clerk Backend API,
3. mints a **Firebase custom token** with `uid = sanitized email` (the same key
   the app uses for `users/{email}` in Firestore),
4. the app then calls `signInWithCustomToken(auth, token)`.

This unlocks **secured Firestore rules** (`request.auth.uid == userId`) without
any paid Firebase feature.

---

## Two ways to run it

### A) Standalone (recommended — no other project touched)
```bash
cd server/firebase-token
npm init -y
npm i express firebase-admin jose cors
cp .env.example .env        # fill in the 4 secrets
node standalone-server.mjs  # listens on :8787
```
Put it behind your reverse proxy (Caddy/Nginx) at e.g.
`https://api.salistar.com/firebase-token`, or run with pm2:
```bash
pm2 start standalone-server.mjs --name firebase-token
```

### B) Inside your existing NestJS backend
Copy `firebase-token.module.ts`, `firebase-token.controller.ts`,
`firebase-token.service.ts` into the backend `src/`, then:
```ts
// app.module.ts
import { FirebaseTokenModule } from './firebase-token/firebase-token.module';
@Module({ imports: [FirebaseTokenModule /* , ... */] })
export class AppModule {}
```
Install deps in that backend:
```bash
npm i firebase-admin jose
```
Endpoint becomes `POST /firebase-token` on that server.

---

## Environment variables (see `.env.example`)

| Var | Where to get it |
|-----|-----------------|
| `CLERK_JWKS_URL` | `https://<clerk-domain>/.well-known/jwks.json` (dev: `evident-drake-70.clerk.accounts.dev`) |
| `CLERK_ISSUER` | `https://<clerk-domain>` (no trailing slash) |
| `CLERK_SECRET_KEY` | Clerk dashboard → API keys (`sk_test_…` / `sk_live_…`) |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase console → Project settings → Service accounts → **Generate new private key** → paste the whole JSON on one line |

> The default `firebase-adminsdk-…` service account already has the
> **Service Account Token Creator** role needed to mint custom tokens.

---

## Wire the app

Add to the app `.env`:
```
EXPO_PUBLIC_FIREBASE_TOKEN_URL=https://api.salistar.com/firebase-token
```
Rebuild the APK/AAB. On sign-in, `lib/firebaseAuth.ts` calls this endpoint and
signs into Firebase. Until the URL is set, the bridge is a **safe no-op**.

---

## Cut over to secured rules (last step, in order!)

1. Endpoint is live (`curl https://api.salistar.com/health` → `{ok:true}`).
2. A build with `EXPO_PUBLIC_FIREBASE_TOKEN_URL` set is installed and you've
   confirmed the device log shows `[firebaseAuth] signed in as <email>`.
3. (Re)seed the test account **before** locking down, or convert the seeder to
   the Admin SDK — the current `scripts/seed-firestore.mjs` runs unauthenticated
   and will be blocked once rules are secured.
4. Point `firebase.json` `firestore.rules` at `firestore.secured.rules`
   (or copy it over `firestore.rules`), then:
   ```bash
   firebase deploy --only firestore:rules
   ```

If anything misbehaves, revert by deploying the open `firestore.rules` again.

---

## Quick test
```bash
# Grab a Clerk session token from the app (or Clerk dashboard → Sessions),
# then:
curl -X POST https://api.salistar.com/firebase-token \
  -H "Authorization: Bearer <clerk-session-token>"
# → { "token": "<firebase custom token>", "uid": "you@example.com" }
```
