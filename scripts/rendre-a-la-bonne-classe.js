// Rend chaque image a la classe que SA SOURCE nomme.
// ---------------------------------------------------------------------------
// LE PROBLEME, ET POURQUOI IL NE SE VOIT PAS
// `khringo` et `baghrir` designent le meme plat — les crepes marocaines mille
// trous. La carte des 172 classes les separe, par decision assumee du 06/09/2026.
// Consequence mesuree le 08/09/2026, et elle n'etait pas prevue :
//
//   khringo a moissonne le premier et detient 58 photos de baghrir.
//   Quand la moisson cherche ENSUITE « baghrir », elle retrouve les MEMES
//   photos, reconnait leur empreinte, et les ecarte comme doublons.
//   `baghrir` reste donc a 3 images — affame par son propre synonyme.
//
// Rien ne signale ce mecanisme : les deux classes ont l'air simplement pauvres.
//
// CE QUE FAIT CE SCRIPT, ET CE QU'IL NE FAIT PAS
// Il NE FUSIONNE PAS les classes : `label_map_172.json` n'est pas touche, le
// modele garde ses 172 sorties. Il deplace seulement les IMAGES vers la classe
// que leur propre titre nomme. Une photo intitulee « Recette de Baghrir -
// Khringo » appartient a `baghrir` : c'est la source qui le dit, pas nous.
//
// Ce qui reste sous `khringo` est ce que les sources appellent vraiment ainsi.
// Si cela tombe sous le plancher d'admission, la classe sera ecartee du modele
// comme les autres classes maigres — et la cascade la traitera au palier
// suivant. C'est le comportement voulu, pas un abandon.
//
// Usage :  node scripts/rendre-a-la-bonne-classe.js [--appliquer]

const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const APPLIQUER = process.argv.includes('--appliquer');

// Les paires constatees, et le nom que les sources donnent vraiment.
// ⚠ Chacune vient d'une OBSERVATION, pas d'une intuition :
//   khringo -> baghrir : 29 des 58 titres nommaient « baghrir » (06/09/2026)
//   rghayf  -> msemen  : 73 des 169 titres nommaient « msemen » (08/09/2026),
//                        pendant que `msemen` plafonnait a 9 images.
//
// ⚠ UNE IMAGE QUI NOMME LES DEUX RESTE OU ELLE EST.
// « Rghaif or Msemen » ne tranche rien : la deplacer serait choisir a la place
// de la source. On ne bouge que celles qui nomment la classe affamee SANS
// nommer celle qui les detient — la seule situation ou la source est claire.
const SYNONYMES = [
  { detenue: 'khringo', vraie: 'baghrir', motif: 'baghrir', sauf: 'khringo' },

  // ⚠ `rghayf` -> `msemen` A ETE ESSAYE, PUIS RETIRE. La regle a REFUSE, et le
  // refus etait juste. Mesure du 08/09/2026 sur les 169 images de `rghayf` :
  //     72 titres nomment « msemen »
  //      4 le nomment SANS nommer « rghaif » — et ces quatre ecrivent
  //        « rghaif » avec trema, que la normalisation ASCII manquait.
  // Autrement dit : les sources nomment TOUJOURS les deux ensemble. Elles
  // considerent que c'est le meme plat — « msemen, mlawi, rghaif : crepe
  // feuilletee marocaine ». Deplacer ces images serait choisir a la place de la
  // source, sur une question qu'elle ne tranche pas.
  //
  // Consequence assumee : `msemen` reste a 9 images, passe sous le plancher
  // d'admission et sort du modele ; `rghayf` represente la famille ; la cascade
  // traite le reste. C'est le comportement voulu, pas un abandon.
  //
  // La difference avec khringo/baghrir est reelle : la-bas, 27 titres nommaient
  // « baghrir » SEUL. Ici, aucun. Une regle qui aurait rendu les deux cas
  // identiques aurait invente la moitie de son resultat.
];

const nu = (x) => String(x).toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');

function main() {
  for (const dossier of ['corpus-web', 'corpus-maghreb-plus']) {
    const racine = path.join(RACINE, dossier);
    const chemin = path.join(racine, 'manifeste.json');
    if (!fs.existsSync(chemin)) continue;
    const m = JSON.parse(fs.readFileSync(chemin, 'utf8'));

    let deplacees = 0;
    for (const s of SYNONYMES) {
      const candidates = (m.images || []).filter((im) => {
        if (im.classe !== s.detenue) return false;
        const t = nu(`${im.titre || ''} ${im.source || ''}`);
        // Nomme la classe affamee, et PAS celle qui la detient : sans cette
        // seconde condition, on deplacerait des images que la source range
        // legitimement des deux cotes.
        return t.includes(nu(s.motif)) && !(s.sauf && t.includes(nu(s.sauf)));
      });
      if (!candidates.length) continue;

      const total = (m.images || []).filter((im) => im.classe === s.detenue).length;
      console.log(`  ${dossier} : ${candidates.length}/${total} images de `
        + `« ${s.detenue} » nomment « ${s.vraie} » dans leur source`);

      if (!APPLIQUER) continue;
      // On renumerote a la suite de ce que la vraie classe possede deja, pour
      // ne pas ecraser ses images existantes.
      let n = (m.images || []).filter((im) => im.classe === s.vraie).length;
      for (const im of candidates) {
        const base = s.vraie.replace(/[^a-z0-9]+/gi, '_');
        let nom;
        do { n += 1; nom = `${base}_${n}.jpg`; } while (fs.existsSync(path.join(racine, nom)));
        try {
          fs.renameSync(path.join(racine, im.fichier), path.join(racine, nom));
          im.fichier = nom;
          im.classe = s.vraie;
          // La trace de la correction, sur l'image elle-meme : dans six mois,
          // « pourquoi cette photo est-elle ici ? » doit avoir une reponse.
          im.rendue_par = `titre nommant « ${s.vraie} » (etait rangee en « ${s.detenue} »)`;
          deplacees += 1;
        } catch { /* deja deplacee */ }
      }
    }

    if (APPLIQUER && deplacees) {
      fs.writeFileSync(chemin, JSON.stringify(m, null, 2));
      console.log(`  ${dossier} : ${deplacees} images rendues, manifeste reecrit`);
    }
  }
  if (!APPLIQUER) console.log('\n  (constat seul — relancer avec --appliquer)');
  else console.log('\n  La carte des 172 classes n a PAS ete touchee.');
}

main();
