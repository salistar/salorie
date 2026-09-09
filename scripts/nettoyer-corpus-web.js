// Applique le filtre de titre AUX IMAGES DEJA COLLECTEES.
// ---------------------------------------------------------------------------
// POURQUOI CE SCRIPT EXISTE
// `construire-corpus-web.js` exige desormais que le nom du plat apparaisse dans
// le titre ou l'URL de la page source. Ce controle est arrive APRES une premiere
// moisson qui avait deja rempli `khringo` de 200 baghrir. Corriger le
// moissonneur ne nettoie pas ce qu'il a deja ecrit.
//
// ⚠ ON NE SUPPRIME RIEN.
// Les images ecartees vont dans `corpus-web/rejets/nom_absent/`, et le manifeste
// est reecrit sans elles. Un filtre trop zele doit pouvoir etre inspecte puis
// annule — surtout celui-ci, qui repose sur des titres redigees par des inconnus.
//
// Usage :  node scripts/nettoyer-corpus-web.js [--appliquer]

const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..', 'corpus-web');
const APPLIQUER = process.argv.includes('--appliquer');

const nu = (x) => String(x).toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');

function porteLeNom(texte, classe, requete) {
  const t = nu(texte);
  const tReduit = t.replace(/(.)\1+/g, '$1');
  const mots = [...String(classe).split(' '), ...String(requete || '').split(' ')]
    .filter((m) => m.length >= 4);
  if (!mots.length) return true;
  return mots.some((m) => {
    const a = nu(m);
    return a && (t.includes(a) || tReduit.includes(a.replace(/(.)\1+/g, '$1')));
  });
}

function main() {
  const chemin = path.join(RACINE, 'manifeste.json');
  if (!fs.existsSync(chemin)) {
    console.log('  pas de manifeste : rien a nettoyer');
    return;
  }
  const m = JSON.parse(fs.readFileSync(chemin, 'utf8'));
  const gardees = [];
  const ecartees = [];
  for (const im of m.images || []) {
    if (!fs.existsSync(path.join(RACINE, im.fichier))) continue;
    const texte = `${im.titre || ''} ${im.source || ''}`;
    (porteLeNom(texte, im.classe, im.via) ? gardees : ecartees).push(im);
  }

  const parClasse = {};
  for (const im of ecartees) parClasse[im.classe] = (parClasse[im.classe] || 0) + 1;
  const restant = {};
  for (const im of gardees) restant[im.classe] = (restant[im.classe] || 0) + 1;

  console.log(`  ${gardees.length} gardees, ${ecartees.length} ecartees\n`);
  // Node ne connait pas les largeurs de champ de printf (« %8d » s'affiche tel
  // quel) : on aligne avec padStart, qui, lui, fait ce qu'il annonce.
  console.log(`  ${'classe'.padEnd(34)}${'ecarte'.padStart(8)}${'reste'.padStart(8)}`);
  for (const c of Object.keys({ ...parClasse, ...restant }).sort()) {
    console.log(`  ${c.padEnd(34)}${String(parClasse[c] || 0).padStart(8)}`
      + `${String(restant[c] || 0).padStart(8)}`);
  }

  if (!APPLIQUER) {
    console.log('\n  (constat seul — relancer avec --appliquer)');
    return;
  }
  const cible = path.join(RACINE, 'rejets', 'nom_absent');
  fs.mkdirSync(cible, { recursive: true });
  for (const im of ecartees) {
    try { fs.renameSync(path.join(RACINE, im.fichier), path.join(cible, im.fichier)); }
    catch { /* deja deplacee */ }
  }
  fs.writeFileSync(chemin, JSON.stringify({ ...m, images: gardees }, null, 2));
  console.log(`\n  ${ecartees.length} images deplacees dans ${cible}`);
  console.log('  manifeste reecrit — rien n a ete supprime');
}

main();
