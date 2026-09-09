const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
// Permet de require() les modèles .tflite comme assets bundlés
config.resolver.assetExts.push('tflite');

// ⚠ NE PAS SURVEILLER LE PROJET NEXT.JS NI LES CORPUS D'ENTRAINEMENT.
// `web/` est une application a part, et son dossier `.next/` se reecrit en
// permanence quand `npm run dev` tourne a cote. Metro le suivait : au demarrage
// du 09/09/2026 il a craché vingt-quatre lignes « Error "ENOENT" reading
// contents of web\.next\types\app\... » — il listait des dossiers que Next venait
// de supprimer sous ses pieds.
//
// Ce n'est pas que du bruit. Metro indexe l'arbre entier avant de bundler, et
// les corpus d'images pesent des dizaines de milliers de fichiers qui
// n'appartiennent a aucun bundle. Les exclure raccourcit le demarrage et retire
// une source d'erreurs qui n'en sont pas.
config.resolver.blockList = [
  /[\\/]web[\\/]\.next[\\/].*/,
  /[\\/]corpus-[^\\/]*[\\/].*/,
  /[\\/]food4k[\\/](?:corpus|modeles|rapports)[\\/].*/,
  /[\\/]captures-[^\\/]*[\\/].*/,
  /[\\/]coverage[\\/].*/,
];

// `@shopify/flash-list` est redirigé vers un équivalent local sans code natif.
// FlashList 2 lève une erreur FATALE au chargement du module hors « nouvelle
// architecture » — l'application meurt, elle ne se dégrade pas. Nos écrans ne
// l'importent plus, mais `react-native-ruler-picker` le fait dans ses sources, ce qui
// faisait planter l'écran de mise à jour du poids. L'alias couvre donc AUSSI les
// dépendances, ce qu'un remplacement écran par écran ne peut pas faire.
// Voir components/FlashListCompat.tsx. À retirer lors du passage à la nouvelle
// architecture.
const FLASH_LIST_COMPAT = path.resolve(__dirname, 'components/FlashListCompat.tsx');
const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@shopify/flash-list' || moduleName.startsWith('@shopify/flash-list/')) {
    return { type: 'sourceFile', filePath: FLASH_LIST_COMPAT };
  }
  return upstreamResolveRequest
    ? upstreamResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
