// Expo config plugin : memoire allouee au demon Gradle.
//
// POURQUOI CE PLUGIN EXISTE
//
// android/gradle.properties portait `-Xmx6144m -XX:MaxMetaspaceSize=1024m
// -XX:+UseParallelGC`. Le fichier etant regenere par `prebuild --clean`, la valeur est
// retombee au defaut d'Expo : `-Xmx2048m -XX:MaxMetaspaceSize=512m`.
//
// Ce n'etait qu'une question de lenteur tant que la minification etait desactivee. Elle
// est desormais active : R8 charge le graphe complet de l'application pour l'optimiser,
// et 2 Go de tas suffisent rarement sur un projet de cette taille — l'echec typique est
// un `OutOfMemoryError: Java heap space` en pleine tache minifyReleaseWithR8, apres une
// vingtaine de minutes de compilation.
//
// 6 Go valides sur une machine de 16 Go, et compatibles avec les runners GitHub, qui en
// offrent autant. Sur une machine plus petite, baisser cette valeur AVANT de compiler.
//
// UseParallelGC est conserve : le ramasse-miettes par defaut (G1) est optimise pour la
// latence, ce dont un build n'a que faire ; le collecteur parallele privilegie le debit.
const { withGradleProperties } = require('@expo/config-plugins');

const KEY = 'org.gradle.jvmargs';
const VALUE = '-Xmx6144m -XX:MaxMetaspaceSize=1024m -XX:+UseParallelGC';

module.exports = function withGradleMemory(config) {
  return withGradleProperties(config, (cfg) => {
    const items = cfg.modResults;
    const existing = items.find((i) => i.type === 'property' && i.key === KEY);
    if (existing) {
      existing.value = VALUE;
    } else {
      items.push({ type: 'property', key: KEY, value: VALUE });
    }
    return cfg;
  });
};
