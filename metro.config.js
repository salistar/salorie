const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
// Permet de require() les modèles .tflite comme assets bundlés
config.resolver.assetExts.push('tflite');

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
