#!/usr/bin/env node
// Compile design/themes.json vers les deux cibles.
//
// POURQUOI UNE GENERATION
// Deux fichiers de couleurs tenus a la main divergent — c'est exactement ce qui
// a produit les 1 843 hexadecimaux en dur de l'application mobile. Une source,
// deux sorties, et un test qui verifie qu'elles correspondent.
//
// Usage :
//   node scripts/generer-themes.js            genere
//   node scripts/generer-themes.js --verifier  echoue si les sorties ont derive
//                                              (c'est ce que la CI appelle)
const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..');
const SOURCE = path.join(RACINE, 'design', 'themes.json');
const CIBLE_MOBILE = path.join(RACINE, 'constants', 'themesGeneres.ts');
const CIBLE_WEB = path.join(RACINE, 'web', 'app', 'themes.generated.css');

const ENTETE = [
  'FICHIER GENERE — NE PAS MODIFIER A LA MAIN.',
  'Source : design/themes.json',
  'Regenerer : node scripts/generer-themes.js',
  'Toute modification directe sera ecrasee, et la CI la refusera.',
];

const def = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
const ordre = def.ordreAffichage;
const themes = def.themes;

// Les jetons qu'un theme DOIT porter. Un thème incomplet casserait un ecran au
// hasard, tres loin d'ici : on prefere echouer maintenant, bruyamment.
const REQUIS = [
  'bg', 'surface', 'surface2', 'border', 'text', 'textMuted',
  'accent', 'accent2', 'accentSoft', 'success', 'warning', 'danger',
];

for (const cle of ordre) {
  const t = themes[cle];
  if (!t) throw new Error(`Theme « ${cle} » liste dans ordreAffichage mais absent de themes`);
  const manquants = REQUIS.filter((j) => !t[j]);
  if (manquants.length) {
    throw new Error(`Theme « ${cle} » : jetons manquants — ${manquants.join(', ')}`);
  }
  if (!Array.isArray(t.gradientHero) || t.gradientHero.length !== 2) {
    throw new Error(`Theme « ${cle} » : gradientHero doit etre [debut, fin]`);
  }
}

/** camelCase -> kebab-case, pour les variables CSS. */
// ⚠ PREFIXE `--t-` OBLIGATOIRE.
// globals.css definit deja --bg, --success, --warning, --danger avec les MEMES
// noms, et il est charge APRES : il ecrasait donc silencieusement les jetons du
// theme. Resultat, les six themes existaient sans que rien ne change a l ecran.
// Le prefixe les met hors de portee de toute collision.
// Le gabarit d'appel ajoute deja les deux tirets : on ne rend donc que
// `t-bg`, jamais `-t-bg` — sans quoi on produit `---t-bg`, que le navigateur
// ignore en silence.
const kebab = (s) => 't-' + s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());

function genererMobile() {
  const l = [];
  l.push('// ' + ENTETE.join('\n// '));
  l.push('');
  l.push('export type CleTheme = ' + ordre.map((c) => `'${c}'`).join(' | ') + ';');
  l.push('');
  l.push('export interface JetonsTheme {');
  l.push('  nom: string;');
  l.push('  sombre: boolean;');
  REQUIS.forEach((j) => l.push(`  ${j}: string;`));
  l.push('  borderSoft?: string;');
  l.push('  gradientHero: [string, string];');
  l.push('}');
  l.push('');
  l.push('export const THEMES: Record<CleTheme, JetonsTheme> = {');
  ordre.forEach((cle) => {
    const t = themes[cle];
    l.push(`  ${cle}: {`);
    l.push(`    nom: ${JSON.stringify(t.nom)},`);
    l.push(`    sombre: ${t.sombre},`);
    REQUIS.forEach((j) => l.push(`    ${j}: '${t[j]}',`));
    if (t.borderSoft) l.push(`    borderSoft: '${t.borderSoft}',`);
    l.push(`    gradientHero: ['${t.gradientHero[0]}', '${t.gradientHero[1]}'],`);
    l.push('  },');
  });
  l.push('};');
  l.push('');
  l.push('/** Ordre du selecteur a six pastilles, identique sur toutes les surfaces. */');
  l.push('export const ORDRE_THEMES: CleTheme[] = [' + ordre.map((c) => `'${c}'`).join(', ') + '];');
  l.push('');
  return l.join('\n');
}

