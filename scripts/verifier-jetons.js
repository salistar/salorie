#!/usr/bin/env node
// Deux défauts que ni TypeScript ni les tests ne voient.
// ---------------------------------------------------------------------------
// Le chantier des six thèmes a produit deux classes d'erreurs qui compilent
// parfaitement, passent les 525 tests, et cassent l'application à l'exécution
// ou — pire — affichent silencieusement la mauvaise couleur.
//
// Les deux ont été trouvées à la main. Ce script les cherche désormais tout
// seul, parce qu'elles reviendront : la première dès qu'on ajoutera un écran,
// la seconde dès qu'un outil de refactorisation touchera une classe.
//
//   node scripts/verifier-jetons.js

const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..');
const DOSSIERS = ['app', 'components', 'lib', 'hooks'];
const IGNORE = /(__tests__|\.test\.|node_modules|\.expo)/;

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

const tous = DOSSIERS.flatMap((d) => fichiers(path.join(RACINE, d)));
const rel = (f) => path.relative(RACINE, f).replace(/\\/g, '/');

/* ── 1. Un jeton lu dans un StyleSheet figé ──────────────────────────────────
 *
 * `StyleSheet.create({...})` écrit HORS d'un composant est évalué une fois, à
 * l'importation du module — avant que le thème n'existe, et sans jamais être
 * recalculé. Un jeton lu là porte donc la valeur du thème par défaut, à vie.
 *
 * Rien ne le signale : l'écran s'affiche, TypeScript est content. Seule une
 * couleur reste fausse, sur un écran, dans un thème.
 *
 * Les fabriques `const makeStyles = (k: Tokens) => StyleSheet.create({...})`
 * ne sont pas concernées : elles sont appelées au rendu.
 */
const figes = [];
for (const f of tous) {
  const s = fs.readFileSync(f, 'utf8');
  const re = /^const \w+ = StyleSheet\.create\(\{/gm;
  let m;
  while ((m = re.exec(s))) {
    const fin = s.indexOf('\n});', m.index);
    const bloc = s.slice(m.index, fin > 0 ? fin : s.length);
    const jetons = bloc.match(/(?<![\w.])(k|tok)\.[A-Za-z0-9_]+/g);
    if (jetons) figes.push([rel(f), jetons.length]);
  }
}

/* ── 2. Un crochet React dans un composant de CLASSE ─────────────────────────
 *
 * Un inséreur automatique remontait jusqu'à l'accolade ouvrante de la fonction
 * englobante. Dans une classe, cette « fonction » est une MÉTHODE — `render()`,
 * `componentDidMount()` — et React y interdit les crochets.
 *
 * TypeScript ne dit rien : la signature est valide. L'erreur ne surgit qu'à
 * l'exécution. Elle avait atterri dans l'ErrorBoundary : l'écran aurait planté
 * au moment précis où une autre erreur venait de se produire.
 */
const dansClasses = [];
for (const f of tous) {
  const s = fs.readFileSync(f, 'utf8');
  const re = /^(export\s+)?(default\s+)?class\s+(\w+)/gm;
  let m;
  while ((m = re.exec(s))) {
    const suite = s.slice(m.index + m[0].length);
    const fin = suite.indexOf('\n}');
    const corps = suite.slice(0, fin > 0 ? fin : suite.length);
    const crochets = corps.match(/\buse[A-Z]\w*\s*\(/g);
    if (crochets) dansClasses.push([rel(f), m[3], [...new Set(crochets)].join(', ')]);
  }
}

let echec = false;

if (figes.length) {
  echec = true;
  console.error('\n  JETONS DANS UN STYLESHEET FIGE — la couleur ne changera jamais :\n');
  figes.forEach(([f, n]) => console.error('    ' + String(n).padStart(3) + '  ' + f));
  console.error('\n  Transformez la feuille en fabrique appelee au rendu :');
  console.error('    const makeStyles = (k: Tokens) => StyleSheet.create({ … });');
  console.error('    const styles = useMemo(() => makeStyles(k), [k]);');
}

if (dansClasses.length) {
  echec = true;
  console.error('\n  CROCHET DANS UN COMPOSANT DE CLASSE — interdit par React :\n');
  dansClasses.forEach(([f, cls, h]) => console.error('    ' + f + '  class ' + cls + '  ->  ' + h));
  console.error('\n  Un composant de classe ne peut pas lire le theme. Passez les');
  console.error('  couleurs en propriete, ou ecrivez-les en dur si le composant doit');
  console.error('  survivre a une panne du fournisseur (cas de l ErrorBoundary).');
}

if (echec) process.exit(1);

console.log('  aucun jeton fige, aucun crochet dans une classe.');
console.log('  ' + tous.length + ' fichiers examines.');
