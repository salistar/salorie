// Construit le corpus de reference pour la reconnaissance d'aliments.
// ---------------------------------------------------------------------------
// POURQUOI IL FAUT UN CORPUS
// Sans lui, aucune regression de reconnaissance n'est visible. La cascade peut
// se degrader d'un palier a l'autre, un fournisseur peut changer de modele sous
// nos pieds, un prompt peut etre reecrit : rien ne le signalerait, et on
// l'apprendrait par les avis sur le Play Store.
//
// LA SOURCE : Food-101 (ETH Zurich), 101 plats, 25 250 photos de validation.
// C'est le jeu de reference du domaine, et surtout : ce sont des PLATS CADRES,
// exactement ce qu'un utilisateur photographie.
//
// ⚠⚠ L'ETIQUETTE EST LUE, JAMAIS CALCULEE. ⚠⚠
//
// La premiere version de ce fichier supposait que la partition de validation
// etait triee par classe, 250 photos chacune, et deduisait l'etiquette de la
// position : `classe = offset / 250`. Cette hypothese est FAUSSE, et elle n'a
// jamais ete verifiee — il suffisait de lire le champ `label` que l'API renvoie
// a cote de chaque image.
//
// Ce que cela a coute (29/08/2026) : l'offset 19000, calcule comme « pizza »,
// contient en realite des nachos. Le classifieur repondait « Nachos », on
// comptait une erreur, et on a conclu qu'il ne reconnaissait RIEN — 0 sur 74.
// Sur cette base, le palier a ete debranche en production, cote serveur ET cote
// telephone. Le modele avait raison ; c'est la mesure qui avait tort.
//
// Une mesure qui deduit sa verite au lieu de la lire ne mesure pas : elle
// invente une reference et note le monde dessus.
//
// Usage :  node scripts/construire-corpus.js [par classe] [--split train|validation]
//   Les images vont dans `corpus-ia/` (ignore par git : ~75 Mo).

const fs = require('fs');
const path = require('path');

// ⚠⚠ ENTRAINER ET MESURER NE DOIVENT PAS PARTAGER LES MEMES IMAGES. ⚠⚠
//
// Jusqu'au 01/09/2026, le jeu d'entrainement etait bati sur la partition de
// VALIDATION — celle-la meme que `mesurer-reconnaissance.js` et
// `valider_modele.py` interrogent pour juger un modele. Un modele entraine
// dessus aurait affiche un score flatteur et faux : il aurait deja vu les
// images de l'examen.
//
// Food-101 offre 75 750 images d'entrainement et 25 250 de validation. On tient
// les deux separees, par construction et non par discipline :
//   --split train       -> corpus-entrainement/   (pour apprendre)
//   --split validation  -> corpus-ia/             (pour mesurer, par defaut)
//
// Le dossier decoule du split : on ne peut pas se tromper en passant l'un et
// en ecrivant dans l'autre.
const iSplit = process.argv.indexOf('--split');
const SPLIT = iSplit > 0 && process.argv[iSplit + 1] === 'train' ? 'train' : 'validation';
const DOSSIER = SPLIT === 'train' ? 'corpus-entrainement' : 'corpus-ia';

const RACINE = path.join(__dirname, '..', DOSSIER);
const API = 'https://datasets-server.huggingface.co/rows';
const JEU = 'ethz%2Ffood101';
const LOT = 100; // le maximum accepte par l'API en une requete
const PAR_CLASSE = Number(process.argv[2] || 14);

const dodo = (ms) => new Promise((r) => setTimeout(r, ms));

