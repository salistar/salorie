// Expo config plugin: registers react-native-health-connect's permission
// delegate in MainActivity.onCreate. Without it, requestPermission() crashes with
// "lateinit property requestPermission has not been initialized" (the library
// expects the host app to call setPermissionDelegate in onCreate).
const { withMainActivity } = require('@expo/config-plugins');

const IMPORT = 'import dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate';
const CALL = 'HealthConnectPermissionDelegate.setPermissionDelegate(this)';

module.exports = function withHealthConnectPermissionDelegate(config) {
  return withMainActivity(config, (cfg) => {
    let src = cfg.modResults.contents;
    const isKotlin = cfg.modResults.language === 'kt';

    if (!src.includes(IMPORT)) {
      src = src.replace(/(^package .*$)/m, `$1\n${IMPORT}`);
    }
    if (!src.includes(CALL)) {
      // Insert right after the first super.onCreate(...) call.
      //
      // L'ancre s'arrete au `;` optionnel et NE consomme PAS l'espace qui suit. Avec
      // `\s*` avant la fin du groupe, la capture avalait le saut de ligne : le second
      // plugin qui insere au meme endroit (withStepCounterService) collait alors son
      // appel a la fin de CELUI-CI, sur la meme ligne, et Kotlin refusait de compiler
      // ("Unexpected tokens (use ';' to separate expressions on the same line)").
      // Invisible en local, ou le garde `includes(CALL)` saute l'insertion parce que
      // android/ existe deja : seul un `prebuild --clean` reproduisait le probleme.
      const stmt = isKotlin ? `\n    ${CALL}` : `\n    ${CALL};`;
      src = src.replace(/(super\.onCreate\([^)]*\);?)/, `$1${stmt}`);
    }
    cfg.modResults.contents = src;
    return cfg;
  });
};
