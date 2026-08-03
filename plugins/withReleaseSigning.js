// Expo config plugin : configuration de signature RELEASE, et refus explicite de
// produire un binaire signe avec la cle de debug.
//
// POURQUOI CE PLUGIN EXISTE
//
// Le gabarit Android d'Expo ecrit, dans le bloc `release` :
//
//     // Caution! In production, you need to generate your own keystore file.
//     signingConfig signingConfigs.debug
//
// Autrement dit, un build de release non configure sort signe avec la cle de DEBUG,
// sans le moindre avertissement. Google Play refuse ces binaires.
//
// Le projet avait bien un bloc `release { MYAPP_RELEASE_* }` ecrit a la main dans
// android/app/build.gradle, avec un commentaire disant qu'aucun repli sur la cle de
// debug ne devait exister. Mais `prebuild --clean` regenere ce fichier : la
// configuration disparaissait, et le build repartait sur la cle de debug.
//
// CONSTAT MESURE sur l'APK produit avant ce correctif :
//     Signer #1 certificate DN: CN=Android Debug, OU=Android, O=Unknown
//
// Cela valait aussi pour l'integration continue, qui execute le meme prebuild : les
// AAB produits par le workflow de release etaient debug-signes. L'etape de
// verification ne s'en apercevait pas, parce qu'elle cherchait seulement la PRESENCE
// d'un bloc de signature dans META-INF — ce qu'une signature de debug satisfait. Il
// faut controler l'IDENTITE du signataire, pas l'existence d'une signature.
//
// C'est la quatrieme fois sur ce projet qu'un reglage ecrit dans android/ disparait au
// prebuild : cle Maps, garde de permission, minification, et maintenant la signature.
// Tout ce qui doit exister dans le binaire publie vit dans un plugin.
const { withAppBuildGradle } = require('@expo/config-plugins');

const RELEASE_SIGNING_CONFIG = `
        release {
            // Les valeurs viennent des proprietes Gradle, jamais du depot :
            //   • en local : ~/.gradle/gradle.properties
            //   • en CI    : -PMYAPP_RELEASE_* alimentes par les secrets GitHub
            if (project.hasProperty('MYAPP_RELEASE_STORE_FILE')) {
                storeFile file(MYAPP_RELEASE_STORE_FILE)
                storePassword MYAPP_RELEASE_STORE_PASSWORD
                keyAlias MYAPP_RELEASE_KEY_ALIAS
                keyPassword MYAPP_RELEASE_KEY_PASSWORD
            }
        }`;

// Le garde ne se declenche QUE si une tache de release est demandee : un simple
// assembleDebug ne doit pas exiger le keystore de production.
const GUARD = `
// Refus explicite de produire un release signe en debug. Sans ce garde, l'erreur ne se
// voit qu'au rejet de Google Play, des semaines plus tard.
gradle.taskGraph.whenReady { graph ->
    def wantsRelease = graph.allTasks.any { t ->
        (t.name.startsWith('assemble') || t.name.startsWith('bundle')) && t.name.contains('Release')
    }
    if (wantsRelease && !project.hasProperty('MYAPP_RELEASE_STORE_FILE')) {
        throw new GradleException(
            "Build de release sans keystore de production.\\n" +
            "Definis MYAPP_RELEASE_STORE_FILE, MYAPP_RELEASE_STORE_PASSWORD, " +
            "MYAPP_RELEASE_KEY_ALIAS et MYAPP_RELEASE_KEY_PASSWORD " +
            "(~/.gradle/gradle.properties en local, secrets GitHub en CI).\\n" +
            "Sans eux le gabarit Expo retombe sur la cle de DEBUG, et Play refuse le binaire."
        )
    }
}
`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error("withReleaseSigning : build.gradle n'est pas en Groovy.");
    }
    let src = cfg.modResults.contents;

    // 1) Ajouter le signingConfig release, s'il n'y est pas deja.
    //
    // Le test porte sur MYAPP_RELEASE_STORE_FILE, marqueur present nulle part ailleurs.
    // Une premiere version cherchait /signingConfigs\s*\{[\s\S]*?release\s*\{/ : le motif
    // paresseux traversait le bloc signingConfigs et trouvait le `release {` de
    // buildTypes, donc le plugin croyait avoir deja fait le travail et n'inserait rien —
    // en laissant buildTypes pointer vers une config inexistante.
    if (!src.includes('MYAPP_RELEASE_STORE_FILE')) {
      const before = src;
      // Ancre : la fin du bloc `debug` du gabarit, reconnaissable a son keyAlias.
      src = src.replace(
        /(signingConfigs\s*\{[\s\S]*?keyAlias 'androiddebugkey'[\s\S]*?\n        \})/,
        `$1${RELEASE_SIGNING_CONFIG}`,
      );
      if (src === before) {
        throw new Error(
          "withReleaseSigning : bloc signingConfigs introuvable — le gabarit Expo a change, " +
            'le plugin doit etre mis a jour avant de publier.',
        );
      }
    }

    // 2) Faire pointer le buildType release sur cette config. L'ancre de REMPLACEMENT
    //    inclut la ligne suivante du gabarit pour ne PAS toucher au buildType debug, qui
    //    contient la meme instruction.
    //
    //    Le test d'etat, lui, porte sur la chaine finale et rien d'autre. Une premiere
    //    version testait /release\s*\{[\s\S]*?signingConfig signingConfigs\.debug/ : sur un
    //    fichier deja corrige, ce motif paresseux appariait le `release {` de
    //    signingConfigs avec le `signingConfigs.debug` de buildTypes.debug, concluait qu'il
    //    restait du travail, ne trouvait rien a remplacer, et faisait echouer le prebuild.
    if (!src.includes('signingConfig signingConfigs.release')) {
      const before = src;
      src = src.replace(
        /signingConfig signingConfigs\.debug(\s*\n\s*def enableShrinkResources)/,
        'signingConfig signingConfigs.release$1',
      );
      if (src === before) {
        throw new Error(
          "withReleaseSigning : impossible de rediriger le buildType release vers la config " +
            'release — le gabarit Expo a change, le plugin doit etre mis a jour.',
        );
      }
    }

    // 3) Garde final.
    if (!src.includes('Build de release sans keystore de production')) {
      src += GUARD;
    }

    cfg.modResults.contents = src;
    return cfg;
  });
};
