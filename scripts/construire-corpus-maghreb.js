// Corpus de reference pour la cuisine marocaine et MENA.
// ---------------------------------------------------------------------------
// POURQUOI IL MANQUAIT, ET POURQUOI C'EST LE PLUS IMPORTANT
// Le corpus Food-101 mesure 101 des 172 classes du modele embarque. Les 71
// autres sont precisement celles pour lesquelles ce modele a ete choisi : la
// cuisine marocaine et MENA, que les modeles generalistes reconnaissent mal.
// C'est aussi le public de Salorie. Autrement dit, ce que la cascade fait sur un
// tajine, une rfissa ou des kaab el ghazal n'etait pas mesure du tout — et c'est
// la moitie du sujet.
//
// ⚠⚠ LA VERITE TERRAIN EST ICI PLUS FAIBLE QU'AVEC FOOD-101, ET IL FAUT LE DIRE.
//
// Food-101 est un jeu de reference : chaque photo a ete etiquetee pour servir de
// verite. Wikimedia Commons est une mediatheque : ses images sont rangees par des
// contributeurs, avec des intentions variees. Deux consequences pratiques :
//
//   - une image de la categorie « Couscous » PEUT montrer une table entiere, un
//     paquet de semoule, ou une preparation en cours ;
//   - une image trouvee par RECHERCHE (repli quand la categorie n'existe pas)
//     n'est etiquetee que par la presence du mot dans son titre.
//
// La provenance de chaque etiquette est donc inscrite dans le manifeste :
// `categorie` (rangee par un humain) ou `recherche` (plus faible). Une mesure qui
// melangerait les deux sans le dire referait, en plus discret, l'erreur du
// 29/08/2026 — croire une verite terrain qu'on n'a pas verifiee.
//
// Ce corpus sert a REPERER un effondrement, pas a etablir un taux publiable.
//
// Usage :  node scripts/construire-corpus-maghreb.js [par classe]

const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..', 'corpus-maghreb');
const COMMONS = 'https://commons.wikimedia.org/w/api.php';
// Wikimedia demande une identification explicite ; sans elle, les requetes
// automatisees sont refusees ou fortement ralenties.
const AGENT = 'salorie-corpus/1.0 (https://salorie.com; contact@salistar.com)';
const PAR_CLASSE = Number(process.argv[2] || 6);
const LARGEUR = 512; // des vignettes : le modele travaille en 224 px

const dodo = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(params) {
  const url = `${COMMONS}?${new URLSearchParams({ ...params, format: 'json', origin: '*' })}`;
  for (let essai = 1; essai <= 4; essai++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': AGENT } });
      if (r.ok) return r.json();
    } catch { /* on retente */ }
    await dodo(essai * 1500);
  }
  return null;
}

/** Les variantes de nom d'une categorie. Les graphies divergent — « Tajine »
 *  n'existe pas, « Tajines » oui ; « Msemen » non, « Msemmen » oui. */
function variantes(classe) {
  const mots = classe.split(' ');
  const capital = mots.map((m) => m[0].toUpperCase() + m.slice(1)).join(' ');
  const v = new Set([capital, capital + 's', capital.replace(/s$/, '')]);
  // Quelques graphies connues qui ne se deduisent pas mecaniquement.
  const CONNUES = {
    'tagine': ['Tajines', 'Tagine'],
    'msemen': ['Msemmen'],
    'bastila': ['Pastilla'],
    'chicken basstila': ['Pastilla'],
    'fish basstila': ['Pastilla'],
    'kaab el ghazal': ['Kaab el ghzal'],
    'sfenj': ['Sfenj'],
    'shakchouka': ['Shakshouka'],
    'zaalouk': ['Zaalouk'],
    'baghrir': ['Baghrir'],
    'chebakia': ['Chebakia'],
    'harcha': ['Harcha'],
    'briouat': ['Briouat'],
    'mechoui': ['Mechoui'],
    'tanjia': ['Tanjia'],
    'seffa': ['Seffa'],
    'rfissa': ['Rfissa'],
  };
  for (const c of CONNUES[classe.toLowerCase()] || []) v.add(c);
  return [...v];
}

async function fichiersParCategorie(classe) {
  for (const nom of variantes(classe)) {
    const d = await api({
      action: 'query', generator: 'categorymembers', gcmtitle: `Category:${nom}`,
      gcmtype: 'file', gcmlimit: String(PAR_CLASSE * 3),
      prop: 'imageinfo', iiprop: 'url|mime', iiurlwidth: String(LARGEUR),
    });
    const pages = d?.query?.pages;
    if (pages && Object.keys(pages).length) {
      return { source: 'categorie', via: nom, pages: Object.values(pages) };
    }
    await dodo(300);
  }
  return null;
}

