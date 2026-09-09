// Moisson par recherche d'images web — LE DERNIER RECOURS, ET IL A UN PRIX.
// ---------------------------------------------------------------------------
// ⚠⚠ CES IMAGES N'ONT AUCUNE LICENCE. ⚠⚠
// Elles ne sont ni sous Creative Commons, ni dans le domaine public : ce sont
// des photos trouvees sur le web ouvert, dont les droits appartiennent a leurs
// auteurs. Les conditions d'utilisation des moteurs de recherche interdisent par
// ailleurs ce type de collecte automatisee.
//
// La decision a ete prise en connaissance de cause le 05/09/2026, apres avoir
// mesure que les sources sous licence ne pouvaient pas nourrir 44 des 71 classes
// marocaines :
//   - la moisson Wikimedia (206 requetes, paginee) : mediane de 3 images ;
//   - le comptage Openverse : 4 images au monde pour `maakouda`, 9 pour
//     `rfissa`, 10 pour `sfenj` ;
//   - Hugging Face : 26 000 images mesurees, toutes levantines.
//
// CE COMMENTAIRE EXISTE POUR QUE LA DECISION RESTE VISIBLE ET REVERSIBLE.
// Le corpus vit dans SON PROPRE DOSSIER : le retirer, c'est supprimer un
// dossier, pas refaire le jeu. La licence est inscrite sur CHAQUE image du
// manifeste, avec l'URL d'origine — pas seulement en tete de ce fichier.
//
// ⚠ ET LES ETIQUETTES NE SONT VERIFIEES PAR PERSONNE.
// Une image Wikimedia a ete rangee par un humain dans une categorie. Ici, la
// seule caution est qu'un moteur l'a rendue pour une requete. C'est la verite
// terrain la plus faible de tout le projet. Le controle qualite n'est donc pas
// optionnel apres cette moisson — il est la condition de son utilisation :
//     python food4k/verifier_images.py corpus-web --appliquer
//     python food4k/detecter_non_aliment.py corpus-web --appliquer
//     python food4k/verifier_fuite.py --appliquer
//
// ⚠ POURQUOI DUCKDUCKGO ET PAS BING.
// Mesure le 05/09/2026 : Bing corrige l'orthographe des noms rares. La requete
// « msemen moroccan » rendait des photos de LIONEL MESSI. Sur des plats dont le
// nom n'existe dans aucun dictionnaire, cette correction est fatale et
// silencieuse — elle remplit une classe d'images plausibles et fausses.
// DuckDuckGo rend « msemen » pour « msemen ».
//
// Usage :  node scripts/construire-corpus-web.js [objectif par classe]

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { REQUETES } = require('./requetes-plats.js');

const RACINE = path.join(__dirname, '..', 'corpus-web');
const OBJECTIF = Number(process.argv[2]) || 200;
const AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
// Releve de 5 a 8 min : la cadence est desormais deliberement lente (6 a 11 s
// entre deux pages), et 5 min coupaient une classe avant sa troisieme requete.
const BUDGET_CLASSE = 8 * 60 * 1000;
const MAX_PAGE = 25_000;
const MAX_IMAGE = 20_000;

const dodo = (ms) => new Promise((r) => setTimeout(r, ms));
const empreinte = (b) => crypto.createHash('sha256').update(b).digest('hex');

// ⚠⚠ LE FILTRE QUI MANQUAIT, ET CE QU'IL A COUTE DE NE PAS L'AVOIR. ⚠⚠
// Le 05/09/2026, la classe `khringo` s'est remplie de 200 images en quelques
// minutes. En les regardant : des BAGHRIR, une autre classe de notre taxonomie,
// plus un logo sportif. Le titre de la page source disait tout — « 10 noms de
// plats marocains super bizarres » : un article qui MENTIONNE khringo parmi dix
// plats, dont le moteur a rendu toutes les illustrations.
//
// Aucun autre controle ne pouvait le voir. Le controle mecanique ne juge que la
// taille et les doublons ; le juge ImageNet dit « c'est de la nourriture » — et
// c'en est ; la coherence visuelle interne ne separe pas la contamination de la
// simple diversite (mesure : `khringo` 46 %, mais `pear` 45 % et `jam` 43 %,
// qui sont parfaitement saines).
//
// Le signal etait dans le titre depuis le debut, et le moissonneur Wikimedia
// l'utilise deja (`titrePorteLeNom`). Mesure sur les deux classes verifiees a
// l'oeil :  khringo 29 % de titres portant son nom, tagine aux coings 96 %.
//
// On exige donc que le nom du plat — ou celui de la requete — apparaisse dans le
// titre OU dans l'URL. Une image hebergee sur /recettes/fekkas-aux-amandes/
// porte son sujet dans son chemin meme quand la page a un titre vague.
const nu = (x) => String(x).toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');

