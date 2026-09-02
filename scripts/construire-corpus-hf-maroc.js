// Photos de plats marocains, depuis trois jeux Hugging Face.
// ---------------------------------------------------------------------------
// POURQUOI CE TROISIEME CORPUS
// Le trou mesure est la cuisine marocaine : 71 classes du modele, et seulement
// 336 images tirees de Wikimedia Commons apres filtrage. Quatre sources ont ete
// sondees le 01/09/2026 ; voici ce qu'elles donnent reellement :
//
//   Open Food Facts  20 638 photos marocaines, mais 100 % des packshots de
//                    produits emballes. Hors domaine : un jeu de paquets de
//                    semoule n'apprend rien sur une assiette de couscous.
//   Openverse        40 a 80 images NOUVELLES pour les classes rares, et ZERO
//                    pour msemen, sfenj, rfissa, sellou, batbout, taktouka,
//                    maakouda, amlou et kaab el ghazal. Il reindexe Commons,
//                    deja moissonne. Et les homonymes sont massifs : « pastilla »
//                    rend une plage de Majorque, « bastila » un groupe de rock,
//                    « seffa » une personne.
//   Wikipedia        ~224 fichiers sur les 24 plats principaux, licences claires
//                    mais largement les memes que Commons.
//   Hugging Face     3 607 vraies photos de plats — LE seul volume reel.
//
// ⚠⚠ LA LICENCE DE CES IMAGES EST INCONNUE. ⚠⚠
// Aucun des trois depots ne declare de licence. C'est ecrit dans le manifeste,
// image par image, et repete dans le JEU.md produit pour l'entrainement. La
// decision de les utiliser a ete prise en connaissance de cause le 01/09/2026 ;
// ce commentaire existe pour qu'elle reste VISIBLE et REVERSIBLE — le corpus
// vit dans son propre dossier, et le retirer ne demande pas de tout refaire.
//
// Usage :  node scripts/construire-corpus-hf-maroc.js [par classe]

const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..', 'corpus-maghreb-hf');
const API = 'https://datasets-server.huggingface.co/rows';
const LOT = 100;
const PAR_CLASSE = Number(process.argv[2] || 400);

const dodo = (ms) => new Promise((r) => setTimeout(r, ms));

// Les trois jeux, et la traduction de LEURS noms vers NOS classes. Sans cette
// table, « pastilla » et « tajine » n'atterriraient dans aucune de nos 172
// classes et les images seraient rangees sous un nom que le modele ignore.
const JEUX = [
  {
    id: 'elhariri16/moroccan_food_classifier', split: 'train',
    // La colonne `label` porte : couscous, pastilla, rfissa, tajine.
    versClasse: { couscous: 'couscous', pastilla: 'bastila', rfissa: 'rfissa', tajine: 'tagine' },
  },
  {
    id: 'huggan/chebakia', split: 'train',
    // Aucune colonne d'etiquette : le jeu ENTIER est de la chebakia.
    classeUnique: 'chebakia',
  },
  {
    id: 'huggan/chebakia', split: 'validation',
    classeUnique: 'chebakia',
  },
  {
    id: '8sylla/Heritage360-Morocco', split: 'train',
    // Jeu de patrimoine : 22 classes dont DEUX seulement sont alimentaires.
    // Aspirer le reste remplirait le corpus de babouches et de portes sculptees.
    versClasse: { couscous_royal_marocain: 'couscous', couscous_royal_moroccan: 'couscous' },
  },
];

async function lignes(jeu, offset, longueur) {
  const url = `${API}?dataset=${encodeURIComponent(jeu.id)}&config=default`
    + `&split=${jeu.split}&offset=${offset}&length=${longueur}`;
  for (let essai = 1; essai <= 6; essai++) {
    try {
      const r = await fetch(url);
      if (r.ok) return r.json();
      if (r.status !== 429 && r.status < 500) return null;
    } catch { /* coupure : on retente */ }
    await dodo(Math.min(20_000, essai * 3000));
  }
  return null;
}

async function main() {
  fs.mkdirSync(RACINE, { recursive: true });
  const manifeste = [];
  const compte = {};
  let telecharges = 0;
  let horsSujet = 0;

  for (const jeu of JEUX) {
    const entete = await lignes(jeu, 0, 1);
    if (!entete) { console.log(`  ${jeu.id} (${jeu.split}) — injoignable`); continue; }

    const champ = (entete.features || []).find((f) => f.name === 'label');
    const noms = champ && champ.type && champ.type.names ? champ.type.names : null;
    const total = entete.num_rows_total || 0;
    console.log(`  ${jeu.id} (${jeu.split}) — ${total} lignes`);

    for (let offset = 0; offset < total; offset += LOT) {
      const lot = await lignes(jeu, offset, LOT);
      if (!lot) continue;

      for (const ligne of lot.rows) {
        // La classe : soit l'etiquette traduite, soit la classe unique du jeu.
        let classe = jeu.classeUnique;
        if (!classe) {
          const brut = noms ? noms[ligne.row.label] : null;
          classe = brut ? jeu.versClasse[brut] : null;
          if (!classe) { horsSujet++; continue; }
        }

        const n = compte[classe] || 0;
        if (n >= PAR_CLASSE) continue;

        const nom = `${classe}_${jeu.id.split('/')[0]}_${n}.jpg`;
        const dest = path.join(RACINE, nom);
        compte[classe] = n + 1;
        manifeste.push({
          fichier: nom, classe, mots: classe.split(' '),
          provenance: 'huggingface', jeu: jeu.id,
          // ⚠ Inscrit sur CHAQUE image, pas seulement en tete de fichier :
          // un jeu se decoupe et se recopie, et l'avertissement doit suivre.
          licence: 'INCONNUE — aucun tag de licence dans le depot source',
        });

        if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) continue;
        const src = ligne.row.image && ligne.row.image.src;
        if (!src) continue;
        try {
          const img = await fetch(src);
          if (!img.ok) continue;
          const buf = Buffer.from(await img.arrayBuffer());
          if (buf.length < 2000) continue;
          fs.writeFileSync(dest, buf);
          telecharges++;
        } catch { /* une image manquante n'arrete pas la moisson */ }
      }
      await dodo(300);
      if ((offset / LOT) % 5 === 0) {
        console.log(`    offset ${offset} — ${manifeste.length} retenues`);
      }
    }
  }

  fs.writeFileSync(path.join(RACINE, 'manifeste.json'), JSON.stringify({
    source: 'Hugging Face — trois depots marocains',
    licence: 'INCONNUE : aucun des trois depots ne declare de licence',
    avertissement: "images retenues sans licence etablie ; decision prise le 01/09/2026 "
      + "en connaissance de cause. Les retirer = supprimer ce dossier, rien d'autre.",
    images: manifeste,
  }, null, 2));

  const parClasse = Object.entries(compte).sort((a, b) => b[1] - a[1]);
  console.log(`\n  ${manifeste.length} images sur ${parClasse.length} classes (${telecharges} telechargees)`);
  for (const [c, n] of parClasse) console.log(`    ${c.padEnd(12)} ${n}`);
  // Dire ce qu'on a ecarte : un filtre muet est un filtre qu'on ne peut juger.
  if (horsSujet) console.log(`  ${horsSujet} lignes ecartees (classe hors de nos 172)`);
  console.log('\n  ⚠ LICENCE INCONNUE — inscrite au manifeste, image par image.');
}

main().catch((e) => { console.error(e); process.exit(1); });
