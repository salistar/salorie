// Expo config plugin : impose une version de NDK au projet Android entier.
//
// POURQUOI CE PLUGIN EXISTE
//
// Google Play refuse a l'envoi, depuis le 1er novembre 2025, toute nouvelle application
// ciblant l'API 35+ dont les bibliotheques natives ne sont pas alignees sur des pages de
// 16 Ko. Apres la montee en SDK 54, 25 des 26 bibliotheques de Salorie etaient conformes.
// La derniere, `libVisionCameraTflite.so` de react-native-fast-tflite, sortait a 4096.
//
// La cause est dans le build.gradle de ce paquet :
//
//     def getExtOrDefault(name) {
//       return rootProject.ext.has(name) ? rootProject.ext.get(name)
//                                        : project.properties["Tflite_" + name]
//     }
//     ndkVersion getExtOrDefault("ndkVersion")
//
// Il cherche la propriete `Tflite_ndkVersion`, alors que son gradle.properties declare
// `Tflite_ndkversion` — un « v » minuscule. Les proprietes Gradle sont sensibles a la
// casse : le repli vaut donc null, et AGP retombe sur son NDK par defaut, qui edite les
// liens sur des pages de 4 Ko. Les autres bibliotheques compilees localement echappent au
// probleme parce qu'elles passent par la configuration CMake de React Native, laquelle
// pose explicitement les drapeaux d'alignement.
//
// La premiere branche de la condition, elle, fonctionne. En definissant `ext.ndkVersion`
// a la racine, on court-circuite la coquille. A partir du NDK r28, l'alignement 16 Ko est
// le comportement par defaut a l'edition de liens : plus aucun drapeau a passer.
//
// Verifie : avec ce reglage, libVisionCameraTflite.so passe de 4096 a 16384 octets.
//
// A SAVOIR
//
// La version est ecrite en dur. Si elle n'est pas installee, Gradle la telecharge — ce
// qui rallonge le premier build d'integration continue mais ne le casse pas. Le jour ou
// react-native-fast-tflite sera monte de version (1.6.1 -> 3.x), verifier si ce plugin
// est encore necessaire : il ne l'est que tant que la coquille existe en amont.
const { withProjectBuildGradle } = require('@expo/config-plugins');

const NDK_VERSION = '29.0.13599879';
const MARKER = 'ndkVersion = "';

module.exports = function withNdkVersion(config) {
  return withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error(
        "withNdkVersion : build.gradle n'est pas en Groovy, le plugin ne sait pas l'editer.",
      );
    }
    if (cfg.modResults.contents.includes(MARKER)) return cfg;

    // Insere avant `allprojects`, present dans tout gabarit Expo, pour que la valeur
    // existe avant que le moindre sous-projet ne soit configure.
    cfg.modResults.contents = cfg.modResults.contents.replace(
      /^allprojects\s*\{/m,
      `ext {\n  ndkVersion = "${NDK_VERSION}"\n}\n\nallprojects {`,
    );
    return cfg;
  });
};
