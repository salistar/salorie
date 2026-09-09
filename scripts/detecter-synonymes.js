// Deux de nos classes designent-elles LE MEME PLAT ?
// ---------------------------------------------------------------------------
// LE DEFAUT QUE CE SCRIPT CHERCHE, ET COMMENT IL A ETE DECOUVERT
// Le 05/09/2026, la classe `khringo` s'est remplie d'images de baghrir. Le
// premier diagnostic etait « le moteur a rendu n'importe quoi ». Les titres
// disaient autre chose :
//     « Recette de Baghrir - Khringo - crepes a mille trous »
//     « Baghrir / Khringo », « #khringo#baghrir# »
// Khringo EST le baghrir. Ce n'etait pas une contamination : c'etait un
// SYNONYME, et notre carte des 172 classes en fait deux classes distinctes.
//
// ⚠ POURQUOI C'EST PIRE QU'UNE CLASSE VIDE.
// Une classe vide se voit et s'ecarte. Deux classes synonymes se remplissent
// toutes les deux, l'air normal, et demandent au modele de distinguer une chose
// d'elle-meme. Il ne peut pas : il apprend a hesiter, et les deux classes se
// degradent — plus celles qui leur ressemblent. Le score global baisse sans que
// rien ne signale d'ou vient la perte.
//
// COMMENT ON LE DETECTE
// Les titres des pages source nomment souvent les deux mots ensemble, parce que
// l'auteur ecrit « baghrir (ou khringo) ». On compte donc, pour chaque classe,
// combien de ses images portent dans leur titre le nom d'une AUTRE classe.
// Une part elevee et reciproque est la signature d'un synonyme.
//
// ⚠ CE SCRIPT NE FUSIONNE RIEN. Il signale. Fusionner deux classes change la
// carte des 172, donc le modele, les deux fichiers d'etiquettes et l'APK : c'est
// une decision, pas une consequence automatique d'une mesure.
//
// Usage :  node scripts/detecter-synonymes.js [part minimale, defaut 0.25]

const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const CORPUS = ['corpus-web', 'corpus-maghreb-plus'];
const PART_MINI = Number(process.argv[2]) || 0.25;

const nu = (x) => String(x).toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');

function main() {
  const classes = JSON.parse(fs.readFileSync(
    path.join(RACINE, 'food4k', 'label_map_172.json'), 'utf8')).classes;
  const f101 = new Set(JSON.parse(fs.readFileSync(
    path.join(RACINE, 'food4k', 'label_map.json'), 'utf8'))
    .classes.map((c) => c.replace(/_/g, ' ').toLowerCase()));
  // On ne compare que les classes marocaines entre elles : « apple » et
  // « apple pie » se citent legitimement sans etre le meme plat.
  const cibles = classes.filter((c) => !f101.has(c.toLowerCase()));

  // ⚠ LE MOT DISTINCTIF N'EST PAS LE PLUS LONG — PREMIERE VERSION FAUSSE.
  // Elle prenait le mot le plus long : « tagine with beef » donnait « tagine »
  // (6 lettres) plutot que « beef » (4). Or « tagine » est partage par CINQ
  // classes, et « chicken » par quatre. Le detecteur accusait donc « roasted
  // chicken » de citer « chicken nuggets » a chaque fois que le mot « chicken »
  // apparaissait — quinze faux positifs sur seize.
  //
  // Le mot distinctif est celui qui apparait dans le MOINS d'autres classes.
  const frequence = {};
  for (const c of cibles) {
    for (const m of new Set(c.split(' ').filter((x) => x.length >= 4))) {
      frequence[nu(m)] = (frequence[nu(m)] || 0) + 1;
    }
  }
  const motCle = {};
  for (const c of cibles) {
    const mots = c.split(' ').filter((m) => m.length >= 4).map(nu)
      .sort((a, b) => (frequence[a] - frequence[b]) || (b.length - a.length));
    if (mots.length) motCle[c] = mots[0];
  }

  const titres = {};
  for (const d of CORPUS) {
    const m = path.join(RACINE, d, 'manifeste.json');
    if (!fs.existsSync(m)) continue;
    for (const im of JSON.parse(fs.readFileSync(m, 'utf8')).images || []) {
      (titres[im.classe] = titres[im.classe] || []).push(nu(`${im.titre || ''}`));
    }
  }

  const paires = [];
  for (const [classe, liste] of Object.entries(titres)) {
    if (!liste.length || !motCle[classe]) continue;
    for (const autre of cibles) {
      if (autre === classe || !motCle[autre]) continue;
      // Un mot-cle inclus dans l'autre (« seffa » dans « seffa with rice »)
      // rendrait toute paire suspecte : on l'ecarte.
      if (motCle[autre].includes(motCle[classe]) || motCle[classe].includes(motCle[autre])) continue;
      const n = liste.filter((t) => t.includes(motCle[autre])).length;
      const part = n / liste.length;
      if (part >= PART_MINI) paires.push({ classe, autre, n, total: liste.length, part });
    }
  }

  paires.sort((a, b) => b.part - a.part);
  if (!paires.length) {
    console.log(`  aucune paire au-dessus de ${(PART_MINI * 100).toFixed(0)} %`);
    return;
  }
  console.log(`  ${paires.length} paire(s) suspecte(s) — le titre d une classe nomme l autre :\n`);
  for (const p of paires) {
    // La reciprocite est le signe fort : « khringo » cite « baghrir » ET
    // inversement. Une citation a sens unique peut n'etre qu'un accompagnement.
    const retour = paires.find((q) => q.classe === p.autre && q.autre === p.classe);
    console.log(`  ${p.classe.padEnd(26)} cite « ${p.autre} » dans `
      + `${p.n}/${p.total} titres (${(p.part * 100).toFixed(0)} %)`
      + (retour ? '   <-- RECIPROQUE : probable SYNONYME' : ''));
  }
  console.log('\n  Deux classes synonymes demandent au modele de distinguer une');
  console.log('  chose d elle-meme. Les fusionner dans label_map_172.json est une');
  console.log('  decision : elle change le modele, les deux listes d etiquettes et l APK.');
}

main();