function porteLeNom(texte, classe, requete) {
  const t = nu(texte);
  const tReduit = t.replace(/(.)\1+/g, '$1');
  const mots = [...classe.split(' '), ...requete.split(' ')].filter((m) => m.length >= 4);
  if (!mots.length) return true;   // nom trop court pour trancher : on n'ecarte pas
  return mots.some((m) => {
    const a = nu(m);
    // La translitteration de l'arabe varie : khringo/chringo, msemen/msemmen.
    // Reduire les lettres doublees rapproche les graphies sans tout accepter.
    return a && (t.includes(a) || tReduit.includes(a.replace(/(.)\1+/g, '$1')));
  });
}

async function texte(url, entetes, ms) {
  const r = await fetch(url, {
    headers: { 'User-Agent': AGENT, ...entetes },
    signal: AbortSignal.timeout(ms),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

/** Le jeton que le moteur exige avant de servir ses resultats en JSON. */
async function jeton(requete) {
  const html = await texte(
    `https://duckduckgo.com/?q=${encodeURIComponent(requete)}&iar=images&iax=images&ia=images`,
    { Accept: 'text/html,application/xhtml+xml' }, MAX_PAGE);
  const m = html.match(/vqd="?([\d-]+)"?/);
  return m ? m[1] : null;
}

// ⚠⚠ CE QUI A RATE LE 05/09/2026, ET POURQUOI C'ETAIT GRAVE. ⚠⚠
// La premiere version avalait toute erreur reseau (`catch { return; }`) et ne
// rendait rien. Le moteur nous a bloques en HTTP 403 apres 400 images ; les
// cinquante classes suivantes ont donc affiche « 104 -> 104 (5s) » — exactement
// ce qu'affiche une classe dont le fonds est VIDE.
//
// On aurait conclu « le web n'a pas d'images de zaalouk » alors que le web ne
// nous repondait simplement plus. C'est la meme faute que le corpus qui
// DEDUISAIT ses etiquettes au lieu de les LIRE : confondre « je n'ai pas vu »
// avec « il n'y a rien ». Le blocage se dit maintenant, et il ARRETE la moisson
// au lieu de la laisser defiler dans le vide.
let bloque = null;

async function* resultats(requete, maxPages = 6) {
  let v;
  try {
    v = await jeton(requete);
  } catch (e) {
    if (String(e.message).includes('403') || String(e.message).includes('429')) {
      bloque = `le moteur a refuse la requete (${e.message})`;
    } else {
      bloque = `reseau : ${e.message}`;
    }
    return;
  }
  if (!v) { bloque = 'jeton introuvable — le moteur a change de page'; return; }
  await dodo(2500 + Math.random() * 2500);

  let suite = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(requete)}`
    + `&vqd=${v}&f=,,,&p=1`;
  for (let page = 0; page < maxPages && suite; page++) {
    let d;
    try {
      d = JSON.parse(await texte(suite, {
        Referer: 'https://duckduckgo.com/',
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
      }, MAX_PAGE));
    } catch (e) {
      const m = String(e.message);
      // Un refus n'est pas une absence de resultat : on le NOMME, et on rend la
      // main pour que l'appelant decide d'attendre plutot que de defiler.
      if (m.includes('403') || m.includes('429')) {
        bloque = `le moteur a refuse la pagination (${m})`;
      } else if (page === 0) {
        bloque = `reseau a la premiere page : ${m}`;
      }
      return;
    }
    for (const x of d.results || []) yield x;
    suite = d.next ? `https://duckduckgo.com/${d.next}&vqd=${v}` : null;
    // Cadence deliberement lente et irreguliere : c'est ce qui a manque a la
    // premiere version, bloquee au bout de quatre classes.
    await dodo(6000 + Math.random() * 5000);
  }
}

/** Attendre franchement, puis reessayer une fois. Un blocage est temporaire ;
 *  abandonner tout de suite ferait perdre le reste de la moisson. */
async function respirer(minutes) {
  console.log(`    ... blocage : pause de ${minutes} min avant de reprendre`);
  await dodo(minutes * 60_000);
  bloque = null;
}

/** Ce qui est deja possede, tous corpus confondus : empreintes et comptes. */
function existant() {
  const sha = new Set();
  const compte = {};
  for (const d of ['corpus-web', 'corpus-maghreb-plus', 'corpus-maghreb-hf',
    'corpus-maghreb', 'corpus-ia', 'corpus-entrainement']) {
    const chemin = path.join(__dirname, '..', d);
    if (!fs.existsSync(chemin)) continue;
    for (const f of fs.readdirSync(chemin)) {
      if (!f.endsWith('.jpg')) continue;
      try { sha.add(empreinte(fs.readFileSync(path.join(chemin, f)))); } catch { /* en ecriture */ }
      // Le compte ne porte que sur les corpus marocains : c'est eux qu'on
      // complete. Food-101 a ses propres classes et son propre objectif.
      if (d === 'corpus-entrainement' || d === 'corpus-ia') continue;
      const c = (d === 'corpus-maghreb-hf' ? f.slice(0, -4).replace(/_[^_]+_\d+$/, '')
        : f.slice(0, -4).replace(/_\d+$/, '')).replace(/_/g, ' ');
      compte[c] = (compte[c] || 0) + 1;
    }
  }
  return { sha, compte };
}

async function main() {
  fs.mkdirSync(RACINE, { recursive: true });
  const { sha: vues, compte } = existant();

  let manifeste = [];
  const cheminManifeste = path.join(RACINE, 'manifeste.json');
  if (fs.existsSync(cheminManifeste)) {
    try {
      manifeste = (JSON.parse(fs.readFileSync(cheminManifeste, 'utf8')).images || [])
        .filter((im) => fs.existsSync(path.join(RACINE, im.fichier)));
    } catch { manifeste = []; }
  }

  const ecrireManifeste = () => fs.writeFileSync(cheminManifeste, JSON.stringify({
    source: 'recherche d images web (DuckDuckGo)',
    licence: 'AUCUNE — images du web ouvert, droits de leurs auteurs respectifs',
    avertissement: 'Collecte decidee le 05/09/2026 en connaissance de cause, apres '
      + 'avoir mesure que les sources sous licence ne couvraient pas 44 des 71 '
      + 'classes marocaines. Etiquettes NON VERIFIEES : la seule caution est '
      + "qu'un moteur a rendu l'image pour la requete. Le controle qualite est "
      + 'la condition de leur usage. Les retirer = supprimer ce dossier.',
    images: manifeste,
  }, null, 2));

  const aFaire = Object.keys(REQUETES)
    .map((c) => ({ classe: c, a: compte[c] || 0 }))
    .filter((x) => x.a < OBJECTIF)
    .sort((x, y) => x.a - y.a);   // les plus demunies d'abord

  console.log(`  ${aFaire.length} classes sous ${OBJECTIF} images`);
  console.log('  ⚠ LICENCE : AUCUNE. Etiquettes non verifiees.\n');

  let ajoutees = 0;
  let doublons = 0;
  let horsSujet = 0;
  // Les classes qu'on n'a PAS PU interroger. A ne jamais confondre avec celles
  // dont le fonds est vide : la premiere liste se rattrape, la seconde non.
  const nonInterrogees = [];
  let pausesRestantes = 4;

  for (const { classe } of aFaire) {
    const debut = Date.now();
    const avant = compte[classe] || 0;
    bloque = null;

    for (const requete of REQUETES[classe]) {
      if ((compte[classe] || 0) >= OBJECTIF || Date.now() - debut > BUDGET_CLASSE) break;
      for await (const x of resultats(requete)) {
        if ((compte[classe] || 0) >= OBJECTIF || Date.now() - debut > BUDGET_CLASSE) break;
        // Sous 200 px, l'agrandissement vers 224 n'apporte que du flou : le
        // modele apprendrait le flou. Le controle qualite les ecarterait de
        // toute facon ; autant ne pas les telecharger.
        if ((x.width || 0) < 200 || (x.height || 0) < 200) continue;
        // Le nom du plat doit apparaitre quelque part. Sans cela, la seule
        // caution de l'etiquette serait qu'un article mentionnait le mot.
        if (!porteLeNom(`${x.title || ''} ${x.url || ''} ${x.image || ''}`, classe, requete)) {
          horsSujet++;
          continue;
        }

        let buf;
        try {
          const r = await fetch(x.image, {
            headers: { 'User-Agent': AGENT, Referer: 'https://duckduckgo.com/' },
            signal: AbortSignal.timeout(MAX_IMAGE),
          });
          if (!r.ok) continue;
          const type = r.headers.get('content-type') || '';
          if (!/^image\/(jpeg|png|webp)/.test(type)) continue;
          buf = Buffer.from(await r.arrayBuffer());
        } catch { continue; }
        if (buf.length < 5000) continue;

        const s = empreinte(buf);
        if (vues.has(s)) { doublons++; continue; }
        vues.add(s);

        const base = classe.replace(/[^a-z0-9]+/gi, '_');
        let i = (compte[classe] || 0) + 1;
        let nom = `${base}_${i}.jpg`;
        while (fs.existsSync(path.join(RACINE, nom))) { i++; nom = `${base}_${i}.jpg`; }
        fs.writeFileSync(path.join(RACINE, nom), buf);
        compte[classe] = (compte[classe] || 0) + 1;
        manifeste.push({
          fichier: nom, classe, provenance: 'recherche-web', via: requete,
          titre: String(x.title || '').slice(0, 160),
          source: String(x.image || '').slice(0, 400),
          // ⚠ Inscrit sur CHAQUE image : un jeu se decoupe et se recopie, et
          // l'avertissement doit suivre les fichiers, pas rester en tete.
          licence: 'AUCUNE — image du web, droits de son auteur',
          sha256: s,
        });
        ajoutees++;
      }
    }
    const s = Math.round((Date.now() - debut) / 1000);
    const apres = compte[classe] || 0;
    // ⚠ DIRE LAQUELLE DES DEUX CHOSES S'EST PASSEE.
    // « 104 -> 104 » sans autre mot, c'est ce qu'affichait la version qui
    // confondait refus et absence. Le motif du refus est desormais imprime.
    const suffixe = (apres === avant && bloque) ? `  [${bloque}]` : '';
    console.log(`  ${classe.padEnd(34)} ${String(avant).padStart(3)} -> `
      + `${String(apres).padStart(3)}  (${s}s)${suffixe}`);
    ecrireManifeste();

    if (bloque) {
      nonInterrogees.push(classe);
      if (pausesRestantes > 0) {
        pausesRestantes--;
        // Une pause franche vaut mieux qu'un abandon : le blocage est
        // temporaire, et defiler dans le vide fait perdre toute la moisson.
        await respirer(6);
      } else {
        console.log('\n  ARRET : le moteur refuse toujours apres quatre pauses.');
        console.log('  Les classes non interrogees ci-dessous n ont PAS ete mesurees ;');
        console.log('  relancer plus tard reprendra exactement ou l on s arrete.');
        break;
      }
    }
  }

  ecrireManifeste();
  console.log(`\n  ${ajoutees} images ajoutees, ${doublons} doublons ecartes,`
    + ` ${horsSujet} ecartees car le nom du plat n apparaissait ni dans le titre`
    + ' ni dans l URL');

  // ⚠ DEUX LISTES, ET ELLES NE VEULENT PAS DIRE LA MEME CHOSE.
  if (nonInterrogees.length) {
    console.log(`\n  ${nonInterrogees.length} classes N ONT PAS PU ETRE INTERROGEES (moteur bloquant).`);
    console.log('  Ce n est PAS un constat sur le monde : relancer plus tard les servira.');
    console.log('      ' + nonInterrogees.slice(0, 20).join(', ')
      + (nonInterrogees.length > 20 ? ` … et ${nonInterrogees.length - 20} autres` : ''));
  }
  const maigres = Object.keys(REQUETES)
    .filter((c) => (compte[c] || 0) < 20 && !nonInterrogees.includes(c));
  if (maigres.length) {
    console.log(`\n  ${maigres.length} classes restent sous 20 APRES avoir ete interrogees :`);
    console.log('      ' + maigres.join(', '));
  }
  console.log('\n  ⚠ AUCUNE de ces images n a de licence, et leurs etiquettes ne');
  console.log('    sont verifiees par personne. Passer les controles AVANT usage :');
  console.log('      python food4k/verifier_images.py corpus-web --appliquer');
  console.log('      python food4k/detecter_non_aliment.py corpus-web --appliquer');
  console.log('      python food4k/verifier_fuite.py --appliquer');
}

main().catch((e) => { console.error(e); process.exit(1); });
