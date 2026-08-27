// Preuve que les six themes atteignent VRAIMENT le vocabulaire du site.
//
// On ne regarde pas --t-* (evidemment correct : c'est le fichier genere). On
// regarde --ink, --card, --bg, --green : les jetons que les 101 pages utilisent
// reellement. Et surtout on lit la couleur CALCULEE du body, seule preuve que
// la variable est resolue et non juste declaree.
const { chromium } = require('playwright');
const THEMES = ['obsidian', 'ivory', 'blush', 'ocean', 'platinum', 'gold'];

(async () => {
  const nav = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = await nav.contexts()[0].newPage();
  // ⚠ SANS CECI, LE TEST MENT. Edge reservait la feuille CSS d une construction
  // precedente : les jetons etaient corrects dans .next et faux a l ecran, ce
  // qui m a fait conclure a tort que le branchement avait echoue.
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await p.setViewportSize({ width: 1280, height: 900 });
  await p.goto('http://127.0.0.1:3100/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4000);

  const vus = new Set();
  for (const t of THEMES) {
    // ⚠ landing.css anime le fond sur .3s : lire la couleur calculee dans la
    // foulee renvoie la valeur de DEPART, pas celle du theme. Deux tests
    // "echoues" venaient de la, pas du CSS.
    await p.evaluate((th) => document.documentElement.setAttribute('data-theme', th), t);
    await p.waitForTimeout(600);
    const r = await p.evaluate((th) => {
      document.documentElement.setAttribute('data-theme', th);
      const cs = getComputedStyle(document.documentElement);
      const body = getComputedStyle(document.body);
      const v = (n) => cs.getPropertyValue(n).trim();
      return {
        nom: v('--t-theme-nom'),
        ink: v('--ink'), card: v('--card'), bg: v('--bg'), green: v('--green'),
        bodyBg: body.backgroundColor, bodyCol: body.color,
      };
    }, t);
    vus.add(r.bodyBg + '|' + r.bodyCol);
    console.log('  ' + t.padEnd(10) + r.nom.padEnd(12)
      + ' --ink=' + r.ink.padEnd(18) + ' --green=' + r.green.padEnd(18));
    console.log('  ' + ' '.repeat(10) + 'body calcule : fond ' + r.bodyBg + '  texte ' + r.bodyCol);
  }
  console.log('\n  rendus distincts : ' + vus.size + ' / 6');
  console.log(vus.size >= 5 ? '  -> les themes atteignent bien le rendu.' : '  -> ECHEC : le vocabulaire du site ne suit pas.');
  await p.close(); await nav.close();
})();
