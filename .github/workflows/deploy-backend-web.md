# `deploy-backend-web.yml` — les explications

⚠️ **Ce document existe parce que le workflow ne peut plus les contenir.**

Mesuré le 13/09/2026, par bisection en huit poussées : GitHub **refuse le
fichier au démarrage** — zéro job, aucun log, le workflow affiché par son
chemin au lieu de son nom — dès qu'il dépasse une taille comprise **entre
32 359 et 32 503 octets**. La séparation est nette :

```
32 219 o ✓   32 345 o ✓   32 358 o ✓   32 359 o ✓
32 503 o ✗   32 643 o ✗   33 662 o ✗   34 265 o ✗
```

La longueur des LIGNES ne corrèle pas : une version dont la plus longue ligne
faisait 182 caractères a été refusée, une autre à 281 est passée. `js-yaml` et
le validateur de schéma Actions trouvent le fichier valide dans tous les cas.

C'est probablement aussi l'explication de l'échec d'août 2026, noté dans
`AUDIT-COMPLET.md` comme non résolu : le fichier était déjà au bord, et une
ligne de plus le faisait basculer.

**282 des 530 lignes étaient du commentaire.** Ils sont ici ; le YAML garde un
renvoi d'une ligne. Rien n'est perdu, et le fichier respire.

## §1 — concurrency:

⚠ DEUX DEPLOIEMENTS SIMULTANES ECRIRAIENT DANS LE MEME REPERTOIRE DU VPS.
Le job copie les sources puis lance `docker compose up --build` — deux runs
qui se chevauchent melangeraient deux arbres de fichiers pendant la copie, et
construiraient une image a partir du resultat.

⚠ ET ICI, `cancel-in-progress` EST A FALSE, CONTRAIREMENT AU BUILD ANDROID.
Interrompre un deploiement en cours de route est pire que de le laisser
finir : on ne sait pas ou il s'est arrete — entre la purge et la copie, le
conteneur backend serait recree sans ses sources. Les deploiements font donc
la QUEUE, ils ne s'annulent pas.

## §2 — Purge des repertoires possedes par le depot

1) Copy the stack to the VPS (source only — node_modules/.next are .dockerignored).
scp OVERWRITE mais ne SUPPRIME jamais (`rm: false`, voulu : le dossier
cible porte .env et l'override compose, qu'un rm global emporterait).
Consequence decouverte le 20/08/2026 : l'ancien web/app/page.tsx a
survecu a son deplacement vers /admin, deux pages se sont disputees
la racine, et le conteneur a servi un 500. On purge donc AVANT l'envoi
les repertoires que le depot possede EN ENTIER — et eux seuls.

## §3 — rm -f web/middleware.ts

⚠ ET UN FICHIER, PARCE QUE LA REGLE CI-DESSUS NE COUVRE QUE DES
REPERTOIRES. `web/middleware.ts` a ete renomme `web/proxy.ts` le
10/09/2026 (Next 16 deprecie la convention `middleware`). L'envoi
qui suit AJOUTE des fichiers, il n'en supprime aucun : l'ancien
serait reste a cote du nouveau, et Next aurait execute le PORTAIL
D'AUTHENTIFICATION perime — celui qui laissait passer
`/users/<courriel>` sans session.
A retirer quand plus aucun VPS n'aura connu l'ancien nom.

## §4 — source: "backend/,web/,food4k/,lib/,assets/data/,docker-compose.yml,do

docker-compose.override.yml et food4k/ ajoutes le 13 aout 2026. Ils n'existaient
QUE sur le serveur : l'override porte la topologie reelle de prod (container_name,
reseau `edge`, sidecar food4k) et food4k/ est le classifieur tier-0 du scan.
Sans eux, une reconstruction du serveur depuis ce depot repartait sans le tier
gratuit et avec un backend injoignable par Caddy.
Le modele .onnx (212 Mo) reste hors git — trop gros pour GitHub. Il est publie
en asset de Release et telecharge au build (cf. food4k/Dockerfile).
`lib/` et `assets/data/` ajoutes le 19 aout 2026. Les pages de /me
IMPORTENT des modules de calcul du depot mobile (nutriScore, readiness,
panierSouk, ramadanAssiettes, sadaqaCalcul) et deux tables de donnees,
au lieu d'en garder des copies qui divergeraient. Ces regles annoncent
des chiffres a quelqu'un : un Nutri-Score, un score de forme.

