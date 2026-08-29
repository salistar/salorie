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
// exactement ce qu'un utilisateur photographie. Les 19 images de substitution
// utilisees jusqu'ici venaient de Pixabay et etaient des SCENES (un etal, un bol
// sur une table) : mesurer la reconnaissance dessus mesurait surtout le decalage
// de domaine.
//
// ⚠ LA STRATIFICATION N'EST PAS UN DETAIL.
// Le jeu est TRIE PAR CLASSE : 250 photos d'apple_pie, puis 250 de
// baby_back_ribs, etc. Prendre les 1 471 premieres lignes donnerait six classes
// sur cent-une, et le taux mesure serait celui de six plats — un chiffre qui
// bougerait au gre de ces six-la et qu'on prendrait pour le taux global.
// On prend donc un nombre EGAL de photos par classe.
//
// Usage :  node scripts/construire-corpus.js [nombre]
//   Les images vont dans `corpus-ia/` (ignore par git : ~75 Mo).

const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..', 'corpus-ia');
const API = 'https://datasets-server.huggingface.co/rows';
const JEU = 'ethz%2Ffood101';
const PAR_CLASSE_TOTAL = 250; // 25 250 / 101 : la taille d'un bloc de classe
const CIBLE = Number(process.argv[2] || 1471);

const dodo = (ms) => new Promise((r) => setTimeout(r, ms));

async function lignes(offset, longueur) {
  // L'API repond parfois 502 sous charge : on retente, sinon la construction
  // s'arrete a mi-parcours et laisse un corpus incomplet qu'on croirait entier.
  for (let essai = 1; essai <= 4; essai++) {
    const r = await fetch(`${API}?dataset=${JEU}&config=default&split=validation&offset=${offset}&length=${longueur}`);
    if (r.ok) return r.json();
    await dodo(essai * 1500);
  }
  throw new Error(`lignes(${offset}) : l'API n'a pas repondu`);
}

async function main() {
  fs.mkdirSync(RACINE, { recursive: true });

  const entete = await lignes(0, 1);
  const classes = entete.features.find((f) => f.name === 'label').type.names;
  const parClasse = Math.max(1, Math.floor(CIBLE / classes.length));
  console.log(`  ${classes.length} classes, ${parClasse} photos chacune → ${classes.length * parClasse} images`);

  const manifeste = [];
  let telecharges = 0;
  let ignores = 0;

  for (let c = 0; c < classes.length; c++) {
    const classe = classes[c];
    // Le bloc de cette classe commence a c * 250. On prend au DEBUT du bloc :
    // deterministe, donc le corpus est reproductible a l'identique, et une
    // comparaison d'un mois sur l'autre porte sur les memes photos.
    const lot = await lignes(c * PAR_CLASSE_TOTAL, parClasse);

    for (let i = 0; i < lot.rows.length; i++) {
      const nom = `${String(c).padStart(3, '0')}_${classe}_${i}.jpg`;
      const dest = path.join(RACINE, nom);
      manifeste.push({ fichier: nom, classe, mots: classe.split('_') });

      // Deja la : on ne retelecharge pas. Relancer le script apres une coupure
      // reprend donc ou il en etait au lieu de tout refaire.
      if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) { ignores++; continue; }

      const src = lot.rows[i].row.image?.src;
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
    if (c % 10 === 0) console.log(`  ${classe} … ${telecharges} telechargees, ${ignores} deja la`);
  }

  fs.writeFileSync(
    path.join(RACINE, 'manifeste.json'),
    JSON.stringify({ source: 'ethz/food101 (validation)', parClasse, images: manifeste }, null, 2),
  );
  console.log(`\n  ${manifeste.length} images au manifeste (${telecharges} telechargees, ${ignores} deja presentes)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
