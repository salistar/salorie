// Le prompt de l'app biaise-t-il le modele vers la cuisine marocaine ?
// ---------------------------------------------------------------------------
// CE QUI A MOTIVE CE BANC
// Mesure du 29/08/2026 : devant une tarte aux pommes, la cascade repond
// « Moroccan msemen » ; devant des sushis, « Moroccan mint tea » ; devant un
// ramen, « Moroccan chicken salad bowl ». Trois erreurs, et les trois vers la
// meme cuisine.
//
// Or le prompt de l'app consacre un paragraphe entier a la cuisine marocaine et
// MENA, avec une vingtaine d'exemples nommes. Cette insistance a une raison —
// c'est le public de Salorie, et les modeles generalistes reconnaissent mal ces
// plats. Mais amorcer un modele avec vingt noms de plats marocains pourrait lui
// faire voir du marocain partout.
//
// Ce banc envoie LES MEMES images avec deux prompts et compare. Il ne tranche
// pas d'avance : si le prompt neutre ne fait pas mieux, l'hypothese tombe et il
// faudra chercher ailleurs.
//
// Usage : node scripts/ab-prompt-vision.js [nombre d images]

const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..', 'corpus-ia');
const API = process.env.SALORIE_API || 'https://api.salorie.com';
const CDP = process.env.SALORIE_CDP || 'http://127.0.0.1:9222';
const N = Number(process.argv[2] || 24);
// On part loin dans le corpus : les premieres photos de chaque plat ont deja
// servi aux mesures precedentes et reviendraient du cache.
const SAUT = Number(process.env.SAUT || 9);

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

/** Le prompt de l'app, lu dans sa source (jamais recopie). */
function promptDeLApp() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app', '(app)', 'scan-analysis.tsx'), 'utf8');
  const debut = src.indexOf('const prompt = `');
  if (debut < 0) throw new Error('prompt introuvable dans scan-analysis.tsx');
  const ouvrant = src.indexOf('`', debut) + 1;
  let i = ouvrant;
  while (i < src.length && !(src[i] === '`' && src[i - 1] !== '\\')) i++;
  return src.slice(ouvrant, i).replaceAll('${langInstr}', 'Answer in ENGLISH.');
}

/** Le meme prompt PRIVE de son paragraphe marocain, et de lui seul.
 *  Tout le reste — contrat JSON, cles, regles — est conserve, sinon on
 *  comparerait deux choses differentes et non une variable. */
function promptSansAmorce(complet) {
  const debut = complet.indexOf('Be especially accurate for INTERNATIONAL');
  const fin = complet.indexOf('Return STRICT JSON');
  if (debut < 0 || fin < 0 || fin <= debut) {
    throw new Error('paragraphe marocain introuvable : le prompt a change, revoir les ancrages');
  }
  return complet.slice(0, debut) + complet.slice(fin);
}

const normaliser = (s) => String(s).toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();

function nomRendu(corps) {
  let r = {};
  try { r = JSON.parse(corps); } catch { return ''; }
  const t = String(r.text || '');
  try {
    const o = JSON.parse(t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, ''));
    if (o && o.name) return String(o.name);
  } catch { /* prose */ }
  return t;
}

async function main() {
  const manifeste = JSON.parse(fs.readFileSync(path.join(RACINE, 'manifeste.json'), 'utf8'));
  const vus = {};
  const echantillon = manifeste.images.filter((im) => {
    vus[im.classe] = (vus[im.classe] || 0) + 1;
    return vus[im.classe] === SAUT + 1;
  }).slice(0, N);

  const complet = promptDeLApp();
  const nu = promptSansAmorce(complet);
  console.log(`  prompt de l app : ${complet.length} car.`);
  console.log(`  prompt sans l amorce marocaine : ${nu.length} car.`);
  console.log(`  ${echantillon.length} images, chacune envoyee deux fois\n`);

  const j = await jeton();
  if (!j) { console.error('  aucun jeton'); process.exit(1); }

  const envoyer = async (base64, prompt) => {
    for (let essai = 1; essai <= 5; essai++) {
      const r = await fetch(`${API}/ai/vision`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${j}` },
        body: JSON.stringify({ imageBase64: base64, prompt }),
      });
      if (r.status === 429) { await dodo(20_000); continue; }
      if (r.status === 401) { console.error('\n  ARRET : jeton refuse.'); process.exit(2); }
      return r.ok ? nomRendu(await r.text()) : '';
    }
    return '';
  };

  let avec = 0, sans = 0, marocAvec = 0, marocSans = 0;
  // Quelques marqueurs suffisent : on cherche une TENDANCE, pas un decompte exact.
  const MAROC = /moroccan|msemen|tajine|tagine|harira|couscous|baghrir|mint tea|maghreb/i;

  console.log('  %s %-22s %-26s %s', ' ', 'vrai plat', 'avec l amorce', 'sans l amorce');
  for (const im of echantillon) {
    const b64 = fs.readFileSync(path.join(RACINE, im.fichier)).toString('base64');
    const a = await envoyer(b64, complet);
    await dodo(2100);
    const s = await envoyer(b64, nu);
    await dodo(2100);

    const mots = im.mots.filter((m) => m.length >= 4).map(normaliser);
    const jusA = mots.some((m) => normaliser(a).includes(m));
    const jusS = mots.some((m) => normaliser(s).includes(m));
    if (jusA) avec++;
    if (jusS) sans++;
    if (MAROC.test(a)) marocAvec++;
    if (MAROC.test(s)) marocSans++;

    console.log('   %s %-22s %-26s %s',
      jusA === jusS ? ' ' : (jusS ? '+' : '-'),
      im.classe.slice(0, 21),
      (a || '(vide)').slice(0, 25),
      (s || '(vide)').slice(0, 25));
  }

  const n = echantillon.length;
  console.log(`\n  avec l amorce marocaine  : ${avec}/${n} justes, ${marocAvec} reponses marocaines`);
  console.log(`  sans l amorce            : ${sans}/${n} justes, ${marocSans} reponses marocaines`);
  if (sans > avec) {
    console.log('\n  => L AMORCE COUTE de la justesse sur les plats internationaux.');
    console.log('     Reste a verifier ce qu elle APPORTE sur les plats marocains,');
    console.log('     que ce corpus ne contient pas : la retirer sans cela serait');
    console.log('     troquer une erreur connue contre une erreur non mesuree.');
  } else if (sans === avec) {
    console.log('\n  => Aucun ecart. L hypothese de l amorce ne tient pas.');
  } else {
    console.log('\n  => L amorce AIDE. Elle n est pas la cause.');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
