const { chromium } = require('playwright');
(async () => {
  const nav = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = nav.contexts()[0];
  const p = ctx.pages().find((x) => /salorie\.com/.test(x.url())) || ctx.pages()[0];
  await p.bringToFront();
  await p.goto('https://salorie.com/me', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(6000);
  let t = await p.locator('body').innerText().catch(() => '');
  if (!/Continuer avec Google|Continue with Google/i.test(t)) {
    console.log('  pas d ecran Google — deja connecte ? ' + !/Se connecter/i.test(t));
    await nav.close(); return;
  }
  const avant = ctx.pages().length;
  await p.getByText(/Continuer avec Google|Continue with Google/i).first().click();
  await p.waitForTimeout(9000);
  // Google peut ouvrir un onglet dedie : on suit celui qui apparait.
  const pages = ctx.pages();
  const cible = pages.length > avant ? pages[pages.length - 1] : p;
  console.log('  page courante : ' + cible.url().slice(0, 90));
  const tt = await cible.locator('body').innerText().catch(() => '');
  console.log('  ecran : ' + tt.split('\n').filter(Boolean).slice(0, 6).join(' | ').slice(0, 200));
  await nav.close();
})();
