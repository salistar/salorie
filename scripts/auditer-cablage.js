#!/usr/bin/env node
// Chaque fonctionnalité est-elle réellement BRANCHÉE ?
// ---------------------------------------------------------------------------
// CE QUE CE SCRIPT CHERCHE, ET POURQUOI L'INVENTAIRE NE SUFFIT PAS
// `inventaire-features.js` recense ce qui EXISTE : 105 écrans, 87 routes. Un
// recensement ne dit pas si les pièces se parlent. Trois pannes lui échappent,
// et ce sont les trois qu'on a réellement rencontrées :
//
//   ÉCRAN ORPHELIN      Le module Strava du backend était complet depuis le
//                       31/08/2026 — signature HMAC, tests, import dédupliqué —
//                       et AUCUN écran ne l'appelait. Le travail existait, le
//                       chemin utilisateur non.
//   APPEL DANS LE VIDE  Un écran qui interroge une route supprimée échoue à
//                       l'exécution, jamais à la compilation.
//   BOUTON MUET         `upgrade` appelait un paywall RevenueCat qui, sans clé
//                       de production, ne fait rien. L'écran s'affiche, le
//                       bouton s'enfonce, et il ne se passe rien.
//
// ⚠ CE QUE CE SCRIPT NE PEUT PAS DIRE.
// Il ne lance pas l'application. Un écran atteignable qui appelle une route
// existante peut parfaitement afficher n'importe quoi. Il répond à « est-ce
// branché », pas à « est-ce juste » — et confondre les deux serait exactement
// l'erreur que cet audit cherche à éviter ailleurs.
//
//   node scripts/auditer-cablage.js            # rapport lisible
//   node scripts/auditer-cablage.js --json     # pour un autre outil

const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..');
const JSON_SEUL = process.argv.includes('--json');

function fichiers(dir, filtre, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (/node_modules|\.next|\.expo|__tests__|\.git/.test(p)) continue;
    if (e.isDirectory()) fichiers(p, filtre, acc);
    else if (filtre.test(e.name)) acc.push(p);
  }
  return acc;
}
const rel = (f) => path.relative(RACINE, f).replace(/\\/g, '/');
const lire = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };

