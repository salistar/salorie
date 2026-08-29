#!/usr/bin/env node
// Empêche le nombre de couleurs écrites en dur de REMONTER.
// ---------------------------------------------------------------------------
// POURQUOI CE SCRIPT PLUTÔT QU'UNE RÈGLE ESLINT
// Le prompt demandait une règle ESLint en avertissement. Elle a été écrite, et
// elle ne peut pas tourner : `eslint.config.js` importe `eslint/config` et
// `eslint-config-expo/flat`, deux choses qui n'existent ni dans l'ESLint 8.57
// declaré par le dépôt, ni dans l'eslint-config-expo 8.0.1 installé. `expo
// lint` échoue donc au démarrage, avant d'avoir lu la moindre règle — et ce,
// AVANT ce chantier. Remettre la chaîne d'aplomb est une mise à niveau à part
// entière, avec ses propres risques.
//
// L'intention, elle, n'attend pas : ce que le prompt veut n'est pas « une
// règle ESLint », c'est que le compteur cesse de monter. Ce script le fait,
// aujourd'hui, sans dépendre d'une chaîne cassée.
//
// ⚠ IL NE RAMÈNE PAS LE COMPTEUR À ZÉRO — la consigne d'audit était explicite :
// NE PAS tout refactoriser. Il fige l'existant et refuse l'aggravation.
//
//   node scripts/couleurs-en-dur.js             compare au plafond
//   node scripts/couleurs-en-dur.js --figer     enregistre le compte actuel

const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..');
const PLAFOND = path.join(RACINE, 'design', 'couleurs-en-dur.json');

// Où l'on regarde. `constants/` est exclu : c'est justement là que les couleurs
// DOIVENT être écrites. Les tests aussi — une couleur attendue par un test
// n'est pas une couleur d'interface.
const DOSSIERS = ['app', 'components', 'lib', 'hooks'];
const IGNORE = /(__tests__|\.test\.|node_modules|\.expo)/;

// Une chaîne qui n'est QU'un hexadécimal : '#fff', '#1f2833', '#0f141980'.
// Celles qui en contiennent un au milieu d'autre chose (un dégradé, une URL)
// ne sont pas visées — les traquer produirait surtout du bruit.
const HEX = /(['"`])#[0-9a-fA-F]{3,8}\1/g;

function fichiers(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (IGNORE.test(p)) continue;
    if (e.isDirectory()) fichiers(p, acc);
    else if (/\.(ts|tsx)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

const parFichier = {};
let total = 0;
for (const d of DOSSIERS) {
  for (const f in {}) void f;
  for (const f of fichiers(path.join(RACINE, d))) {
    const contenu = fs.readFileSync(f, 'utf8');
    // ⚠ LES FICHIERS D'IDENTITE SORTENT DU COMPTE.
    // Nutri-Score, cadres de medaille, paliers d'avatar, echelle A-E : leurs
    // couleurs ne suivent PAS le theme, et c'est ce qui les rend justes. Les
    // compter comme une dette pousserait quelqu'un a les "corriger" — ce qui
    // est arrive trois fois pendant ce chantier.
    if (contenu.includes('@couleurs-identite')) continue;
    const n = (contenu.match(HEX) || []).length;
    if (!n) continue;
    parFichier[path.relative(RACINE, f).replace(/\\/g, '/')] = n;
    total += n;
  }
}

if (process.argv.includes('--figer')) {
  fs.mkdirSync(path.dirname(PLAFOND), { recursive: true });
  fs.writeFileSync(
    PLAFOND,
    JSON.stringify(
      {
        _lisezMoi:
          'Plafond du nombre de couleurs ecrites en dur. Il ne doit que ' +
          'DESCENDRE. Le relever demande une raison ecrite dans le message de ' +
          'commit — sans quoi la dette redevient invisible.',
        total,
        parFichier,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  console.log('  plafond fige a ' + total + ' occurrences dans ' + Object.keys(parFichier).length + ' fichiers');
  process.exit(0);
}

if (!fs.existsSync(PLAFOND)) {
  console.error('  Aucun plafond enregistre. Lancez : node scripts/couleurs-en-dur.js --figer');
  process.exit(1);
}

const ref = JSON.parse(fs.readFileSync(PLAFOND, 'utf8'));
const ecart = total - ref.total;

console.log('  couleurs en dur : ' + total + '   plafond : ' + ref.total);

if (ecart > 0) {
  // On nomme les fichiers responsables : « +7 quelque part » n'aide personne.
  const pires = Object.entries(parFichier)
    .map(([f, n]) => [f, n - (ref.parFichier[f] || 0)])
    .filter(([, d]) => d > 0)
    .sort((a, b) => b[1] - a[1]);
  console.error('\n  ' + ecart + ' couleur(s) en dur de plus qu au plafond.\n');
  pires.slice(0, 12).forEach(([f, d]) => console.error('    +' + String(d).padStart(3) + '  ' + f));
  console.error('\n  Employez useTokens() : bg, surface, text, accent, border, danger…');
  console.error('  Les six themes ne peuvent pas atteindre une valeur figee dans un');
  console.error('  ecran — il restera vert sur un theme dore.');
  console.error('\n  Si la hausse est justifiee : node scripts/couleurs-en-dur.js --figer');
  console.error('  et DITES POURQUOI dans le message de commit.');
  process.exit(1);
}

if (ecart < 0) {
  console.log('  ' + -ecart + ' de moins qu au plafond — pensez a refiger pour verrouiller le gain.');
} else {
  console.log('  stable.');
}