async function lignes(offset, longueur) {
  // ⚠ HUGGING FACE LIMITE LE DEBIT, ET LA CONSTRUCTION EST LONGUE.
  // Quatre essais rapproches ne suffisaient pas : la construction s'arretait
  // apres 182 images sur 1 414. On patiente donc vraiment — jusqu'a une demi-
  // minute — et on rend `null` plutot que de lever, pour qu'un trou dans un lot
  // ne detruise pas le travail deja fait. Les classes incompletes sont
  // signalees a la fin.
  for (let essai = 1; essai <= 7; essai++) {
    try {
      const r = await fetch(`${API}?dataset=${JEU}&config=default&split=${SPLIT}&offset=${offset}&length=${longueur}`);
      if (r.ok) return r.json();
      if (r.status !== 429 && r.status < 500) return null;
    } catch { /* coupure reseau : on retente */ }
    await dodo(Math.min(30_000, essai * 4000));
  }
  return null;
}

async function main() {
  fs.mkdirSync(RACINE, { recursive: true });

  const entete = await lignes(0, 1);
  if (!entete) throw new Error("l'API des jeux de donnees est injoignable");
  const classes = entete.features.find((f) => f.name === 'label').type.names;
  const total = entete.num_rows_total || 25250;
  console.log(`  partition ${SPLIT} → ${DOSSIER}`);
  console.log(`  ${classes.length} classes, ${total} photos disponibles`);
  console.log(`  objectif : ${PAR_CLASSE} par classe → ${classes.length * PAR_CLASSE} images\n`);

  const compte = {};        // classe -> nombre deja pris
  const manifeste = [];
  let telecharges = 0;
  let ignores = 0;

  // On balaie la partition et on remplit les classes au fur et a mesure. On
  // s'arrete des que toutes sont pleines : inutile de parcourir 25 250 lignes
  // si les 1 414 images voulues sont trouvees avant.
  for (let offset = 0; offset < total; offset += LOT) {
    const pleines = classes.filter((c) => (compte[c] || 0) >= PAR_CLASSE).length;
    if (pleines === classes.length) break;

    const lot = await lignes(offset, LOT);
    if (!lot) { console.log(`  offset ${offset} — lot manquant, on continue`); continue; }
    for (const ligne of lot.rows) {
      // ⚠ ICI. L'etiquette vient du jeu de donnees, pas d'un calcul.
      const classe = classes[ligne.row.label];
      if (!classe) continue;
      const n = compte[classe] || 0;
      if (n >= PAR_CLASSE) continue;

      const nom = `${String(ligne.row.label).padStart(3, '0')}_${classe}_${n}.jpg`;
      const dest = path.join(RACINE, nom);
      compte[classe] = n + 1;
      manifeste.push({ fichier: nom, classe, mots: classe.split('_') });

      // Deja la : on ne retelecharge pas. Relancer apres une coupure reprend
      // donc ou on en etait au lieu de tout refaire.
      if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) { ignores++; continue; }

      const src = ligne.row.image?.src;
      if (!src) continue;
      try {
        const img = await fetch(src);
        if (!img.ok) continue;
        fs.writeFileSync(dest, Buffer.from(await img.arrayBuffer()));
        telecharges++;
      } catch {
        /* une image manquante ne doit pas faire tomber la construction */
      }
    }
    await dodo(400);
    if ((offset / LOT) % 10 === 0) {
      console.log(`  offset ${offset} — ${manifeste.length} images, ${pleines}/${classes.length} classes pleines`);
    }
  }

  const manquantes = classes.filter((c) => (compte[c] || 0) < PAR_CLASSE);
  if (manquantes.length) {
    // Dit, jamais taise : un corpus incomplet dont on croit qu'il est complet
    // fausse toute comparaison ulterieure.
    console.log(`\n  ⚠ ${manquantes.length} classes incompletes : ${manquantes.slice(0, 6).join(', ')}…`);
  }

  fs.writeFileSync(
    path.join(RACINE, 'manifeste.json'),
    JSON.stringify({
      source: `ethz/food101 (${SPLIT})`,
      split: SPLIT,
      etiquettes: 'lues dans le champ `label` du jeu, jamais deduites de la position',
      parClasse: PAR_CLASSE,
      images: manifeste,
    }, null, 2),
  );
  console.log(`\n  ${manifeste.length} images au manifeste (${telecharges} telechargees, ${ignores} deja presentes)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
