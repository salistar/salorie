// Quel seuil de confiance la PRODUCTION applique-t-elle vraiment ?
// ---------------------------------------------------------------------------
// POURQUOI CE SCRIPT EXISTE
// `FOOD4K_MIN_CONF` a trois sources possibles, dans cet ordre de priorite :
//   1. l'environnement du serveur (fichier .env du VPS)   <- gagne
//   2. docker-compose.override.yml                        <- puis
//   3. le defaut ecrit dans ml.service.ts                 <- en dernier
//
// Les 30 et 31/08/2026, le seuil a ete modifie dans le code (2), puis dans le
// compose (2), sans effet visible. Deux mesures ont ete attribuees a un reglage
// qui n'avait pas pris. Le seul moyen de trancher depuis l'exterieur, c'est de
// regarder ce que la production REND.
//
// L'astuce : `/ai/vision` renvoie `engine: "tier0:food4k@0.93"` — la confiance
// de la reponse. Le MINIMUM observe sur un echantillon donne le plancher
// effectif. Aucune reponse ne peut exister sous le seuil.
//
// ⚠ Ce que ce script ne peut pas faire : prouver un seuil PLUS HAUT que le
// minimum observe. Si toutes les reponses sont a 0,95, le seuil peut valoir
// 0,60 comme 0,95 — il faut assez d'images pour que le plancher se revele.
//
// Usage :  node scripts/seuil-effectif.js [nombre] [--corpus X] [--sauter N]

const fs = require('fs');
const path = require('path');

const iCorpus = process.argv.indexOf('--corpus');
const RACINE = path.join(__dirname, '..', iCorpus > 0 ? process.argv[iCorpus + 1] : 'corpus-ia');
const API = process.env.SALORIE_API || 'https://api.salorie.com';
const CDP = process.env.SALORIE_CDP || 'http://127.0.0.1:9222';
const N = Number(process.argv.find((a) => /^\d+$/.test(a)) || 40);

const dodo = (ms) => new Promise((r) => setTimeout(r, ms));

async function jeton() {
  const { chromium } = require(require.resolve('playwright', {
    paths: [path.join(__dirname, '..', 'web')],
  }));
  const nav = await chromium.connectOverCDP(CDP);
  const page = nav.contexts()[0].pages().find((p) => /salorie\.com/.test(p.url()))
    || (await nav.contexts()[0].newPage());
  await page.goto('https://salorie.com/me', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(7000);
  const j = await page.evaluate(async () => {
    const e = await new Promise((ok) => {
      const r = indexedDB.open('firebaseLocalStorageDb');
      r.onsuccess = () => {
        const s = r.result.transaction('firebaseLocalStorage', 'readonly')
          .objectStore('firebaseLocalStorage').getAll();
        s.onsuccess = () => ok(s.result); s.onerror = () => ok([]);
      };
      r.onerror = () => ok([]);
    });
    return e.map((x) => x.value).find((v) => v && v.stsTokenManager)?.stsTokenManager?.accessToken;
  });
  await nav.close();
  return j;
}

function promptDeLApp() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app', '(app)', 'scan-analysis.tsx'), 'utf8');
  const debut = src.indexOf('const prompt = `');
  if (debut < 0) throw new Error('prompt introuvable dans scan-analysis.tsx');
  const ouvrant = src.indexOf('`', debut) + 1;
  let i = ouvrant;
  while (i < src.length && !(src[i] === '`' && src[i - 1] !== '\\')) i++;
  return src.slice(ouvrant, i).replaceAll('${langInstr}', 'Answer in ENGLISH.');
}

(async () => {
  const manifeste = JSON.parse(fs.readFileSync(path.join(RACINE, 'manifeste.json'), 'utf8'));
  // ⚠ SANS DECALAGE, ON NE SONDE QUE LE CACHE.
  // Premiere version : la premiere image de chaque plat — c'est-a-dire celles
  // soumises des dizaines de fois par les mesures precedentes. Le serveur les
  // rejouait toutes, l'engine valait « cache », et le rapport annoncait « zero
  // reponse du tier-0 » : j'ai cru a une panne de production alors que je
  // regardais des reponses d'archive.
  const iSaut = process.argv.indexOf('--sauter');
  const saut = iSaut > 0 ? Number(process.argv[iSaut + 1]) : 0;
  const compte = {};
  const echantillon = manifeste.images.filter((im) => {
    compte[im.classe] = (compte[im.classe] || 0) + 1;
    return compte[im.classe] === saut + 1 && fs.existsSync(path.join(RACINE, im.fichier));
  }).slice(0, N);

  const PROMPT = promptDeLApp();
  const j = await jeton();
  if (!j) { console.error('  aucun jeton'); process.exit(1); }

  const confiances = [];
  const autresMoteurs = [];
  let autres = 0;
  for (const im of echantillon) {
    const b64 = fs.readFileSync(path.join(RACINE, im.fichier)).toString('base64');
    let engine = '';
    for (let essai = 1; essai <= 5; essai++) {
      const r = await fetch(`${API}/ai/vision`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${j}` },
        body: JSON.stringify({ imageBase64: b64, prompt: PROMPT }),
      });
      if (r.status === 429) { await dodo(20_000); continue; }
      if (r.ok) { engine = String((await r.json()).engine || ''); }
      break;
    }
    if (autresMoteurs.length < 8 && !/^tier0/.test(engine)) autresMoteurs.push(engine.slice(0, 46));
    const m = engine.match(/^tier0:food4k@([\d.]+)/);
    if (m) confiances.push(Number(m[1])); else autres++;
    await dodo(2100);
  }

  confiances.sort((a, b) => a - b);
  console.log(`\n  ${confiances.length} reponses du tier-0 sur ${echantillon.length} images (${autres} servies ailleurs)`);
  if (!confiances.length) {
    console.log('  Le tier-0 n a rien rendu. Qui a repondu a sa place :');
    for (const e of autresMoteurs) console.log('    ' + (e || '(vide)'));
    return;
  }
  console.log(`  confiance minimale observee : ${confiances[0].toFixed(2)}`);
  console.log(`  mediane                     : ${confiances[Math.floor(confiances.length / 2)].toFixed(2)}`);
  console.log(`  maximale                    : ${confiances[confiances.length - 1].toFixed(2)}`);
  console.log('\n  Le seuil effectif ne peut pas depasser ' + confiances[0].toFixed(2) + '.');
  // On nomme les hypotheses plutot que de laisser interpreter le chiffre brut.
  for (const [valeur, nom] of [[0.6, '0,60 (ancienne valeur du compose)'],
    [0.8, '0,80'], [0.9, '0,90 (valeur voulue)'], [0.95, '0,95']]) {
    const compatible = confiances[0] >= valeur - 1e-9;
    console.log(`    ${nom.padEnd(34)} ${compatible ? 'compatible' : 'EXCLU — une reponse est passee en dessous'}`);
  }
})();
