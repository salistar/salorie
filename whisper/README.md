# whisper — transcription du journal vocal

Service minuscule (deux fichiers) qui transforme un enregistrement vocal en
texte, pour que l'utilisateur puisse dicter son repas au lieu de le saisir.
`faster-whisper` en CPU int8 : beaucoup plus rapide et beaucoup moins cher que
de faire transcrire par un modèle généraliste, et le modèle est **pré-téléchargé
au build** pour que le conteneur démarre instantanément.

## ⚠ Ce répertoire n'existait QUE sur le serveur

Rapatrié dans le dépôt le **13/09/2026**, en vérifiant que tout ce qui est en
local existe bien sur GitHub et sur le serveur. Il manquait dans l'autre sens :
`whisper/Dockerfile` et `whisper/app.py` vivaient uniquement dans
`~/apps/salorie-stack/` sur srv3, et n'étaient **dans aucun dépôt**.

Deux fichiers, 1,6 Ko en tout — mais c'est le service qui fait fonctionner le
journal vocal. Si la machine disparaissait, il faudrait le réécrire, et surtout
*se souvenir qu'il existait* : rien dans le dépôt n'y faisait référence, sauf un
mot dans un commentaire de `docker-compose.override.yml`.

C'est le même défaut de fond que le `Caddyfile` de srv3, qui n'est lui non plus
versionné nulle part — voir `AUDIT-COMPLET.md`.

> ⚠️ **Le déploiement ne copie PAS ce répertoire.** La liste `source:` de
> `deploy-backend-web.yml` énumère `backend/,web/,food4k/,lib/,assets/data/…` et
> ne mentionne pas `whisper/`. Ces fichiers sont donc dans le dépôt **pour ne pas
> être perdus**, pas pour être déployés : la version qui tourne reste celle du
> serveur. Les modifier ici ne change rien en production tant que la liste n'est
> pas complétée — et la compléter demande de vérifier que la reconstruction du
> conteneur (qui retélécharge le modèle) est acceptable au milieu d'un
> déploiement.

## Contrat

| | |
|---|---|
| `GET /health` | `{ ok: true, model: "small" }` |
| `POST /transcribe` | `{ audioBase64, language? }` → `{ text, language }` |

`language` vaut `fr`, `en`, `ar`, ou rien du tout pour laisser le modèle
détecter. `vad_filter` coupe les silences avant transcription.

## ⚠ L'audio n'est jamais conservé

Le fichier temporaire est supprimé dans un `finally`, donc y compris quand la
transcription échoue. C'est ce que déclare le formulaire « Sécurité des
données » (voir `PLAY-CONSOLE.md`) : **l'audio est transcrit puis jeté, seul le
texte survit**. Cette ligne-là est la preuve de cette déclaration ; la changer
rendrait le formulaire faux.
