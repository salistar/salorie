// Expo config plugin : plafonne les deux permissions de stockage heritees.
//
// POURQUOI CE PLUGIN EXISTE
//
// L'AAB livre par le CI declarait READ_EXTERNAL_STORAGE et WRITE_EXTERNAL_STORAGE
// SANS `android:maxSdkVersion` — verifie le 13 aout 2026 en lisant le manifeste du
// bundle, pas le dossier android/ local, qui est regenere a chaque `prebuild --clean`
// et ne reflete donc pas ce qui part chez Google.
//
// Le fichier DATA_SAFETY.md affirmait pourtant : « WRITE/READ_EXTERNAL_STORAGE limitees
// maxSdkVersion ». C'etait faux. Partir en revue avec une declaration Data Safety qui
// contredit le binaire est le pire des cas : Google compare les deux.
//
// CE QUE CA RISQUAIT
//
// Sur targetSdk 36, demander un acces LARGE au stockage declenche la « Photo and Video
// Permissions policy » : il faut alors remplir un formulaire de declaration justifiant
// l'acces, ou migrer vers le selecteur de photos. C'est un motif de refus courant.
//
// POURQUOI PLAFONNER PLUTOT QUE BLOQUER
//
// expo-image-picker sert dans six ecrans (scan d'etiquette, frigo, ticket de caisse,
// photos de progression, equipement, annonces). Depuis Android 13, il passe par le
// selecteur systeme et n'a besoin d'AUCUNE permission ; les deux permissions ne servent
// qu'au repli sur les versions anterieures — et minSdkVersion vaut 26, donc ce repli est
// encore atteignable. Les bloquer casserait le choix de photos sur Android 8 a 12.
//
// Les paliers sont ceux de Google : l'ecriture externe est sans effet depuis Android 10
// (29), la lecture est remplacee par READ_MEDIA_* depuis Android 13 (33).
const { withAndroidManifest } = require('@expo/config-plugins');

const PLAFONDS = {
  'android.permission.WRITE_EXTERNAL_STORAGE': '28',
  'android.permission.READ_EXTERNAL_STORAGE': '32',
};

module.exports = function withStoragePermissionCaps(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest['uses-permission'] = manifest['uses-permission'] || [];

    for (const perm of manifest['uses-permission']) {
      const nom = perm.$ && perm.$['android:name'];
      if (nom && PLAFONDS[nom]) {
        perm.$['android:maxSdkVersion'] = PLAFONDS[nom];
      }
    }
    return cfg;
  });
};
