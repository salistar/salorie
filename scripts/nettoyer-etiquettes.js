// Ecarte les images dont RIEN n'atteste l'etiquette.
// ---------------------------------------------------------------------------
// CE QUI A ETE CONSTATE LE 08/09/2026, ET POURQUOI C'EST LE VRAI PLAFOND
// La moitie marocaine du modele plafonnait a 38 % de justesse. Ni l'architecture
// ni le volume n'etaient en cause — la comparaison de six socles pre-entraines
// les separait de moins d'un point, et le corpus etait passe de 336 a 12 000
// images. C'etaient les ETIQUETTES.
//
// Sur douze images Openverse tirees au hasard parmi celles dont le titre ne
// nomme pas le plat, DIX montraient autre chose :
//     `dates`   -> une planche botanique d'un cafeier
//     `harcha`  -> un lezard (Psammodromus algirus)
//     `mechoui` -> l'interieur vide d'un cafe
//     `matbucha`, `chicken basstila`, `fish and vegetables`, `jam`... idem
// Deux seulement etaient justes. Une image fausse n'affaiblit pas seulement sa
// classe : elle enseigne au modele qu'un lezard est de la harcha, et tire vers
// elle toutes les photos brunes sur fond clair.
//
// ⚠ LA REGLE DEPEND DE LA PROVENANCE, ET C'EST TOUT L'INTERET.
// Appliquer le meme filtre partout detruirait plus qu'il ne nettoie :
//
//   categorie              UN HUMAIN a range l'image dans une categorie
//                          Wikimedia. C'est une caution plus forte qu'un titre.
//                          On n'y touche pas — d'autant que le controle y
//                          produit 53 % de faux positifs, sur de simples
//                          variantes de graphie (« Makers of Amlu » EST de
//                          l'amlou).
//   recherche-nom          le titre porte deja le nom : le controle est sans
//                          objet.
//   recherche-descriptive  le titre ne le porte JAMAIS, par definition de cette
//                          provenance. Filtrer la supprimerait la provenance
//                          entiere, pas ses erreurs.
//   openverse              titre libre ecrit par le deposant, aucune curation.
//                          C'EST LA SEULE OU LE CONTROLE MORD.
//
// ⚠ ON DEPLACE, ON NE SUPPRIME PAS. Environ deux images sur dix etaient justes :
// le nettoyage a un cout, il est assume et il est reversible.
//
// Usage :  node scripts/nettoyer-etiquettes.js [--appliquer]

const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const APPLIQUER = process.argv.includes('--appliquer');

// Les provenances dont le titre est la SEULE caution disponible.
const A_CONTROLER = new Set(['openverse']);

const nu = (x) => String(x).toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');

function porteLeNom(titre, classe, requete) {
  const t = nu(titre);
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
  for (const dossier of ['corpus-maghreb-plus', 'corpus-web']) {
    const racine = path.join(RACINE, dossier);
    const chemin = path.join(racine, 'manifeste.json');
    if (!fs.existsSync(chemin)) continue;
    const m = JSON.parse(fs.readFileSync(chemin, 'utf8'));

    const gardees = [];
    const ecartees = [];
    for (const im of m.images || []) {
      if (!fs.existsSync(path.join(racine, im.fichier))) continue;
      const controlee = A_CONTROLER.has(im.provenance);
      // ⚠ Le TITRE seul. Y joindre la requete rendrait le controle circulaire :
      // on chercherait les mots de la requete dans un texte qui la contient.
      // Une premiere version le faisait et annoncait « 0 image muette » sur
      // 5 988 — un resultat parfait qui ne mesurait rien.
      if (!controlee || porteLeNom(im.titre || '', im.classe, im.via)) gardees.push(im);
      else ecartees.push(im);
    }

    const perdu = {};
    const reste = {};
    for (const im of ecartees) perdu[im.classe] = (perdu[im.classe] || 0) + 1;
    for (const im of gardees) reste[im.classe] = (reste[im.classe] || 0) + 1;

    console.log(`\n  ${dossier} : ${gardees.length} gardees, ${ecartees.length} ecartees`);
    const graves = Object.keys(perdu)
      .map((c) => [c, perdu[c], reste[c] || 0])
      .sort((a, b) => b[1] - a[1]).slice(0, 12);
    if (graves.length) {
      console.log(`  ${'classe'.padEnd(34)}${'ecarte'.padStart(8)}${'reste'.padStart(8)}`);
      for (const [c, p, r] of graves) {
        console.log(`  ${c.padEnd(34)}${String(p).padStart(8)}${String(r).padStart(8)}`
          + (r < 20 ? '   <-- tombe sous le seuil d admission' : ''));
      }
    }

    if (!APPLIQUER || !ecartees.length) continue;
    const cible = path.join(racine, 'rejets', 'titre_muet');
    fs.mkdirSync(cible, { recursive: true });
    for (const im of ecartees) {
      try { fs.renameSync(path.join(racine, im.fichier), path.join(cible, im.fichier)); }
      catch { /* deja deplacee */ }
    }
    fs.writeFileSync(chemin, JSON.stringify({ ...m, images: gardees }, null, 2));
    console.log(`  ${ecartees.length} images deplacees dans ${dossier}/rejets/titre_muet/`);
  }
  if (!APPLIQUER) console.log('\n  (constat seul — relancer avec --appliquer)');
}

main();