Sans ces deux repertoires, le build du conteneur `web` echoue sur le
serveur avec « /lib: not found » — alors qu'il passe en local, ou tout
le depot est present. C'est ce qui a bloque six deploiements d'affilee.

## §5 — envs: SALORIE_SHA

Le SHA deploye, relu par GET /health : sans lui, seul l'uptime etait
visible, et un uptime ne distingue pas "a jour" de "le dernier
deploiement a echoue sans que personne ne regarde".

Il passe par `envs`, le mecanisme prevu par l'action, et NON par un
`${{ }}` ecrit dans le corps du script. Trois tentatives de cette
seconde forme ont fait echouer le workflow AU DEMARRAGE — zero job,
aucun log, "cannot be retried" — alors que la ligne etait de forme
identique a ses dix voisines et que le YAML validait. La cause
exacte m'echappe ; le contournement, lui, est mesure.

## §6 — touch .env

.env ADDITIF depuis le 13 aout 2026. Avant, la premiere ligne utilisait `>`
et REECRIVAIT le fichier de zero : toute variable posee a la main sur le
serveur (un FOOD4K_MIN_CONF ajuste, un reglage de debogage) disparaissait au
deploiement suivant, sans trace et sans message. On ne remplace desormais que
les cles gerees par ce workflow et on preserve tout le reste.

## §7 — grep -vE '^ *(export +)?(FIREBASE_SERVICE_ACCOUNT|GEMINI_API_KEY|USDA_

⚠ TOUTE CLE REECRITE PLUS BAS DOIT ETRE FILTREE ICI.
Sinon elle n'est jamais retiree et s'empile : le .env de production
faisait 1 924 LIGNES POUR 28 CLES, dont 205 copies d'ADMIN_API_KEY.
dotenv retient la derniere, donc la valeur servie restait juste —
mais le fichier gardait EN CLAIR toute valeur qu'une cle a eue.
Une rotation qui ne retire pas l'ancien secret n'en est pas une.
`scripts/verifier-env-deploiement.js` refuse un oubli, en CI.

⚠ ET CETTE LIGNE DOIT RESTER COURTE. A 425 caracteres GitHub REFUSE
le fichier au demarrage : zero job, aucun log, workflow affiche par
son chemin. A 281 il demarre. Isole par bisection le 13/09/2026 —
js-yaml et le validateur de schema Actions le trouvent valide tous
les deux. D'ou la CLASSE `NEXT_PUBLIC_[A-Z_]+` plutot que les dix
noms ecrits un par un.

⚠ QUATRE CLES SONT VOLONTAIREMENT ABSENTES : MONGO_PASS (ecrite une
seule fois, la filtrer ferait perdre la base), TURN_SECRET (retiree
seulement lors d'une rotation), MONGO_URI et MONGO_CMD (qui font
deja leur propre sed).

## §8 — printf '%s\n' 'ADMIN_API_KEY=${{ secrets.ADMIN_API_KEY }}' >> .env.nex

Cloudflare Workers AI — tier 2 de la cascade de vision, juste apres food4k.
Ajoute le 13 aout 2026 : les deux variables etaient VIDES en production, donc
`tryCloudflare` sortait immediatement et Ollama (CPU, lent) restait le seul
repli reel. Mesure du jour : @cf/meta/llama-3.2-11b-vision-instruct repond en
HTTP 200 pour ~1 neurone par appel, sur 10 000 neurones/jour gratuits.
ADMIN_API_KEY protege les routes admin ET le webhook du pipeline. Absente du
serveur jusqu'au 13 aout 2026 — reclamee depuis le 29 juillet — elle laissait
POST /pipeline/webhook-sink ouvert a tout Internet.