async function fichiersParRecherche(classe) {
  const d = await api({
    action: 'query', generator: 'search', gsrsearch: `${classe} food`,
    gsrnamespace: '6', gsrlimit: String(PAR_CLASSE * 3),
    prop: 'imageinfo', iiprop: 'url|mime', iiurlwidth: String(LARGEUR),
  });
  const pages = d?.query?.pages;
  if (!pages || !Object.keys(pages).length) return null;
  return { source: 'recherche', via: `${classe} food`, pages: Object.values(pages) };
}

async function main() {
  fs.mkdirSync(RACINE, { recursive: true });

  const toutes = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'food4k', 'label_map_172.json'), 'utf8')).classes;
  const food101 = new Set(JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'food4k', 'label_map.json'), 'utf8'))
    .classes.map((c) => c.replace(/_/g, ' ').toLowerCase()));
  const cibles = toutes.filter((c) => !food101.has(c.toLowerCase()));

  console.log(`  ${cibles.length} classes hors Food-101 a couvrir`);
  console.log(`  objectif : ${PAR_CLASSE} photos chacune\n`);

  const manifeste = [];
  const vides = [];
  let echecs = 0;

  for (const classe of cibles) {
    let lot = await fichiersParCategorie(classe);
    if (!lot) lot = await fichiersParRecherche(classe);
    if (!lot) { vides.push(classe); console.log(`  ${classe.padEnd(30)} AUCUNE image`); continue; }

    let pris = 0;
    for (const page of lot.pages) {
      if (pris >= PAR_CLASSE) break;
      const ii = (page.imageinfo || [])[0];
      // Les PDF, SVG et videos rangees dans les memes categories n'ont rien a
      // faire dans un corpus d'images de plats.
      if (!ii || !/^image\/(jpeg|png)$/.test(ii.mime || '')) continue;
      const src = ii.thumburl || ii.url;
      if (!src) continue;

      const nom = `${classe.replace(/[^a-z0-9]+/gi, '_')}_${pris}.jpg`;
      const dest = path.join(RACINE, nom);
      if (!fs.existsSync(dest) || fs.statSync(dest).size < 1000) {
        // ⚠ UN ECHEC DE TELECHARGEMENT DOIT SE VOIR.
        // Premiere version : `catch { continue; }`. Wikimedia ralentit les
        // requetes automatisees, et les vignettes revenaient en erreur — la
        // classe « tagine » affichait donc « 0 images (categorie : Tagine) »
        // alors que la categorie en contenait. Un zero qu'on prend pour une
        // absence de source, quand c'est un refus de debit, envoie chercher le
        // probleme au mauvais endroit.
        let obtenu = false;
        for (let essai = 1; essai <= 3 && !obtenu; essai++) {
          try {
            const img = await fetch(src, { headers: { 'User-Agent': AGENT } });
            if (img.ok) {
              const buf = Buffer.from(await img.arrayBuffer());
              if (buf.length >= 2000) { fs.writeFileSync(dest, buf); obtenu = true; break; }
            }
          } catch { /* on retente */ }
          await dodo(essai * 2000);
        }
        if (!obtenu) { echecs++; continue; }
      }
      manifeste.push({
        fichier: nom, classe, mots: classe.split(' '),
        // ⚠ CE CHAMP EST LA POUR QU'ON NE MELANGE PAS DEUX QUALITES DE VERITE.
        provenance: lot.source, via: lot.via, titre: page.title,
      });
      pris++;
      await dodo(250);
    }
    console.log(`  ${classe.padEnd(30)} ${String(pris).padStart(2)} images  (${lot.source} : ${lot.via})`);
    await dodo(300);
  }

  const parCategorie = manifeste.filter((m) => m.provenance === 'categorie').length;
  fs.writeFileSync(path.join(RACINE, 'manifeste.json'), JSON.stringify({
    source: 'Wikimedia Commons',
    avertissement: "verite terrain plus faible que Food-101 : les images `recherche` "
      + "ne sont etiquetees que par la presence du mot dans leur titre",
    images: manifeste,
  }, null, 2));

  console.log(`\n  ${manifeste.length} images sur ${cibles.length} classes`);
  console.log(`  dont ${parCategorie} par categorie (plus sur) et ${manifeste.length - parCategorie} par recherche`);
  if (vides.length) console.log(`  ${vides.length} classes sans aucune source : ${vides.slice(0, 8).join(', ')}…`);
  // Distingue « pas de source » de « source refusee » : ce sont deux
  // problemes differents, et un seul se resout en relancant.
  if (echecs) console.log(`  ${echecs} telechargements refuses malgre trois essais — relancer completera`);
}

main().catch((e) => { console.error(e); process.exit(1); });
