#!/usr/bin/env node
// Construit un corpus d'images ÉTIQUETÉES pour éprouver la cascade IA.
// ---------------------------------------------------------------------------
// ⚠ CE N'EST PAS LE CORPUS ANNONCÉ, ET IL FAUT LE DIRE.
// Le cahier des charges renvoyait à `donnees/corpus-de-test/` — 1 471 images
// étiquetées. Ce dossier n'existe pas dans ce dépôt, n'est pas ignoré par git,
// et personne n'a pu me dire où il se trouve. Sans lui, aucun test ne pouvait
// affirmer quoi que ce soit sur ce que le modèle RECONNAÎT.
//
// Ce que le dépôt contient en revanche : `assets/images/photos/`, dont le
// manifeste garde pour chaque image la requête ayant servi à la récupérer —
// « healthy food bowl », « moroccan tajine », « green salad ». C'est une
// étiquette, écrite avant même qu'on pense à s'en servir.
//
// On en tire donc un corpus MODESTE : une vingtaine d'images, étiquetées par
// leur provenance. Il ne mesure pas une précision, il attrape une panne — la
// cascade qui répond « frites » à une salade, ou qui ne répond plus du tout.
// C'est très en dessous de ce que le cahier des charges voulait, et très
// au-dessus de rien.
//
//   node scripts/corpus-de-test.js

const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..');
const PHOTOS = path.join(RACINE, 'assets', 'images', 'photos');
const CIBLE = path.join(RACINE, 'donnees', 'corpus-de-test');

const manifeste = JSON.parse(
  fs.readFileSync(path.join(PHOTOS, '_photos_manifest.json'), 'utf8'),
);

// Les mots qu'une description juste devrait contenir, par famille. On accepte
// large : le modèle peut dire « bol de légumes » là où l'étiquette dit
// « healthy food bowl » — c'est la même chose, et exiger le mot exact
// mesurerait le vocabulaire, pas la reconnaissance.
const ATTENDUS = {
  food: ['bol', 'salade', 'légume', 'legume', 'assiette', 'repas', 'plat', 'bowl', 'food'],
  salad: ['salade', 'légume', 'legume', 'verdure', 'laitue', 'salad'],
  fruits: ['fruit', 'pomme', 'banane', 'raisin', 'orange', 'baie'],
  breakfast: ['petit-déjeuner', 'petit déjeuner', 'déjeuner', 'café', 'tartine', 'oeuf', 'œuf', 'breakfast'],
  fish: ['poisson', 'saumon', 'fish'],
  smoothie: ['smoothie', 'boisson', 'verre', 'jus'],
  moroccan: ['tajine', 'marocain', 'plat', 'couscous', 'ragoût', 'ragout'],
  medfood: ['méditerranéen', 'mediterraneen', 'plat', 'légume', 'legume', 'huile'],
  mealprep: ['boîte', 'boite', 'repas', 'préparation', 'preparation', 'portion'],
  gym: ['salle', 'sport', 'haltère', 'haltere', 'musculation', 'équipement', 'equipement'],
  running: ['course', 'coureur', 'piste', 'chaussure', 'running'],
};

const entrees = [];
for (const [fichier, meta] of Object.entries(manifeste)) {
  if (!fs.existsSync(path.join(PHOTOS, fichier))) continue;
  const famille = fichier.replace(/_\d+\.jpg$/, '');
  const attendus = ATTENDUS[famille];
  if (!attendus) continue; // pas d'etiquette fiable : on n'invente pas
  entrees.push({
    image: 'assets/images/photos/' + fichier,
    famille,
    etiquette: meta.q,
    attenduParmi: attendus,
    source: meta.src + (meta.id ? '#' + meta.id : ''),
  });
}

fs.mkdirSync(CIBLE, { recursive: true });
const sortie = {
  _lisezMoi:
    'Corpus MODESTE, construit depuis les etiquettes de assets/images/photos. ' +
    'Ce n est PAS le corpus de 1 471 images annonce par le cahier des charges, ' +
    'qui est absent du depot. Il attrape une panne de la cascade, il ne mesure ' +
    'pas une precision. Regenerer : node scripts/corpus-de-test.js',
  genereDepuis: 'assets/images/photos/_photos_manifest.json',
  total: entrees.length,
  entrees,
};
fs.writeFileSync(path.join(CIBLE, 'corpus.json'), JSON.stringify(sortie, null, 2) + '\n', 'utf8');

const parFamille = {};
entrees.forEach((e) => { parFamille[e.famille] = (parFamille[e.famille] || 0) + 1; });
console.log('  ' + entrees.length + ' images etiquetees, ' + Object.keys(parFamille).length + ' familles');
Object.entries(parFamille).sort().forEach(([f, n]) => console.log('    ' + String(n).padStart(2) + '  ' + f));
console.log('\n  ecrit : donnees/corpus-de-test/corpus.json');
