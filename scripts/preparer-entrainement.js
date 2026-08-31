// Rassemble les images en un jeu pret a entrainer, sur le Bureau.
// ---------------------------------------------------------------------------
// CE QUE CE SCRIPT PRODUIT
// Un dossier par classe, la convention que lisent directement Keras
// (`image_dataset_from_directory`), PyTorch (`ImageFolder`) et la plupart des
// outils d'entrainement :
//
//   salorie-entrainement/
//     entrainement/tagine/xxx.jpg      80 % des images
//     validation/tagine/yyy.jpg        20 %, jamais vues a l'apprentissage
//     JEU.md                           d'ou vient chaque image, et ce qu'elle vaut
//
// ⚠ LA SEPARATION EST FAITE ICI, ET ELLE EST DECISIVE.
// Un modele evalue sur des images qu'il a vues a l'apprentissage affiche un
// score flatteur et faux. La partition est donc faite AVANT toute chose, de
// facon DETERMINISTE (hachage du nom de fichier) : relancer ce script range la
// meme image du meme cote, et deux entrainements restent comparables.
//
// ⚠ CE QUE CE JEU NE PERMET PAS ENCORE.
// Il compte quelques centaines d'images pour 172 classes. Entrainer un
// classifieur depuis zero la-dessus produirait un modele qui apprend le bruit de
// ces images-la. Ce qui est realiste avec cette taille : un REGLAGE FIN de la
// derniere couche d'un modele deja entraine. Le fichier JEU.md le redit, chiffres
// par classe a l'appui, pour que personne ne s'y trompe.
//
// Usage :  node scripts/preparer-entrainement.js [dossier de sortie]

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SORTIE = process.argv[2]
  || path.join(process.env.USERPROFILE || process.env.HOME || '.', 'Desktop', 'salorie-entrainement');

const SOURCES = [
  {
    dossier: 'corpus-ia',
    nom: 'Food-101 (ETH Zurich)',
    fiabilite: 'reference',
    note: 'etiquettes du jeu de donnees, lues et non deduites',
  },
  {
    dossier: 'corpus-maghreb',
    nom: 'Wikimedia Commons',
    fiabilite: 'moyenne',
    note: 'rangees par des contributeurs ; provenance `categorie` plus sure que `recherche`',
  },
];

// Un cinquieme en validation. Le hachage rend le choix stable d'une execution a
// l'autre — un tirage au hasard melangerait les partitions entre deux versions
// du jeu et rendrait deux mesures incomparables.
const PART_VALIDATION = 0.2;
const versValidation = (nomFichier) => {
  const h = crypto.createHash('sha1').update(nomFichier).digest();
  return (h[0] / 256) < PART_VALIDATION;
};

const RACINE = path.join(__dirname, '..');

