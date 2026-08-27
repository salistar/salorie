// Ajoute https://salorie.com/* aux referents de « Salorie Maps - admin web ».
//
// POURQUOI
// La carte de /races (back-office) echoue en RefererNotAllowedMapError. Cette
// cle porte une restriction par referent posee le 5 aout — donc AVANT la
// bascule du domaine Clerk du 22 aout. Sa liste autorise vraisemblablement
// encore l'ancien domaine.
//
// ⚠ ON AJOUTE, ON NE REMPLACE PAS : d'autres surfaces peuvent dependre des
// referents deja presents. Le script les affiche avant et apres.
//
// ⚠ L'ETAPE « Terminé » : la saisie ouvre un sous-formulaire avec ses propres
// boutons. Sans ce clic, « Enregistrer » abandonne la ligne SANS un mot — le
// piege qui m'a coute quatre tentatives silencieuses sur l'autre cle.
const { chromium } = require('playwright');

const REFERENT = 'https://salorie.com/*';

(async () => {
  const nav = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = nav.contexts()[0];
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 1440, height: 1000 });

  await p.goto('https://console.cloud.google.com/apis/credentials?project=salistar-salorie', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(14000);
  await p.getByText('Salorie Maps - admin web').first().click();
  await p.waitForTimeout(14000);
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await p.waitForTimeout(2500);

  const avant = await p.locator('input[placeholder="*.example.com/*"]').all();
  const listeAvant = [];
  for (const c of avant) listeAvant.push(await c.inputValue().catch(() => '?'));
  console.log('  referents AVANT (' + listeAvant.length + ') : ' + (listeAvant.join(' , ') || '(aucun champ visible)'));

  if (listeAvant.some((v) => v === REFERENT)) {
    console.log('  deja present — rien a faire.');
    await p.close(); await nav.close(); return;
  }

  await p.locator('button:has-text("Add"), button:has-text("Ajouter")').first().click();
  await p.waitForTimeout(3000);
  const champ = p.locator('input[placeholder="*.example.com/*"]').last();
  await champ.click();
  await champ.pressSequentially(REFERENT, { delay: 45 });
  await p.waitForTimeout(1500);

  await p.locator('button:has-text("Terminé"), button:has-text("Done")').first().click();
  await p.waitForTimeout(3000);

  const t = await p.locator('body').innerText().catch(() => '');
  if (!/salorie\.com/.test(t.split('Filtrer')[1] || '')) {
    console.log('  ARRET : la ligne n a pas ete validee. Rien enregistre.');
    await p.close(); await nav.close(); return;
  }

  await p.locator('button:has-text("Enregistrer")').first().click();
  await p.waitForTimeout(9000);
  console.log('  enregistre — verification…');

  await p.goto(p.url().includes('/key/') ? p.url() : 'https://console.cloud.google.com/apis/credentials?project=salistar-salorie', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await p.waitForTimeout(12000);
  const t2 = await p.locator('body').innerText().catch(() => '');
  console.log('  salorie.com present apres rechargement : ' + /salorie\.com\/\*/.test(t2));
  await p.close();
  await nav.close();
})();
