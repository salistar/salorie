// Mesure ce que la cascade IA reconnait, et le fige comme point de repere.
// ---------------------------------------------------------------------------
// Usage :
//   node scripts/mesurer-reconnaissance.js            # 101 images, une par plat
//   node scripts/mesurer-reconnaissance.js --tout     # les 1 414
//   node scripts/mesurer-reconnaissance.js --par 3    # 3 par plat
//
// Le jeton vient d'Edge par le port de debogage, comme les tests de bout en
// bout : la cascade exige une identite, et taper un jeton a la main dans une
// ligne de commande le laisse dans l'historique du shell.
//
// ⚠ CE QUE MESURE CE SCRIPT, ET CE QU'IL NE MESURE PAS.
// Il compare le NOM rendu par `/ai/vision` a la classe Food-101 de la photo.
// C'est une mesure severe et imparfaite : « spaghetti bolognaise » rendu
// « pates a la sauce tomate » compte comme un echec alors qu'un utilisateur
// serait satisfait. Le chiffre absolu vaut donc moins que sa VARIATION d'une
// mesure a l'autre — c'est pour cela qu'il est fige dans un point de repere.
//
// Il ne mesure PAS la justesse des macros. Une reconnaissance juste avec des
// calories inventees reste un probleme, et il n'est pas couvert ici.
//
// ⚠ LIRE LE DECOUPAGE PAR PALIER, PAS LE TAUX GLOBAL.
// Une seconde mesure sur les memes images tombe dans le CACHE du serveur et
// rejoue les reponses de la premiere : le palier `cache` gonfle alors, et le
// taux global cesse de decrire ce que la cascade sait faire aujourd'hui. Le
// decoupage par palier, lui, reste lisible dans tous les cas.

const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..', 'corpus-ia');
const REPERE = path.join(__dirname, '..', 'corpus-ia', 'repere.json');
const API = process.env.SALORIE_API || 'https://api.salorie.com';
const CDP = process.env.SALORIE_CDP || 'http://127.0.0.1:9222';