## §9 — printf '%s\n' 'FOOD4K_MIN_CONF=${{ vars.FOOD4K_MIN_CONF || '0.80' }}' 

⚠ SEUILS DU TIER-0 : REPRIS EN MAIN PAR LE DEPLOIEMENT LE 31/08/2026.

Ils etaient poses A LA MAIN dans ce .env, que ce workflow preserve
expressement. Consequence : deux changements du depot — dans le code,
puis dans docker-compose.override.yml — n'ont RIEN produit, et deux
mesures ont ete attribuees a un reglage qui n'avait pas pris. Sonde du
31/08 : une reponse du tier-0 servie a 0,53 de confiance, sous les 0,60
du compose comme sous les 0,90 du code.

C'est un renoncement ASSUME au principe « les reglages du serveur
survivent » : pour ces deux cles precisement, une valeur invisible qui
gagne en silence a coute plus cher que la souplesse qu'elle offrait. Les
ajuster passe desormais par les VARIABLES du depot (Settings > Variables),
ou par ce fichier — les deux sont lisibles et versionnes.

Le filtre ci-dessus tolere « export X= » et « X : » : le sed manuel du
31/08 n'avait rien remplace, probablement pour une de ces formes.

## §10 — printf '%s\n' 'MAIL_INGEST_KEY=${{ secrets.MAIL_INGEST_KEY }}' >> .env

ADMIN_SETUP_KEY : RETIREE le 27/08/2026.

Elle rouvrait /register a un compte de plus, et servait d'unique issue
si le mot de passe du back-office etait perdu — les mots de passe
etant en bcrypt, donc illisibles.

Cette issue n'est plus l'unique : depuis le 27/08 les DEUX comptes
sont owner et se connectent par Google, et idriss.kriouile.pro garde
son mot de passe. Deux chemins independants subsistent donc.

Sans cette variable, /api/auth/register repond 403 « Inscription
fermee » — le bon defaut. Un nouvel administrateur se cree desormais
depuis la page /admins, avec journal d'audit, plutot que par une cle
partagee qui trainait dans les secrets du depot.

Pour la retablir en urgence : reposer le secret ADMIN_SETUP_KEY et
decommenter la ligne ci-dessous.
printf '%s\n' 'ADMIN_SETUP_KEY=${{ secrets.ADMIN_SETUP_KEY }}' >> .env.next
MAIL_INGEST_KEY : cle partagee avec l'Email Worker Cloudflare qui poste les
mails de support@salorie.com sur POST /support-mail/ingest. Sans elle,
l'endpoint est ferme et les mails n'arrivent que sur le Gmail (forward).

## §11 — printf '%s\n' 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=${{ secrets.EXPO_PUBL

Espace personnel /me (14 aout 2026). AUCUN nouveau secret : on reutilise
les EXPO_PUBLIC_* deja en place pour l'app mobile, simplement renommes au
prefixe que Next.js exige. C'est volontaire et c'est le coeur du chantier :
une seule instance Clerk et un seul projet Firebase pour les deux clients,
donc le meme compte, le meme uid, le meme document Firestore.

## §12 — if [ "${{ inputs.rotation_turn }}" = "true" ]; then

TURN_SECRET (15 aout 2026) — secret PARTAGE entre coturn et le backend.
Il est genere ICI, sur le serveur, et jamais ailleurs : ni dans le depot
(public), ni dans les secrets GitHub, ni dans un presse-papier. Personne
n'a besoin de le connaitre, pas meme pour l'installer. Il est ADDITIF —
une fois pose, les deploiements suivants le conservent, sinon toutes les
sessions vocales en cours seraient invalidees a chaque livraison.
ROTATION DELIBEREE. Le secret est conserve par defaut (voir ci-dessus) :
le regenerer a chaque livraison invaliderait toutes les sessions vocales
en cours. Mais il faut pouvoir le faire tourner — le 21/08/2026 il a ete
expose en clair dans un journal d Actions d un depot PUBLIC, par un
`docker inspect` de coturn. Un secret vu une fois est un secret mort.

