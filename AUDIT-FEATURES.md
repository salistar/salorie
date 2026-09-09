# Audit des fonctionnalités — 09/09/2026

Reproductible en trois commandes, et c'est le but : un audit qu'on ne peut pas
relancer périme le jour où il est écrit (cf. `AUDIT-SALORIE.md`, daté du 31/08).

```
node scripts/auditer-cablage.js     # est-ce BRANCHÉ ?
node scripts/auditer-features.js    # qu'y a-t-il DERRIÈRE ?
npx jest && cd backend && npx jest   # est-ce que ça PASSE ?
```

## Ce qui marche, mesuré

| | |
|---|---|
| Tests mobile | **525 / 525**, 43 suites |
| Tests backend | **182 / 182**, 14 suites |
| `api.salorie.com/health` | 200, uptime stable |
| Routes protégées | 401 sans jeton (`/ml/vision-tiers` vérifié) |
| Appels vers une route API inexistante | **0** sur 77 routes |
| Drapeaux qui ne commandent rien | **0** sur 39 |
| Boutons sans effet | **0** |

## Les quatre constats

### 1. `GET /flags` n'existe pas — le repli tient, l'optimisation non

`lib/featureFlags.ts` décrit un endpoint backend avec cache Redis, repli
« dernier bon » et protocole `source:'empty'`. Le mot « flags » apparaît
**zéro fois** dans `backend/src`. En production, l'URL rend 404.

Le code encaisse (404 → `!r.ok` → `null` → Firestore direct → cache
AsyncStorage), donc **rien ne casse**. Mais deux promesses écrites dans le
commentaire ne sont pas tenues : l'économie de quota Firestore
(« N clients → 1 lecture ») n'a pas lieu, et la résilience si Firestore tombe
non plus.

Deux issues honnêtes : construire le module, ou corriger le commentaire. La
pire est de le laisser décrire un mécanisme absent.

### 2. Trois fonctionnalités finies qu'aucun lien n'atteint

| écran | poids | ce qui existe autour |
|---|---|---|
| `/meal-plan` | 425 lignes | dans `FLAG_KEYS`, 1 test |
| `/panier-souk` | 187 lignes | `lib/panierSouk.ts`, `assets/data/prix-souk.json`, 1 test **qui passe** |
| `/race-chat` | 36 lignes | `components/RaceChat.tsx`, utilisé par lui seul |

`/oauth-callback` figure aussi comme orphelin : **faux positif**, il est atteint
par lien profond (`Linking.createURL('oauth-callback')`).

Ce ne sont pas des ruines : `panier-souk` a un test au vert tous les jours sur
du code que personne ne peut ouvrir. `meal-plan` semble supplanté par
`ai-meal-plan` (lui, atteignable) — mais `meal-builder`, `meal-templates` et
`meal-plan-history` le sont aussi, donc la redondance est une hypothèse, pas
un constat. Supprimer ou brancher est une décision produit.

### 3. 33 écrans de 250+ lignes qu'aucun drapeau n'éteint

En cas d'incident sur l'un d'eux, il faut **republier** — pas de coupure à
distance. Les plus lourds : `/analytics` (1241), `/challenge` (1225),
`/workout-details` (773), `/notifications` (656), `/profile` (615),
`/ramadan` (607).

Les 39 drapeaux couvrent bien les fonctionnalités de nutrition et de sport ;
ce sont l'analytique, le social et le profil qui n'ont aucun interrupteur.

### 4. 55 écrans atteignables sans aucun test — 18 portent du calcul

Couverture réelle : **45 / 102**. « Sans test » n'est un défaut que si l'écran
calcule ; on ne compte donc que ceux qui importent au moins trois modules
métier :

`/challenge` (1225 lignes, 9 modules), `/races` (627), `/log-food-details`
(591), `/race-live` (589), `/ar-ghost` (555), `/preferences` (499),
`/health` (445), `/vitals` (383), `/health-export` (377), `/scan-camera` (364),
`/duo-walk` (310), `/challenge-ar` (279), `/battle` (266), `/nutrients` (243),
`/log-manual` (203), `/body-composition` (164), `/streaks` (155),
`/medals` (153).

`/challenge` est le pire cas du projet : le deuxième écran le plus lourd,
neuf modules métier, aucun drapeau, aucun test.

## Deux mesures qui mentaient, et comment

À garder en tête avant de croire un chiffre d'audit.

**« 99 écrans sur 102 couverts par un test »** — le rapprochement passait par
`theme`, `i18n`, `firebase`, importés par presque tous les écrans. Un seul test
touchant l'un d'eux se rattachait à toute l'application. Corrigé en écartant
les modules présents dans plus d'un quart des écrans. Chiffre réel : 45.

**« Presque aucun écran n'appelle le backend »** — les écrans ne parlent pas à
l'API, ils appellent `lib/api.ts`, `lib/socialApi.ts`. La mesure s'arrêtait un
saut trop tôt. Corrigé : écran → module `lib/` → routes du backend.

Les deux erreurs allaient dans le sens qui rassure.

## Ce que cet audit ne dit pas

Il ne lance pas l'application. Un écran atteignable, testé et branché peut
parfaitement afficher n'importe quoi. Il répond à « est-ce branché », pas à
« est-ce juste ».
