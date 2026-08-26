// Expo config plugin: registers react-native-health-connect's permission
// delegate in MainActivity.onCreate. Without it, requestPermission() crashes with
// "lateinit property requestPermission has not been initialized" (the library
// expects the host app to call setPermissionDelegate in onCreate).
//
// Il declare AUSSI l'alias que Health Connect exige depuis Android 14 — voir le
// second bloc, plus bas.
const { withMainActivity, withAndroidManifest } = require('@expo/config-plugins');

const IMPORT = 'import dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate';
const CALL = 'HealthConnectPermissionDelegate.setPermissionDelegate(this)';

/**
 * Android 14+ : sans cet alias, Health Connect REFUSE d'afficher son ecran.
 * ---------------------------------------------------------------------------
 * Le manifeste ne declarait que la forme ancienne :
 *
 *     <action android:name="androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE"/>
 *
 * Elle vaut pour Android 13 et anterieur. Depuis Android 14, Health Connect est
 * integre au systeme et cherche un tout autre point d'entree : une activite
 * repondant a VIEW_PERMISSION_USAGE dans la categorie HEALTH_PERMISSIONS. Sans
 * elle, il ouvre son controleur de permissions et le referme dans la seconde,
 * sans un mot.
 *
 * Constate le 26/08/2026 sur un Galaxy A07 sous Android 16 : appui sur
 * « Connecter Health Connect », le journal montre
 * `noteStopComponent(): com.google.android.permissioncontroller` — ouvert puis
 * arrete aussitot — et l'ecran retombe sur « Autorise l'acces aux Pas […] puis
 * reviens », un conseil impossible a suivre puisque l'ecran ne s'ouvre jamais.
 *
 * Autrement dit : la synchronisation sante ne pouvait etre accordee sur AUCUN
 * telephone recent. Les quatre permissions restaient a `granted=false` pour
 * toujours.
 *
 * `android:permission` est obligatoire : elle garantit que seul le systeme peut
 * lancer cet alias. Sans elle, Android refuse l'installation de l'APK.
 */
function ajouterAliasSante(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application[0];
    app['activity-alias'] = app['activity-alias'] || [];

    const NOM = 'ViewPermissionUsageActivity';
    if (app['activity-alias'].some((a) => a.$ && a.$['android:name'] === NOM)) {
      return cfg;
    }

    app['activity-alias'].push({
      $: {
        'android:name': NOM,
        'android:exported': 'true',
        'android:targetActivity': '.MainActivity',
        'android:permission': 'android.permission.START_VIEW_PERMISSION_USAGE',
      },
      'intent-filter': [
        {
          action: [{ $: { 'android:name': 'android.intent.action.VIEW_PERMISSION_USAGE' } }],
          category: [{ $: { 'android:name': 'android.intent.category.HEALTH_PERMISSIONS' } }],
        },
      ],
    });

    return cfg;
  });
}

module.exports = function withHealthConnectPermissionDelegate(config) {
  const avecDelegue = withMainActivity(config, (cfg) => {
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

  return ajouterAliasSante(avecDelegue);
};
