# Déploiement des règles Firestore — pont Clerk → Firebase

**État au 13/09/2026.** Le pont est vérifié et fonctionnel côté serveur. Le déploiement des
règles reste **bloqué par un seul verrou** : aucun build publié n'active le pont.

> **Ne déploie pas `firestore.rules` aujourd'hui.** Les règles du dépôt exigent
> `request.auth.uid == userId`. Or l'app publiée n'ouvre aucune session Firebase Auth, donc
> `request.auth` est `null` pour **tous** les utilisateurs. Déployer maintenant, c'est passer
> l'application entière en `permission-denied` — panne totale, immédiate, pour tout le monde.

## Les deux conditions posées par l'en-tête des règles

| # | Condition | État | Preuve |
|---|---|---|---|
| 1 | Le endpoint de token est en ligne | ✅ **remplie** | voir ci-dessous |
| 2 | Un build installé appelle `signInToFirebase()` | ❌ **non remplie** | voir ci-dessous |

### Condition 1 — vérifiée, tout est bon

- Conteneur `salorie-firebase-token` sur **srv3** : `Up (healthy)`, port 8787 interne.
- Exposé par Caddy sur **deux** domaines :
  - `salorie-auth.salorie.com`
  - `salorie-auth.salistar.com`
- Réponses en production :
  ```
  GET  /health         → 200  {"ok":true}
  POST /firebase-token → 401  {"error":"missing-token"}
  ```
- **Les identifiants concordent.** `emailToDocId()` dans `lib/firebase.ts` fait
  `email.trim().toLowerCase()`, et le serveur fait `createCustomToken(String(email).trim().toLowerCase())`.
  Donc `request.auth.uid` sera bien égal à la clé du document `users/{docId}` et `isOwner()`
  matchera. Ce point était le principal risque silencieux : il est écarté.

### Condition 2 — c'est le verrou

`signInToFirebase()` commence par :

```ts
if (!CONFIG.firebaseTokenUrl) return false;   // no-op
```

et `CONFIG.firebaseTokenUrl` vient de `EXPO_PUBLIC_FIREBASE_TOKEN_URL`, qui n'était déclarée
**nulle part** : ni dans `.env.example`, ni dans les profils de `eas.json`, ni dans
`app.json`. Tous les builds publiés jusqu'ici ont donc le pont désactivé.

**Corrigé dans ce commit :** la variable est maintenant câblée dans les trois profils de
`eas.json` (`development`, `preview`, `production`) et documentée dans `.env.example`.

## Avant de builder : un préalable à régler

Le conteneur tourne **sans `CLERK_SECRET_KEY`** (vérifié : seules `PORT`,
`FIREBASE_SERVICE_ACCOUNT`, `CLERK_JWKS_URL`, `CLERK_ISSUER`, `NODE_ENV` sont définies).

Or le serveur lit l'email ainsi :

```js
let email = payload.email ? ... : '';
if (!email && CLERK_SECRET_KEY) email = await resolveEmail(payload.sub);
if (!email) return res.status(401).json({ error: 'no-email-claim' });
```

Sans clé secrète, **le token de session Clerk doit impérativement porter une claim `email`
signée**. Je n'ai pas pu confirmer dans le dashboard Clerk que cette claim est configurée
(l'éditeur de claims n'est pas lisible par script). Deux options, à choisir :

- **A — configurer la claim.** Clerk → Configure → Sessions → *Customize session token*,
  ajouter `"email": "{{user.primary_email_address}}"`.
- **B — poser la clé secrète** sur le conteneur, ce qui rend le repli opérationnel et supprime
  la dépendance à la configuration du token. Une variable d'environnement à ajouter, puis
  `docker compose up -d salorie-firebase-token`.

**Fais les deux.** A est le chemin normal, B est le filet. Sans au moins l'un des deux, chaque
appel renverra `401 no-email-claim` et le pont ne servira à rien.

## Le plan, dans l'ordre

### Étape 1 — préalable Clerk
Appliquer A et/ou B ci-dessus.

### Étape 2 — vérifier le pont avec un vrai utilisateur
Builder en profil `preview`, installer, se connecter, puis contrôler qu'une session Firebase
existe réellement — pas seulement que l'app démarre :

```ts
import { auth } from './lib/firebaseAuth';
console.log('firebase uid =', auth.currentUser?.uid);   // doit afficher l'email en minuscules
```

**Go/No-go :** si `auth.currentUser` est `null`, **arrêter ici**. Regarder les logs du
conteneur, qui nomment la cause exacte :

```bash
ssh srv3 'docker logs --tail 50 salorie-firebase-token'
```

### Étape 3 — publier et attendre l'adoption
Builder en `production`, soumettre, et **attendre que le parc soit migré**. C'est l'étape la
plus longue et la moins évitable : tout utilisateur resté sur un build antérieur sera
déconnecté de ses données à la seconde où les règles passent.

Sans mise à jour forcée, prévoir plusieurs semaines. Avec un écran de mise à jour obligatoire
(comparaison de version au démarrage), quelques jours.

### Étape 4 — répétition sur l'émulateur
`firebase.json` déclare déjà l'émulateur Firestore sur le port 8089 :

```bash
cd salorie
firebase emulators:start --only firestore
```

Rejouer les parcours principaux — profil, amis, analytics, calendrier — contre les nouvelles
règles avant de toucher à la production.

### Étape 5 — déployer
```bash
cd salorie
firebase deploy --only firestore:rules --project salistar-salorie
```

Puis, immédiatement, vérifier que l'énumération anonyme reste refusée :

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://firestore.googleapis.com/v1/projects/salistar-salorie/databases/(default)/documents/users?pageSize=1"
# attendu : 403
```

### Rollback
Garder la copie des règles actuellement en production **avant** de déployer — la console
Firestore permet de les copier depuis l'onglet Règles. En cas d'incident, les recoller et
redéployer. Sans cette copie, il n'y a pas de retour arrière.

## Ce que les nouvelles règles corrigent

Trois failles, lisibles dans les commentaires du fichier :

1. **Énumération de la PII (critique).** `allow read: if signedIn()` couvrait aussi `list` :
   n'importe quel compte connecté pouvait parcourir toute la collection `users` et aspirer
   email, **conditions de santé, poids** et profil de tous les inscrits. La lecture est
   désormais réservée au propriétaire, et les champs réellement publics (nom, avatar, streak)
   ont été déplacés dans `public_profiles/{docId}`.

2. **Premium auto-attribué.** `premiumOverride`, `subscription`, `premiumTrialUntil` étaient
   écrivables par le client — un utilisateur pouvait s'offrir l'abonnement en une requête.
   Ces champs sont maintenant immuables côté client ; seuls le SDK Admin et le webhook
   RevenueCat les posent.

3. **Parrainage falsifiable.** `referredBy` et `referralCount` relevaient du même problème.

## Rappel de priorité

Le point 1 expose des **données de santé**. Tant que les règles de production n'ont pas été
comparées à ce fichier, considère l'exposition comme active. La sonde anonyme renvoie 403,
ce qui prouve seulement que l'accès **non authentifié** est fermé — la faille décrite
s'ouvre à tout utilisateur **authentifié**, donc à n'importe quel inscrit.

**Premier geste, avant tout le reste :** ouvrir la console Firestore → Règles, et comparer
avec `firestore.rules` du dépôt. Si la version en ligne contient encore
`allow read: if signedIn()` sur `/users`, la fuite est réelle aujourd'hui.
