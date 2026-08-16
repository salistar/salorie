# Revenir en arrière

À lire **avant** de paniquer, pas pendant.

## Le point de retour

    git tag point-sur-avant-webrtc   →  ea0673a

C'est le dernier état **vérifié sur appareil** avant l'ajout du moindre module
natif nouveau. Build release verte : run `31950700655`. Contrôlé à l'écran sur
`R83L20HWJTE` : démarrage, connexion Clerk + Firebase, affichage arabe, les deux
barres de navigation, le paywall, la caméra OCR.

Tout ce qui suit ce tag touche au natif. C'est précisément ce qui peut casser
d'une façon qu'aucun test ne voit — parce que les tests tournent sur Node, pas
sur un téléphone.

## Ce qui peut mal tourner, par ordre de probabilité

**1. L'application ne démarre plus après l'ajout d'un module natif.**
Le symptôme est un plantage immédiat, avant même l'écran vert. Regarder
`adb logcat` juste après le lancement : chercher `FATAL` et le nom du module.

**2. La build échoue à l'édition de liens.**
`react-native-webrtc` embarque des binaires par architecture. Le projet filtre
les architectures via `plugins/withAbiFilters.js` (arm64 et armeabi uniquement).
Si le module n'expose pas ces deux-là, l'édition de liens échoue — ça se voit
dans le journal Gradle, pas au typecheck.

**3. L'APK grossit trop.**
WebRTC pèse lourd. Comparer avant/après : l'APK était à **62 Mo** après R8.
Au-delà de ~90 Mo, l'installation en 4G devient un frein réel sur le marché visé.

**4. Une permission apparaît sans qu'on l'ait demandée.**
`react-native-webrtc` ajoute `CAMERA`, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`.
Toute permission non déclarée dans le formulaire de sécurité de Play fait
refuser la mise à jour. Vérifier le manifeste généré **avant** de soumettre :

    grep uses-permission android/app/src/main/AndroidManifest.xml

## La procédure

### a. Revenir au code seul

```bash
git revert --no-commit <sha-du-commit-fautif>
git commit -m "Retour arriere : <ce qui cassait>"
```

`revert` et non `reset` : l'historique reste lisible et rien n'est perdu. Un
`reset --hard` sur une branche déjà poussée oblige tout le monde à réparer son
dépôt.

### b. Revenir au natif aussi

Le code seul ne suffit pas si `package.json` a changé. Il faut aussi :

```bash
git checkout point-sur-avant-webrtc -- package.json package-lock.json app.json
npm ci
npx expo prebuild --clean
```

`prebuild --clean` **régénère `android/`**. Toute modification faite à la main
dans ce dossier est perdue — c'est voulu, c'est ce qui garantit qu'on repart
d'un état propre. Les réglages du projet vivent dans `app.json` et dans
`plugins/`, jamais dans `android/`.

### c. Remettre une build connue sur le téléphone

```bash
gh run download 31950700655 -n salorie-apk-ea0673a... -D ./apk
adb install -r ./apk/app-release.apk
```

⚠️ **Ne jamais désinstaller pour contourner un refus d'installation.** La
désinstallation efface les données locales de l'utilisateur. Si les signatures
ne correspondent pas, c'est qu'on tente d'installer une build *debug* par-dessus
une *release* : reprendre l'artefact du bon workflow (`android-release.yml`).

## Ce qui ne se rejoue pas

Un retour arrière du code **ne défait pas** :

- les données déjà écrites dans Firestore ou Mongo ;
- les migrations côté serveur ;
- une soumission déjà envoyée au Play Store.

Pour ces trois-là, il n'y a pas de bouton. C'est la raison pour laquelle le
natif se teste sur appareil **avant** de soumettre, pas après.

## Vérifier qu'on est bien revenu

Ces quatre points, dans cet ordre. Le premier qui échoue arrête le reste.

```bash
npx tsc --noEmit                      # le code compile
npx jest --silent                     # la logique tient
adb logcat -c && adb shell am start -n com.idriss.kriouile.salorie/.MainActivity
adb logcat -d | grep -i fatal         # doit être VIDE
```

Puis à l'œil, sur le téléphone : l'écran vert passe, le compte est reconnu, et
la barre d'onglets ne se cache pas derrière celle d'Android. Ces trois-là ont
déjà cassé une fois chacun.
