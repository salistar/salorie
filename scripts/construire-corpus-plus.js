// Moisson elargie pour les 71 classes hors Food-101.
// ---------------------------------------------------------------------------
// CE QUI A CHANGE PAR RAPPORT A LA MOISSON DU 30/08/2026
// Elle rendait 336 images pour 71 classes et concluait « sources epuisees ».
// Trois defauts la plafonnaient, et aucun ne venait des sources :
//
//   1. UNE SEULE REQUETE PAR PLAT — le nom de la classe. Or le photographe qui
//      ne connait pas le mot decrit le plat : « moroccan thousand hole pancake »
//      pour baghrir. Ces images existent et ne portent jamais le nom.
//      → `requetes-plats.js` pose maintenant 206 questions au lieu de 71.
//
//   2. AUCUNE PAGINATION. La recherche Commons s'arretait au premier lot, quel
//      que soit le nombre de resultats derriere. C'etait le plafond principal.
//      → on pagine avec `gsroffset` jusqu'a epuisement reel.
//
//   3. AUCUNE DEDUPLICATION PAR CONTENU. Openverse REINDEXE Commons : sans
//      comparer les octets, on recompte les memes photos et on croit avoir
//      double le corpus.
//      → empreinte SHA-256 de chaque image, comparee a TOUS les corpus deja la.
//
// ⚠ LA FORCE DE L'ETIQUETTE VARIE, ET C'EST ECRIT IMAGE PAR IMAGE.
//   `categorie`             rangee par un humain — la plus sure
//   `recherche-nom`         le titre porte le nom du plat (graphies tolerees)
//   `recherche-descriptive` SEULE la requete descriptive concorde : l'etiquette
//                           est une HYPOTHESE, pas un constat.
// Ce corpus sert a ENTRAINER. Il ne doit jamais servir a mesurer : la mesure vit
// dans `corpus-ia`, dont les etiquettes sont lues et non supposees.
//
// Usage :  node scripts/construire-corpus-plus.js [par classe] [--sans-openverse]

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { REQUETES } = require('./requetes-plats.js');

const RACINE = path.join(__dirname, '..', 'corpus-maghreb-plus');
const COMMONS = 'https://commons.wikimedia.org/w/api.php';
const AGENT = 'salorie-corpus/1.0 (https://salorie.com; contact@salistar.com)';
const PAR_CLASSE = Number(process.argv[2]) || 200;
const SANS_OPENVERSE = process.argv.includes('--sans-openverse');
const LARGEUR = 512;

// Openverse en anonyme : 20 requetes/minute et 200/JOUR. Ce plafond quotidien
// est la vraie contrainte — on le tient nous-memes plutot que de se faire
// couper au milieu d'une classe et de croire la source vide.
const BUDGET_OPENVERSE = 180;
let depenseOpenverse = 0;

const dodo = (ms) => new Promise((r) => setTimeout(r, ms));
const empreinte = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// ⚠ SANS DELAI MAXIMAL, UN SEUL SERVEUR LENT ARRETE TOUTE LA MOISSON.
// Constate le 02/09/2026 : la classe « bahla » a occupe 7 658 SECONDES — deux
// heures — pour rendre zero image, sur un telechargement qui n'a jamais rendu
// la main. `fetch` n'a aucun delai par defaut : il attend indefiniment. Chaque
// appel reseau passe donc desormais par ici.
const MAX_API = 20_000;
const MAX_IMAGE = 25_000;
async function fetchLimite(url, ms, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(ms) });
}

// ── Ce qui n'est pas une assiette ──────────────────────────────────────────
// Repris de `construire-corpus-maghreb.js`, ou il a ete etabli en constatant ce
// qui etait entre sans lui : un BLASON dans la categorie du gateau kaak, une
// macro scientifique de texture de couscous, un logo de restaurant.
const HORS_SUJET = new RegExp([
  'wappen', 'coat.of.arms', 'blason', 'logo', 'stamp', 'timbre', 'banknote',
  'map\\b', 'carte\\b', 'diagram', 'schema', 'graph', 'chart', 'icon\\b',
  'portrait', 'poster', 'affiche', 'book', 'livre', 'cover', 'sign\\b',
  'packaging', 'package', 'boite', 'sachet', 'label\\b', 'bottle',
  'microscop', 'cavities', 'texture', 'cross.section',
  'shop', 'store', 'market stall', 'restaurant exterior', 'street',
  'building', 'mosque', 'person', 'woman', 'man\\b', 'child',
].join('|'), 'i');

const nu = (x) => String(x).toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');

