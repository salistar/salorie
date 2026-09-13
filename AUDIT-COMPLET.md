# Audit complet — 10 septembre 2026

Douze parties. **Tout ce qui est présenté comme un fait a été mesuré**, et la
commande qui le reproduit est donnée. Les parties 7 et 8 sont des
**propositions**, pas des constats — elles sont marquées comme telles.

```bash
node scripts/auditer-cablage.js        # est-ce branché ?
node scripts/auditer-features.js       # qu'y a-t-il derrière ?
node scripts/balayage-api.js https://api.salorie.com   # les routes produit répondent-elles ?
npx jest && (cd backend && npx jest) && (cd web && npx jest)
```

**État global** au 13/09/2026, après relecture intégrale : **1 200 tests verts**
(933 mobile · 210 backend · 57 web), `tsc` et ESLint propres sur les trois projets, 0 écran
orphelin, 0 appel vers une route inexistante, 0 drapeau fantôme. Web et landing
sont en **Next 16**, sans vulnérabilité critique ni haute ; les deux conteneurs
sont passés de Node 20 (fin de vie) à Node 22. `salorie.salistar.com`, l'ancienne
landing qui distribuait l'APK du 9 juin, redirige désormais vers `salorie.com`.
Production servie par `3305233`, égal à `main` — vérifié par `/health`.

---

## Partie 1 — Risque de rejet Google Play

