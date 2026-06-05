# VPS deployment — step by step (SSH)

Deploy the Clerk→Firebase token endpoint on your VPS with Docker + Caddy (auto
HTTPS). Assumes a Linux VPS (Ubuntu/Debian) you reach over SSH. Replace
`auth.salistar.com` and `<VPS_IP>` with your values.

---

## 0. DNS (do this first — propagation takes a few minutes)

In your DNS provider, add an **A record**:

```
auth.salistar.com   →   <VPS_PUBLIC_IP>
```

Check it resolves:
```bash
nslookup auth.salistar.com
```

---

## 1. SSH into the VPS

```bash
ssh root@<VPS_IP>          # or your sudo user
```

---

## 2. Install Docker + Caddy (skip what you already have)

```bash
# Docker engine + compose plugin
curl -fsSL https://get.docker.com | sh

# Caddy (host service, auto-TLS)
sudo apt update
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

# Firewall: allow HTTP/HTTPS (Caddy needs 80 for the ACME challenge)
sudo ufw allow 80,443/tcp || true
```

---

## 3. Copy the service files to the VPS

The repo is private, so the simplest path is `scp` from your machine.

**From your Windows machine (PowerShell), in the project root:**
```powershell
scp -r server/firebase-token root@<VPS_IP>:/opt/salorie-firebase-token
```
> `node_modules`, `.env` and the key JSON are excluded by `.dockerignore` for the
> image build, but `scp -r` copies whatever is in the folder — make sure your
> local `node_modules` isn't huge, or copy only what's needed:
> ```powershell
> # minimal copy
> scp server/firebase-token/{Dockerfile,docker-compose.yml,package.json,package-lock.json,standalone-server.mjs,.dockerignore,.env.example,Caddyfile} root@<VPS_IP>:/opt/salorie-firebase-token/
> ```

*(Alternative: `git clone` with a GitHub token / deploy key if you prefer.)*

---

## 4. Create the production `.env` on the VPS

```bash
cd /opt/salorie-firebase-token
cp .env.example .env
nano .env
```
Fill in (single line for the JSON):
```
PORT=8787
CLERK_JWKS_URL=https://evident-drake-70.clerk.accounts.dev/.well-known/jwks.json
CLERK_ISSUER=https://evident-drake-70.clerk.accounts.dev
# CLERK_SECRET_KEY is OPTIONAL — not needed since the session token carries the email claim.
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"salistar-salorie", ... }
```
Lock it down:
```bash
chmod 600 .env
```

> 🔐 Generate a FRESH service-account key in Firebase (the earlier one was shared
> in chat) and paste that one here.

---

## 5. Start the container

```bash
docker compose up -d --build
docker compose ps                 # should show "healthy" after ~15s
curl -s http://127.0.0.1:8787/health   # -> {"ok":true}
```

---

## 6. Configure Caddy (HTTPS)

```bash
# Use the provided Caddyfile (edit the domain inside first if needed)
sudo cp /opt/salorie-firebase-token/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo systemctl status caddy --no-pager
```

Test from anywhere (TLS issued automatically):
```bash
curl -s https://auth.salistar.com/health      # -> {"ok":true}
```

---

## 7. Point the app at the endpoint + rebuild

In the app `.env`:
```
EXPO_PUBLIC_FIREBASE_TOKEN_URL=https://auth.salistar.com/firebase-token
```
Then rebuild and ship:
```bash
cd android && ./gradlew :app:assembleRelease :app:bundleRelease
```

Confirm sign-in works (a Firebase Auth user with uid = the user's email appears
in Firebase console → Authentication → Users after launching the app).

---

## 8. Cut over to secured Firestore rules (LAST — order matters)

1. Endpoint live (step 6) and a build with the URL is installed.
2. Re-seed the test account if needed (the unauthenticated seeder is blocked once
   rules are locked — run it BEFORE, or convert it to the Admin SDK).
3. Point `firebase.json` `firestore.rules` at `firestore.secured.rules`
   (or copy it over), then:
   ```bash
   firebase deploy --only firestore:rules
   ```
4. Rollback if needed: redeploy the open `firestore.rules`.

---

## 9. (Optional) Enable GitHub auto-deploy

Generate a deploy key on the VPS:
```bash
ssh-keygen -t ed25519 -f ~/.ssh/gha_deploy -N ""
cat ~/.ssh/gha_deploy.pub >> ~/.ssh/authorized_keys
cat ~/.ssh/gha_deploy            # copy this PRIVATE key
```
In GitHub → repo → Settings → Secrets and variables → Actions, add:

| Secret | Value |
|--------|-------|
| `VPS_HOST` | `<VPS_IP>` or `auth.salistar.com` |
| `VPS_USER` | `root` (or your user) |
| `VPS_SSH_KEY` | the **private** key printed above |
| `VPS_PATH` | `/opt/salorie-firebase-token` |

Now every push touching `server/firebase-token/**` builds the image, pushes it to
GHCR, and runs `docker compose pull && up -d` on the VPS automatically.

> If you deploy via the GHCR image instead of building on the VPS, first run
> `docker login ghcr.io` on the VPS (the package is private by default), or make
> the package public in GitHub → Packages.

---

## Troubleshooting

| Symptom | Fix |
|--------|-----|
| `curl https://.../health` hangs | DNS not propagated yet, or port 80/443 blocked by firewall/cloud security group |
| Caddy TLS error | A record must point to this VPS; port 80 must be reachable for the ACME challenge |
| App doesn't sign into Firebase | Check the endpoint URL in app `.env`, and that the Clerk session token carries the `email` claim (Clerk → Sessions → Claims) |
| `permission-denied` in app after rules cutover | A build that signs into Firebase must be installed BEFORE deploying secured rules |