/** Le jeton Firebase de la session ouverte dans Edge, lu dans IndexedDB. */
async function jeton() {
  // Playwright n'est installe que dans `web/` : ce script vit a la racine et
  // ne doit pas justifier une seconde copie de 300 Mo.
  const { chromium } = require(require.resolve('playwright', {
    paths: [path.join(__dirname, '..', 'web')],
  }));
  const nav = await chromium.connectOverCDP(CDP);
  const page = nav.contexts()[0].pages().find((p) => /salorie\.com/.test(p.url()))
    || (await nav.contexts()[0].newPage());
  if (!/salorie\.com/.test(page.url())) {
    await page.goto('https://salorie.com/me', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
  }
  const j = await page.evaluate(async () => {
    const entrees = await new Promise((ok) => {
      const req = indexedDB.open('firebaseLocalStorageDb');
      req.onsuccess = () => {
        try {
          const st = req.result.transaction('firebaseLocalStorage', 'readonly')
            .objectStore('firebaseLocalStorage').getAll();
          st.onsuccess = () => ok(st.result); st.onerror = () => ok([]);
        } catch { ok([]); }
      };
      req.onerror = () => ok([]);
    });
    const u = entrees.map((e) => e.value).find((v) => v && v.stsTokenManager);
    return u?.stsTokenManager?.accessToken || null;
  });
  await nav.close();
  return j;
}

/**
 * Le nom d'aliment rendu par la cascade, ET le palier qui a repondu.
 *
 * ⚠ POURQUOI LE PALIER COMPTE AUTANT QUE LE NOM.
 * Un taux global melange deux defauts sans rapport : un classifieur local qui se
 * trompe, et un modele distant qui repond juste mais en PROSE (« Le sandwich est
 * un aliment compose de… ») que ce script note comme un echec faute d'y trouver
 * le mot attendu. Confondus, on ne sait pas quoi corriger. Separes, la reponse
 * saute aux yeux.
 */
function analyser(corps) {
  let r = {};
  try { r = JSON.parse(corps); } catch { return { nom: '', moteur: '?' }; }
  const moteur = String(r.engine || '?').split('@')[0];
  const texte = String(r.text || '');
  try {
    const fiche = JSON.parse(texte);
    if (fiche && fiche.name) return { nom: String(fiche.name), moteur };
  } catch { /* certains paliers repondent en prose */ }
  return { nom: texte, moteur };
}

/** Normalise pour comparer : accents, pluriels simples, ponctuation. */
const dodo = (ms) => new Promise((r) => setTimeout(r, ms));

const normaliser = (s) =>
  String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();

async function main() {
  const manifeste = JSON.parse(fs.readFileSync(path.join(RACINE, 'manifeste.json'), 'utf8'));
  const tout = process.argv.includes('--tout');
  const iPar = process.argv.indexOf('--par');
  const parClasse = tout ? Infinity : (iPar > 0 ? Number(process.argv[iPar + 1]) : 1);

  // Un echantillon EQUILIBRE, comme le corpus : sinon on mesurerait les plats
  // qui se trouvent en tete de liste.
  const vus = {};
  const echantillon = manifeste.images.filter((im) => {
    vus[im.classe] = (vus[im.classe] || 0) + 1;
    return vus[im.classe] <= parClasse;
  });

  const j = await jeton();
  if (!j) { console.error('  Aucun jeton : ouvre une session Salorie dans Edge.'); process.exit(1); }
  console.log(`  ${echantillon.length} images a soumettre\n`);

  const parPlat = {};
  const parMoteur = {};
  let justes = 0, repondu = 0, erreurs = 0, etranglements = 0;

  for (let i = 0; i < echantillon.length; i++) {
    const im = echantillon[i];
    const base64 = fs.readFileSync(path.join(RACINE, im.fichier)).toString('base64');
    let nom = '';
    let moteur = '?';

    // ⚠ LE QUOTA EST DE TRENTE REQUETES PAR MINUTE (ai.controller.ts).
    // Premiere version : les images partaient a la chaine. Soixante-et-onze
    // requetes sur cent-une revenaient en 429, et le script les comptait comme
    // des echecs de reconnaissance — il annoncait 1 % la ou la cascade n'avait
    // tout simplement pas ete interrogee. Un instrument de mesure qui sature ce
    // qu'il mesure ne mesure plus rien.
    for (let essai = 1; essai <= 5; essai++) {
      try {
        const r = await fetch(`${API}/ai/vision`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${j}` },
          body: JSON.stringify({ imageBase64: base64, prompt: 'Quel aliment cette photo montre-t-elle ?' }),
        });
        if (r.status === 429) {
          // Le seau se vide en soixante secondes : on attend qu'il se vide,
          // plutot que de retenter aussitot et de rester bloque dehors.
          etranglements++;
          await dodo(20_000);
          continue;
        }
        const corps = await r.text();
        if (r.ok) { const a = analyser(corps); nom = a.nom; moteur = a.moteur; if (nom) repondu++; } else { erreurs++; }
        break;
      } catch {
        if (essai === 5) erreurs++; else await dodo(3000);
      }
    }

    // L'espacement nominal : trente par minute, donc une toutes les deux
    // secondes. Sans lui on repart aussitot dans le mur du quota.
    await dodo(2100);

    const n = normaliser(nom);
    // Juste des qu'un mot significatif de la classe apparait : « apple_pie »
    // reconnu « apple pie » ou « tarte aux pommes » ne doit pas dependre de la
    // langue de reponse du modele. Les mots de moins de quatre lettres sont
    // ecartes — « and », « pie » sur « pot pie » produiraient des faux positifs.
    const mots = im.mots.filter((m) => m.length >= 4).map(normaliser);
    const juste = mots.length > 0 && mots.some((m) => n.includes(m));
    if (juste) justes++;

    parMoteur[moteur] = parMoteur[moteur] || { n: 0, justes: 0 };
    parMoteur[moteur].n++;
    if (juste) parMoteur[moteur].justes++;

    parPlat[im.classe] = parPlat[im.classe] || { n: 0, justes: 0, exemples: [] };
    parPlat[im.classe].n++;
    if (juste) parPlat[im.classe].justes++;
    else if (parPlat[im.classe].exemples.length < 2) parPlat[im.classe].exemples.push(nom.slice(0, 60));

    if (i % 10 === 0 || i === echantillon.length - 1) {
      process.stdout.write(`\r  ${i + 1}/${echantillon.length} — ${justes} justes`);
    }
  }

  const taux = echantillon.length ? justes / echantillon.length : 0;
  console.log(`\n\n  a repondu   : ${repondu}/${echantillon.length}`);
  console.log(`  erreurs     : ${erreurs}`);
  console.log(`  etranglements (429, retentes) : ${etranglements}`);
  console.log(`  reconnu     : ${justes}/${echantillon.length}  (${(taux * 100).toFixed(1)} %)`);

  console.log('');
  console.log('  par palier de la cascade :');
  for (const [moteur, v] of Object.entries(parMoteur).sort((a, b) => b[1].n - a[1].n)) {
    const pc = v.n ? ((v.justes / v.n) * 100).toFixed(1) : '0.0';
    console.log(`    ${moteur.padEnd(46)} ${String(v.justes).padStart(3)}/${String(v.n).padEnd(4)} ${pc.padStart(5)} %`);
  }

  const pires = Object.entries(parPlat)
    .filter(([, v]) => v.justes === 0)
    .slice(0, 12);
  if (pires.length) {
    console.log('\n  jamais reconnus (et ce que la cascade a repondu) :');
    for (const [plat, v] of pires) console.log(`    ${plat.padEnd(24)} ${v.exemples.join(' | ')}`);
  }

  // Le point de repere. Sans lui, ce chiffre se perd dans un terminal et la
  // prochaine mesure n'aura rien a quoi se comparer — ce qui est exactement la
  // situation que ce script existe pour corriger.
  const ancien = fs.existsSync(REPERE) ? JSON.parse(fs.readFileSync(REPERE, 'utf8')) : null;
  if (ancien) {
    const ecart = (taux - ancien.taux) * 100;
    console.log(`\n  repere precedent : ${(ancien.taux * 100).toFixed(1)} % (${ancien.date})`);
    console.log(`  ecart            : ${ecart >= 0 ? '+' : ''}${ecart.toFixed(1)} points`);
    if (ecart < -5) console.log('  ⚠ REGRESSION de plus de cinq points.');
  }
  fs.writeFileSync(REPERE, JSON.stringify({
    date: new Date().toISOString().slice(0, 10),
    taux, justes, total: echantillon.length, repondu, erreurs, etranglements, parMoteur, parPlat,
  }, null, 2));
  console.log(`\n  repere ecrit dans corpus-ia/repere.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
