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

**État global** : **825 tests verts** (610 mobile · 194 backend · 21 web), `tsc` et
ESLint propres sur les trois projets, 0 écran orphelin, 0 appel vers une route
inexistante, 0 drapeau fantôme.

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
3. 🟠 **Formulaire Health Connect** : déclaration d'usage + lien vers la
   politique de confidentialité.
4. 🟠 **Divulgation visible** pour `RECORD_AUDIO` (journal vocal) et
   `ACCESS_FINE_LOCATION` (course GPS) — un écran d'explication *avant* la
   demande système.
5. 🟠 **Formulaire « Sécurité des données »** : doit correspondre à ce qui est
   réellement collecté, Sentry et RevenueCat compris.

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

| | critique | haute | moyenne |
|---|---:|---:|---:|
| mobile | 0 | 21 | 37 |
| backend | 0 | 4 | 25 |
| web | **1** | 1 | 8 |

⚠️ **Sur la critique, la mesure honnête** : c'est Next.js, corrigeable seulement
par une montée majeure en 16. Son vecteur nommé est un déni de service via
`images.remotePatterns` de l'Image Optimizer. **Aucun `remotePatterns` n'est
configuré ici**, et `next/image` n'est utilisé que dans un fichier. L'exposition
par ce vecteur est nulle. La montée reste à faire ; la présenter comme une
brèche ouverte serait faux.

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

⚠️ **45 écrans sur 102 sont touchés par un test.** C'est le principal chantier
restant. `/challenge` est le pire cas : deuxième écran le plus lourd
(1 229 lignes), neuf modules métier, **aucun test**.

---

## Partie 4 bis — Fonctionnement des fonctionnalités web

**8 pages publiques**, toutes en 200, en trois langues et deux thèmes (24
captures). **70 pages** dans l'espace membre `/me`. **26 routes API**.

`web` : `tsc` propre, 21 tests verts. Les 7 routes du back-office redirigent
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

Toutes protégées par le middleware (cookie JWT admin) **et** un `requireAdmin`
côté route — la double vérification est intentionnelle. `requireWriter`
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

---

## Partie 10 — Parité local / GitHub / serveur / binaires

| | état |
|---|---|
| local == `origin/main` | ✅ 0 devant, 0 derrière |
| serveur == dépôt | ✅ **vérifiable depuis aujourd'hui** |
| APK/AAB sur GitHub | ✅ présents, **mais du 29 août** |
| landing → binaires | ✅ résolution dynamique de la dernière release |

**Corrigé** : `/health` ne disait pas quel commit tourne. Un uptime de 19 heures
signifie aussi bien « à jour depuis hier » que « le dernier déploiement a échoué
sans que personne ne regarde » — la seule façon de trancher était de croire le
journal du workflow. La route expose désormais `commit`, posé au déploiement.

```bash
curl -s https://api.salorie.com/health | jq -r .commit   # doit valoir le SHA de main
git rev-parse HEAD
```

Vérifié : les deux rendent `260f1b054e55e9b8ffba0fb16cb65b5eae26dcf6`.

⚠️ **Ce correctif m'a coûté trois déploiements cassés, et la cause m'échappe
encore.** Écrire `printf ... 'GIT_COMMIT=${{ github.sha }}'` dans le corps du
script faisait échouer le workflow **au démarrage** : zéro job, aucun log,
« cannot be retried », et GitHub affichant le fichier par son chemin au lieu de
son nom. La ligne était pourtant de forme identique à ses dix voisines — relue
dans les octets que GitHub *stocke*, sans tabulation ni caractère invisible, et
le YAML validait.

Je l'ai isolé en deux poussées plutôt qu'en devinant : retirer ce seul `printf`
en gardant la modification du `grep` a fait repartir le déploiement
immédiatement. Le SHA passe maintenant par `envs:`, le mécanisme prévu par
l'action. Je ne sais toujours pas *pourquoi* l'autre forme est refusée — je
préfère l'écrire que d'inventer une explication.

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

**Reste à faire** : un `beforeSend` qui masque les clés connues des données de
santé, et des `tags` de tri (thème, langue, palier de la cascade).

---

## Ce que cet audit ne dit pas

Il ne remplace pas un utilisateur. Un écran atteignable, testé, branché et
mesuré peut parfaitement afficher une bêtise. Six défauts de cette liste
n'étaient trouvables **qu'en faisant tourner l'application** ou en interrogeant
la production — et cinq alertes ont été écartées en mesurant ce que je croyais
voir.

## Priorités

1. 🔴 **La clé RevenueCat de production** — elle bloque tout binaire, donc la
   publication et la mise à jour du téléchargement.
2. 🔴 **20 testeurs / 14 jours**.
3. 🟠 **Next 16** — la seule vulnérabilité critique.
4. 🟠 **Couverture de tests** au-delà de 45/102, en commençant par `/challenge`.
5. 🟢 **Mettre en avant ce qui existe déjà** : les 71 plats marocains et le mode
   Ramadan ne sont mentionnés nulle part sur la landing. C'est le seul avantage
   que personne ne peut copier, et il est invisible.
