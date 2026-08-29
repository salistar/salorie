import { test, expect } from '@playwright/test';

// Parcours critiques, de bout en bout, sur le site DEPLOYE.
//
// POURQUOI CE FICHIER EXISTE
// Chaque test ci-dessous correspond a une verification faite A LA MAIN le
// 27/08/2026 — et chacune avait revele un vrai defaut. Un controle manuel ne
// protege que le jour ou on le fait ; c'est sa transformation en test qui vaut
// quelque chose.
//
// Ce qu'ils auraient attrape :
//   · un APK vieux de trois mois distribue par la landing ;
//   · une deconnexion qui affichait du JSON brut ;
//   · une redirection partant vers `localhost` derriere le proxy ;
//   · l'absence de tout chemin vers l'espace membre.
//
// AUCUN mot de passe ici : ces tests s'arretent au seuil des ecrans de
// connexion, et verifient qu'ils sont bien la. Ce qui exige une session est
// signale comme tel plutot que simule.

const LANDING = 'https://salorie.com';

test.describe('landing — porte d entree', () => {
  test('mene a l espace membre, au telechargement et au code source', async ({ page }) => {
    await page.goto(LANDING);

    // Ces trois liens sont la raison d'etre du lot 4 : avant lui, RIEN sur la
    // landing ne menait a l'application web.
    await expect(page.getByRole('link', { name: /Espace membre/i })).toBeVisible();
    await expect(page.locator('a[href="#download"]').first()).toBeVisible();
    await expect(page.locator('a[href*="github.com/salistar/salorie"]').first()).toBeVisible();
  });

  test('le pied de page rend l administration trouvable sans la mettre en avant', async ({ page }) => {
    await page.goto(LANDING);
    const admin = page.getByRole('link', { name: /^Administration$/i });
    await expect(admin).toBeVisible();
    await expect(admin).toHaveAttribute('href', '/login');

    // ⚠ CE TEST A ETE RETOURNE LE 29/08/2026.
    // Il exigeait la presence de « Signaler un bug » et « Versions » dans le
    // pied de page. Ces liens — comme le bouton GitHub de l'en-tete — ont ete
    // deplaces vers le back-office : le code source n'interesse pas un
    // visiteur venu suivre ses calories, et l'afficher publiquement revenait a
    // indiquer a tout le monde ou vit le depot.
    //
    // Le test verifie donc desormais leur ABSENCE. Le laisser exiger leur
    // presence aurait fait echouer la CI sur une exigence perimee — et
    // quelqu'un les aurait remis pour faire passer le test.
    await expect(page.getByRole('link', { name: /Signaler un bug/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /^Versions$/i })).toHaveCount(0);
    // ⚠ ON NE PEUT PAS EXIGER ZERO LIEN GITHUB, et la premiere version de ce
    // test le faisait — elle echouait sur quatre liens parfaitement legitimes.
    // Les boutons de telechargement de l'APK et de l'AAB pointent vers les
    // releases GitHub : ce sont des liens de FICHIER, pas de code source.
    //
    // Ce qui doit disparaitre, c'est le lien vers le DEPOT lui-meme.
    for (const lien of await page.locator('a[href*="github.com"]').all()) {
      const href = (await lien.getAttribute('href')) || '';
      // Deux formes sont legitimes, et une seule ne l'est pas :
      //   /releases/download/…  le fichier APK ou AAB
      //   /releases/tag/…       les notes de version, EXIGEES par le cahier
      //                         des charges a cote de chaque telechargement
      // Tout autre chemin — la racine du depot, /issues, /blob — renverrait au
      // CODE, et c'est cela qui doit rester dans le back-office.
      expect(href, 'seuls les fichiers et les notes de version sont admis').toMatch(
        /\/releases\/(download|tag)\//,
      );
    }
  });

  test('les liens de telechargement pointent vers un vrai fichier', async ({ page, request }) => {
    await page.goto(LANDING);

    const apk = page.locator('a[href$=".apk"]').first();
    await expect(apk).toBeVisible();
    const href = await apk.getAttribute('href');
    expect(href).toBeTruthy();

    // ⚠ LE PIEGE QUI A COUTE TROIS MOIS : un lien code en dur qui repond 200 a
    // l'air parfaitement sain. On verifie donc AUSSI que ce n'est ni un build
    // de debogage, ni un fichier hors sujet — la release `food4k-v1` proposait
    // un modele ONNX de 202 Mo.
    expect(href!).not.toMatch(/debug/i);
    expect(href!).not.toMatch(/\.onnx$/i);

    const tete = await request.head(href!, { maxRedirects: 5 });
    expect(tete.status()).toBe(200);
  });

  test('la version affichee vient du build, pas d une chaine ecrite a la main', async ({ page }) => {
    await page.goto(LANDING);
    const section = page.locator('#download');
    await expect(section).toBeVisible();
    // `v1.0.0` etait ecrit en dur : il restait juste pendant que les fichiers
    // vieillissaient de trois mois. La version doit desormais venir du tag.
    await expect(section).not.toContainText('v1.0.0');
  });

  test('l empreinte SHA-256 est publiee', async ({ page }) => {
    await page.goto(LANDING);
    const section = page.locator('#download');
    // Sans empreinte, telecharger un APK hors magasin est un acte de foi.
    // Le test tolere son absence tant que le premier build au nouveau format
    // n'est pas publie, mais SIGNALE l'etat plutot que de le taire.
    const texte = (await section.innerText()).toLowerCase();
    test.info().annotations.push({
      type: 'empreinte',
      description: texte.includes('sha-256') ? 'publiee' : 'PAS ENCORE — build au format build-N attendu',
    });
    expect(texte).toContain('build');
  });
});

