#!/usr/bin/env node
// Chaque fonctionnalité, en profondeur : écran, logique, backend, tests, drapeau.
// ---------------------------------------------------------------------------
// POURQUOI UN TROISIEME SCRIPT
// `inventaire-features.js` compte ce qui EXISTE. `auditer-cablage.js` verifie que
// les pieces se PARLENT. Ni l'un ni l'autre ne dit ce qu'une fonctionnalite a
// derriere elle. Or c'est la que se logent les pannes qu'on a payees :
//
//   ECRAN SANS FILET     `panier-souk` a un ecran, une librairie, un jeu de
//                        donnees et un test — et aucune porte d'entree. Le test
//                        passe au vert tous les jours sur du code que personne
//                        ne peut atteindre.
//   ECRAN SANS TEST      La majorite. Ce n'est pas un defaut en soi : un ecran
//                        d'affichage n'a rien a tester. Ca le devient quand
//                        l'ecran porte un CALCUL.
//   DRAPEAU FANTOME      Une cle dans FLAG_KEYS dont aucune route ne depend :
//                        l'admin croit pouvoir eteindre une fonctionnalite, et
//                        le bouton ne commande rien.
//   ROUTE NON GERABLE    L'inverse : un ecran lourd qu'aucun drapeau ne couvre.
//                        En cas d'incident, impossible de l'eteindre a distance ;
//                        il faut publier une version.
//
// ⚠ COMMENT LES TESTS SONT RATTACHES, ET POURQUOI PAS PAR LE NOM.
// Rapprocher `fasting.tsx` de `jeune.test.ts` par le nom est impossible : le
// projet nomme ses ecrans en anglais et ses tests en francais. Rapprocher par
// ressemblance inventerait des liens. On suit donc les IMPORTS REELS : un test
// couvre une fonctionnalite s'il importe un module `lib/` que l'ecran importe
// aussi. C'est verifiable, et ca ne peut pas mentir dans le sens flatteur.
//
// ⚠ CE QUE CE SCRIPT NE DIT TOUJOURS PAS.
// « Un test existe » n'est pas « le comportement est juste ». Il ne lance pas
// l'application. Il mesure la COUVERTURE STRUCTURELLE, et la confondre avec la
// justesse serait exactement l'erreur que cet audit cherche a eviter.
//
//   node scripts/auditer-features.js            # rapport lisible
//   node scripts/auditer-features.js --json     # pour un autre outil

const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..');
const JSON_SEUL = process.argv.includes('--json');

function fichiers(dir, filtre, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (/node_modules|\.next|\.expo|\.git/.test(p)) continue;
    if (e.isDirectory()) fichiers(p, filtre, acc);
    else if (filtre.test(e.name)) acc.push(p);
  }
  return acc;
}
const rel = (f) => path.relative(RACINE, f).replace(/\\/g, '/');
const lire = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };

