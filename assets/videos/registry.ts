// Les vidéos ne sont PLUS embarquées : elles sont servies depuis srv3 et mises en cache
// au premier visionnage. Voir lib/exerciseVideos.ts.
//
// Ce fichier ne contient volontairement plus aucun `require('./x.mp4')` : c'est ce
// require statique qui faisait inclure les 76 Mo par Metro. Les .mp4 restent dans
// assets/videos/ comme SOURCE d'envoi vers le serveur, mais ne partent plus dans l'APK.
//
// Conservé comme point de compatibilité — le code appelle désormais hasVideo() /
// getVideoSource() de lib/exerciseVideos.
export { VIDEO_IDS, hasVideo, getVideoSource, cacheInBackground, primeCacheIndex } from '../../lib/exerciseVideos';
