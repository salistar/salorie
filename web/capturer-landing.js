// Captures des pages publiques (landing). Aucune authentification requise.
// Usage : node capturer-landing.js
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const RACINE = 'https://salorie.com';
const SORTIE = 'C:/Users/21266/Desktop/salorie_8-26_2026/captures/landing';

const PAGES = [
  ['accueil', '/'],
  ['accueil-en', '/en'],
  ['accueil-ar', '/ar'],
  ['contact', '/contact'],
  ['confidentialite', '/privacy'],
  ['conditions', '/terms'],
  ['remboursement', '/refund'],
  ['suppression-compte', '/delete-account'],
];

// Le thème suit `prefers-color-scheme` : on capture les deux, sinon on ne montre
// que la moitié d'un travail qui a été fait sur les deux modes.
const THEMES = [['clair', 'light'], ['sombre', 'dark']];

(async () => {
  fs.mkdirSync(SORTIE, { recursive: true });
  const navigateur = await chromium.launch();
  let ok = 0, ko = 0;

  for (const [nomTheme, schema] of THEMES) {
    const ctx = await navigateur.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: schema,
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();

    for (const [nom, chemin] of PAGES) {
      const url = RACINE + chemin;
      const fichier = path.join(SORTIE, `${nom}-${nomTheme}.png`);
      try {
        const r = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
        // On laisse les polices et les images au-dessus de la ligne de flottaison
        // se poser : une capture prise trop tot montre du texte sans sa fonte.
        await page.waitForTimeout(1200);
        await page.screenshot({ path: fichier, fullPage: true });
        console.log(`  ok   ${nom}-${nomTheme}  (HTTP ${r ? r.status() : '?'})`);
        ok++;
      } catch (e) {
        console.log(`  ECHEC ${nom}-${nomTheme} : ${e.message.split('\n')[0]}`);
        ko++;
      }
    }
    await ctx.close();
  }

  // Une vue telephone : la landing est vue majoritairement au telephone.
  const mob = await navigateur.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const pm = await mob.newPage();
  for (const [nom, chemin] of PAGES) {
    try {
      await pm.goto(RACINE + chemin, { waitUntil: 'networkidle', timeout: 45000 });
      await pm.waitForTimeout(1200);
      await pm.screenshot({ path: path.join(SORTIE, `${nom}-telephone.png`), fullPage: true });
      console.log(`  ok   ${nom}-telephone`);
      ok++;
    } catch (e) {
      console.log(`  ECHEC ${nom}-telephone : ${e.message.split('\n')[0]}`);
      ko++;
    }
  }
  await mob.close();

  await navigateur.close();
  console.log(`\n  captures : ${ok} reussies, ${ko} echouees`);
})();
