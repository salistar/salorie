# Infrastructure des appels — ce qui est en place et pourquoi

Dernière mise à jour : 24 août 2026.

Ce fichier existe parce que la configuration décisive **ne vit pas dans ce
dépôt** : le Caddyfile est sur srv3 (`$HOME/caddy/Caddyfile`), partagé avec
d'autres projets. Sans ces notes, personne ne peut deviner depuis le code
pourquoi le port 443 se comporte ainsi.

## Comment un appel traverse le réseau

| Chemin | Port | Couvre |
|---|---|---|
| STUN | 3478 UDP | la majorité des connexions — le pair-à-pair suffit |
| TURN en clair | 3478 UDP/TCP | derrière un NAT symétrique |
| TURN sur TLS | 5349 TCP | réseaux qui inspectent le trafic |
| **TURN sur TLS** | **443 TCP** | **réseaux d'entreprise qui n'ouvrent que le 443** |

Le backend annonce les deux adresses `turns:` par `TURN_TLS_PORT=443,5349`,
443 en premier : quand un client en a besoin, c'est qu'il n'a rien d'autre.

## Le partage du port 443

Caddy est construit avec le module `layer4` et aiguille chaque connexion TCP du
443 **avant tout déchiffrement**, sur le seul nom annoncé (SNI) :

```
443 TCP ─┬─ SNI = turn.salorie.com ──→ salorie-coturn:5349
         └─ tout le reste ───────────→ Caddy HTTP (127.0.0.1:8443)
```

Trois détails sans lesquels cela ne marche pas :

- **coturn est sur le réseau `edge`** (`docker-compose.override.yml`). Sans cela
  Caddy ne résout même pas son nom.
- **`proxy_protocol` dans les deux sens.** Le trafic arrive par un relais local ;
  sans lui, les 12 vhosts de la machine verraient tous leurs visiteurs comme
  `127.0.0.1` dans leurs journaux.
- **`https_port 8443`** : Caddy passe derrière layer4.

## HTTP/3 est désactivé — c'est un choix, pas un oubli

`layer4` ne traite que le TCP. Caddy annoncerait sinon un service QUIC sur
8443/udp que rien ne publie : chaque navigateur tenterait, échouerait, puis
retomberait sur TCP — plus lent que de ne rien annoncer.

Rendre HTTP/3 demanderait de séparer les écouteurs TCP et UDP de Caddy, ce que
le Caddyfile n'exprime pas (`https_port` déplace les deux). C'est possible en
configuration JSON, sur un proxy qui sert trois projets.

**Arbitrage tranché le 24/08/2026 : les appels qui traversent les réseaux
fermés valent plus que QUIC.** Si vous inversez ce choix, il faut aussi retirer
`443` de `TURN_TLS_PORT`, sans quoi le backend annoncera une adresse morte.

## Le certificat

Caddy obtient et renouvelle celui de `turn.salorie.com` — un bloc existe dans
son Caddyfile pour cela seul. Mais **coturn ne relit ses fichiers qu'au
démarrage**, et son magasin est en `drwx------ root` alors que coturn tourne en
`nobody` : les fichiers sont donc copiés dans `certs-turn/` et donnés à
`nobody`, par un conteneur root jetable.

`.github/workflows/turn-certificat.yml` le refait chaque lundi et ne redémarre
coturn que si l'empreinte a changé — un redémarrage systématique couperait les
appels en cours. Il vérifie ensuite depuis l'extérieur, sur les deux ports, que
le certificat servi est bien le bon : sinon il pourrait réussir sans avoir rien
renouvelé.

## Retour arrière

Sur srv3, dans `$HOME/caddy` : `Caddyfile.avant-l4` et
`docker-compose.yml.avant-l4`, image d'origine `caddy:2-alpine`.

## Ce qui reste ouvert

- **MongoDB accepte les connexions sans authentification.** Aucun port n'est
  publié et le réseau est interne, donc il faut déjà être sur la machine — mais
  la défense en profondeur manque.
- **L'amitié ne demande aucun accord.** On peut s'ajouter à la liste d'amis de
  quelqu'un en connaissant son adresse e-mail, et l'amitié ouvre l'accès aux
  appels du duo. Les règles Firestore bornent correctement l'écriture ; c'est la
  conception qu'il faut trancher.
- **Les règles Firestore ne se déploient pas** : le compte de service n'a pas le
  rôle `Firebase Rules Admin` (403).
