const { chromium } = require('playwright');
const fs = require('fs');
const THEMES = ['obsidian', 'ivory', 'blush', 'ocean', 'platinum', 'gold'];
const D = 'C:/Users/21266/Desktop/salorie_8-26_2026/captures/themes-prod';
(async () => {
  const nav = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = nav.contexts()[0];
  const p = ctx.pages().find((x) => /salorie\.com\/me/.test(x.url())) || ctx.pages()[0];
  await p.bringToFront();
  await p.setViewportSize({ width: 1280, height: 900 });
  for (const [nom, url] of [['me', 'https://salorie.com/me'], ['admin', 'https://salorie.com/admin']]) {
    await p.goto(url, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(5000);
    const t = await p.locator('body').innerText().catch(() => '');
    if (/Continuer avec Google|pour continuer vers/i.test(t)) { console.log('  ' + nom + ' : ECRAN DE CONNEXION, ignore'); continue; }
    for (const th of THEMES) {
      await p.evaluate((x) => { document.documentElement.setAttribute('data-theme', x); try { localStorage.setItem('salorie-theme', x); } catch {} }, th);
      await p.waitForTimeout(700);
      const f = D + '/' + nom + '-' + th + '.png';
      await p.screenshot({ path: f });
      console.log('  ' + nom.padEnd(7) + th.padEnd(10) + Math.round(fs.statSync(f).size / 1024) + ' Ko');
    }
  }
  await nav.close();
})();