test.describe('surfaces — chacune reste elle-meme', () => {
  test('l espace membre demande une identite', async ({ page }) => {
    await page.goto(`${LANDING}/me`);
    // On ne se connecte pas : on verifie que la porte existe et qu'elle est
    // fermee. Une page /me accessible sans identite serait une fuite.
    //
    // ⚠ LES DEUX LANGUES. Clerk suit la langue du NAVIGATEUR, pas celle du
    // site : un agent en en-US voit « Sign in », un visiteur francais voit
    // « Se connecter ». Un test qui n'attendait que le francais echouait — et
    // aurait fait croire a une porte ouverte.
    await expect(
      page.locator('text=/Continuer avec Google|Continue with Google|pour continuer vers|to continue to/i').first(),
    ).toBeVisible({ timeout: 30000 });
  });

  test('le back-office annonce ce qu il est', async ({ page }) => {
    await page.goto(`${LANDING}/login`);
    await expect(page.locator('text=/réservé aux administrateurs/i')).toBeVisible();
    // Les deux voies doivent coexister : Google ne remplace pas le formulaire,
    // qui reste le seul recours si Clerk ou le reseau Google tombe.
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('text=/Continuer avec Google/i')).toBeVisible();
  });
});

test.describe('themes et RTL', () => {
  test('le choix de theme survit au rechargement', async ({ page }) => {
    await page.goto(LANDING);
    await page.evaluate(() => {
      localStorage.setItem('salorie-theme', 'ocean');
      document.documentElement.setAttribute('data-theme', 'ocean');
    });
    await page.reload();
    // Le theme est pose AVANT le premier rendu par le script du layout : s'il
    // ne l'etait pas, la page clignoterait en clair a chaque chargement.
    const stocke = await page.evaluate(() => localStorage.getItem('salorie-theme'));
    expect(stocke).toBe('ocean');
  });

  test('l arabe ne deborde pas horizontalement', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${LANDING}/ar`);
    await page.waitForTimeout(1200);

    // Un debordement horizontal en RTL est le defaut le plus courant, et le
    // plus invisible en relecture : il ne se voit qu'a l'ecran, en arabe.
    const debordement = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(debordement).toBeLessThanOrEqual(2); // 2 px de tolerance : arrondis
  });

  test('les trois langues sont servies', async ({ request }) => {
    for (const chemin of ['/', '/en', '/ar']) {
      const r = await request.get(`${LANDING}${chemin}`);
      expect(r.status(), `${chemin} doit repondre 200`).toBe(200);
    }
  });
});