On le RETIRE ici ; le bloc suivant en genere un neuf, sur le serveur,
avec `openssl rand`. Il ne transite donc par aucun journal, aucun secret
GitHub, aucun presse-papier — exactement comme a la premiere installation.
Consequence assumee : les appels en cours tombent le temps du redemarrage.

## §13 — sed -i '/^TURN_TLS_PORT=/d' .env 2>/dev/null || true

TURN_TLS_PORT : le backend n'annonce l'adresse `turns:` que si elle
existe. Elle passe EN TETE de la liste ICE — quand un client en a
besoin, c'est qu'il n'a rien d'autre, et un client presse s'arrete au
premier serveur qui repond. Posee ici et non laissee au hasard d'un
.env : coturn ecoute 5349 depuis le compose du depot, les deux doivent
s'accorder ou l'un annonce ce que l'autre n'ouvre pas.
443 EN PREMIER : c'est le port que meme les reseaux les plus fermes
laissent sortir. coturn y est joignable depuis le 22/08/2026, par
routage TCP selon le SNI dans Caddy (le port reste a Caddy, qui n'y
envoie que ce qui annonce turn.salorie.com). Le 5349 suit : c'est le
port standard du TURN sur TLS, et rien ne dit qu'un pare-feu qui
bloque l'un bloque l'autre.
Reecrit a chaque deploiement, et non « pose si absent » : la valeur a
change une fois, elle rechangera.

## §14 — CD=/data/caddy/certificates/acme-v02.api.letsencrypt.org-directory/tur

Certificat du TURN sur TLS. On COPIE les fichiers que Caddy renouvelle
pour turn.salorie.com : les monter en place ne marche pas, l'image
coturn tourne en `nobody` (65534) et le magasin de Caddy est en
`drwx------ root`. `docker cp` passe par le demon, qui est root, donc
il lit ce que l'utilisateur de deploiement ne peut pas lire.

Refait a CHAQUE deploiement : Caddy renouvelle tous les deux mois et
coturn ne relit ses fichiers qu'au demarrage. Si les deploiements
s'espacaient au-dela de deux mois, il servirait un certificat expire —
a surveiller, ou a confier a une tache periodique.

## §15 — if docker run --rm --volumes-from caddy -v "$PWD/certs-turn:/c" alpine

UN SEUL conteneur root fait tout : il lit le magasin de Caddy
(`--volumes-from`), ecrit dans le repertoire protege, et donne les
fichiers a `nobody`. L'utilisateur de deploiement n'a de sudo ni
d'acces a l'un ni a l'autre — le demon docker, si.
Le REPERTOIRE compte autant que les fichiers : sans droit de traversee,
coturn recoit « Permission denied » sur /certs/ et rapporte « cannot
find certificate file » — un refus d'acces deguise en fichier absent.

## §16 — EMPREINTE_APRES="$(cat certs-turn.empreinte 2>/dev/null || echo absent

