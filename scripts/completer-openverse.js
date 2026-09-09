// Une seconde passe Openverse, dépensée par BESOIN et non par ordre alphabétique.
// ---------------------------------------------------------------------------
// LE DEFAUT QUE CE SCRIPT REPARE
// `construire-corpus-plus.js` parcourt les classes dans l'ordre alphabetique et
// puise dans un budget Openverse commun de 180 requetes par jour (le plafond
// anonyme). Resultat mesure le 05/09/2026 : le budget etait epuise a la lettre
// « f ». Les classes suivantes n'ont RIEN recu d'Openverse — dont `harira`
// (240 images disponibles) et `mechoui` (184), restees a ZERO.
//
// Ce n'etait pas une limite du monde : c'etait une limite de l'ordre alphabetique.
// Le budget va donc desormais AUX CLASSES QUI EN ONT LE PLUS BESOIN, mesure
// d'abord et depense ensuite.
//
// COMMENT LE BESOIN EST ETABLI
//   1. On compte ce que chaque classe possede deja sur le disque.
//   2. On demande a Openverse combien d'images il annonce pour chacune —
//      UNE requete par classe, comptee au budget comme les autres.
//   3. On classe par « ce qui manque, et qu'Openverse peut vraiment fournir ».
//      Une classe a qui il manque 200 images mais dont Openverse n'en a que 4
//      passe APRES une classe a qui il en manque 100 et qu'il peut servir.
//
// ⚠ ET S'IL N'Y A RIEN, ON LE DIT.
// Le compte rendu final distingue « pas assez de budget » de « le fonds est
// vide ». Ce sont deux conclusions opposees : la premiere se resout en revenant
// demain, la seconde jamais.
//
// Usage :  node scripts/completer-openverse.js [objectif] [budget]

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { REQUETES } = require('./requetes-plats.js');

const RACINE = path.join(__dirname, '..', 'corpus-maghreb-plus');
const AGENT = 'salorie-corpus/1.0 (https://salorie.com; contact@salistar.com)';
const OBJECTIF = Number(process.argv[2]) || 200;
const BUDGET = Number(process.argv[3]) || 190;

let depense = 0;
const dodo = (ms) => new Promise((r) => setTimeout(r, ms));
const empreinte = (b) => crypto.createHash('sha256').update(b).digest('hex');

async function openverse(requete, page, taille) {
  if (depense >= BUDGET) return null;
  depense++;
  const url = 'https://api.openverse.org/v1/images/?' + new URLSearchParams({
    q: requete, page_size: String(taille), page: String(page), license_type: 'all-cc',
  });
  for (let essai = 1; essai <= 3; essai++) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': AGENT }, signal: AbortSignal.timeout(25_000),
      });
      if (r.ok) return r.json();
      // 429 : on a touche la limite par minute, pas la limite par jour. On
      // attend plutot que d'abandonner — abandonner ici ferait conclure « fonds
      // vide » sur une simple bousculade.
      if (r.status === 429) { await dodo(10_000); continue; }
      return null;
    } catch { await dodo(essai * 2000); }
  }
  return null;
}

function possedees() {
  const n = {};
  const sha = new Set();
  for (const d of ['corpus-maghreb-plus', 'corpus-maghreb-hf', 'corpus-maghreb']) {
    const chemin = path.join(__dirname, '..', d);
    if (!fs.existsSync(chemin)) continue;
    for (const f of fs.readdirSync(chemin)) {
      if (!f.endsWith('.jpg')) continue;
      try { sha.add(empreinte(fs.readFileSync(path.join(chemin, f)))); } catch { /* en cours d'ecriture */ }
      if (d !== 'corpus-maghreb-plus') continue;
      const c = f.slice(0, -4).replace(/_\d+$/, '').replace(/_/g, ' ');
      n[c] = (n[c] || 0) + 1;
    }
  }
  return { n, sha };
}

