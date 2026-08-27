#!/usr/bin/env node
// Contrôle du contraste sur la palette MOBILE — celle qui est dérivée.
// ---------------------------------------------------------------------------
// `verifier-contraste.js` mesure les douze jetons écrits dans
// design/themes.json. Ce script-ci mesure ce que la dérivation en TIRE :
// surfaceSunken, textFaint, borderStrong, les triplets …Soft / …Ink.
//
// C'est la partie risquée. Les douze valeurs ont été choisies par un humain ;
// les autres sortent d'un calcul qui peut très bien produire un gris illisible
// sans que rien ne le signale. Ce contrôle a d'ailleurs trouvé onze paires sous
// le seuil dès sa première exécution.
//
// ⚠ IL COMPILE LE VRAI FICHIER, IL N'EN RECOPIE PAS LA LOGIQUE.
// Une première version reproduisait les mélanges en JavaScript pour tourner
// sous Node nu. Elle a divergé de constants/derivationThemes.ts en une seule
// modification — un contrôle qui mesure autre chose que le code livré ne
// contrôle rien. On passe donc par `tsc`, au prix de quelques secondes.
//
//   node scripts/verifier-contraste-mobile.js

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');

const RACINE = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'salorie-contraste-'));

try {
  execFileSync(
    // ⚠ PAS `npx` : sous Windows c'est un .cmd, qu'execFileSync refuse de
    // lancer sans shell — le script echouait alors sur un « compilation
    // impossible » sans la moindre explication. On appelle le compilateur
    // par son chemin resolu, ce qui evite le shell ET une seconde de demarrage.
    process.execPath,
    [require.resolve('typescript/bin/tsc'),
      path.join(RACINE, 'constants', 'derivationThemes.ts'),
      '--outDir', tmp,
      '--module', 'commonjs',
      '--target', 'es2019',
      '--skipLibCheck'],
    { stdio: 'pipe', cwd: RACINE }
  );
} catch (e) {
  // tsc rend un code non nul pour de simples avertissements de configuration ;
  // ce qui compte est que le fichier attendu existe.
  if (!fs.existsSync(path.join(tmp, 'derivationThemes.js'))) {
    console.error('  compilation impossible :\n' + String(e.stdout || e.message).slice(0, 900));
    process.exit(1);
  }
}

const { paletteComplete, contraste } = require(path.join(tmp, 'derivationThemes.js'));
const def = JSON.parse(fs.readFileSync(path.join(RACINE, 'design', 'themes.json'), 'utf8'));

// Les paires que l'application affiche réellement, et le seuil applicable.
// 4,5:1 pour du texte courant, 3:1 pour du gros texte et les éléments d'IHM,
// 1,3:1 pour un trait qui doit rester perceptible sans porter d'information.
const PAIRES = [
  ['text', 'bg', 4.5, 'texte courant sur le fond'],
  ['text', 'surface', 4.5, 'texte sur une carte'],
  ['text', 'surfaceRaised', 4.5, 'texte sur une carte surelevee'],
  ['text', 'surfaceSunken', 4.5, 'texte dans un champ de saisie'],
  ['textMuted', 'bg', 4.5, 'texte secondaire sur le fond'],
  ['textMuted', 'surface', 4.5, 'texte secondaire sur une carte'],
  ['textFaint', 'bg', 3, 'mention discrete sur le fond'],
  ['textFaint', 'surface', 3, 'mention discrete sur une carte'],
  ['accent', 'bg', 3, 'accent sur le fond'],
  ['accent', 'surface', 3, 'accent sur une carte'],
  ['onAccent', 'accent', 4.5, 'texte pose SUR l accent'],
  ['accent', 'accentSoft', 3, 'accent sur son fond teinte'],
  ['border', 'bg', 1.3, 'bordure sur le fond'],
  ['borderStrong', 'surface', 1.3, 'bordure appuyee sur une carte'],
  ['successInk', 'successSoft', 4.5, 'message de succes'],
  ['warningInk', 'warningSoft', 4.5, 'message d avertissement'],
  ['dangerInk', 'dangerSoft', 4.5, 'message d erreur'],
  ['infoInk', 'infoSoft', 4.5, 'message d information'],
];

let echecs = 0;
let total = 0;
for (const cle of def.ordreAffichage) {
  const t = def.themes[cle];
  const p = paletteComplete(t);
  console.log('\n  ' + t.nom.toUpperCase() + '  (' + cle + ')');
  for (const [a, b, min, quoi] of PAIRES) {
    const r = contraste(p[a], p[b]);
    total++;
    const ok = r >= min;
    if (!ok) echecs++;
    console.log(
      '    ' + (ok ? 'ok  ' : 'ECHEC') + ' ' + r.toFixed(2).padStart(6) + ':1  (min ' + min + ')  ' + quoi
    );
  }
}

fs.rmSync(tmp, { recursive: true, force: true });

console.log('\n  ' + (total - echecs) + ' / ' + total + ' paires conformes');
if (echecs) {
  console.error('\n  ' + echecs + ' paire(s) sous le seuil. La derivation doit etre corrigee');
  console.error('  dans constants/derivationThemes.ts — PAS en ecrivant la valeur a la main');
  console.error('  dans un ecran : ce serait rouvrir la porte aux couleurs en dur.');
  process.exit(1);
}
console.log('\n  ⚠ Un calcul ne remplace pas un ecran physique en plein soleil.');
