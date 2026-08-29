#!/usr/bin/env node
// Recense TOUTES les fonctionnalités de l'écosystème, depuis le code.
// ---------------------------------------------------------------------------
// POURQUOI DEPUIS LE CODE ET NON DE MÉMOIRE
// Une liste écrite de mémoire oublie toujours quelque chose — et ce qu'elle
// oublie n'est jamais aléatoire : c'est ce qui n'a pas été touché récemment,
// donc précisément ce dont personne ne se souvient. Ce script lit les routes,
// les contrôleurs et les collections. Il ne peut pas oublier un écran ; il peut
// en revanche mal le décrire, et c'est à la relecture de corriger.
//
//   node scripts/inventaire-features.js > /tmp/inventaire.json

const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..');

function fichiers(dir, filtre, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (/node_modules|\.next|\.expo|__tests__/.test(p)) continue;
    if (e.isDirectory()) fichiers(p, filtre, acc);
    else if (filtre.test(e.name)) acc.push(p);
  }
  return acc;
}

const rel = (f) => path.relative(RACINE, f).replace(/\\/g, '/');

/** Le titre d'un écran : son premier commentaire de tête, ou son nom. */
function titre(f) {
  const s = fs.readFileSync(f, 'utf8').slice(0, 2500);
  // Un bloc `/** … */` ou une ligne `// …` en tête décrit souvent l'écran.
  const bloc = s.match(/\/\*\*\s*\n?\s*\*?\s*([^\n*][^\n]{8,120})/);
  if (bloc) return bloc[1].trim().replace(/\s*\*\/$/, '');
  const ligne = s.match(/^\/\/\s*([^\n]{8,120})/m);
  if (ligne && !/@couleurs-identite|eslint|FICHIER GENERE/.test(ligne[1])) return ligne[1].trim();
  return null;
}

const out = { genere: 'scripts/inventaire-features.js' };

// ── Mobile : les routes d'expo-router ──────────────────────────────────────
out.mobile = {};
for (const groupe of ['(app)', '(tabs)', '(auth)', '(onboarding)']) {
  const d = path.join(RACINE, 'app', groupe);
  if (!fs.existsSync(d)) continue;
  out.mobile[groupe] = fs
    .readdirSync(d)
    .filter((f) => f.endsWith('.tsx') && !f.startsWith('_'))
    .map((f) => ({ route: f.replace(/\.tsx$/, ''), titre: titre(path.join(d, f)) }));
}

// ── Web : les pages Next.js ────────────────────────────────────────────────
const pagesWeb = fichiers(path.join(RACINE, 'web', 'app'), /^page\.tsx$/);
out.web = { landing: [], me: [], admin: [] };
for (const f of pagesWeb) {
  const r = rel(f).replace(/^web\/app/, '').replace(/\/page\.tsx$/, '') || '/';
  const propre = r.replace(/\/\(landing\)/, '') || '/';
  const cible = propre.startsWith('/me') ? 'me' : /^\/(admin|admins|ai-keys|achievements|emails|feedback|flags|marketplace|medal|moderation|news|notify|orgs|premium|races|reports|sport-fields)/.test(propre) ? 'admin' : 'landing';
  out.web[cible].push({ route: propre, titre: titre(f) });
}

// ── Backend : les routes NestJS ────────────────────────────────────────────
const ctrls = fichiers(path.join(RACINE, 'backend', 'src'), /\.controller\.ts$/);
out.api = ctrls.map((f) => {
  const s = fs.readFileSync(f, 'utf8');
  const base = (s.match(/@Controller\('([^']*)'\)/) || [, ''])[1];
  const routes = [...s.matchAll(/@(Get|Post|Put|Patch|Delete)\('?([^')]*)'?\)/g)].map(
    (m) => m[1].toUpperCase() + ' /' + [base, m[2]].filter(Boolean).join('/'),
  );
  return { fichier: rel(f), garde: /@UseGuards\(([^)]*)\)/.test(s) ? (s.match(/@UseGuards\(([^)]*)\)/) || [])[1] : null, routes };
});

// ── Web : les routes d'API ─────────────────────────────────────────────────
out.apiWeb = fichiers(path.join(RACINE, 'web', 'app', 'api'), /^route\.ts$/).map((f) => {
  const s = fs.readFileSync(f, 'utf8');
  return {
    route: rel(f).replace(/^web\/app/, '').replace(/\/route\.ts$/, ''),
    methodes: [...s.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)/g)].map((m) => m[1]),
  };
});

// ── Les modules de logique ─────────────────────────────────────────────────
out.lib = fichiers(path.join(RACINE, 'lib'), /\.ts$/)
  .map((f) => ({ module: rel(f), titre: titre(f) }))
  .filter((x) => x.titre);

const compte = (o) => Object.values(o).reduce((n, v) => n + (Array.isArray(v) ? v.length : 0), 0);
out.totaux = {
  ecransMobile: compte(out.mobile),
  pagesWeb: compte(out.web),
  controleursApi: out.api.length,
  routesApi: out.api.reduce((n, c) => n + c.routes.length, 0),
  routesApiWeb: out.apiWeb.length,
  modulesLogique: out.lib.length,
};

process.stdout.write(JSON.stringify(out, null, 1));