coturn ne relit ses certificats qu'au DEMARRAGE, et `docker compose
up -d` ne recree un service que si sa configuration a change — le
certificat, lui, change sans que le compose bouge. On redemarre donc
coturn, mais UNIQUEMENT si le fichier a reellement change : un
redemarrage systematique couperait les appels relayes en cours a
chaque livraison, ce que tout le reste de ce workflow evite.

## §17 — if docker exec salorie-coturn sh -lc 'netstat -lnt 2>/dev/null | grep 

Deux raisons de redemarrer, et deux seulement :
 · le certificat a change (renouvellement Caddy) ;
 · coturn n'ecoute PAS en TLS alors qu'il le devrait — cas d'un
   demarrage anterieur a la mise en place des droits, ou d'une
   configuration corrigee sans que docker recree le service.
Ce second test rend l'etape auto-reparatrice : un `docker compose
up -d` ne recree un service que si sa configuration RESOLUE change,
et un commentaire n'en fait pas partie — j'ai cru le forcer ainsi,
sans effet (21/08/2026).

## §18 — grep -vE '^TURN_PUBLIC_IP=' .env > .env.ip || true

coturn est passe derriere la traduction d'adresse de Docker (ports
publies au lieu du mode host, 15 aout 2026). Il doit donc annoncer
l'adresse PUBLIQUE dans ses candidats ICE : sans elle il proposerait
son IP de conteneur, que personne ne peut joindre. Reecrite a chaque
deploiement — c'est l'IP du serveur, elle ne se devine pas mais elle
est connue d'ici.

## §19 — if ! docker compose ps --status running --format '{{.Service}}' 2>/dev

── MongoDB : une serrure, pas seulement une porte fermee ────────

Mongo n'est publie sur aucun port de l'hote et ne vit que sur le
reseau docker interne : il faut deja etre sur la machine pour lui
parler. Mais « il faut deja etre dedans » n'est pas une serrure —
n'importe quel conteneur du meme reseau, ou n'importe quel
processus ayant obtenu un shell, lisait et ecrivait TOUT sans
avoir a se presenter.

Le mot de passe est genere ICI, sur le serveur, comme TURN_SECRET :
il ne transite par aucun journal, aucun secret GitHub, aucun
presse-papier. En hexadecimal, donc sans un seul caractere a
echapper dans une URI de connexion.

## §20 — POSER='

Le mot de passe passe par l'ENVIRONNEMENT du conteneur, jamais par
la ligne de commande : `docker exec ... -u salorie -p <secret>`
serait lisible dans `ps` par tout processus de la machine.

Le meme script sert avant et apres l'activation : `auth()` echoue
sans consequence quand l'authentification n'est pas encore active
(il n'y a rien a prouver), et il est indispensable ensuite.
⚠ On SORT des que le mot de passe du .env est accepte, et c'est
essentiel : le compte `salorie` n'a que `readWrite` sur SA base.
Il peut s'authentifier, il ne peut pas se modifier lui-meme.
Ma premiere version appelait `updateUser` a chaque passage : elle
a marche a la premiere pose (authentification encore inactive,
donc tous les droits) et a fait echouer TOUS les deploiements
suivants sur « not authorized on admin to execute updateUser ».
Une etape qui ne marche que la premiere fois.

Rien a mettre a jour de toute facon : le mot de passe vit dans le
.env et n'y change pas. `auth()` qui passe = compte en place.

## §21 — fantomes=$(docker ps -a --format '{{.Names}}' | grep -E '^[0-9a-f]{12}

⚠ CONTENEURS FANTOMES — la panne du 27/08/2026.
Quand Docker remplace un conteneur mais n'arrive pas a supprimer
l'ancien, il le RENOMME en « <id_court>_<nom> » et le laisse la.
Au deploiement suivant, compose veut reutiliser ce nom, tombe sur
le fantome et echoue :
  Conflict. The container name "/843ed059fe47_salorie-food4k"
  is already in use
Les images etaient pourtant construites : seul l'echange final
ratait, donc le site continuait de servir l'ANCIENNE version alors
que le workflow annoncait un echec dont la cause semblait ailleurs.

On ne supprime que les noms PREFIXES par un id hexadecimal, jamais
les conteneurs normaux : un `docker rm` trop large couperait la
production.

## §22 — sleep 40

`docker compose up -d` rend 0 des que les conteneurs sont LANCES, meme si
l'un d'eux meurt aussitot. Le 4 aout 2026, le backend sortait en code 1 a
chaque demarrage — point d'entree introuvable — et Docker le relancait en
boucle : l'API a renvoye 502 pendant que cette etape s'affichait en vert.
On laisse 40 s aux conteneurs pour se stabiliser, puis on refuse tout
service qui n'est pas reste debout.
