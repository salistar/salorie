// Mesure ce que la cascade IA reconnait, et le fige comme point de repere.
// ---------------------------------------------------------------------------
// Usage :
//   node scripts/mesurer-reconnaissance.js            # 101 images, une par plat
//   node scripts/mesurer-reconnaissance.js --tout     # les 1 414
//   node scripts/mesurer-reconnaissance.js --par 3    # 3 par plat
//   node scripts/mesurer-reconnaissance.js --sauter 2 # ignore les 2 premieres
//                                                     # (celles deja en cache)
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
  // ⚠ ON RECHARGE, MEME SI LA PAGE EST DEJA LA.
  // IndexedDB ne contient que le DERNIER jeton ecrit par le SDK Firebase. Sur un
  // onglet ouvert depuis des heures, c'est un jeton expire : le lire donne une
  // chaine parfaitement formee et parfaitement refusee. Charger la page force le
  // SDK a renouveler et a REECRIRE, et c'est ce jeton-la qu'on veut.
  await page.goto('https://salorie.com/me', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(7000);
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

/**
 * Le prompt REEL de l'app, lu dans sa source.
 *
 * ⚠ POURQUOI ON NE LE RECOPIE PAS.
 * Une premiere version envoyait ma propre question (« Quel aliment cette photo
 * montre-t-elle ? »). Le modele repondait alors en PROSE, alors que l'app exige
 * un JSON avec un champ `name` — et le comparateur notait faux des reponses
 * parfois justes. La mesure decrivait mon prompt, pas le produit.
 *
 * Une copie figee aurait le meme defaut a retardement : elle divergerait au
 * premier ajustement du prompt, sans que rien ne le signale. On le lit donc a
 * la source, et on echoue bruyamment si on ne le trouve plus.
 */
function promptDeLApp() {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'app', '(app)', 'scan-analysis.tsx'), 'utf8');
  const debut = src.indexOf('const prompt = `');
  if (debut < 0) {
    throw new Error(
      "prompt introuvable dans scan-analysis.tsx : la mesure ne peut pas " +
      "pretendre decrire ce que vivent les utilisateurs. Corrige l'ancrage.");
  }
  const ouvrant = src.indexOf('`', debut) + 1;
  // Le litteral se termine au premier accent grave non echappe.
  let i = ouvrant;
  while (i < src.length && !(src[i] === '`' && src[i - 1] !== '\\')) i++;
  const brut = src.slice(ouvrant, i);
  // ⚠ DEUX CORRECTIONS ICI, ET CHACUNE FAUSSAIT LE CHIFFRE.
  //
  // 1. `replaceAll`, pas `replace`. Le prompt porte DEUX `${langInstr}` ; n'en
  //    remplacer qu'un envoyait le second tel quel au modele, qui le recopiait
  //    dans sa reponse (« {langInstr} Francais {langInstr} »). On mesurait donc
  //    un prompt corrompu.
  //
  // 2. ANGLAIS, pas francais. Les etiquettes de Food-101 sont anglaises. En
  //    demandant une reponse en francais, une reconnaissance PARFAITE
  //    (« tarte aux pommes » pour apple_pie) etait comptee comme une erreur : on
  //    mesurait la langue de la reponse, pas la justesse. L'app, elle, demande
  //    la langue de l'utilisateur — ce que ce banc ne peut pas reproduire sans
  //    une table de traduction des 101 plats, qui reste a faire.
  return brut.replaceAll('${langInstr}', 'Answer in ENGLISH.');
}