function bloc(l, cle, selecteur) {
  const t = themes[cle];
  l.push(`${selecteur} {`);
  l.push(`  --t-theme-nom: '${t.nom}';`);
  l.push(`  color-scheme: ${t.sombre ? 'dark' : 'light'};`);
  REQUIS.forEach((j) => l.push(`  --${kebab(j)}: ${t[j]};`));
  if (t.borderSoft) l.push(`  --t-border-soft: ${t.borderSoft};`);
  l.push(`  --t-gradient-hero: linear-gradient(135deg, ${t.gradientHero[0]}, ${t.gradientHero[1]});`);
  l.push('}');
  l.push('');
}

function genererWeb() {
  const l = [];
  l.push('/* ' + ENTETE.join('\n   ') + ' */');
  l.push('');

  // ⚠ LE DEFAUT N'EST PAS LE PREMIER THEME DE LA LISTE.
  // Sans `data-theme` (premiere visite, ou reglage « systeme »), le site doit
  // rendre ce qu'il rendait avant ce chantier : clair, et sombre seulement si le
  // systeme le demande. Faire de `obsidian` le defaut de :root basculerait tout
  // le site en sombre du jour au lendemain — une regression massive, et
  // invisible en relecture de code.
  l.push('/* Sans choix explicite : clair, ou sombre si le systeme le demande. */');
  bloc(l, def.themeParDefautClair, ':root');
  l.push('@media (prefers-color-scheme: dark) {');
  const sombre = themes[def.themeParDefautSombre];
  l.push(`  :root:not([data-theme]) {`);
  REQUIS.forEach((j) => l.push(`    --${kebab(j)}: ${sombre[j]};`));
  l.push(`    color-scheme: dark;`);
  l.push(`    --t-gradient-hero: linear-gradient(135deg, ${sombre.gradientHero[0]}, ${sombre.gradientHero[1]});`);
  l.push('  }');
  l.push('}');
  l.push('');
  l.push('/* Les six thèmes, quand l\'un est explicitement choisi. */');

  // ⚠ ALIAS DE COMPATIBILITE — a ne pas retirer.
  // Le selecteur precedent enregistrait `light` / `dark` dans localStorage. Ces
  // valeurs sont TOUJOURS dans le navigateur des utilisateurs : sans ces alias,
  // leur preference cesserait simplement de s'appliquer, sans erreur et sans
  // que personne comprenne pourquoi.
  const ALIAS = { light: def.themeParDefautClair, dark: def.themeParDefautSombre };
  Object.entries(ALIAS).forEach(([ancien, vers]) => {
    bloc(l, vers, `[data-theme='${ancien}']`);
  });

  ordre.forEach((cle) => {
    const t = themes[cle];
    const sel = `[data-theme='${cle}']`;
    l.push(`${sel} {`);
    l.push(`  --t-theme-nom: '${t.nom}';`);
    l.push(`  color-scheme: ${t.sombre ? 'dark' : 'light'};`);
    REQUIS.forEach((j) => l.push(`  --${kebab(j)}: ${t[j]};`));
    if (t.borderSoft) l.push(`  --t-border-soft: ${t.borderSoft};`);
    l.push(`  --t-gradient-hero: linear-gradient(135deg, ${t.gradientHero[0]}, ${t.gradientHero[1]});`);
    l.push('}');
    l.push('');
  });
  return l.join('\n');
}

const sorties = [
  [CIBLE_MOBILE, genererMobile()],
  [CIBLE_WEB, genererWeb()],
];

if (process.argv.includes('--verifier')) {
  let derive = 0;
  for (const [chemin, attendu] of sorties) {
    const actuel = fs.existsSync(chemin) ? fs.readFileSync(chemin, 'utf8') : '';
    if (actuel !== attendu) {
      console.error('  A DERIVE : ' + path.relative(RACINE, chemin));
      derive++;
    } else {
      console.log('  conforme : ' + path.relative(RACINE, chemin));
    }
  }
  if (derive) {
    console.error('\n  Un fichier genere a ete modifie a la main, ou la source a change');
    console.error('  sans regeneration. Lancez : node scripts/generer-themes.js');
    process.exit(1);
  }
  console.log('\n  Les sorties correspondent a design/themes.json.');
  process.exit(0);
}

for (const [chemin, contenu] of sorties) {
  fs.mkdirSync(path.dirname(chemin), { recursive: true });
  fs.writeFileSync(chemin, contenu, 'utf8');
  console.log('  ecrit : ' + path.relative(RACINE, chemin) + '  (' + contenu.length + ' octets)');
}
console.log('\n  ' + ordre.length + ' themes : ' + ordre.join(', '));
