#!/usr/bin/env node
// Manifeste des images — construit par BALAYAGE DU CODE, pas a la main.
//
// POURQUOI CET OUTIL EXISTE
// Les noms de fichiers mentent. `weightlifting.jpg` est une photo aerienne de
// vagues ; `gain_weight.jpg` montre des cordes de battle rope avec deux
// personnes. Un audit par nom serait passe a cote des vraies violations tout en
// signalant des innocents. Seul un verdict RENDU EN REGARDANT vaut quelque
// chose — et il faut un endroit pour le consigner.
//
// Trois etats possibles pour `conforme` :
//   true   verifie en regardant l'image, conforme a la politique
//   false  verifie, NON conforme — la CI echoue tant qu'elle est utilisee
//   null   pas encore regardee. Signale, mais ne bloque pas : bloquer sur 90
//          images non revues arreterait le projet sans rien prouver.
//
// Usage :
//   node scripts/manifeste-images.js            met a jour (conserve les verdicts)
//   node scripts/manifeste-images.js --verifier  echoue si une image `false` est utilisee
const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..');
const MANIFESTE = path.join(RACINE, 'assets', 'images.manifest.json');
const DOSSIERS = ['app', 'components', 'constants', 'lib'];
// Le TIRET compte. Sans lui, `hero-connexion.jpg` echappait au balayage : les
// images ajoutees le 27/08 etaient invisibles au manifeste, donc jamais
// verifiees — un angle mort silencieux dans l'outil cense les traquer.
const MOTIF = /assets\/images\/([a-zA-Z_0-9/-]+\.(?:jpg|png|webp))/g;

function fichiersSources(dir, acc = []) {
  const p = path.join(RACINE, dir);
  if (!fs.existsSync(p)) return acc;
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    const complet = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      fichiersSources(complet, acc);
    } else if (/\.(tsx?|jsx?)$/.test(e.name)) {
      acc.push(complet);
    }
  }
  return acc;
}

// Balayage : qui utilise quoi, et combien de fois.
const usages = new Map();
for (const f of DOSSIERS.flatMap((d) => fichiersSources(d))) {
  const src = fs.readFileSync(path.join(RACINE, f), 'utf8');
  let m;
  while ((m = MOTIF.exec(src))) {
    const cle = m[1];
    if (!usages.has(cle)) usages.set(cle, new Set());
    usages.get(cle).add(f.replace(/\\/g, '/'));
  }
}

const ancien = fs.existsSync(MANIFESTE)
  ? JSON.parse(fs.readFileSync(MANIFESTE, 'utf8'))
  : { images: {} };

const images = {};
for (const cle of [...usages.keys()].sort()) {
  const precedent = ancien.images[cle] || {};
  images[cle] = {
    // Le verdict PRECEDENT est conserve : un balayage ne doit jamais effacer un
    // travail de revue. Seuls les usages sont recalcules.
    conforme: precedent.conforme === undefined ? null : precedent.conforme,
    sujet: precedent.sujet || null,
    note: precedent.note || null,
    // La tolerance est un VERDICT, pas un calcul : elle survit au balayage.
    ...(precedent.tolereJusquA ? { tolereJusquA: precedent.tolereJusquA } : {}),
    existe: fs.existsSync(path.join(RACINE, 'assets', 'images', cle)),
    usages: [...usages.get(cle)].sort(),
  };
}

// Les images presentes sur le disque mais utilisees nulle part : signalees, car
// ce sont soit des oublis, soit du poids mort dans l'APK.
const surDisque = [];
(function scan(rel) {
  const abs = path.join(RACINE, 'assets', 'images', rel);
  if (!fs.existsSync(abs)) return;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) scan(r);
    else if (/\.(jpg|png|webp)$/i.test(e.name) && !usages.has(r)) surDisque.push(r);
  }
})('');