Mesuré sur le **binaire signé** (`aapt2 dump permissions` sur l'APK de release),
pas sur le source — la distinction compte : le manifeste de *debug* porte des
permissions que le binaire livré n'a pas.

| | état |
|---|---|
| `targetSdk` | **36** — au-dessus de l'exigence en vigueur ✅ |
| `SYSTEM_ALERT_WINDOW` | **absente** du binaire signé ✅ (présente en debug : c'est le menu du dev-client) |
| `READ_EXTERNAL_STORAGE` | plafonnée `maxSdkVersion=32` ✅ hors politique Photos et Vidéos |
| `WRITE_EXTERNAL_STORAGE` | plafonnée `maxSdkVersion=28` ✅ |
| Santé | **lecture seule**, 4 types déclarés un par un ✅ |
| Facturation | `com.android.vending.BILLING` présente ✅ |

**Ce qui bloque, et ce n'est pas du code** :

1. 🔴 **La clé RevenueCat de production.** `android-release.yml` refuse de signer
   un build dont la clé est une clé de test — le paywall serait mort en silence.
   Le garde-fou a raison. Mais il date du 31/08, soit **deux jours après**
   `build-1053`, la seule release signée existante. Vérifié dans son bundle par
   comptage de préfixes : **4 `test_…`, 0 `goog_…`**. Le binaire que la landing
   distribue a donc un bouton « s'abonner » inerte. Aucun nouveau binaire ne
   peut être produit tant que le secret n'est pas corrigé.
2. 🔴 **20 testeurs pendant 14 jours** en test fermé.
3. ✅ **Formulaire Health Connect** — texte prêt à recopier dans
   [`PLAY-CONSOLE.md`](PLAY-CONSOLE.md), avec le parcours à filmer.
4. ✅ **Divulgation visible** — faite le 10/09/2026. `lib/divulgationPermission.ts`
   est la **seule porte** vers le micro et la position ; vérifié le 13/09 :
   **zéro** appel direct à `Audio.requestPermissionsAsync` ou
   `Location.requestForegroundPermissionsAsync` subsiste dans `app/` et
   `components/` (la seule occurrence restante est un commentaire qui le
   rappelle). Six tests l'interdisent, et exigent que le texte dise les trois
   choses attendues : **ce qui est lu**, **pourquoi**, et **ce qu'on n'en fait
   pas** — dans les trois langues.
5. ✅ **Formulaire « Sécurité des données »** — rempli champ par champ dans
   [`PLAY-CONSOLE.md`](PLAY-CONSOLE.md), **chaque ligne relevée dans le code**
   avec la commande qui la vérifie. Le point que les formulaires ratent le plus
   souvent y est traité : les **photos doivent être déclarées partagées** (elles
   partent vers un fournisseur de vision), mais **ne sont pas conservées** hors
   du programme d'amélioration, qui est opt-in et pseudonymisé.

---

## Partie 2 — Sécurité

**En place, vérifié** : HSTS un an, `X-Frame-Options: DENY`, `nosniff`,
`Referrer-Policy: no-referrer`, `Permissions-Policy` limitée à notre origine.
**Aucun secret versionné** (seuls trois `.env.example`). **14 routes** sous
limitation de débit Redis. **21 contrôleurs backend sur 21** protégés — 18 par
un Guard, 3 par une vérification de clé explicite (`pipeline`, `support-mail`) ;
`/health` est public par conception. Secrets masqués dans les logs
(`masquage-secrets.spec.ts`). Règles Firestore testées sous émulateur. Les 7
routes du back-office redirigent vers `/login` sans session ; `/ml/vision-tiers`
rend 401 sans jeton ; `/flags/invalidate` rend 403 sans clé admin.

**Vulnérabilités restantes** (dépendances de production) :

Remesuré le 13/09/2026, `--omit=dev`, les cinq projets :

| | critique | haute | moyenne |
|---|---:|---:|---:|
| mobile | 0 | ~~21~~ **9** | ~~37~~ **36** |
| backend | 0 | ~~4~~ **5** | ~~25~~ **19** |
| web | ~~1~~ **0** | ~~1~~ **0** | ~~8~~ **2** |
| landing | ~~1~~ **0** | ~~5~~ **0** | ~~1~~ **0** |
| firebase-token | 0 | ~~1~~ **0** | ~~12~~ **10** |

⚠️ **UN CHIFFRE N'EST PAS UN RISQUE, et les quatorze alertes hautes qui restent
le montrent.** Chacune a été suivie jusqu'à son point d'entrée réel :

| | atteignable ici ? | |
|---|---|---|
| **`multer`** (backend) | **OUI** | `src/files/files.controller.ts` expose un vrai téléversement. Garde-fous en place : jeton Firebase obligatoire, liste blanche MIME + extension, plafond 5 Mo, nom en UUID. Tout utilisateur **inscrit** peut néanmoins l'atteindre. |
| `@nestjs/platform-express` | — | Agrégat de `body-parser` et `multer`. Même sortie. |
| `lodash` (backend) | non | `_.template` par injection. **Aucun fichier de `src/` n'importe lodash** : il n'arrive que dans les entrailles d'Apollo. |
| `ws` (backend) | non | Chemin des *subscriptions* GraphQL. Le temps réel de l'application passe par **socket.io**, qui résout `ws@8.21.3`, hors de la plage vulnérable. |
| `glob` (backend) | non | Vecteur : l'exécutable `glob -c/--cmd`. Rien ici ne lance ce binaire. |
| les 9 du **mobile** | non | `@expo/cli`, `metro`, `metro-config`, `metro-transform-worker`, `image-size`, `postcss` : **toutes transitives, aucune importée par `lib/` ou `app/`** — elles fabriquent le binaire, elles n'y entrent pas. |

⚠️ **ET LA SEULE VRAIMENT ATTEIGNABLE NE SE CORRIGE PAS SEULE.** J'ai essayé :
`multer` est une dépendance **directe**, donc `overrides` est refusé
(`EOVERRIDE`) ; et la copie vulnérable est de toute façon celle qu'embarque
`@nestjs/platform-express`. La fermer demande **NestJS 10 → 12**, c'est-à-dire
Express 4 → 5 — dont `path-to-regexp` 8, qui change la syntaxe des motifs de
route. Vingt-et-un contrôleurs, une API que l'application mobile utilise en
production, et un mode d'échec silencieux (une route qui se met à rendre 404).
C'est un chantier à part, pas une ligne de `npm audit fix`.

✅ **Fait le 10/09/2026 — la montée en Next 16.** Les deux critiques étaient
Next.js, corrigeables seulement par une montée majeure. Elles sont éteintes des
deux côtés.

⚠️ **CORRECTION — CE QUE CET AUDIT ANNONÇAIT ÉTAIT FAUX.** Il disait : « huit
alertes moyennes, une seule faille (`uuid`), elle part avec `firebase-admin`
14.4.0 ». Le chiffre venait du `fixAvailable` de npm, qui est **optimiste** : il
nomme une version sans vérifier l'arbre qu'elle produit. Fait le même jour, et
mesuré :

- côté **web**, six alertes partent, **`uuid` reste** —
  `@google-cloud/storage@8` tire encore `gaxios@6`, qui tire `uuid@9` ;
- côté **backend**, `uuid` est aussi tiré par **Apollo et GraphQL** : le SDK
  Firebase n'y pouvait rien dès le départ. La vraie sortie est une majeure
  NestJS 12 / Apollo 5, un chantier à part ;
- et le backend **gagne** une alerte haute, `glob` — dont le vecteur est
  l'exécutable `glob -c/--cmd`, que rien ici n'appelle. On échange une alerte
  inatteignable contre une autre.

**Ce qui justifie quand même la montée** : `firebase-admin` 14 exige
`node >= 22`, et les deux conteneurs tournaient sur **Node 20, en fin de vie
depuis avril 2026** — donc sans correctif de sécurité. C'était un problème plus
sérieux que celui qu'on cherchait à fermer. Vérifié après déploiement :
`v22.23.2` dans les deux conteneurs, `/flags` rend `"source":"firestore"`,
c'est-à-dire une vraie lecture par le SDK migré.

⚠️ **Trois pièges de cette montée, dont deux invisibles** :

1. La 14 **supprime l'API à espace de noms** (`admin.auth()`, `admin.apps`,
   jusqu'aux types). Bruyante, donc inoffensive : le compilateur la signale.
2. `firebase-admin/auth` tire `jose` 6, **publié en ESM pur**. Jest est en
   CommonJS : huit suites sur seize ont cessé de **démarrer**, le compte est
   passé de 194 à 91 tests, et la ligne « 0 failed » restait vraie. Une suite
   qui rétrécit en silence est pire qu'une suite rouge.
3. `engines` n'est **pas** appliqué : npm avertit, l'image se construit, le
   conteneur démarre, et l'incompatibilité se manifeste à l'exécution — ici sur
   `verifyIdToken`, c'est-à-dire l'authentification de toutes les requêtes
   mobiles. Deux tests jumeaux comparent désormais le `FROM node:XX` du
   Dockerfile au `engines` du paquet installé.

⚠️ **Non fait, et assumé** : `server/firebase-token` utilise encore
`firebase-admin` 13. C'est un troisième service, sur le chemin d'authentification,
dont la frappe de jetons ne peut pas être testée de bout en bout d'ici.

**Revenons à Next 16.** Cette montée-là a coûté quatre ruptures d'API, et en a
révélé trois défauts que personne ne cherchait :

1. **Une faille préexistante d'authentification** (voir plus bas).
2. **Turbopack ne résout rien hors de la racine du projet**, et devinait cette
   racine à partir d'un `package-lock.json`. Les pages `/me` importent les
   modules de calcul du dépôt mobile : le build passait en local et mourait en
   conteneur sur neuf « Module not found ». Racine désormais fixée
   explicitement.
3. **Les liens de `.next/node_modules/` sont ABSOLUS.** Next 16 y dépose des
   liens symboliques vers les paquets externalisés, pointant vers le chemin du
   build. Déplacer l'image d'un répertoire les fait pendre : déploiement vert,
   conteneur démarré, **et toutes les pages en 500** sur
   « Cannot find module 'require-in-the-middle-0b638d63113f337b' ».

⚠️ Les points 2 et 3 ont un trait commun qu'il vaut mieux retenir que la
solution : **aucun des deux ne peut se voir en local.** Le premier ne se
manifeste que si la racine est devinée autrement, le second que si le chemin
change. Les deux passent le build, les tests, et le déploiement.

✅ **Dette réglée le même jour** : Next 16 dépréciait la convention
`middleware` au profit de `proxy`. Le fichier renommé est le portail
d'authentification — et renommer ne suffisait pas : le déploiement **ajoute** des
fichiers sans jamais en supprimer, et sa purge ne connaît que des répertoires
entiers. Un `middleware.ts` orphelin serait resté à côté du nouveau `proxy.ts`,
et Next aurait exécuté **le portail périmé** : celui qui laissait passer
`/users/<courriel>` sans session. `rm -f web/middleware.ts` a donc été ajouté à
la purge le même jour. Les deux vont ensemble, ou aucun des deux.

La vérification a du sens : si `proxy.ts` n'était pas exécuté, tout répondrait
200. En production, `/users/<courriel>` et `/emails` rendent 307.

---

## Partie 3 — Design de tous les écrans

Le banc d'essai a été réglé sur **320 dp**, la largeur effective d'un Galaxy A07
dont la « Taille d'affichage » est agrandie — un réglage d'accessibilité
courant, pas un vieux téléphone. C'est là que tout est apparu.

**Corrigé** :

- « Statistiques » tronqué en « **Statisti…** » ; « Challenges » en
  « **Challen…** ». Formes brèves séparées de l'annonce des lecteurs d'écran.
- Le libellé de l'onglet Défis vivait **en dur dans les deux barres**. Troisième
  divergence de cet onglet (16/08, 09/09, 10/09) — plus aucun cas particulier.
- **Les deux barres d'onglets étaient invisibles sur les thèmes sombres** :
  intérieur et fond de page mesurés à **(17, 26, 44)**, identiques. La séparation
  ne tenait qu'à une ombre, et une ombre sur du (11,18,32) ne se voit pas. Filet
  d'un point : discret en thème clair, vérifié.
- **Le titre des bandeaux photo était peint avec la couleur de l'accent**
  (`onAccent`), alors qu'il repose sur un dégradé noir fixe. Les **six** thèmes
  donnaient `#0B0B0B` : noir sur noir, lisible seulement par accident. Passé à
  **15,55:1**.
- L'eyebrow des bandeaux rendait **1,33:1**. Halo serré ; un dégradé ne pouvait
  pas l'atteindre, il est le premier élément d'un bloc ancré en bas.
- Rôles `eyebrow`/`title` **inversés** sur l'écran Progrès : la phrase entière
  partait en h1 borné à deux lignes, d'où « ورؤى ال. » coupé en plein mot.
- Titre arabe sur trois lignes : ce n'était pas la largeur (272 dp libres, 87
  occupés) mais la **mesure** — `letterSpacing` négatif sur une écriture liée,
  et `fontWeight: 900` sans graisse arabe.
- **Cinq écrans réservaient deux fois** la place du bas ; l'onglet Défis ne la
  réservait **pas du tout** (`paddingBottom: 130` pour une valeur calculée
  proche de 200).

**Cinq fausses alertes écartées en mesurant** : cartes « coupées » (elles
défilent), carte « cachée » (capture en milieu de défilement), bandeau **noir**
(4 des 5 abstraits ont une luminance de ~21 — c'est la norme du jeu), texte
« tronqué » sur `/streaks` (fin de défilement propre), et surtout **« 78 écrans
sur 84 ne réservent rien »** — faux, le layout le fait pour eux.

---

## Partie 4 — Fonctionnement des fonctionnalités mobiles

**107 écrans, 0 orphelin, 0 appel vers une route inexistante, 0 bouton mort.**
57 drapeaux, **0 fantôme**, et `NON_EXTINGUIBLES` interdit d'en poser un sur
`/privacy`, le journal alimentaire ou un onglet.

Balayés sur matériel réel et sur émulateur à 320 dp, **zéro erreur JS** :
cuisine, panier du souk, plan repas, séries, Strava, statistiques, profil,
liste de courses, nutriments, jeûne, santé, constantes, journal, préférences,
notifications, détails du compte, confidentialité, saisie manuelle, eau, poids.

**Corrigé pendant l'audit** :
- Trois fonctionnalités finies sans porte d'entrée — dont `/meal-plan`, seul
  écrivain de `saveMealPlan`, ce qui rendait `/meal-plan-history` **vide par
  construction**.
- Le panier du souk affichait son interface en anglais et ses 50 produits en
  français ; les unités n'étaient traduites dans **aucune** des deux autres
  langues.
- Un badge « série protégée » s'affichait chez **tout le monde** : le calcul
  dépensait un gel en tombant au bout de l'historique, sans rien ponter.

✅ **Chantier clos le 13/09/2026.** Les écrans touchés par au moins un test sont
passés de **45 à 72 sur 102**, et ceux qui portent de la logique **sans aucun
test** de **16 à 0**. `/challenge`, cité ici comme le pire cas, a été le premier
traité.

Ce que ce chiffre ne dit pas, et qu'il faut garder en tête : « un test existe »
n'est pas « le comportement est juste ». Ce qui a été verrouillé, ce sont les
modules dont **une erreur ne lève rien** — l'anti-triche, le quota gratuit, les
contraintes de régime, les constantes vitales, le rapport médecin, le miroir
hors ligne, le crédit de course. Voir « Ce que les tests du 13/09/2026 ont
trouvé », plus bas.

---

## Partie 4 bis — Fonctionnement des fonctionnalités web

**8 pages publiques**, toutes en 200, en trois langues et deux thèmes (24
captures). **70 pages** dans l'espace membre `/me`. **26 routes API**.

`web` : `tsc` propre, **57 tests verts** (21 le 10/09). Les 7 routes du back-office redirigent
correctement vers `/login` sans session.

**Corrigé** : le bouton de téléchargement **le plus visible du site** pointait
sur le build du 9 juin, alors que la section plus bas utilisait la release
dynamique — et il affichait, juste à côté, la **taille du build courant**.
L'asset de juin n'ayant jamais été supprimé, le lien répondait 200 : un
contrôle de liens morts l'aurait déclaré sain. Un test interdit désormais la
*forme* : tout `href` de téléchargement doit consulter `meta` d'abord.

---

## Partie 5 — Fonctionnement de l'administration

**19 pages** : `admin`, `admins`, `ai-keys`, `emails`, `feedback`, `flags`,
`marketplace`, `medal-builder`, `medals-history`, `moderation`, `news`,
`notify`, `orgs`, `premium`, `races`, `register`, `reports`, `sport-fields`,
`users`.

Toutes protégées par le portail (`web/proxy.ts`, cookie JWT admin — le fichier
s'appelait `middleware.ts` jusqu'au 13/09/2026, Next 16 ayant déprécié cette
convention) **et** par un `requireAdmin` côté route : la double vérification est
intentionnelle, et c'est elle qui a tenu le jour où le portail laissait passer
`/users/<courriel>`. `requireWriter`
distingue lecture et écriture.

**Corrigé** : un basculement de drapeau depuis la console mettait **jusqu'à
60 secondes** à atteindre les téléphones — acceptable pour allumer une
fonctionnalité, pas pour en éteindre une qui pose problème. Les **deux** chemins
d'écriture (bascule et rollback) préviennent maintenant l'API.

---

## Partie 6 — Ce qui relie mobile, web et administration

**95 écrans mobiles sur 100 ont leur équivalent dans `/me`**, et **aucune**
correspondance ne pointe vers une page absente. Les 5 restants en ont un aussi
(`ai-coach` → `/me/coach`, `scan-camera` → `/me/scan`, `workout-result` →
`/me/seance`, `avatar` → `/me/profile`, `index` → `/me`).

La chaîne des drapeaux est complète et vérifiée de bout en bout :

```
admin /flags  →  Firestore config/features  →  POST api/flags/invalidate
              →  GET api/flags (cache Redis 60 s)  →  mobile
```

**Corrigé** : `GET /flags` **n'existait pas**. `lib/featureFlags.ts` décrivait
depuis des mois un endpoint avec cache Redis et repli « dernier bon » ; le mot
« flags » n'apparaissait nulle part dans `backend/src`, et l'URL rendait 404.
Rien ne cassait — le mobile retombait sur Firestore — mais l'économie de quota
annoncée n'avait jamais lieu. Vérifié en production : `{"source":"cache"}`.

---

## Partie 7 — Monétisation : 30 pistes

⚠️ **Ce sont des propositions, pas des constats.** Aucune n'est implémentée, et
leur ordre est un jugement, pas une mesure.

**Ce qui existe déjà** : RevenueCat est câblé, `FeatureGate` sait verrouiller un
écran derrière Premium, et chaque drapeau porte un champ `premium`. Le socle est
là ; il manque la clé de production.

### Abonnement (le cœur)
1. **Premium mensuel** — le scan illimité, aujourd'hui le seul vrai levier.
2. **Premium annuel** à −40 % — le prix d'ancrage qui fait vendre le mensuel.
3. **Offre famille** (jusqu'à 5 comptes) — `/family` existe déjà.
4. **Essai de 7 jours** déclenché *après* le premier scan réussi, pas à l'ouverture.
5. **Tarif Maroc** en dirhams, aligné sur le pouvoir d'achat local plutôt que converti.
6. **Palier étudiant** vérifié par courriel universitaire.
7. **Ramadan** : un mois offert à qui logge 20 jours de jeûne — fidélisation saisonnière.

### À l'usage
8. **Crédits de scan** à l'unité pour qui refuse l'abonnement.
9. **Analyses IA approfondies** facturées au rapport (`/health-export`).
10. **Plans repas IA** au-delà d'un par semaine.
11. **Export du rapport santé** en PDF signé, pour un médecin.
12. **Reconnaissance de plats en lot** (une semaine de photos d'un coup).

### Le terrain marocain
13. **Commission sur `/panier-souk`** : partenariat avec des épiciers en ligne.
14. **Marketplace** (`/marketplace`) : commission sur les ventes entre membres.
15. **Réservation de terrain** (`/field-reserve`) : commission par créneau.
16. **Coachs sportifs** vérifiés, avec commission sur la mise en relation.
17. **Diététiciens** : consultation dans l'app, part sur l'honoraire.
18. **Salles de sport** : abonnement conjoint app + salle.

### Marque et contenu
19. **Recettes sponsorisées** par des marques alimentaires locales, clairement marquées.
20. **Défis de marque** (`/challenge`) financés par un annonceur.
21. **Médailles physiques** vendues à qui termine un défi.
22. **Boutique** : gourdes, balances connectées, en marque blanche.
23. **Contenu premium** : programmes de 8 semaines écrits par des coachs.

### Entreprises
24. **Salorie Entreprise** : bien-être salarié, facturé par siège (`/orgs` existe).
25. **Assureurs santé** : primes réduites contre régularité prouvée.
26. **Mutuelles** : tableau de bord agrégé et anonymisé.
27. **API nutrition** pour d'autres applications marocaines.

### Le reste
28. **Parrainage** payé en mois offerts plutôt qu'en argent (`/referral` existe).
29. **Sadaqa** (`/sadaqa`) : arrondi des dons, part reversée — revenu *et* ancrage culturel.
30. **Licence du modèle 172 classes** : le corpus marocain n'existe nulle part ailleurs.

**Ce que je recommanderais si vous n'en gardiez que trois** : le tarif en
dirhams (5), l'essai déclenché après un scan réussi (4), et la licence du
modèle (30) — parce que c'est le seul actif que personne ne peut copier.

---

## Partie 8 — 50 fonctionnalités : ce qui manque, ce qui n'existe nulle part

⚠️ **Propositions.** Les comparaisons avec la concurrence viennent de ce qui est
publiquement documenté par ces produits, pas d'une mesure de ma part.

### Ce que les concurrents ont et vous non (25)

**MyFitnessPal / Yazio / Lifesum**
1. Code-barres **hors ligne** sur une base embarquée.
2. **Import de recette depuis une photo** de livre de cuisine.
3. **Portions personnalisées** mémorisées par aliment.
4. **Repas récents** en accès direct sur l'écran de saisie.
5. **Copier un jour** entier vers un autre.
6. **Objectifs par jour de la semaine** (moins le dimanche).
7. **Rappels intelligents** basés sur les heures de repas habituelles.
8. **Widget** écran d'accueil Android.
9. **Complication** pour montre connectée.
10. **Mode invité** sans compte pour essayer.

**Strava / Nike Run Club**
11. **Segments** chronométrés sur un parcours.
12. **Analyse de la foulée** par accéléromètre.
13. **Coach vocal** pendant la course.
14. **Rétrospective annuelle** partageable.
15. **Clubs** avec classement interne.

**Noom / Zoe**
16. **Cours quotidiens** de 5 minutes sur le comportement alimentaire.
17. **Journal d'humeur lié aux repas** (`/mood-tracker` existe, non relié).
18. **Score de transformation** du plat (ultra-transformé).
19. **Réponse glycémique estimée** par aliment.
20. **Groupes de pairs** encadrés.

**Cronometer / MacroFactor**
21. **Micronutriments complets** (84 nutriments).
22. **Dépense énergétique adaptative** recalculée chaque semaine.
23. **Biomarqueurs sanguins** importés d'un laboratoire.
24. **Analyse statistique de tendance** avec intervalle de confiance.
25. **Export CSV** brut de toutes les données.

### Ce qui n'existe nulle part, et que votre position permet (25)

**Le Maroc, que personne d'autre ne peut faire**
26. **Reconnaissance des 71 plats marocains** — vous l'avez, aucun concurrent ne l'a. *À mettre en avant, pas à construire.*
27. **Mode Ramadan complet** : Suhoor/Iftar, hydratation nocturne, budget scindé. *Existe — à faire savoir.*
28. **Prix du souk en direct**, alimentés par les membres.
29. **Équivalences de portions marocaines** : « une louche de harira », « un verre à thé ».
30. **Cuisine familiale partagée** : un tajine pour 6, réparti automatiquement.
31. **Halal au scan** avec le détail des additifs douteux. *Existe.*
32. **Calendrier des saisons marocaines** : ce qui est bon marché ce mois-ci.
33. **Mode invité du vendredi** : le couscous familial, en une saisie.
34. **Darija à la dictée vocale** — aucun concurrent ne transcrit l'arabe marocain.
35. **Jeûne du lundi/jeudi** (sunnah), distinct du jeûne intermittent.

**Ce que la cascade IA rend possible**
36. **Estimation du coût** d'un repas photographié, en dirhams.
37. **« Que puis-je cuisiner ? »** à partir d'une photo du placard *et* du budget.
38. **Détection du gaspillage** : ce qui périme dans le frigo.
39. **Coach en photo** : « montre-moi ton assiette », correction en une phrase.
40. **Substitution locale** : remplacer un ingrédient absent du souk.

**Social et motivation**
41. **Défi de quartier** géolocalisé.
42. **Marche en duo à distance** — `/duo-walk` existe, à étendre.
43. **Pari amical** avec mise en sadaqa plutôt qu'en argent.
44. **Suivi familial intergénérationnel** : un parent voit la régularité d'un enfant, avec consentement.
45. **Mode Aïd** : gérer l'excès sans culpabiliser.

**Santé sérieuse**
46. **Compte-rendu pour le médecin**, format ordonnance marocaine.
47. **Suivi du diabète** : glycémie et repas sur la même courbe.
48. **Grossesse** : besoins par trimestre.
49. **Tension et sel** : alerte quand le sodium dépasse le seuil.
50. **Rappel de médicaments** lié aux repas (à jeun / au cours du repas).

**Les trois que je construirais d'abord** : 34 (darija à la dictée — personne ne
peut vous suivre), 36 (coût du repas en dirhams — parle à tout le monde ici), et
26/27 mis en avant sur la landing, parce qu'ils **existent déjà** et que rien ne
le dit.

---

## Partie 9 — Landing

**Impeccable, mesuré** : 8 pages en HTTP 200 (`/`, `/en`, `/ar`, `/contact`,
`/privacy`, `/terms`, `/refund`, `/delete-account`), 6 liens sortants en 200,
**0 lien cassé**. Rendu vérifié en trois langues et deux thèmes, plus une vue
téléphone — 24 captures.

Reproductible : `node scripts/liens-landing.js https://salorie.com`

Seule réserve : les liens de téléchargement pointent sur `build-1053`, qui est
la dernière release existante. Voir partie 1.

⚠️ **IL Y A UNE SECONDE LANDING, ET ELLE N'EST PAS À JOUR** (constaté le
10/09/2026). Le dépôt `salistar/salorie-landing` sert toujours
`salorie.salistar.com` : c'est l'ancêtre de celle qui a été fusionnée dans
`web/app/(landing)`. Les deux sites se ressemblent, mais pas leurs liens :

| | résolution du binaire | ce qu'un visiteur télécharge |
|---|---|---|
| `salorie.com` | `meta?.apk?.url ?? APK_URL` | la dernière release `build-*` |
| `salorie.salistar.com` | `v1.0.0` **en dur** | l'APK du **9 juin 2026** |

Ce n'est donc pas la partie 1 qui s'applique ici, mais bien pire : une version
antérieure au consentement d'amitié, au correctif de la faille Premium et à
Health Connect — exactement le défaut que `releaseMeta.ts` avait corrigé côté
`salorie.com`, resté entier sur son jumeau.

Ce site a été monté en Next 16 le 10/09/2026 (il portait la même faille
critique, plus cinq hautes ; il est à **zéro**, transitives comprises). Mais la
vraie question n'est pas technique : **faut-il encore qu'il existe ?** Deux
landings, c'est deux fois la maintenance et une chance sur deux de corriger la
bonne. Une redirection vers `salorie.com` réglerait le fond ; c'est un
arbitrage, pas un correctif.

---

## Partie 10 — Parité local / GitHub / serveur / binaires

Revérifié de bout en bout le 13/09/2026, **dans les deux sens** :

| | état |
|---|---|
| local == `origin/main` | ✅ 0 devant, 0 derrière, **0 fichier non suivi** — sur les deux dépôts |
| dépôt → serveur | ✅ le déploiement copie ce qu'il annonce |
| **serveur → dépôt** | ⚠️ **c'est ici qu'il manquait quelque chose** (ci-dessous) |
| secrets | ✅ 33 secrets GitHub ; 12 des 14 clés du `.env` local y ont leur jumeau |
| APK/AAB sur GitHub | ✅ présents, **mais du 29 août** |
| landing → binaires | ✅ résolution dynamique de la dernière release |

⚠️ **`whisper/` N'ÉTAIT DANS AUCUN DÉPÔT.** Deux fichiers, 1,6 Ko, qui vivaient
uniquement dans `~/apps/salorie-stack/` sur srv3 : le service `faster-whisper`
qui fait fonctionner le **journal vocal**. Rien dans le dépôt n'y faisait
référence, sauf un mot dans un commentaire de `docker-compose.override.yml`. Si
la machine disparaissait, il aurait fallu le réécrire — et d'abord se souvenir
qu'il existait. Rapatrié, avec un README qui précise qu'il **n'est pas déployé**
par le workflow, pour que personne ne le modifie en croyant changer la
production.

C'est le même défaut de fond que le **`Caddyfile`**, qui reste versionné nulle
part : c'est lui qui décide que `salorie.com` est servi par `salorie-web` et
`salorie.salistar.com` par `salorie-landing`. **Toujours ouvert.**

⚠️ **ET LE `.env` DE PRODUCTION FAISAIT 1 924 LIGNES POUR 28 CLÉS.** 205 copies
d'`ADMIN_API_KEY`, 189 de chaque `NEXT_PUBLIC_*` : le workflow réécrivait 22
clés mais n'en filtrait que 12 avant, donc dix s'empilaient à chaque
déploiement. `dotenv` retenant la dernière occurrence, la valeur servie restait
juste — mais le fichier gardait **en clair, sur disque, toute valeur qu'une clé
a eue dans sa vie**. Faire tourner `ADMIN_API_KEY` n'effaçait donc pas
l'ancienne. Une rotation qui ne retire pas l'ancien secret n'en est pas une.

Corrigé, et le nettoyage est rétroactif : **28 lignes, 3,9 Ko, zéro doublon**
après le déploiement suivant. `scripts/verifier-env-deploiement.js` refuse
désormais qu'une clé réécrite ne soit pas filtrée — éprouvé dans les deux sens.

⚠️ Quatre clés sont **volontairement** hors du filtre, et j'ai failli les y
mettre : `MONGO_PASS` n'est écrite qu'une fois (la filtrer aurait fait perdre la
base au backend), `TURN_SECRET` n'est retirée que lors d'une rotation explicite,
`MONGO_URI` et `MONGO_CMD` font déjà leur propre `sed`.

**Corrigé** : `/health` ne disait pas quel commit tourne. Un uptime de 19 heures
signifie aussi bien « à jour depuis hier » que « le dernier déploiement a échoué
sans que personne ne regarde » — la seule façon de trancher était de croire le
journal du workflow. La route expose désormais `commit`, posé au déploiement.

```bash
curl -s https://api.salorie.com/health | jq -r .commit   # doit valoir le SHA de main
git rev-parse HEAD
```

Vérifié : les deux rendent `260f1b054e55e9b8ffba0fb16cb65b5eae26dcf6`.

### ✅ L'énigme d'août est résolue — c'était LA TAILLE DU FICHIER

Trois déploiements cassés en août, et la cause m'échappait depuis : écrire
`printf ... 'GIT_COMMIT=${{ github.sha }}'` faisait échouer le workflow **au
démarrage** — zéro job, aucun log, « cannot be retried », GitHub affichant le
fichier par son **chemin** au lieu de son nom. La ligne était de forme identique
à ses dix voisines, et le YAML validait.

Le 13/09/2026, le même symptôme est revenu. Bisection en **huit poussées**, en
mettant cette fois les octets en face des résultats :

```
32 219 o ✓   32 345 o ✓   32 358 o ✓   32 359 o ✓
32 503 o ✗   32 643 o ✗   33 662 o ✗   34 265 o ✗
```

**Séparation parfaite.** GitHub refuse le fichier dès qu'il dépasse une taille
comprise **entre 32 359 et 32 503 octets**.

⚠️ **Et ce n'est PAS la longueur des lignes**, que j'ai cru et écrit deux fois
avant de mesurer : une version dont la plus longue ligne faisait 182 caractères
a été refusée, une autre à 281 est passée. `js-yaml` et le validateur de schéma
Actions trouvent le fichier valide dans tous les cas — aucun outil local ne voit
quoi que ce soit.

Ce qui explique août : le fichier était déjà au bord, et la ligne ajoutée le
faisait basculer. **Ce n'était pas la forme de l'expression, c'était son poids.**

**Corrigé structurellement** : 282 des 530 lignes étaient du commentaire. Elles
vivent maintenant dans `.github/workflows/deploy-backend-web.md`, le YAML gardant
un renvoi d'une ligne. Le fichier passe de 33 662 à **16 683 octets** — la moitié
du seuil. Rien n'est perdu, et il est enfin lisible.

---

## Partie 11 — CI/CD sans échec

Trois échecs, trois causes différentes, **trois corrigés** :

1. **Design system** — mon propre changement : le compteur de couleurs en dur
   passait de 0 à 1. Le plafond est figé à 1, avec sa justification : le blanc de
   `HeroImage` repose sur un dégradé **fixe**, pas sur une surface thémée.
2. **API — sentinelle** — le seul contrôle qui appelle vraiment les routes
   produit, et il avait **raison** : `/fridge/analyze` rendait TIMEOUT après
   90 s. Voir ci-dessous.
3. **Android Build** — `Could not resolve foojay-resolver:0.5.0`,
   plugins.gradle.org injoignable. Rien dans le dépôt n'avait changé. Une
   seconde tentative après 30 s ; une vraie erreur de compilation échoue deux
   fois et remonte quand même.

**Et un quatrième, que j'ai causé moi-même** : le déploiement, cassé par ma
propre correction de la partie 10. Trois runs rouges avant de l'isoler. C'est
la seule façon honnête de présenter ce chiffre — « zéro échec » ne se mesure
pas sur l'intention.

### Mise à jour du 10/09/2026 — deux échecs de plus, un vrai, un faux

5. **Le déploiement, cassé deux fois par la montée en Next 16** : d'abord neuf
   « Module not found » (racine Turbopack), puis un rouge encore plus
   désagréable — **vert au workflow, 500 sur tout le site**, parce que les liens
   de `.next/node_modules/` sont absolus. Les deux sont analysés en partie 2.
   Onze tests web les verrouillent désormais.

6. **Le déploiement de `salorie-landing`, rouge alors que tout allait bien chez
   lui.** Sa vérification interrogeait `https://salorie.com/` — un domaine que
   Caddy sert par `salorie-web`, un conteneur d'un **autre dépôt**, qu'il ne
   construit ni ne redémarre. Il a donc échoué quinze fois de suite à cause
   d'une panne qui n'était pas la sienne, pendant que son propre conteneur
   servait correctement le nouveau build.

   Vérifié sur la machine plutôt que supposé :

   ```
   salorie.com            reverse_proxy salorie-web:3000
   salorie.salistar.com   reverse_proxy salorie-landing:3000
   ```

   Une vérification qui interroge le voisin ne vérifie rien : elle échoue quand
   tout va bien chez elle, et passe au vert quand rien ne va.

### Mise à jour du 13/09/2026 — un build réussi qui partait en rouge

7. **`Salorie Android Build`, échec à la DERNIÈRE étape.** Ce n'était pas le
   build : l'APK était construit et l'artefact téléversé. C'est la
   **publication** qui échouait — le workflow republie à chaque poussée le même
   `app-debug.apk` sous le même tag « latest », et trois runs simultanés se
   disputaient l'asset : `HttpError`.

   Provoqué en poussant une correction puis sa documentation coup sur coup. Ce
   qui a mis sur la piste plutôt qu'un aléa réseau : **le commit suivant était
   vert**.

   Deux garde-fous, volontairement opposés :

   | | |
   |---|---|
   | `android-build` | `cancel-in-progress: **true**` — seul le dernier commit compte, l'APK s'appelle « latest ». Supprime la course **et** le gaspillage : 14 minutes de build par commit de documentation. |
   | `deploy` | `cancel-in-progress: **false**` — interrompre un déploiement est pire que de le laisser finir : entre la purge et la copie, le conteneur serait recréé sans ses sources. Ils font la queue. |

   ⚠️ Le groupe du build inclut `github.ref`, obligatoirement : le workflow se
   déclenche aussi sur les tags `v*`, et un build de tag produit un binaire
   qu'on garde.

8. **Le workflow de déploiement refusé au démarrage — et la cause enfin
   isolée.** Détaillée en partie 10 : c'est la **taille du fichier**, pas la
   forme d'une ligne. Huit poussées de bisection pour l'établir, et deux
   conclusions fausses de ma part corrigées en chemin par la mesure.

⚠️ **Ce que cette série de huit échecs apprend, et qui vaut plus que les huit
correctifs** : sur les huit, **deux n'étaient pas des pannes du produit**. Le
build Android qui rougissait à la publication fonctionnait parfaitement ; le
déploiement de la landing accusait un conteneur qui n'était pas le sien. Une CI
qui rougit pour de mauvaises raisons apprend à ignorer le rouge — et c'est ainsi
qu'on rate le neuvième, qui sera vrai.

### La panne que la sentinelle a trouvée

**« Frigo → recettes » était mort en production.** `analyze()` faisait **deux
passes vision** sur la même photo : la première détecte les ingrédients, la
seconde demandait des recettes — un travail de **texte** — en repassant l'image
dans le VLM. `/ml/vision` seul prend 38 s ; deux passes dépassaient les 90 s du
client. Le commentaire du code disait déjà « texte → texte, pas d'image ». Le
code envoyait l'image. Cinq tests verrouillent le point.

---

## Partie 12 — Sentry

Les trois SDK étaient branchés et bien réglés — échantillonnage à 10 %,
`sendDefaultPii: false` (l'app manipule des données de santé et des photos de
repas), DSN en clair et justifié.

**Corrigé** : **aucun ne posait `release`.** Sans elle, Sentry ne peut ni
regrouper par version, ni comparer deux versions, ni montrer qu'un correctif a
éteint une erreur. Le projet distribue en plus **deux binaires à la fois** — le
Play Store et l'APK de la landing — qui n'avancent pas au même rythme : sans
release, leurs erreurs se mélangent.

- **mobile** : `salorie@<version>+<versionCode>`, plus `dist` = versionCode.
  Deux builds peuvent partager « 1.0.0 » sans contenir le même JavaScript ; c'est
  aussi ce que Sentry associe aux source maps.
- **backend** : `SENTRY_RELEASE` sinon `GITHUB_SHA`.
- **web** : idem, avec `VERCEL_GIT_COMMIT_SHA` en plus.

✅ **Fait le 13/09/2026 — les `tags` de tri.** Trois axes, et ils ne sont pas
génériques : ce sont les trois endroits où cette application a déjà cassé.
`langue` + `rtl` (icônes à l'envers, titres tronqués en plein mot),
`theme` + `apparence` (deux barres d'onglets invisibles, un titre noir sur noir
sur les six palettes), et `palier_scan` (la cascade a quatre étages ; sans
étiquette, il faut lire la pile d'appels pour savoir lequel a répondu).

Une valeur absente vaut `inconnu` et non une étiquette manquante : dans Sentry
les deux se filtrent différemment, et `inconnu` dit que l'erreur est survenue
avant que le contexte ne soit prêt — le moment le plus fragile du démarrage.

✅ **Fait le 13/09/2026 — le `beforeSend` du web et du backend.**
`sendDefaultPii: false` était posé partout, et c'est le malentendu qui rendait
le trou invisible : ce réglage empêche le SDK d'ajouter **de lui-même** l'IP, les
en-têtes et les cookies. Il ne touche pas à ce que notre code écrit — or
l'identifiant de compte de cette application **est un courriel**, donc il est
dans la moitié des messages d'erreur.

Le backend était le pire des trois : la cascade de vision renvoie le corps
d'erreur des fournisseurs, et ceux-ci recopient la clé reçue. `masquerSecrets`
protégeait déjà la réponse rendue à l'admin, **pas** ce chemin : deux sorties,
une seule gardée. Une règle pour les préfixes de clés (`sk-`, `AIza`, `goog_`)
a donc été ajoutée au module partagé.

Côté web, **trois runtimes, trois `Sentry.init`** — serveur, Edge (le portail
d'authentification y tourne) et navigateur. Les trois importent le module de la
racine ; aucun n'en fait une copie. Le backend, lui, ne peut pas partager
(contexte de build `./backend`, `rootDir: "src"`) : c'est une copie, mais **un
test compare les règles des deux fichiers** et fait échouer la CI à la moindre
divergence.

**Reste à faire** : rien côté configuration. Le seul angle non couvert est que
**le mobile n'a jamais été vérifié depuis un vrai build EAS** — ni ses
étiquettes, ni son masquage.

### Mise à jour du 10/09/2026 — le back-office ne remontait **rien**

Trouvé en vérifiant une redirection après la montée en Next 16. Trois défauts
empilés, tous silencieux, et le troisième masquait les deux autres.

1. **`sentry.client.config.ts` n'était plus lu.** La convention est dépréciée
   depuis Next 15.5 et **cesse d'être chargée sous Turbopack**. Mesure : le DSN
   n'apparaissait dans **aucun** fichier de `.next/static/`. Aucune erreur
   navigateur du back-office ne pouvait remonter. La landing avait déjà fait ce
   renommage, le piège écrit en commentaire — évité d'un côté, pas de l'autre.

2. **`tunnelRoute` est une option webpack.** Vérifié dans le SDK 10.74.0 :
   `_sentryRewritesTunnelPath` n'existe que dans son `config/webpack.js`. Sous
   Turbopack, la clé est lue, acceptée, sans effet. `/monitoring` rendait 404 et
   le navigateur repartait droit vers `*.sentry.io` — dans le bloqueur de
   publicité que ce tunnel devait contourner.

3. **Le portail redirigeait le tunnel.** `POST /monitoring` rendait 307 vers
   `/login`, sur les deux domaines. Or les erreurs qu'on veut voir sont
   précisément celles des visiteurs **non connectés** : la landing, `/me`, et la
   page de connexion elle-même.

Le tunnel est désormais écrit à la main, sur les deux sites, en trois pièces
qu'un test tient accordées.

⚠️ **Une route publique qui repost le corps reçu est un relais ouvert.**
L'enveloppe annonce son DSN dans sa première ligne ; on ne lui fait pas
confiance. Il est comparé au nôtre — hôte **et** numéro de projet — et l'URL
d'amont est reconstruite depuis le nôtre. Sept tests, dont trois attaques : hôte
pirate, même SaaS autre région, autre projet du même hôte.

**Vérifié en production**, pas seulement sur le poste :

```bash
# La route existe et refuse un DSN qui n'est pas le nôtre
curl -o /dev/null -w '%{http_code}\n' -X POST --data-binary \
  '{"dsn":"https://k@evil.example.com/123"}' https://salorie.com/monitoring   # 403
# Et le DSN est bien reparti dans le bundle du navigateur
curl -s https://app.salorie.com/login | grep -oE '/_next/static/chunks/[^"]+\.js' \
  | while read c; do curl -s "https://app.salorie.com$c" | grep -q o4509622074081280 \
  && echo "$c"; done
```

Les deux domaines répondent 403 au DSN étranger, 405 en `GET`, et le DSN est
présent dans `1yo0plxxhe1qp.js`.

⚠️ **Ce que ça dit du reste** : trois mécanismes de surveillance étaient en
panne, et le symptôme était *moins d'erreurs dans Sentry*. Un tableau de bord
calme n'est pas une preuve de santé — il faut vérifier que le canal transporte
encore quelque chose. C'est vrai aussi du mobile, dont le `Sentry.init` est
pourtant le mieux réglé des quatre (release, `dist`, `beforeSend` qui masque),
mais qui n'a jamais été vérifié depuis un vrai build EAS.

---

## Ce que cet audit ne dit pas

Il ne remplace pas un utilisateur. Un écran atteignable, testé, branché et
mesuré peut parfaitement afficher une bêtise. Six défauts de cette liste
n'étaient trouvables **qu'en faisant tourner l'application** ou en interrogeant
la production — et cinq alertes ont été écartées en mesurant ce que je croyais
voir.

---

## Ce que les tests du 13/09/2026 ont trouvé

Couvrir les seize écrans nus n'a pas seulement produit des tests : écrire un
test oblige à dire ce qu'un module **promet**, et c'est là que les écarts
apparaissent. Un défaut corrigé, huit constats laissés à l'arbitrage.

**Corrigé** — `lib/haptique.ts` : un `return promesse` à l'intérieur d'un `try`
ne passe pas par le `catch`. Le module annonçait « l'échec est TOUJOURS avalé »
et ne l'avalait pas. Sans conséquence aujourd'hui (les dix appels sont
fire-and-forget), mais le premier qui aurait écrit `await haptique.succes()` en
se fiant à cette promesse aurait vu son action mourir sur une vibration.

**Les huit ont été corrigés le 13/09/2026**, après arbitrage. Pour les trois qui
touchent à des chiffres lus par des humains, la version retenue est à chaque
fois celle qui **ne masque rien** :

| | corrigé |
|---|---|
| `bpAlert` | **140/90 pile déclenche l'alerte** : bornes hautes inclusives. ⚠️ Les bornes **basses restent strictes** — l'hypotension se définit *sous* 90/60, et 90/60 pile est une tension basse normale. |
| `setChallengeProgress` | Une **seconde mémoire sur l'appareil** retient le dernier cumul réellement crédité et sert de repli quand Firestore ne répond pas. Ni distant ni local → on ne crédite rien plutôt que d'inventer. |
| `buildHealthReport` | Une journée **sans le moindre apport** ne compte plus dans la moyenne. ⚠️ Un déficit **réel** reste négatif : un plancher à zéro cacherait au soignant ce qu'il doit voir. |
| `dietPrefs` | **Copie de secours** de cinq booléens, qui survit au gros enregistrement. Un refus explicite reste un refus : le filet ne sert que si le principal ne dit rien. |
| `updateLocalCollection` | `upsert` sans identifiant **refuse le doublon à l'identique** au lieu d'empiler. Deux entrées différentes coexistent toujours. Et la purge ne compte plus `profile_` deux fois. |
| `freeLimit` | `SANS_QUOTA` déclare l'absence de quota, un nom inconnu crie en développement, et **un test balaie `app/`** pour exiger que tout nom employé soit déclaré. Le défaut permissif est conservé. |
| `staticMapUrl` | Coerce ses arguments **comme sa jumelle**. |
| `profile.tsx` | La ligne morte est **retirée, pas réparée** : l'écrire correctement aurait effacé le drapeau à chaque déconnexion. |

**Et deux de mes propres mesures étaient fausses**, corrigées par le calcul :
une borne de vitesse que j'annonçais exacte (le flottant l'a démentie) et des
points d'intérêt « hors bornes » qui n'étaient qu'un artefact de ma fenêtre de
lecture. Les deux sont consignées dans les tests concernés.

## Priorités — état au 13/09/2026

Relecture intégrale des douze parties. **Tout ce qui pouvait être corrigé sans
arbitrage l'a été** ; ce qui reste est listé ici avec ce qu'il coûte.

### Ce qui bloque encore, et qui n'est pas du code

1. 🔴 **La clé RevenueCat de production.** Elle gèle tout binaire, donc la
   publication et la mise à jour du téléchargement. **Non touchée, sur consigne.**
2. 🔴 **20 testeurs pendant 14 jours** en test fermé. Le compteur ne démarre
   qu'une fois un binaire déposé — donc après le point 1.
3. 🟠 **Les deux formulaires de la console** sont écrits et vérifiables
   ([`PLAY-CONSOLE.md`](PLAY-CONSOLE.md)), mais **c'est toi qui les recopies**.

### Ce qui reste ouvert dans le code, et pourquoi

4. 🟠 **NestJS 10 → 12 (avec Express 4 → 5).** C'est la seule façon de fermer
   `multer`, la **seule alerte haute réellement atteignable** du projet — un vrai
   endpoint de téléversement, derrière un jeton Firebase. Ce n'est pas un
   `npm audit fix` : `path-to-regexp` 8 change la syntaxe des motifs de route,
   vingt-et-un contrôleurs sont concernés, l'API sert l'application mobile en
   production, et le mode d'échec est silencieux (une route qui rend 404).
5. 🟠 **Le `Caddyfile` de srv3 n'est versionné nulle part.** C'est lui qui décide
   quel conteneur sert quel domaine. `whisper/` avait le même défaut et a été
   rapatrié le 13/09 ; celui-ci demande une décision — le mettre dans quel dépôt,
   et comment le déployer sans casser les autres sites de la machine.
6. 🟠 **`/graphql` est en production et personne ne l'appelle.** Endpoint vivant
   (HTTP 200), resolvers protégés par `FirebaseAuthGuard`, **aucun client du
   dépôt ne l'utilise**. Le retirer fermerait `lodash` et `ws` (deux hautes) plus
   quatre moyennes, et réduirait la surface. Mais c'est supprimer une
   fonctionnalité : à toi de trancher, pas à moi.
7. 🟠 **`server/firebase-token` reste en `firebase-admin` 13.** La raison est
   dans son README : la 14 supprime l'API à espace de noms, ce fichier est du
   `.mjs` **sans compilateur**, et `createCustomToken` ne peut être exercé
   qu'avec un vrai jeton de session. La vérification passe par toi : se
   connecter à `/me` après déploiement.
8. 🟠 **Sentry mobile n'a jamais été vérifié depuis un vrai build EAS.** Ni ses
   étiquettes de tri, ni son masquage. Les trois autres projets sont vérifiés en
   production.
9. 🟢 **`react-native-reanimated` 3.19.5 contre `~4.1.1` attendu** par Expo
   SDK 54. Écart **préexistant** (mon verrou n'y a pas touché). Monter une
   majeure d'une bibliothèque d'animation native demande un build et un contrôle
   visuel.

### Ce qui a été fermé aujourd'hui

| | |
|---|---|
| Couverture de tests | 45 → **72 écrans sur 102** ; **16 → 0** sans aucun test |
| Divulgation préalable | zéro appel direct au système subsiste |
| Formulaires Play | écrits, chaque ligne relevée dans le code |
| `beforeSend` Sentry | posé sur les trois runtimes web **et** le backend |
| Étiquettes Sentry | langue/RTL, thème/apparence, palier de scan |
| Node 20 (fin de vie) | éliminé partout : 6 workflows + 3 conteneurs |
| Vulnérabilités mobile | 21 → **9** hautes, sans toucher une version déclarée |
| `.env` de production | 1 924 → **28 lignes**, zéro doublon |
| `whisper/` | rapatrié dans le dépôt |
| Refus au démarrage | **cause isolée** après un mois : la taille du fichier |
| Les 8 constats des tests | corrigés, chacun documenté |

### Et une chose qui n'est pas un chantier

🟢 **Mettre en avant ce qui existe déjà** — les 71 plats marocains et le mode
Ramadan. C'était la priorité 5 de cet audit : **elle est faite**, les deux
figurent maintenant en avant sur la landing, dans les trois langues.
