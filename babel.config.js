module.exports = function (api) {
  api.cache(true);
  return {
    // babel-preset-expo active automatiquement react-compiler via le flag
    // "experiments.reactCompiler" de app.json — on le conserve.
    presets: ['babel-preset-expo'],
    env: {
      // En build de production (release), on retire tous les console.* :
      // securite (plus d'emails/tokens en clair dans logcat) + performance.
      production: {
        // En release : on retire tous les console.* (sécurité + perf).
        plugins: ['transform-remove-console'],
      },
    },
  };
};
