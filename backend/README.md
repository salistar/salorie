# Salorie — Backend (NestJS) + Admin Web (Next.js)

Full stack added under the mobile repo, sharing the same Firebase project as the app.

## Stack
- **backend/** — NestJS API: MongoDB (Mongoose), Redis cache (ioredis), file uploads (local disk → MinIO/S3 in prod), Firebase-admin bridge to read the app's Firestore.
- **web/** — Next.js admin (same green design as the app): lists users + their data from Firestore. Open at `http://localhost:3000`.
- **docker-compose.yml** — MongoDB + Redis + MinIO + backend + web.

## Run locally
```bash
# admin web only (reads Firestore via firebase-admin)
cd web && npm install && npm run dev          # → http://localhost:3000

# backend API
cd backend && npm install && npm run start:dev # → http://localhost:4000/health

# everything (needs Docker)
FIREBASE_SERVICE_ACCOUNT='<service-account-json>' docker compose up -d --build
```

## API
- `GET /health` — service check
- `GET /users?max=200` — list app users (Firestore, Redis-cached 60s)
- `GET /users/:id` — one user
- `POST /files` (multipart `file`) — upload, returns `{ url }`
- `GET /files/:name` — serve uploaded file

## Env
Copy `backend/.env.example` → `.env`. `web/.env.local` needs `FIREBASE_SERVICE_ACCOUNT`.

## CI/CD (local → GitHub → VPS)
`.github/workflows/deploy-backend-web.yml` builds backend+web on push to `main`, then SSH-deploys to the VPS (`docker compose up -d --build`).
Required GitHub secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_APP_DIR`, `FIREBASE_SERVICE_ACCOUNT`.
VPS one-time: `git clone` the repo to `$VPS_APP_DIR`, install Docker + compose.