function main() {
  fs.rmSync(SORTIE, { recursive: true, force: true });
  const stats = {};
  let copiees = 0;
  const parSource = {};

  for (const src of SOURCES) {
    const dossier = path.join(RACINE, src.dossier);
    const manifeste = path.join(dossier, 'manifeste.json');
    if (!fs.existsSync(manifeste)) {
      console.log(`  ${src.dossier} absent — ignore (le reconstruire avec scripts/construire-corpus*.js)`);
      continue;
    }
    const m = JSON.parse(fs.readFileSync(manifeste, 'utf8'));
    parSource[src.nom] = 0;

    for (const im of m.images) {
      const origine = path.join(dossier, im.fichier);
      if (!fs.existsSync(origine)) continue;

      // Le nom de classe devient un nom de dossier : on retire ce qui gene sur
      // un systeme de fichiers, sans fusionner deux classes distinctes.
      const classe = String(im.classe).replace(/[^a-z0-9]+/gi, '_').toLowerCase();
      const partie = versValidation(im.fichier) ? 'validation' : 'entrainement';
      const cible = path.join(SORTIE, partie, classe);
      fs.mkdirSync(cible, { recursive: true });
      // Le nom porte sa source : une image douteuse doit pouvoir etre retrouvee.
      fs.copyFileSync(origine, path.join(cible, `${src.dossier}__${im.fichier}`));

      stats[classe] = stats[classe] || { entrainement: 0, validation: 0, sources: new Set() };
      stats[classe][partie]++;
      stats[classe].sources.add(src.fiabilite);
      parSource[src.nom]++;
      copiees++;
    }
  }

  // ── Le fichier qui dit ce que vaut ce jeu ────────────────────────────────
  const classes = Object.keys(stats).sort();
  const maigres = classes.filter((c) => stats[c].entrainement + stats[c].validation < 20);
  const sansValidation = classes.filter((c) => stats[c].validation === 0);

  const lignes = [
    '# Jeu d\'entrainement Salorie',
    '',
    `Genere par \`scripts/preparer-entrainement.js\` — ${copiees} images, ${classes.length} classes.`,
    '',
    '## Ce que contient ce dossier',
    '',
    '```',
    'entrainement/<classe>/*.jpg   80 %',
    'validation/<classe>/*.jpg     20 %, jamais vues a l\'apprentissage',
    '```',
    '',
    'La partition est **deterministe** (hachage du nom de fichier) : relancer le',
    'script range la meme image du meme cote, et deux entrainements restent',
    'comparables.',
    '',
    '## D\'ou viennent les images',
    '',
    '| source | images | fiabilite de l\'etiquette |',
    '|---|---|---|',
    ...SOURCES.filter((s) => parSource[s.nom]).map(
      (s) => `| ${s.nom} | ${parSource[s.nom]} | ${s.fiabilite} — ${s.note} |`),
    '',
    '## ⚠ Ce que ce jeu ne permet pas',
    '',
    `Il compte ${copiees} images pour ${classes.length} classes. **Entrainer un classifieur`,
    'depuis zero la-dessus produirait un modele qui apprend le bruit de ces',
    'images-la, pas la forme des plats.** Ce qui est realiste a cette taille :',
    'un **reglage fin de la derniere couche** d\'un modele deja entraine',
    '(EfficientNet, MobileNet), en gelant le reste.',
    '',
    `${maigres.length} classes ont moins de 20 images au total`
      + (maigres.length ? ` : ${maigres.slice(0, 10).join(', ')}${maigres.length > 10 ? '…' : ''}` : '')
      + '.',
    sansValidation.length
      ? `${sansValidation.length} classes n'ont AUCUNE image de validation : leur score ne voudra rien dire.`
      : 'Toutes les classes ont au moins une image de validation.',
    '',
    'La vraie matiere viendra des corrections d\'utilisateurs, que l\'application',
    'collecte deja (`/ml/feedback`). `food4k/exporter_dataset.py` les transforme en',
    'exemples utilisables. Au 31/08/2026 : 7 enregistrements, 0 correction.',
    '',
    '## Entrainer, puis verifier avant de deployer',
    '',
    '```bash',
    '# Le modele candidat DOIT passer la barre avant de prendre la tete de la cascade',
    'python food4k/valider_modele.py mon_modele.tflite mes_etiquettes.json --seuil 0.50',
    '```',
    '',
    'Le modele en place sert de repere : 57,4 % de justesse globale, 71,9 % sur les',
    'seules reponses qu\'il rend au-dessus de son seuil.',
    '',
    '## Repartition par classe',
    '',
    '| classe | entrainement | validation |',
    '|---|---|---|',
    ...classes.map((c) => `| ${c} | ${stats[c].entrainement} | ${stats[c].validation} |`),
  ];

  fs.writeFileSync(path.join(SORTIE, 'JEU.md'), lignes.join('\n') + '\n');

  console.log(`\n  ${copiees} images copiees, ${classes.length} classes`);
  console.log(`  ${SORTIE}`);
  for (const [nom, n] of Object.entries(parSource)) console.log(`    ${nom.padEnd(24)} ${n}`);
  if (maigres.length) console.log(`  ⚠ ${maigres.length} classes sous 20 images`);
  if (sansValidation.length) console.log(`  ⚠ ${sansValidation.length} classes sans image de validation`);
}

main();