/** Le titre porte-t-il le nom du plat ? Tolerant aux graphies : la
 *  translitteration de l'arabe varie (bastila/basstila/pastilla/bisteeya), et
 *  exiger l'egalite exacte ecarterait des images parfaitement valides. */
function titrePorteLeNom(titre, classe) {
  const t = nu(titre);
  const tReduit = t.replace(/(.)\1+/g, '$1');
  const mots = classe.split(' ').filter((m) => m.length >= 4);
  if (!mots.length) return false;
  return mots.some((m) => {
    const a = nu(m);
    return a && (t.includes(a) || tReduit.includes(a.replace(/(.)\1+/g, '$1')));
  });
}

async function apiCommons(params) {
  const url = `${COMMONS}?${new URLSearchParams({ ...params, format: 'json' })}`;
  for (let essai = 1; essai <= 4; essai++) {
    try {
      const r = await fetchLimite(url, MAX_API, { headers: { 'User-Agent': AGENT } });
      if (r.ok) return r.json();
      if (r.status < 500 && r.status !== 429) return null;
    } catch { /* coupure : on retente */ }
    await dodo(essai * 1500);
  }
  return null;
}

/** La recherche Commons, PAGINEE. C'etait le plafond de la moisson precedente :
 *  elle s'arretait au premier lot de 50, quel que soit le nombre derriere. */
async function* rechercheCommons(requete, maxPages = 6) {
  for (let page = 0; page < maxPages; page++) {
    const d = await apiCommons({
      action: 'query', generator: 'search', gsrsearch: requete,
      gsrnamespace: '6', gsrlimit: '50', gsroffset: String(page * 50),
      prop: 'imageinfo', iiprop: 'url|mime|extmetadata', iiurlwidth: String(LARGEUR),
    });
    const pages = d && d.query && d.query.pages;
    if (!pages) return;
    const liste = Object.values(pages);
    if (!liste.length) return;
    for (const p of liste) yield p;
    if (!d.continue) return;      // fin reelle, pas fin de lot
    await dodo(400);
  }
}

async function* categorieCommons(nom) {
  let cont = null;
  for (let page = 0; page < 4; page++) {
    const p = {
      action: 'query', generator: 'categorymembers', gcmtitle: `Category:${nom}`,
      gcmtype: 'file', gcmlimit: '100',
      prop: 'imageinfo', iiprop: 'url|mime|extmetadata', iiurlwidth: String(LARGEUR),
    };
    if (cont) p.gcmcontinue = cont;
    const d = await apiCommons(p);
    const pages = d && d.query && d.query.pages;
    if (!pages) return;
    for (const x of Object.values(pages)) yield x;
    cont = d.continue && d.continue.gcmcontinue;
    if (!cont) return;
    await dodo(400);
  }
}

async function openverse(requete, page) {
  if (depenseOpenverse >= BUDGET_OPENVERSE) return null;
  depenseOpenverse++;
  const url = 'https://api.openverse.org/v1/images/?'
    + new URLSearchParams({
      q: requete, page_size: '20', page: String(page),
      license_type: 'all-cc', category: 'photograph',
    });
  for (let essai = 1; essai <= 3; essai++) {
    try {
      const r = await fetchLimite(url, MAX_API, { headers: { 'User-Agent': AGENT } });
      if (r.ok) return r.json();
      if (r.status === 429) { await dodo(8000); continue; }
      return null;
    } catch { await dodo(essai * 2000); }
  }
  return null;
}

/** Les empreintes de TOUT ce qu'on possede deja. Sans cela, Openverse — qui
 *  reindexe Commons — reintroduirait les memes photos sous un autre nom, et le
 *  corpus paraitrait avoir double sans avoir rien gagne. */
function empreintesExistantes() {
  const vues = new Set();
  const dossiers = ['corpus-maghreb', 'corpus-maghreb-hf', 'corpus-ia',
    'corpus-entrainement', 'corpus-maghreb-plus'];
  let lus = 0;
  for (const d of dossiers) {
    const chemin = path.join(__dirname, '..', d);
    if (!fs.existsSync(chemin)) continue;
    for (const f of fs.readdirSync(chemin)) {
      if (!f.endsWith('.jpg')) continue;
      try {
        vues.add(empreinte(fs.readFileSync(path.join(chemin, f))));
        lus++;
      } catch { /* fichier en cours d'ecriture : il sera revu au prochain tour */ }
    }
  }
  console.log(`  ${lus} images deja possedees, empreintes calculees\n`);
  return vues;
}