async function main() {
  fs.mkdirSync(RACINE, { recursive: true });
  const { n: compte, sha: vues } = possedees();
  const cheminManifeste = path.join(RACINE, 'manifeste.json');
  let manifeste = [];
  if (fs.existsSync(cheminManifeste)) {
    try {
      manifeste = (JSON.parse(fs.readFileSync(cheminManifeste, 'utf8')).images || [])
        .filter((im) => fs.existsSync(path.join(RACINE, im.fichier)));
    } catch { manifeste = [] }
  }

  const classes = Object.keys(REQUETES).filter((c) => (compte[c] || 0) < OBJECTIF);
  console.log(`  ${classes.length} classes sous l'objectif de ${OBJECTIF}`);
  console.log(`  budget : ${BUDGET} requetes\n`);

  // ── 1. Ce qu'Openverse annonce, par classe ──────────────────────────────
  console.log('  ── ce qu Openverse annonce ──');
  const besoin = [];
  for (const c of classes) {
    const d = await openverse(REQUETES[c][0], 1, 1);
    const dispo = d ? (d.result_count || 0) : -1;
    const manque = OBJECTIF - (compte[c] || 0);
    besoin.push({ classe: c, dispo, manque, a: compte[c] || 0 });
    await dodo(3200);
    if (depense >= BUDGET - 40) break;   // on garde de quoi moissonner
  }
  // Le gain REEL possible : le minimum entre ce qui manque et ce qui existe.
  besoin.sort((x, y) => Math.min(y.dispo, y.manque) - Math.min(x.dispo, x.manque));
  for (const b of besoin.slice(0, 18)) {
    console.log(`    ${b.classe.padEnd(32)} a ${String(b.a).padStart(3)}, `
      + `manque ${String(b.manque).padStart(3)}, Openverse annonce ${b.dispo}`);
  }

  // ── 2. Moissonner, en commencant par le meilleur rapport ────────────────
  console.log('\n  ── moisson ──');
  let ajoutees = 0;
  for (const b of besoin) {
    if (depense >= BUDGET) break;
    if (b.dispo <= 0) continue;
    let pris = 0;
    for (const requete of REQUETES[b.classe]) {
      if (depense >= BUDGET || (compte[b.classe] || 0) >= OBJECTIF) break;
      for (let page = 1; page <= 5; page++) {
        const d = await openverse(requete, page, 20);
        if (!d || !d.results || !d.results.length) break;
        for (const x of d.results) {
          if ((compte[b.classe] || 0) >= OBJECTIF) break;
          let buf;
          try {
            const r = await fetch(x.url, {
              headers: { 'User-Agent': AGENT }, signal: AbortSignal.timeout(25_000),
            });
            if (!r.ok) continue;
            buf = Buffer.from(await r.arrayBuffer());
          } catch { continue }
          if (buf.length < 4000) continue;
          const s = empreinte(buf);
          if (vues.has(s)) continue;
          vues.add(s);

          const base = b.classe.replace(/[^a-z0-9]+/gi, '_');
          let i = (compte[b.classe] || 0) + 1;
          let nom = `${base}_${i}.jpg`;
          while (fs.existsSync(path.join(RACINE, nom))) { i++; nom = `${base}_${i}.jpg`; }
          fs.writeFileSync(path.join(RACINE, nom), buf);
          compte[b.classe] = (compte[b.classe] || 0) + 1;
          manifeste.push({
            fichier: nom, classe: b.classe, provenance: 'openverse', via: requete,
            titre: String(x.title || '').slice(0, 160), licence: x.license || 'cc',
            sha256: s,
          });
          pris++; ajoutees++;
        }
        await dodo(3200);
      }
    }
    if (pris) console.log(`    ${b.classe.padEnd(32)} +${pris}  (total ${compte[b.classe]})`);
  }

  fs.writeFileSync(cheminManifeste, JSON.stringify({
    source: 'Wikimedia Commons + Openverse (dont seconde passe par besoin)',
    genere: new Date().toISOString(),
    avertissement: 'Corpus d ENTRAINEMENT. Ne jamais mesurer dessus : la mesure '
      + 'vit dans corpus-ia et corpus-maghreb.',
    images: manifeste,
  }, null, 2));

  // ── 3. Dire POURQUOI chaque classe reste incomplete ─────────────────────
  const budgetEpuise = besoin.filter((b) => b.dispo > 5 && (compte[b.classe] || 0) < OBJECTIF);
  const fondsVide = besoin.filter((b) => b.dispo >= 0 && b.dispo <= 5);
  console.log(`\n  ${ajoutees} images ajoutees, ${depense}/${BUDGET} requetes depensees`);
  if (budgetEpuise.length) {
    console.log(`\n  ${budgetEpuise.length} classes ou Openverse a ENCORE de la matiere`);
    console.log('    (relancer demain : le plafond anonyme est quotidien)');
    for (const b of budgetEpuise.slice(0, 12)) {
      console.log(`      ${b.classe.padEnd(32)} ${compte[b.classe] || 0} / ${OBJECTIF}, `
        + `Openverse en annonce ${b.dispo}`);
    }
  }
  if (fondsVide.length) {
    console.log(`\n  ${fondsVide.length} classes ou le FONDS EST VIDE — revenir demain n y changera rien :`);
    console.log('      ' + fondsVide.map((b) => `${b.classe} (${b.dispo})`).join(', '));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
