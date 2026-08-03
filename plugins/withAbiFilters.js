// Expo config plugin : limiter les architectures natives embarquees a l'ARM.
//
// POURQUOI CE PLUGIN EXISTE
//
// L'APK de release pesait 187 Mo, dont 131 Mo de bibliotheques natives reparties sur
// QUATRE architectures :
//
//     37,1 Mo  lib/x86_64
//     37,1 Mo  lib/x86
//     35,2 Mo  lib/arm64-v8a
//     21,7 Mo  lib/armeabi-v7a
//
// Le projet passait pourtant `-PreactNativeArchitectures=arm64-v8a`. Ce drapeau ne pilote
// que ce que React Native COMPILE lui-meme : les binaires deja compilis livres par les
// dependances (ML Kit, TensorFlow Lite) arrivent pour toutes les architectures et sont
// empaquetes quand meme. C'est `abiFilters`, au niveau du module, qui filtre a
// l'empaquetage — et expo-build-properties ne l'expose pas.
//
// CE QUE CE CHOIX IMPLIQUE
//
// x86 et x86_64 ne servent qu'aux emulateurs et a quelques appareils Android sur
// processeur Intel — Chromebooks pour l'essentiel. Les exclure rend l'application
// indisponible pour eux sur le Play Store. Pour une application de nutrition et de sport
// utilisee sur telephone, l'echange est favorable : environ 74 Mo d'AAB en moins.
//
// A savoir : Play decoupe deja l'AAB par appareil a la livraison, donc un utilisateur ne
// telechargeait pas ces 74 Mo. Le gain porte sur le poids de l'AAB depose et sur la duree
// de compilation, pas sur ce que telecharge l'utilisateur final.
const { withAppBuildGradle } = require('@expo/config-plugins');

const ABIS = ["'armeabi-v7a'", "'arm64-v8a'"];
const MARKER = 'abiFilters';

module.exports = function withAbiFilters(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error("withAbiFilters : build.gradle n'est pas en Groovy.");
    }
    let src = cfg.modResults.contents;

    // Test d'etat sur un marqueur litteral, jamais sur un motif a portee large : un
    // motif paresseux traversant les blocs a deja fait echouer deux plugins de ce projet.
    if (src.includes(MARKER)) return cfg;

    const before = src;
    src = src.replace(
      /(defaultConfig\s*\{\s*\n\s*applicationId[^\n]*\n)/,
      `$1        ndk {\n            abiFilters ${ABIS.join(', ')}\n        }\n`,
    );
    if (src === before) {
      throw new Error(
        'withAbiFilters : bloc defaultConfig introuvable — le gabarit Expo a change, ' +
          'le plugin doit etre mis a jour avant de publier.',
      );
    }

    cfg.modResults.contents = src;
    return cfg;
  });
};
