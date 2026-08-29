#!/usr/bin/env node
// Contrôle du contraste des variantes WEB dérivées par `color-mix`.
// ---------------------------------------------------------------------------
// POURQUOI CE TROISIÈME SCRIPT
// `verifier-contraste.js` mesure les douze jetons source. `verifier-contraste-
// mobile.js` mesure ce que la dérivation TypeScript en tire. Restait le web,
// dont les variantes — `--danger-bg`, `--danger-ink`, `--inset` — sont
// dérivées par `color-mix()` directement dans la feuille de style.
//
// Le CSS calcule ce mélange à l'affichage, donc rien ne peut le vérifier au
// moment de la construction. Ce script refait le calcul ici : `color-mix(in
// srgb, A p%, B)` est une interpolation linéaire en sRGB, reproductible en
// quelques lignes.
//
// ⚠ CE QUE ÇA NE COUVRE PAS. Si quelqu'un change le pourcentage dans
// globals.css sans le changer ici, le contrôle mesurera autre chose que ce qui
// s'affiche. Les deux valeurs sont donc lues DEPUIS le fichier, pas recopiées.
//
//   node scripts/verifier-contraste-web.js

const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..');
const CSS = fs.readFileSync(path.join(RACINE, 'web', 'app', 'globals.css'), 'utf8');
const def = JSON.parse(fs.readFileSync(path.join(RACINE, 'design', 'themes.json'), 'utf8'));

const rvb = (h) => {
  const s = h.replace('#', '');
  const p = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  return [0, 2, 4].map((i) => parseInt(p.slice(i, i + 2), 16));
};
const melange = (a, b, pct) => {
  const A = rvb(a), B = rvb(b), t = pct / 100;
  return '#' + [0, 1, 2].map((i) => Math.round(A[i] * t + B[i] * (1 - t)).toString(16).padStart(2, '0')).join('');
};
const lum = (h) => {
  const [r, g, b] = rvb(h).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

// Les mélanges tels qu'ils sont ÉCRITS dans la feuille — on les lit, on ne les
// suppose pas. `--danger-bg: color-mix(in srgb, var(--t-danger) 14%, var(--t-bg))`
const MIX = /--(?<nom>[a-z]+)-(?<role>bg|ink):\s*color-mix\(in srgb,\s*var\(--t-(?<src>[a-z0-9-]+)\)\s*(?<pct>\d+)%,\s*var\(--t-(?<fond>[a-z0-9-]+)\)\)/g;

// Le nom du jeton dans themes.json, depuis son nom CSS.
const jeton = (t, nom) => {
  const carte = { bg: 'bg', surface: 'surface', surface2: 'surface2', border: 'border',
    text: 'text', 'text-muted': 'textMuted', accent: 'accent', accent2: 'accent2',
    'accent-soft': 'accentSoft', success: 'success', warning: 'warning', danger: 'danger' };
  return t[carte[nom]];
};

const trouves = [...CSS.matchAll(MIX)];
if (!trouves.length) {
  console.error('  Aucun color-mix trouve dans globals.css. Le script mesure-t-il');
  console.error('  encore ce que la feuille fait reellement ?');
  process.exit(1);
}

// On apparie chaque `-ink` avec le `-bg` de la meme famille : c'est le couple
// qui s'affiche a l'ecran (`.msg-err`, `.badge-danger`, `.me-erreur`).
const parFamille = {};
for (const m of trouves) {
  const { nom, role, src, pct, fond } = m.groups;
  (parFamille[nom] = parFamille[nom] || {})[role] = { src, pct: Number(pct), fond };
}

let echecs = 0, total = 0;
for (const cle of def.ordreAffichage) {
  const t = def.themes[cle];
  const lignes = [];
  for (const [famille, r] of Object.entries(parFamille)) {
    if (!r.bg || !r.ink) continue;
    const fond = melange(jeton(t, r.bg.src), jeton(t, r.bg.fond), r.bg.pct);
    const encre = melange(jeton(t, r.ink.src), jeton(t, r.ink.fond), r.ink.pct);
    const c = ratio(encre, fond);
    total++;
    const ok = c >= 4.5;
    if (!ok) echecs++;
    lignes.push('    ' + (ok ? 'ok  ' : 'ECHEC') + ' ' + c.toFixed(2).padStart(6) + ':1  message ' + famille);
  }
  if (lignes.length) {
    console.log('\n  ' + t.nom.toUpperCase() + '  (' + cle + ')');
    lignes.forEach((l) => console.log(l));
  }
}

console.log('\n  ' + (total - echecs) + ' / ' + total + ' couples conformes');
if (echecs) {
  console.error('\n  Un message serait illisible sur son propre fond. Ajustez les');
  console.error('  pourcentages de color-mix dans web/app/globals.css.');
  process.exit(1);
}