const sortie = {
  _lisezMoi: [
    "Manifeste des images. Genere par scripts/manifeste-images.js — les USAGES",
    "sont recalcules a chaque passage, les VERDICTS sont conserves.",
    "",
    "`conforme` : true = verifie en regardant, conforme · false = verifie, NON",
    "conforme (la CI echoue) · null = pas encore regardee.",
    "",
    "⚠ NE JUGEZ JAMAIS UNE IMAGE SUR SON NOM. weightlifting.jpg est une photo de",
    "vagues, gain_weight.jpg montre deux personnes. Les noms mentent."
  ],
  _politique: [
    "Autorise : plats dresses et appetissants, ingredients, marches, equipement",
    "sportif, terrains, pistes, paysages, degrades et geometries abstraites.",
    "",
    "Interdit : toute personne identifiable, silhouettes comprises. Si un humain",
    "est indispensable (demonstration d'exercice), pictogramme neutre sans visage",
    "ou mains seules. Pas de viande crue en gros plan."
  ],
  _genere: 'node scripts/manifeste-images.js',
  // ⚠ CONSERVE, comme les verdicts. La liste des images BANNIES doit survivre a
  // une regeneration : sinon le garde-fou qui les empeche de revenir disparait
  // au premier balayage, et personne ne s'en apercoit — c'est exactement ce qui
  // s'est produit le 27/08, mon propre test detruisant la donnee qu'il verifiait.
  _retirees: ancien._retirees || {},
  imagesNonUtilisees: surDisque.sort(),
  images,
};

if (process.argv.includes('--verifier')) {
  // ⚠ TOLERANCE DATEE, JAMAIS SILENCIEUSE.
  // La revue du 27/08 a trouve 51 images non conformes, dont 38 dans la seule
  // bibliotheque d'exercices. Les remplacer demande un travail de DESIGN —
  // des pictogrammes neutres sans visage — pas une substitution de fichier.
  //
  // Deux mauvaises reponses existaient : faire echouer la CI immediatement, ce
  // qui aurait bloque tout le projet sur un chantier graphique ; ou taire le
  // probleme, ce qui l'aurait enterre. On DATE la tolerance : elle est comptee
  // et affichee a chaque passage, et le jour ou l'echeance tombe, la
  // verification echoue d'elle-meme.
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const estTolere = (v) => typeof v.tolereJusquA === 'string' && v.tolereJusquA >= aujourdhui;

  const toutesFautives = Object.entries(images).filter(([, v]) => v.conforme === false);
  const bloquantes = toutesFautives.filter(([, v]) => !estTolere(v));
  const tolerees = toutesFautives.filter(([, v]) => estTolere(v));
  const absentes = Object.entries(images).filter(([, v]) => !v.existe);
  const nonRevues = Object.values(images).filter((v) => v.conforme === null).length;

  absentes.forEach(([k, v]) => console.error(`  INTROUVABLE  ${k}  (utilisee par ${v.usages.join(', ')})`));
  bloquantes.forEach(([k, v]) => console.error(`  NON CONFORME ${k}  ${v.sujet || ''}\n               utilisee par ${v.usages.join(', ')}`));

  console.log(`\n  ${Object.keys(images).length} images utilisees`);
  console.log(`  ${Object.values(images).filter((v) => v.conforme === true).length} conformes, verifiees en regardant`);
  if (nonRevues) console.log(`  ${nonRevues} pas encore regardees`);
  if (tolerees.length) {
    const echeance = tolerees.map(([, v]) => v.tolereJusquA).sort()[0];
    console.log(`  ${tolerees.length} NON CONFORMES, tolerees jusqu au ${echeance}`);
    console.log('    (a remplacer par des pictogrammes neutres — voir _revue dans le manifeste)');
  }
  console.log(`  ${surDisque.length} presentes sur le disque mais utilisees nulle part`);

  if (bloquantes.length || absentes.length) {
    console.error(`\n  Echec : ${bloquantes.length} image(s) non conforme(s) sans tolerance valide, ${absentes.length} introuvable(s).`);
    process.exit(1);
  }
  console.log('\n  Aucune image non conforme hors tolerance.');
  process.exit(0);
}

fs.writeFileSync(MANIFESTE, JSON.stringify(sortie, null, 2) + '\n', 'utf8');
console.log(`  ecrit : assets/images.manifest.json`);
console.log(`  ${Object.keys(images).length} images utilisees, ${surDisque.length} inutilisees`);
