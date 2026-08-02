// Configuration Expo DYNAMIQUE — étend app.json, ne le remplace pas.
//
// POURQUOI CE FICHIER EXISTE : la clé Maps vivait en dur dans
// `android/app/src/main/AndroidManifest.xml`. Or la CI exécute `expo prebuild --clean`,
// qui SUPPRIME et régénère tout le dossier `android/` à partir d'app.json et des plugins.
// La clé écrite à la main y disparaissait donc silencieusement : les APK produits par la
// CI n'avaient aucune clé Maps, alors que les builds locaux fonctionnaient. Divergence
// invisible tant qu'on ne publie que depuis sa machine.
//
// En la déclarant ici, Expo l'injecte lui-même dans le manifeste à chaque prebuild —
// local ET CI se comportent enfin pareil.
//
// La valeur vient de l'ENVIRONNEMENT, jamais du dépôt. DEUX noms sont acceptés, et ce
// n'est pas une coquetterie :
//   • en CI    : `GMAPS_ANDROID_KEY`, secret GitHub exposé à l'étape prebuild.
//   • en local : `EXPO_PUBLIC_GOOGLE_MAPS_KEY`, le nom que porte déjà la clé dans `.env`
//     (non versionné) parce que le code mobile la lit aussi à l'exécution.
// N'accepter que le premier nom reproduisait le bug d'origine en le déplaçant : les builds
// LOCAUX recevaient une clé vide, personne ne s'en apercevant avant d'ouvrir la carte.
// Une clé absente ne casse pas le build : seule la carte est inerte, ce qui est
// préférable à un échec de compilation pour une fonctionnalité secondaire.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    config: {
      ...(config.android && config.android.config),
      googleMaps: {
        apiKey:
          process.env.GMAPS_ANDROID_KEY ||
          process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY ||
          '',
      },
    },
  },
});
