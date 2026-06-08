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
      const stmt = isKotlin ? `\n    ${CALL}` : `\n    ${CALL};`;
      src = src.replace(/(super\.onCreate\([^)]*\)\s*;?)/, `$1${stmt}`);
    }
    cfg.modResults.contents = src;
    return cfg;
  });
};
