# Salorie — Runbook scaling : 2M inscrits / 200k connectés simultanés

200k simultanés ≈ 2-4k req/s API. Le CPX52 actuel (16 vCPU/32 Go) tient ~5-10k simultanés.

## Déjà en place ✅
- Backend NestJS **stateless** (scalable horizontalement tel quel)
- Cache Redis sur les générations IA + **rate limiting** `/ai/*` (30/min/user, `RedisService.rateLimit`)
- Mongo : `bulkWrite` médailles, index, filtres tenant ; pipeline CDC Firestore→Mongo (lectures chaudes déplaçables)
- Whisper local (retire la charge/coût Gemini audio) ; vision flash-lite
- App : cache résolution user (1 lecture Firestore/écran), file d'écritures offline (logs + progression défis), listes plafonnées
- Crash-reporting maison (crashs JS → back-office)

## Palier 1 — jusqu'à ~30k simultanés (~150 €/mois, 1 journée de travail)
1. 2 serveurs CPX42 supplémentaires + **Hetzner Load Balancer** devant `api.`
2. `docker compose up -d --scale backend=3` par machine (retirer `container_name`, Caddy → LB)
3. **Cloudflare** (gratuit) devant `app.` et `api.` : TLS, cache statique, protection DDoS de base
4. Mongo → **replica set 3 nœuds** (1 par serveur) ; `readPreference=secondaryPreferred` pour les lectures
5. Sentry (SDK JS backend seulement = sans risque) + uptime monitoring (UptimeRobot)

## Palier 2 — jusqu'à ~200k simultanés
6. **BullMQ** (Redis existant) : files `medals`, `push`, `insights` — les POST répondent en <50 ms, les jobs suivent
7. Redis → cluster 3 nœuds ; leaderboards live via pub/sub + WebSocket service dédié
8. Mongo **sharding par userId** au-delà de ~50M documents
9. Firestore réservé aux écritures temps réel client ; toutes les lectures listes via API/Mongo (CDC déjà prêt)
10. k8s managé (Hetzner/Scaleway) + autoscaling HPA quand l'équipe peut l'opérer

## Firebase natif (nécessite une passe de build native — à planifier ensemble)
- **Crashlytics natif** + **Analytics/funnels** + **App Check** (Play Integrity) : exigent `@react-native-firebase/*` + google-services.json + gradle — à faire dans une itération dédiée avec tests.
- Remote Config : redondant (nos Feature Flags Firestore + back-office font déjà flags + ciblage).
- Dynamic Links : **déprécié par Google** → parrainage via code + App Links classiques.