// ── Les écrans, leur route, leur source ────────────────────────────────────
function routeDe(f) {
  let r = rel(f).replace(/^app\//, '').replace(/\.tsx$/, '');
  r = r.split('/').filter((s) => !/^\(.*\)$/.test(s)).join('/');
  return '/' + r.replace(/\/index$/, '').replace(/^index$/, '');
}
const ecrans = fichiers(path.join(RACINE, 'app'), /\.tsx$/)
  .filter((f) => !/_layout|\+not-found|\+html|__tests__/.test(f))
  .map((f) => ({ fichier: rel(f), route: routeDe(f), source: lire(f) }));

// ── Ce que chaque fichier importe de `lib/` et de `components/` ────────────
// On accepte les trois formes en usage dans le projet : '@/lib/x', '../lib/x',
// './lib/x'. Une seule oubliee ferait passer un ecran pour depourvu de logique.
function modulesDe(source) {
  const out = new Set();
  for (const m of source.matchAll(/from\s+['"](?:@\/|\.{1,2}\/)*(?:lib|components)\/([a-zA-Z0-9\-_/]+)['"]/g)) {
    out.add(m[1].split('/').pop());
  }
  return out;
}

// ── Les routes API que le backend expose, par module ───────────────────────
const routesApi = new Map();          // chemin -> module backend
for (const f of fichiers(path.join(RACINE, 'backend/src'), /\.controller\.ts$/)) {
  const s = lire(f);
  const module = rel(f).split('/')[2];
  const base = (s.match(/@Controller\(\s*['"`]([^'"`]*)['"`]/) || [, ''])[1];
  for (const m of s.matchAll(/@(Get|Post|Put|Patch|Delete)\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/g)) {
    const chemin = ('/' + base + '/' + (m[2] || '')).replace(/\/+/g, '/').replace(/\/$/, '') || '/';
    routesApi.set(chemin, module);
  }
}

// ── Les tests, et les modules qu'ils exercent ──────────────────────────────
const tests = [
  ...fichiers(path.join(RACINE, '__tests__'), /\.(test|spec)\.tsx?$/),
  ...fichiers(path.join(RACINE, 'backend/src'), /\.spec\.ts$/),
].map((f) => ({ fichier: rel(f), modules: modulesDe(lire(f)), source: lire(f) }));

// Un test backend n'importe pas `lib/` : on le rattache par son MODULE backend
// (backend/src/social/amis.spec.ts -> module 'social'), ce qui est un lien de
// structure, pas une ressemblance de nom.
for (const t of tests) {
  if (t.fichier.startsWith('backend/src/')) t.moduleBackend = t.fichier.split('/')[2];
}

// ── Les destinations citées, pour savoir qui est atteignable ───────────────
const sourcesApp = [
  ...fichiers(path.join(RACINE, 'app'), /\.tsx?$/),
  ...fichiers(path.join(RACINE, 'components'), /\.tsx?$/),
  ...fichiers(path.join(RACINE, 'lib'), /\.tsx?$/),
].map((f) => ({ fichier: rel(f), source: lire(f) }));
const citees = new Set();
for (const { source } of sourcesApp) {
  for (const m of source.matchAll(/['"`](\/[a-zA-Z0-9\-_()\/]*)(?:[?'"`$]|\$\{)/g)) {
    const d = m[1].split('?')[0].replace(/\/\(app\)|\/\(tabs\)|\(app\)|\(tabs\)/g, '');
    if (d.startsWith('/')) citees.add(d.replace(/\/$/, '') || '/');
  }
}
// Un lien profond est une porte d'entree : `/oauth-callback` est atteint depuis
// l'exterieur par `Linking.createURL(...)`, jamais par un `router.push`.
for (const { source } of sourcesApp) {
  for (const m of source.matchAll(/createURL\(\s*['"`]\/?([a-zA-Z0-9\-_/]+)/g)) {
    citees.add('/' + m[1].replace(/^\//, ''));
  }
}
const onglets = ecrans.filter((e) => e.fichier.includes('(tabs)')).map((e) => e.route);

// ── Les drapeaux, lus dans le code plutôt que recopiés ─────────────────────
// Recopier FLAG_KEYS ici creerait une quatrieme liste a maintenir — le defaut
// exact que `verifier-etiquettes.js` existe pour attraper ailleurs.
const srcNav = lire(path.join(RACINE, 'lib/navFlags.ts'));
// ⚠ ON RETIRE LES COMMENTAIRES AVANT DE LIRE LES CHAINES.
// Sans ca, le motif ramasse les apostrophes du francais : « l'admin », « d'un »,
// « qu'aucun ». Le 09/09/2026, l'ajout de 18 cles commentees a fait passer ce
// script de 39 a 64 drapeaux, dont 25 « fantomes » qui n'etaient que des
// morceaux de phrase. Une mesure qui compte ses propres commentaires ne mesure
// rien — et celle-ci s'est trompee sur le fichier qu'elle venait d'auditer.
const sansCommentaires = (t) => String(t).replace(/\/\/[^\n]*/g, '');
const blocFlags = sansCommentaires((srcNav.match(/FLAG_KEYS[^=]*=\s*new Set\(\[([\s\S]*?)\]\)/) || [, ''])[1]);
const FLAG_KEYS = [...blocFlags.matchAll(/'([^']+)'/g)].map((m) => m[1]);
const blocExc = sansCommentaires((srcNav.match(/ROUTE_EXCEPTIONS[^=]*=\s*\{([\s\S]*?)\n\}/) || [, ''])[1]);
const EXCEPTIONS = {};
for (const m of blocExc.matchAll(/'([^']+)'\s*:\s*'([^']+)'/g)) EXCEPTIONS[m[1]] = m[2];

const segmentDe = (route) => String(route).replace(/^\//, '').split('?')[0].split('/')[0];
const flagDe = (route) => {
  const seg = segmentDe(route);
  const cle = EXCEPTIONS[seg] || seg;
  return FLAG_KEYS.includes(cle) ? cle : null;
};

// ── L'INFRASTRUCTURE, qu'il faut retirer du calcul ─────────────────────────
// ⚠ PREMIERE VERSION : 99 ECRANS SUR 102 « COUVERTS PAR UN TEST ». Faux, et faux
// dans le sens qui rassure. Le lien passait par `theme`, `i18n`, `firebase` —
// des modules que TOUS les ecrans importent. N'importe quel test touchant l'un
// d'eux se rattachait alors a la totalite de l'application.
//
// Un module importe par plus d'un ecran sur quatre n'appartient a aucune
// fonctionnalite : c'est le socle. On le retire des DEUX cotes du rapprochement.
// Le seuil est mesure, pas choisi : la coupure nette du projet se situe entre
// `useThemeColors` (~90 ecrans) et les modules metier (moins de 10).
const compteModule = {};
const ecransUtiles = ecrans.filter((e) => !/\(auth\)|\(onboarding\)/.test(e.fichier));
for (const e of ecransUtiles) for (const m of modulesDe(e.source)) compteModule[m] = (compteModule[m] || 0) + 1;
const SEUIL_SOCLE = Math.ceil(ecransUtiles.length / 4);
const SOCLE = new Set(Object.keys(compteModule).filter((m) => compteModule[m] >= SEUIL_SOCLE));

// ── Quelles routes API chaque module `lib/` appelle ────────────────────────
// ⚠ DEUXIEME CORRECTION. La premiere version cherchait les routes API dans la
// source de l'ECRAN, et n'en trouvait presque aucune : les ecrans ne parlent pas
// au backend, ils appellent `lib/api.ts`, `lib/socialApi.ts`, `lib/stravaApi.ts`.
// Conclure « ce feature n'a pas de backend » etait un artefact de la mesure.
// On fait donc un saut de plus : ecran -> module lib -> routes du backend.
const backendDuModule = {};
for (const f of fichiers(path.join(RACINE, 'lib'), /\.tsx?$/)) {
  const nom = path.basename(f).replace(/\.tsx?$/, '');
  const s = lire(f);
  const mods = new Set();
  for (const m of s.matchAll(/[`'"](\/[a-zA-Z0-9\-_/]+)/g)) {
    for (const [r, mod] of routesApi) {
      if (m[1] === r || m[1].startsWith(r + '/')) { mods.add(mod); break; }
    }
  }
  backendDuModule[nom] = mods;
}

// ── Le portrait de chaque écran ────────────────────────────────────────────
const portraits = ecransUtiles
  .map((e) => {
    const tous = modulesDe(e.source);
    const modules = new Set([...tous].filter((m) => !SOCLE.has(m)));
    const appels = new Set();
    for (const m of e.source.matchAll(/[`'"](\/[a-zA-Z0-9\-_/]+)/g)) {
      const c = m[1];
      for (const [r, mod] of routesApi) {
        if (c === r || c.startsWith(r + '/')) { appels.add(mod); break; }
      }
    }
    for (const m of modules) for (const mod of backendDuModule[m] || []) appels.add(mod);
    const couvrants = tests.filter((t) =>
      [...t.modules].some((m) => !SOCLE.has(m) && modules.has(m))
      || (t.moduleBackend && appels.has(t.moduleBackend)));
    return {
      route: e.route,
      fichier: e.fichier,
      lignes: e.source.split('\n').length,
      atteignable: citees.has(e.route) || onglets.includes(e.route),
      drapeau: flagDe(e.route),
      modules: [...modules],
      backend: [...appels],
      tests: couvrants.map((t) => t.fichier),
    };
  })
  .sort((a, b) => b.lignes - a.lignes);

console.error(`  socle ecarte (>= ${SEUIL_SOCLE} ecrans) : ${[...SOCLE].join(", ")}`);

// ── Les trois questions que seul ce croisement peut poser ──────────────────
// 1. Un drapeau qui ne commande rien.
const routesParFlag = {};
for (const p of portraits) if (p.drapeau) (routesParFlag[p.drapeau] = routesParFlag[p.drapeau] || []).push(p.route);
const drapeauxFantomes = FLAG_KEYS.filter((k) => !routesParFlag[k]);

// 2. Un ecran lourd qu'aucun drapeau ne peut eteindre.
// ⚠ ON EXCLUT CE QUI EST DELIBEREMENT NON EXTINGUIBLE. Les onglets, les ecrans
// legaux (/privacy, /terms) et la saisie (/diary, /log-*) n'ont pas d'interrupteur
// PAR DECISION : en poser un sur /privacy est un risque de retrait du magasin, et
// sur /diary une application de nutrition qui ne sait plus enregistrer un repas.
// La liste et ses raisons vivent dans `lib/navFlags.ts`, et on la LIT ici plutot
// que de la recopier. Signaler une decision comme un manque, c'est apprendre au
// lecteur a ignorer le rapport.
const blocNon = sansCommentaires(
  (srcNav.match(/NON_EXTINGUIBLES[^=]*=\s*\{([\s\S]*?)\n\}/) || [, ''])[1]);
const NON_EXTINGUIBLES = new Set(
  [...blocNon.matchAll(/^\s*'?([a-zA-Z0-9\-_]*)'?\s*:/gm)].map((m) => m[1]));

const SEUIL_LOURD = 250;
const nonGerables = portraits.filter((p) =>
  !p.drapeau
  && p.lignes >= SEUIL_LOURD
  && p.atteignable
  && !NON_EXTINGUIBLES.has(segmentDe(p.route)));

// 3. Un ecran qui porte du CALCUL et n'a aucun test.
// ⚠ « aucun test » n'est un defaut que si l'ecran calcule. Un ecran qui affiche
// n'a rien a prouver. On repere le calcul par les modules de logique qu'il
// importe : s'il n'en importe aucun, il ne fait qu'afficher.
const sansFilet = portraits.filter((p) => p.atteignable && p.modules.length >= 3 && !p.tests.length);

const rapport = {
  genere: new Date().toISOString(),
  totaux: {
    ecrans: portraits.length,
    drapeaux: FLAG_KEYS.length,
    routesApi: routesApi.size,
    tests: tests.length,
    couverts: portraits.filter((p) => p.tests.length).length,
    inatteignables: portraits.filter((p) => !p.atteignable).length,
  },
  drapeauxFantomes,
  nonGerables: nonGerables.map((p) => ({ route: p.route, lignes: p.lignes })),
  sansFilet: sansFilet.map((p) => ({ route: p.route, lignes: p.lignes, modules: p.modules.length })),
  ecrans: portraits,
};

if (JSON_SEUL) { console.log(JSON.stringify(rapport, null, 1)); process.exit(0); }

const T = rapport.totaux;
console.log(`\n  ${T.ecrans} écrans hors auth, ${T.drapeaux} drapeaux, ${T.routesApi} routes API, ${T.tests} tests`);
console.log(`  ${T.couverts} écran(s) touchés par au moins un test, ${T.inatteignables} sans porte d'entrée\n`);

console.log(`  ── ${drapeauxFantomes.length} drapeau(x) qui ne commandent aucune route ──`);
console.log('     (l\'admin croit pouvoir éteindre, le bouton ne commande rien)');
for (const d of drapeauxFantomes) console.log(`     ${d}`);

console.log(`\n  ── ${nonGerables.length} écran(s) de ${SEUIL_LOURD}+ lignes qu'aucun drapeau n'éteint ──`);
console.log('     (en cas d\'incident : republier, pas de coupure à distance)');
for (const p of nonGerables.slice(0, 20)) console.log(`     ${p.route.padEnd(30)} ${String(p.lignes).padStart(5)} lignes`);
if (nonGerables.length > 20) console.log(`     … et ${nonGerables.length - 20} autres`);

console.log(`\n  ── ${sansFilet.length} écran(s) qui portent de la logique sans aucun test ──`);
for (const p of sansFilet.slice(0, 20)) {
  console.log(`     ${p.route.padEnd(30)} ${String(p.lignes).padStart(5)} lignes, ${p.modules} modules`);
}
if (sansFilet.length > 20) console.log(`     … et ${sansFilet.length - 20} autres`);

console.log('\n  ── les 15 écrans les plus lourds, en détail ──');
console.log(`  ${'route'.padEnd(26)}${'lignes'.padStart(7)}  ${'drapeau'.padEnd(18)}${'backend'.padEnd(22)}tests`);
for (const p of portraits.slice(0, 15)) {
  console.log(`  ${p.route.padEnd(26)}${String(p.lignes).padStart(7)}  `
    + `${(p.drapeau || '— aucun').padEnd(18)}`
    + `${(p.backend.join(',') || '—').slice(0, 20).padEnd(22)}`
    + `${p.tests.length || '—'}${p.atteignable ? '' : '   ⚠ INATTEIGNABLE'}`);
}

console.log('\n  ⚠ « un test existe » n\'est pas « le comportement est juste ».');
console.log('    Ce script mesure la couverture STRUCTURELLE, il ne lance rien.\n');