async function main() {
  fs.mkdirSync(RACINE, { recursive: true });
  const vues = empreintesExistantes();

  const toutes = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'food4k', 'label_map_172.json'), 'utf8')).classes;
  const food101 = new Set(JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'food4k', 'label_map.json'), 'utf8'))
    .classes.map((c) => c.replace(/_/g, ' ').toLowerCase()));
  let cibles = toutes.filter((c) => !food101.has(c.toLowerCase()));

  // Un filtre pour eprouver le moissonneur sur une classe avant de lancer les 71 :
  // verifier d'abord coute quelques secondes, se tromper sur 71 classes coute une heure.
  const filtre = process.argv.find((a) => a.startsWith('--classe='));
  if (filtre) {
    const voulue = filtre.slice(9).toLowerCase();
    cibles = cibles.filter((c) => c.toLowerCase().includes(voulue));
    console.log(`  filtre --classe=${voulue} : ${cibles.length} classe(s)`);
  }

  console.log(`  ${cibles.length} classes, objectif ${PAR_CLASSE} images chacune`);
  console.log(`  budget Openverse : ${SANS_OPENVERSE ? 'desactive' : BUDGET_OPENVERSE + ' requetes'}\n`);

  // ⚠ REPRENDRE, PAS RECOMMENCER.
  // La deduplication compare aux images DEJA POSSEDEES — y compris celles que ce
  // script vient d'ecrire. Redemarrer sans relire l'existant ferait donc compter
  // zero partout : chaque image retrouvee serait vue comme un doublon, et le
  // corpus paraitrait vide alors qu'il est plein. On repart du manifeste.
  let manifeste = [];
  const compte = {};
  const cheminManifeste = path.join(RACINE, 'manifeste.json');
  if (fs.existsSync(cheminManifeste)) {
    try {
      const ancien = JSON.parse(fs.readFileSync(cheminManifeste, 'utf8'));
      manifeste = (ancien.images || []).filter((im) => fs.existsSync(path.join(RACINE, im.fichier)));
      for (const im of manifeste) compte[im.classe] = (compte[im.classe] || 0) + 1;
      console.log(`  reprise : ${manifeste.length} images deja moissonnees, `
        + `${Object.keys(compte).length} classes entamees
`);
    } catch { manifeste = []; }
  }
  let ecartes = 0;
  let doublons = 0;

  /** Retenir une image, si elle est nouvelle et si elle est une assiette. */
  async function retenir(classe, url, titre, provenance, via, licence) {
    if ((compte[classe] || 0) >= PAR_CLASSE) return false;
    if (HORS_SUJET.test(titre)) { ecartes++; return false; }
    let buf;
    try {
      const r = await fetchLimite(url, MAX_IMAGE, { headers: { 'User-Agent': AGENT } });
      if (!r.ok) return false;
      buf = Buffer.from(await r.arrayBuffer());
    } catch { return false; }
    if (buf.length < 4000) return false;           // vignette morte ou pixel

    const sha = empreinte(buf);
    if (vues.has(sha)) { doublons++; return false; }
    vues.add(sha);

    const n = compte[classe] = (compte[classe] || 0) + 1;
    let nom = `${classe.replace(/[^a-z0-9]+/gi, '_')}_${n}.jpg`;
    // Apres une reprise, l'indice peut deja etre pris : on avance jusqu'au libre.
    let bis = n;
    while (fs.existsSync(path.join(RACINE, nom))) {
      bis += 1;
      nom = `${classe.replace(/[^a-z0-9]+/gi, '_')}_${bis}.jpg`;
    }
    fs.writeFileSync(path.join(RACINE, nom), buf);
    manifeste.push({
      fichier: nom, classe, provenance, via,
      titre: String(titre).slice(0, 160), licence: licence || 'inconnue', sha256: sha,
    });
    return true;
  }

  // Aucune classe ne doit pouvoir monopoliser la moisson. Les delais maximaux
  // empechent qu'un appel bloque ; ce budget empeche qu'une CLASSE s'eternise en
  // enchainant des centaines d'appels lents mais valides.
  const BUDGET_CLASSE = 6 * 60 * 1000;

  // ⚠ ECRIT APRES CHAQUE CLASSE, PAS A LA FIN.
  // Une moisson dure des heures. Si le manifeste n'est ecrit qu'au terme, une
  // interruption — panne reseau, arret manuel — rend le travail deja fait
  // irrecuperable : la reprise ne saurait pas ce qui existe, et la
  // deduplication ferait compter zero partout.
  const ecrireManifeste = (images) => {
    fs.writeFileSync(path.join(RACINE, 'manifeste.json'), JSON.stringify({
      source: 'Wikimedia Commons (categories + recherche paginee) et Openverse',
      genere: new Date().toISOString(),
      avertissement: 'Corpus d ENTRAINEMENT. La provenance `recherche-descriptive` '
        + 'signale une etiquette SUPPOSEE d apres la requete, non constatee dans le '
        + 'titre. Ne jamais mesurer sur ce corpus : la mesure vit dans corpus-ia et '
        + 'corpus-maghreb, dont ce corpus est separe par food4k/verifier_fuite.py.',
      images,
    }, null, 2));
  };

  for (const classe of cibles) {
    const requetes = REQUETES[classe] || [classe];
    const debut = Date.now();
    const tempsEcoule = () => Date.now() - debut > BUDGET_CLASSE;

    // 1. Les categories Commons : l'etiquette la plus sure, rangee par un humain.
    for (const r of requetes) {
      if ((compte[classe] || 0) >= PAR_CLASSE || tempsEcoule()) break;
      const capital = r[0].toUpperCase() + r.slice(1);
      for (const nom of [capital, `${capital}s`]) {
        if ((compte[classe] || 0) >= PAR_CLASSE) break;
        for await (const p of categorieCommons(nom)) {
          const ii = (p.imageinfo || [])[0];
          if (!ii || !/^image\/(jpeg|png|webp)/.test(ii.mime || '')) continue;
          const lic = ii.extmetadata && ii.extmetadata.LicenseShortName;
          await retenir(classe, ii.thumburl || ii.url, p.title, 'categorie', nom,
            lic && lic.value);
          // Le budget se verifie ICI aussi : une pagination peut enchainer des
          // centaines de telechargements sans jamais repasser par la boucle
          // exterieure, et echapper ainsi a toute limite de temps.
          if ((compte[classe] || 0) >= PAR_CLASSE || tempsEcoule()) break;
        }
      }
    }

    // 2. La recherche Commons, paginee — le gisement que la version precedente
    //    laissait intact.
    for (const r of requetes) {
      if ((compte[classe] || 0) >= PAR_CLASSE || tempsEcoule()) break;
      for await (const p of rechercheCommons(`${r} food`)) {
        const ii = (p.imageinfo || [])[0];
        if (!ii || !/^image\/(jpeg|png|webp)/.test(ii.mime || '')) continue;
        // Le titre porte-t-il le nom ? Sinon l'etiquette n'est qu'une hypothese
        // tiree de la requete : on le DIT, on ne le cache pas.
        const fort = titrePorteLeNom(p.title, classe) || titrePorteLeNom(p.title, r);
        const lic = ii.extmetadata && ii.extmetadata.LicenseShortName;
        await retenir(classe, ii.thumburl || ii.url, p.title,
          fort ? 'recherche-nom' : 'recherche-descriptive', r, lic && lic.value);
        if ((compte[classe] || 0) >= PAR_CLASSE || tempsEcoule()) break;
      }
    }

    // 3. Openverse en complement, seulement si la classe est encore maigre :
    //    le budget quotidien doit aller aux classes qui en ont besoin.
    if (!SANS_OPENVERSE && (compte[classe] || 0) < PAR_CLASSE / 2) {
      for (const r of requetes) {
        if ((compte[classe] || 0) >= PAR_CLASSE || tempsEcoule()) break;
        for (let page = 1; page <= 3; page++) {
          const d = await openverse(r, page);
          if (!d || !d.results || !d.results.length) break;
          for (const x of d.results) {
            const t = `${x.title || ''} ${(x.tags || []).map((g) => g.name).join(' ')}`;
            await retenir(classe, x.url, t || r, 'openverse', r, x.license);
            if ((compte[classe] || 0) >= PAR_CLASSE || tempsEcoule()) break;
          }
          await dodo(3200);   // 20 requetes/minute en anonyme
        }
      }
    }

    const n = compte[classe] || 0;
    const s = Math.round((Date.now() - debut) / 1000);
    console.log(`  ${classe.padEnd(34)} ${String(n).padStart(3)}  (${s}s)`);
    ecrireManifeste(manifeste);
  }

  ecrireManifeste(manifeste);

  const parProvenance = {};
  for (const im of manifeste) parProvenance[im.provenance] = (parProvenance[im.provenance] || 0) + 1;

  console.log(`\n  ${manifeste.length} images nouvelles`);
  for (const [p, n] of Object.entries(parProvenance)) console.log(`    ${p.padEnd(24)} ${n}`);
  console.log(`  ${doublons} doublons ecartes (memes octets qu'une image deja possedee)`);
  console.log(`  ${ecartes} ecartees comme hors sujet (titre)`);
  console.log(`  Openverse : ${depenseOpenverse}/${BUDGET_OPENVERSE} requetes depensees`);
  const vides = cibles.filter((c) => !compte[c]);
  if (vides.length) console.log(`  ⚠ ${vides.length} classes toujours vides : ${vides.join(', ')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
