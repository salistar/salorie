// Preuve visuelle : la landing et /me dans les six themes.
const { chromium } = require('playwright');
const fs = require('fs');
const THEMES = ['obsidian', 'ivory', 'blush', 'ocean', 'platinum', 'gold'];
const DOSSIER = 'C:/Users/21266/Desktop/salorie_8-26_2026/captures/themes';

(async () => {
  fs.mkdirSync(DOSSIER, { recursive: true });
  const nav = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const p = await nav.contexts()[0].newPage();
  await p.setViewportSize({ width: 1280, height: 900 });
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });

  for (const [nom, url] of [['landing', 'http://127.0.0.1:3100/'], ['me', 'http://127.0.0.1:3100/me']]) {
    await p.goto(url, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(3500);
    for (const t of THEMES) {
      await p.evaluate((th) => {
        document.documentElement.setAttribute('data-theme', th);
        try { localStorage.setItem('salorie_theme', th); } catch {}
      }, t);
      await p.waitForTimeout(700); // la transition .3s de landing.css
      const f = DOSSIER + '/' + nom + '-' + t + '.png';
      await p.screenshot({ path: f });
      console.log('  ' + nom.padEnd(8) + t.padEnd(10) + Math.round(fs.statSync(f).size / 1024) + ' Ko');
    }
  }
  await p.close(); await nav.close();
})();
