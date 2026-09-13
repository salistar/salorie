# `infra/` — ce qui vit sur srv3 et n'était dans aucun dépôt

## `Caddyfile`

Le reverse proxy de srv3. C'est lui qui décide **quel conteneur sert quel
domaine** — et cette information n'existait jusqu'ici qu'à un seul endroit : la
machine.

⚠️ **C'est le défaut que cet audit a payé deux fois.** Le 13/09/2026, j'ai
supposé que `salorie.com` était servi par le conteneur `salorie-landing`. Faux :
c'est `salorie-web`. Le workflow de déploiement du dépôt landing faisait la même
supposition et partait en rouge quand le voisin allait mal. Une topologie que
personne ne peut lire est une topologie que tout le monde devine.

```
salorie.com            reverse_proxy salorie-web:3000
salorie.salistar.com   reverse_proxy salorie-landing:3000
api.salorie.com        reverse_proxy salorie-backend:4000
```

### ⚠️ Cette copie n'est PAS déployée — et c'est délibéré

Rien n'écrit ce fichier sur le serveur. Trois raisons, dans l'ordre
d'importance :

1. **Il sert trois projets.** Ses 23 blocs couvrent `salorie`, `sallysudo` et
   `salifz`. Un déploiement automatique depuis *ce* dépôt donnerait à une
   modification Salorie le pouvoir de casser les deux autres.
2. **Caddy recharge à chaud.** Un fichier invalide poussé automatiquement
   coupe *tous* les sites de la machine d'un coup, pas seulement le nôtre.
3. **Il porte l'état des certificats.** Les blocs `turn.salorie.com` et le
   routage TCP par SNI ont été construits par étapes, sur la machine, en
   vérifiant à chaque fois. Ce n'est pas un fichier qu'on régénère.

Cette copie existe donc pour qu'il **survive à la machine**, pas pour la piloter.
Exactement comme `whisper/`.

### Modifier le Caddyfile, dans le bon ordre

```bash
# 1. Éditer la copie du dépôt, la relire, la committer.
#    (elle est la référence : ce qui n'y est pas sera signalé comme dérive)

# 2. Appliquer sur le serveur, à la main, et VALIDER AVANT DE RECHARGER :
#    docker exec caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
#    docker exec caddy caddy reload   --config /etc/caddy/Caddyfile --adapter caddyfile

# 3. Vérifier qu'aucun des trois projets n'est tombé.
```

### La dérive est surveillée

`.github/workflows/caddy-derive.yml` compare chaque jour l'empreinte SHA-256 du
fichier du serveur à celle de cette copie, et **échoue si elles diffèrent**.

Sans ce contrôle, versionner ne servirait à rien : la copie se démoderait en
silence, et on lirait une topologie qui n'est plus vraie — ce qui est pire que
de n'en avoir aucune, parce qu'on lui ferait confiance.

Le contrôle ne publie **jamais** le contenu, seulement l'empreinte. Vérifié
avant versionnement : ce fichier ne contient aucun secret — il le dit d'ailleurs
lui-même (« les secrets vivent dans `.env`, jamais dans ce fichier »), et les
seules occurrences de « token » sont le nom du conteneur
`salorie-firebase-token`.

Empreinte au moment du versionnement :
`ea55ee014edc68a3673319f1d73b95583132fcd969dcbcfc29c5abf576aae6bc`