async function main() {
  const manifeste = JSON.parse(fs.readFileSync(path.join(RACINE, 'manifeste.json'), 'utf8'));
  const tout = process.argv.includes('--tout');
  const iPar = process.argv.indexOf('--par');
  const parClasse = tout ? Infinity : (iPar > 0 ? Number(process.argv[iPar + 1]) : 1);

  // Un echantillon EQUILIBRE, comme le corpus : sinon on mesurerait les plats
  // qui se trouvent en tete de liste.
  // ⚠ SAUTER LES PHOTOS DEJA SOUMISES, SINON ON MESURE LE CACHE.
  // Le serveur garde ses reponses. Relancer la mesure sur les memes images
  // rejoue donc les reponses de la fois precedente — y compris celles d'un
  // palier qu'on vient justement de debrancher. `--sauter N` avance dans le
  // corpus (quatorze photos par plat) pour interroger la cascade REELLE.
  const iSaut = process.argv.indexOf('--sauter');
  const saut = iSaut > 0 ? Number(process.argv[iSaut + 1]) : 0;

  const vus = {};
  const echantillon = manifeste.images.filter((im) => {
    vus[im.classe] = (vus[im.classe] || 0) + 1;
    return vus[im.classe] > saut && vus[im.classe] <= saut + parClasse;
  });

  // ⚠ UN JETON FIREBASE NE VIT QU'UNE HEURE.
  // Premiere version : il etait lu UNE fois au demarrage. Sur une mesure de 404
  // images a deux secondes l'une, la course dure plus d'un quart d'heure — et si
  // le jeton stocke etait deja vieux, TOUTES les requetes revenaient en 401.
  // C'est ce qui s'est produit : 404 erreurs sur 404, que le script a presentees
  // comme « la cascade ne repond plus » alors que l'API se portait tres bien. Un
  // instrument doit savoir distinguer sa propre panne de celle qu'il observe.
  const PROMPT = promptDeLApp();
  let j = await jeton();
  if (!j) { console.error('  Aucun jeton : ouvre une session Salorie dans Edge.'); process.exit(1); }
  let jetonPose = Date.now();
  const jetonFrais = async () => {
    // Renouvele bien avant l'heure : une expiration en plein milieu ferait
    // basculer la fin de la mesure en 401 et tirerait le taux vers le bas.
    if (Date.now() - jetonPose < 40 * 60 * 1000) return j;
    j = (await jeton()) || j;
    jetonPose = Date.now();
    return j;
  };
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
          headers: { 'content-type': 'application/json', authorization: `Bearer ${await jetonFrais()}` },
          body: JSON.stringify({ imageBase64: base64, prompt: PROMPT }),
        });
        if (r.status === 429) {
          // Le seau se vide en soixante secondes : on attend qu'il se vide,
          // plutot que de retenter aussitot et de rester bloque dehors.
          etranglements++;
          await dodo(20_000);
          continue;
        }
        if (r.status === 401) {
          // On ne poursuit pas : sans identite valide, chaque image suivante
          // reviendrait en 401 et le rapport annoncerait 0 % de reconnaissance
          // pour une raison etrangere a la cascade.
          console.error('\n  ARRET : jeton refuse (401). Reconnecte-toi dans Edge et relance.');
          process.exit(2);
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

  // ⚠ UNE MESURE QUI REJOUE LE CACHE NE MESURE PLUS LA CASCADE D'AUJOURD'HUI.
  // Le serveur garde ses reponses sept jours. Relancer sur des images deja
  // soumises rejoue donc les reponses d'AVANT le dernier changement — et le
  // resultat semble parfaitement normal. C'est arrive le 31/08/2026 : 100
  // reponses sur 202 venaient du cache, la comparaison avant/apres etait
  // inutilisable, et rien ne le disait. `--sauter N` avance dans le corpus.
  const partCache = (parMoteur['cache']?.n || 0) / (echantillon.length || 1);
  if (partCache > 0.2) {
    console.log('');
    console.log('  ATTENTION : ' + Math.round(partCache * 100) + ' % des reponses viennent du CACHE.');
    console.log('  Ce sont des reponses calculees AVANT, rejouees telles quelles. Cette');
    console.log('  mesure ne decrit donc pas la cascade actuelle. Relancer avec');
    console.log('  --sauter ' + (saut + parClasse) + ' pour interroger des images jamais soumises.');
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
