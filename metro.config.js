const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
// Permet de require() les modèles .tflite comme assets bundlés
config.resolver.assetExts.push('tflite');
module.exports = config;