// ── 1. Les écrans mobiles, et leur route Expo Router ───────────────────────
// Expo Router dérive la route du chemin : app/(app)/strava.tsx -> /strava.
// Les groupes entre parenthèses ne comptent pas, `index` désigne le parent.
function routeDe(f) {
  let r = rel(f).replace(/^app\//, '').replace(/\.tsx$/, '');
  r = r.split('/').filter((s) => !/^\(.*\)$/.test(s)).join('/');
  return '/' + r.replace(/\/index$/, '').replace(/^index$/, '');
}

const ecrans = fichiers(path.join(RACINE, 'app'), /\.tsx$/)
  .filter((f) => !/_layout|\+not-found|\+html/.test(f))
  .map((f) => ({ fichier: rel(f), route: routeDe(f), source: lire(f) }));

// ── 2. Toutes les destinations citées quelque part dans le code ────────────
const sourcesApp = [
  ...fichiers(path.join(RACINE, 'app'), /\.tsx?$/),
  ...fichiers(path.join(RACINE, 'components'), /\.tsx?$/),
  ...fichiers(path.join(RACINE, 'lib'), /\.tsx?$/),
].map((f) => ({ fichier: rel(f), source: lire(f) }));

// ⚠ ON RAMASSE TOUTE CHAINE COMMENCANT PAR « / », PAS SEULEMENT LES `push`.
// Premiere version : elle ne cherchait que `push|replace|navigate|href|pathname`
// et annoncait 39 ecrans orphelins — dont `workout-plans`, `fasting`,
// `meal-plan`. Faux. Les hubs de navigation (Accueil, Coach, Defis) construisent
// leurs tuiles depuis des TABLEAUX de donnees :
//     { Icon: Dumbbell, label: ..., route: '/workout-plans' }
// puis font `router.push(item.route)`. La destination n'apparait jamais a cote
// d'un `push`.
//
// Une detection trop etroite ici ne produit pas une liste incomplete : elle
// produit une FAUSSE ALERTE, qui envoie chercher trente-neuf pannes inexistantes.
// On ratisse donc large et on accepte de rater un orphelin plutot que d'en
// inventer.
const citees = new Set();
for (const { source } of sourcesApp) {
  // ⚠ ON S'ARRETE AU « ? », PAS AU GUILLEMET.
  // Deuxieme faux positif : `router.push('/duo-walk?duoId=' + x)` et
  // `` `/listing-detail?id=${id}` `` n'etaient pas vus, parce que le motif
  // exigeait le guillemet immediatement apres le chemin. Quatre ecrans
  // parfaitement atteignables etaient declares orphelins.
  for (const m of source.matchAll(/['"`](\/[a-zA-Z0-9\-_()\/]*)(?:[?'"`$]|\$\{)/g)) {
    const d = m[1].split('?')[0].replace(/\/\(app\)|\/\(tabs\)|\(app\)|\(tabs\)/g, '');
    if (d.startsWith('/')) citees.add(d.replace(/\/$/, '') || '/');
  }
}

// Les onglets sont atteignables par la barre, sans push explicite.
const onglets = ecrans.filter((e) => e.fichier.includes('(tabs)')).map((e) => e.route);

// ⚠ UN LIEN PROFOND EST UNE PORTE D'ENTREE, MEME SANS `push`.
// `/oauth-callback` a ete signale orphelin a chaque execution : c'est FAUX. Il est
// atteint depuis l'exterieur, par `Linking.createURL('oauth-callback')` — le
// navigateur y renvoie l'utilisateur apres l'autorisation. Aucun `router.push`
// ne le cite, et il ne doit pas en citer : ce serait le contraire de son role.
//
// Un faux positif qu'on reexplique a chaque fois finit par etre ignore, et le
// jour ou un VRAI orphelin apparait a cote, il est ignore avec lui.
for (const { source } of sourcesApp) {
  for (const m of source.matchAll(/createURL\(\s*['"`]\/?([a-zA-Z0-9\-_\/]+)/g)) {
    citees.add('/' + m[1].replace(/^\//, ''));
  }
}

const orphelins = ecrans.filter((e) =>
  !citees.has(e.route)
  && !onglets.includes(e.route)
  && !/\(auth\)|\(onboarding\)/.test(e.fichier));

// ── 3. Les routes que le backend expose réellement ─────────────────────────
const routesApi = new Set();
for (const f of fichiers(path.join(RACINE, 'backend/src'), /\.controller\.ts$/)) {
  const s = lire(f);
  const base = (s.match(/@Controller\(\s*['"`]([^'"`]*)['"`]/) || [, ''])[1];
  for (const m of s.matchAll(/@(Get|Post|Put|Patch|Delete)\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/g)) {
    const chemin = ('/' + base + '/' + (m[2] || '')).replace(/\/+/g, '/').replace(/\/$/, '') || '/';
    routesApi.add(chemin);
  }
}

// ── 4. Les appels que l'application adresse au backend ─────────────────────
// On ne garde que les chemins litteraux : un chemin construit par variable ne
// peut pas etre verifie ici, et le PRETENDRE serait pire que de l'ignorer.
const appels = [];
for (const { fichier, source } of sourcesApp) {
  for (const m of source.matchAll(/(?:API_URL|API|apiUrl)\}?\s*\}?\s*[`'"]([/][a-zA-Z0-9\-_/]*)/g)) {
    appels.push({ fichier, chemin: m[1].replace(/\/$/, '') });
  }
  for (const m of source.matchAll(/(?:authFetch|appel|apiFetch)\(\s*[`'"]([/][a-zA-Z0-9\-_/]*)/g)) {
    appels.push({ fichier, chemin: m[1].replace(/\/$/, '') });
  }
}
const dansLeVide = appels.filter((a) => {
  if (routesApi.has(a.chemin)) return false;
  // Une route paramétrée (/races/:id) ne correspond jamais littéralement : on
  // accepte tout préfixe déclaré, sinon on crierait au loup sur du code sain.
  return ![...routesApi].some((r) => a.chemin.startsWith(r + '/') || r.startsWith(a.chemin + '/'));
});

// ── 5. Les gestes sans effet apparent ──────────────────────────────────────
// ⚠ UN `onPress={() => {}}` N'EST PAS TOUJOURS UN OUBLI.
// C'est aussi l'idiome standard pour ABSORBER un tap. Dans une modale, la
// surface exterieure ferme la fenetre ; la carte interieure porte alors un
// gestionnaire vide, sans quoi toucher la carte la fermerait. Constate le
// 09/09/2026 sur app/(tabs)/coach.tsx:467 — le seul « bouton mort » signale par
// la premiere version de ce script etait ce garde-fou, parfaitement voulu.
//
// Le signaler enverrait CASSER un comportement correct. On exclut donc le cas
// reconnaissable — un element dont le style porte modal/card/sheet/overlay — et
// on nomme le reste « a relire » plutot que « casse » : ce script ne lance pas
// l'application, il ne peut pas savoir si un handler vide est un oubli.
const muets = [];
for (const { fichier, source } of sourcesApp) {
  const lignes = source.split('\n');
  lignes.forEach((l, i) => {
    if (!/on(Press|Click)\s*=\s*\{\s*\(\s*\)\s*=>\s*(\{\s*\}|null|undefined|void 0)\s*\}/.test(l)) return;
    if (/modal|card|sheet|content|overlay|backdrop/i.test(l)) return;   // absorbeur de tap
    muets.push({ fichier, ligne: i + 1, code: l.trim().slice(0, 80) });
  });
}

// ── 6. Les fonctionnalités suspendues à une configuration ──────────────────
const config = [];
for (const { fichier, source } of sourcesApp) {
  for (const m of source.matchAll(/process\.env\.(EXPO_PUBLIC_[A-Z0-9_]+)/g)) {
    config.push({ fichier, variable: m[1] });
  }
}
const parVariable = {};
for (const c of config) (parVariable[c.variable] = parVariable[c.variable] || new Set()).add(c.fichier);

const rapport = {
  genere: new Date().toISOString(),
  totaux: {
    ecrans: ecrans.length,
    destinationsCitees: citees.size,
    routesApi: routesApi.size,
    appelsLitteraux: appels.length,
  },
  orphelins: orphelins.map((e) => ({ route: e.route, fichier: e.fichier })),
  appelsDansLeVide: dansLeVide,
  boutonsMuets: muets,
  variablesConfig: Object.fromEntries(
    Object.entries(parVariable).map(([v, s]) => [v, [...s]])),
};

if (JSON_SEUL) {
  console.log(JSON.stringify(rapport, null, 1));
} else {
  const T = rapport.totaux;
  console.log(`\n  ${T.ecrans} écrans, ${T.destinationsCitees} destinations citées, `
    + `${T.routesApi} routes API, ${T.appelsLitteraux} appels littéraux\n`);

  console.log(`  ── ${rapport.orphelins.length} écran(s) qu'aucun lien n'atteint ──`);
  for (const o of rapport.orphelins.slice(0, 40)) console.log(`     ${o.route.padEnd(34)} ${o.fichier}`);
  if (rapport.orphelins.length > 40) console.log(`     … et ${rapport.orphelins.length - 40} autres`);

  console.log(`\n  ── ${rapport.appelsDansLeVide.length} appel(s) vers une route inexistante ──`);
  for (const a of rapport.appelsDansLeVide.slice(0, 25)) console.log(`     ${a.chemin.padEnd(34)} ${a.fichier}`);

  console.log(`\n  ── ${rapport.boutonsMuets.length} bouton(s) sans effet ──`);
  for (const b of rapport.boutonsMuets.slice(0, 20)) console.log(`     ${b.fichier}:${b.ligne}  ${b.code}`);

  console.log(`\n  ── ${Object.keys(rapport.variablesConfig).length} variable(s) dont dépendent des écrans ──`);
  for (const [v, f] of Object.entries(rapport.variablesConfig)) {
    console.log(`     ${v.padEnd(34)} ${f.length} fichier(s)`);
  }
  console.log('\n  ⚠ Ce script dit si c\'est BRANCHÉ, pas si c\'est JUSTE.');
  console.log('    Il ne lance pas l\'application.\n');
}
