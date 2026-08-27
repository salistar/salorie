#!/usr/bin/env node
// Verifie les rapports de contraste des six themes (WCAG 2.1).
//
// Ce script existe parce que l'audit design du 26/08 disait franchement que les
// contrastes n'avaient JAMAIS ete mesures : 1 843 couleurs, deux modes, et aucun
// chiffre. On ne peut pas batir six themes sur cette base sans verifier.
//
// Seuils : 4.5:1 pour le texte courant, 3:1 pour le grand texte et les bordures.
//
// Usage : node scripts/verifier-contraste.js
const path = require('path');
const { THEMES, ORDRE_THEMES } = require('./_charger-themes');

function luminance(hex) {
  const v = hex.replace('#', '');
  const n = v.length === 3 ? v.split('').map((c) => c + c).join('') : v;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(n.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Chaque paire porte son seuil : une bordure n'a pas a etre lisible, elle a a
// etre VISIBLE. Les confondre produit soit des bordures criardes, soit des
// textes illisibles.
const PAIRES = [
  ['text', 'bg', 4.5, 'texte courant sur le fond'],
  ['text', 'surface', 4.5, 'texte sur une carte'],
  ['text', 'surface2', 4.5, 'texte sur une carte surelevee'],
  ['textMuted', 'bg', 4.5, 'texte secondaire sur le fond'],
  ['textMuted', 'surface', 4.5, 'texte secondaire sur une carte'],
  ['accent', 'bg', 3.0, 'accent sur le fond'],
  ['accent', 'surface', 3.0, 'accent sur une carte'],
  ['border', 'bg', 1.3, 'bordure visible sur le fond'],
  ['border', 'surface', 1.3, 'bordure visible sur une carte'],
  ['danger', 'surface', 3.0, 'message d erreur'],
  ['success', 'surface', 3.0, 'message de succes'],
];

let echecs = 0, total = 0;
const problemes = [];

for (const cle of ORDRE_THEMES) {
  const t = THEMES[cle];
  const lignes = [];
  for (const [avant, arriere, seuil, quoi] of PAIRES) {
    const r = ratio(t[avant], t[arriere]);
    total++;
    const ok = r >= seuil;
    if (!ok) { echecs++; problemes.push({ theme: cle, quoi, r, seuil }); }
    lignes.push(
      '    ' + (ok ? 'ok  ' : 'ECHEC') + '  ' +
      r.toFixed(2).padStart(5) + ':1  (min ' + seuil + ')  ' + quoi,
    );
  }
  console.log('\n  ' + t.nom.toUpperCase() + '  (' + cle + ')');
  console.log(lignes.join('\n'));
}

console.log('\n  ' + (total - echecs) + ' / ' + total + ' paires conformes');
if (problemes.length) {
  console.log('\n  A CORRIGER :');
  problemes.forEach((p) => console.log(
    '    ' + p.theme.padEnd(10) + p.r.toFixed(2) + ':1 au lieu de ' + p.seuil + '  — ' + p.quoi,
  ));
  console.log('\n  ⚠ Un calcul ne remplace pas un ecran physique en plein soleil.');
  console.log('  Il ecarte le pire, il ne garantit pas le confort.');
  process.exit(1);
}
console.log('\n  ⚠ Un calcul ne remplace pas un ecran physique en plein soleil.');
console.log('  Il ecarte le pire, il ne garantit pas le confort.');
