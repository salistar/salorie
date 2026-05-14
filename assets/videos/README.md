# Videos musculation

Ce dossier contient les vidéos démo des mouvements de musculation, lues **inline** dans l'écran `/workout-details` (type=lifting).

## Fichiers attendus (30 exercices au total)

Dépose des fichiers MP4 (H.264 recommandé, < 2 Mo chacun) avec ces noms **exacts** :

### Exercices de base (6)
| Fichier              | Exercice          |
|----------------------|-------------------|
| `bench_press.mp4`    | Développé couché  |
| `squat.mp4`          | Squat             |
| `deadlift.mp4`       | Soulevé de terre  |
| `shoulder_press.mp4` | Développé épaules |
| `pullup.mp4`         | Traction          |
| `bicep_curl.mp4`     | Curl biceps       |

### Exercices additionnels (24+)
| Fichier                    | Exercice                  |
|----------------------------|---------------------------|
| `incline_bench.mp4`        | Développé incliné         |
| `dumbbell_row.mp4`         | Rowing haltère            |
| `barbell_row.mp4`          | Rowing barre              |
| `lat_pulldown.mp4`         | Tirage vertical           |
| `leg_press.mp4`            | Presse à cuisses          |
| `lunges.mp4`               | Fentes                    |
| `romanian_dl.mp4`          | Soulevé de terre roumain  |
| `tricep_dips.mp4`          | Dips triceps              |
| `tricep_pushdown.mp4`      | Extension triceps poulie  |
| `hammer_curl.mp4`          | Curl marteau              |
| `preacher_curl.mp4`        | Curl pupitre              |
| `lateral_raise.mp4`        | Élévations latérales      |
| `front_raise.mp4`          | Élévations frontales      |
| `face_pull.mp4`            | Face pull                 |
| `chest_fly.mp4`            | Écarté pectoraux          |
| `cable_crossover.mp4`      | Crossover poulie          |
| `calf_raise.mp4`           | Mollets debout            |
| `leg_curl.mp4`             | Leg curl                  |
| `leg_extension.mp4`        | Leg extension             |
| `hip_thrust.mp4`           | Hip thrust                |
| `bulgarian_split.mp4`      | Fente bulgare             |
| `plank.mp4`                | Planche                   |
| `crunches.mp4`             | Abdos crunch              |
| `russian_twist.mp4`        | Russian twist             |
| `hanging_knee.mp4`         | Relevé de genoux suspendu |

## Où trouver des vidéos légales gratuites

- **Pexels Videos** → https://www.pexels.com/videos/ (License free, commercial OK)
- **Mixkit** → https://mixkit.co/free-stock-video/fitness/
- **Coverr** → https://coverr.co/s/fitness
- **Videvo** → https://www.videvo.net/

Recommandation : clips de **3 à 10 secondes**, en **720p max**, boucles propres. Objectif : < 2 Mo par fichier pour ne pas faire exploser la taille de l'APK.

## Comment l'app les charge

Le fichier `assets/videos/registry.ts` fait le `require()` de chaque MP4. Quand tu ajoutes un fichier, tu **dois** également l'enregistrer dans `registry.ts` (sinon le bundler ne l'inclut pas).

Si un exercice n'a pas de vidéo locale, le bouton démo tombe en fallback sur un lien YouTube externe (via `Linking.openURL`).
