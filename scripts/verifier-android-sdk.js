// Les niveaux d'API Android sont-ils FIXES, et assez hauts pour Google Play ?
// ---------------------------------------------------------------------------
// POURQUOI CE CONTROLE EXISTE
// `targetSdkVersion` n'etait pas fixe : il suivait le defaut du modele Expo (36
// aujourd'hui, via expo-modules-core). Cela marchait — et c'est precisement le
// piege. Google releve son plancher chaque annee ; le jour ou une mise a jour
// d'Expo, une retrogradation, ou un changement de modele ferait bouger cette
// valeur, personne ne le verrait avant le refus de publication. Or ce refus
// arrive au pire moment : au depot, quand la version est prete.
//
// Fixer la valeur ne suffit pas non plus. Une valeur figee dans `app.json` peut
// disparaitre au detour d'un remaniement du fichier. Ce script la relit.
//
// ⚠ CE QU'IL NE PEUT PAS VERIFIER : que le build applique bien ce qui est
// demande. `android/` est regenere a chaque construction et n'est pas versionne.
// Ce controle porte sur l'INTENTION declaree, pas sur l'artefact produit.
//
// Usage :  node scripts/verifier-android-sdk.js

const fs = require('fs');
const path = require('path');

// Le plancher impose par Google Play. Il MONTE chaque annee — habituellement
// annonce au premier semestre, applique au 31 aout. Le mettre a jour ici est un
// geste deliberé, et c'est le but : la valeur ne doit jamais bouger toute seule.
const PLANCHER_PLAY = 35;
const ECHEANCE = 'plancher applique par Google Play depuis aout 2025 (API 35) ; '
  + 'verifier chaque annee avant la campagne de rentree';

const app = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8'));
const plugins = app?.expo?.plugins || [];

const entree = plugins.find((p) => Array.isArray(p) && String(p[0]).includes('build-properties'));
if (!entree) {
  console.error("  ECHEC : le plugin expo-build-properties n'est plus declare dans app.json.");
  console.error('  Sans lui, aucun niveau d API n est fixe et tout suit le defaut d Expo.');
  process.exit(1);
}

const android = entree[1]?.android || {};
const manques = ['minSdkVersion', 'compileSdkVersion', 'targetSdkVersion']
  .filter((k) => typeof android[k] !== 'number');

if (manques.length) {
  console.error(`  ECHEC : ${manques.join(', ')} non fixe(s) dans app.json.`);
  console.error('  Ces valeurs suivraient alors le defaut du modele Expo, qui change');
  console.error('  d une version a l autre sans que rien ne le signale.');
  process.exit(1);
}

console.log('  minSdkVersion     : ' + android.minSdkVersion);
console.log('  compileSdkVersion : ' + android.compileSdkVersion);
console.log('  targetSdkVersion  : ' + android.targetSdkVersion);

if (android.targetSdkVersion < PLANCHER_PLAY) {
  console.error(`\n  ECHEC : targetSdkVersion ${android.targetSdkVersion} < ${PLANCHER_PLAY} exige par Google Play.`);
  console.error('  ' + ECHEANCE);
  process.exit(1);
}

// compileSdk inferieur a targetSdk ne compile pas : le detecter ici evite un
// echec de build de plusieurs minutes pour une erreur de saisie.
if (android.compileSdkVersion < android.targetSdkVersion) {
  console.error('\n  ECHEC : compileSdkVersion est inferieur a targetSdkVersion.');
  console.error('  On ne peut pas cibler une API qu on ne compile pas.');
  process.exit(1);
}

console.log(`\n  Conforme : cible ${android.targetSdkVersion}, plancher Play ${PLANCHER_PLAY}.`);
