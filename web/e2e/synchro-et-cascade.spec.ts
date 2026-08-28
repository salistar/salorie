// Les deux parcours qui exigent une identité : synchro temps réel, cascade IA.
// ---------------------------------------------------------------------------
// POURQUOI CE FICHIER EST À PART
// Les autres specs vérifient ce qu'un visiteur anonyme voit. Ces deux-ci
// touchent des données personnelles et un point d'entrée protégé par
// `FirebaseAuthGuard` : ils ont besoin d'une session Clerk + Firebase valide.
//
// Playwright ne peut pas se connecter à Google lui-même — Google refuse les
// navigateurs pilotés. On se RACCROCHE donc à un Edge déjà ouvert et déjà
// authentifié, exactement comme le reste du travail sur ce projet :
//
//   1. Fermer Edge, puis le relancer avec :
//        msedge.exe --remote-debugging-port=9222
//   2. S'y connecter à https://salorie.com/me
//   3. npx playwright test e2e/synchro-et-cascade.spec.ts
//
// ⚠ SANS CETTE SESSION, LES TESTS S'ABSTIENNENT — ils ne passent pas.
// Un test vert faute d'avoir rien vérifié est pire que pas de test : il
// affirme que le parcours marche. `test.skip` le dit à voix haute.

import { test, expect, chromium, Browser, Page } from '@playwright/test';

const CDP = process.env.SALORIE_CDP || 'http://127.0.0.1:9222';
const RACINE = 'https://salorie.com';

/** Le navigateur authentifié, ou `null` s'il n'y en a pas. */
async function edgeAuthentifie(): Promise<Browser | null> {
  try {
    return await chromium.connectOverCDP(CDP);
  } catch {
    return null;
  }
}

/** Vrai si la page montre l'espace membre, et non l'écran de connexion. */
async function connecte(p: Page): Promise<boolean> {
  const txt = await p.locator('body').innerText().catch(() => '');
  return !/Continuer avec Google|pour continuer vers|Se connecter/i.test(txt);
}

test.describe('parcours authentifies', () => {
  let nav: Browser | null = null;

  test.beforeAll(async () => {
    nav = await edgeAuthentifie();
  });

  test.afterAll(async () => {
    // On ne FERME pas le navigateur : il appartient à la personne qui l'a
    // ouvert. `close()` sur une connexion CDP tuerait sa session Edge.
    nav = null;
  });

  test('un verre d eau ajoute ici apparait la-bas, sans rechargement', async () => {
    test.skip(!nav, 'aucun Edge authentifie sur ' + CDP + ' — voir l en-tete du fichier');
    const ctx = nav!.contexts()[0];

    const a = await ctx.newPage();
    await a.goto(RACINE + '/me/eau', { waitUntil: 'domcontentloaded' });
    await a.waitForTimeout(6000);
    test.skip(!(await connecte(a)), 'session expiree — se reconnecter dans Edge');

    // La SECONDE page est le cœur du test : elle ne sera jamais rechargée.
    // C'est ce qui distingue une vraie synchronisation d'un simple aller-retour
    // serveur. Les deux clients écoutent le même document avec le même uid.
    const b = await ctx.newPage();
    await b.goto(RACINE + '/me/eau', { waitUntil: 'domcontentloaded' });
    await b.waitForTimeout(6000);

    const chiffres = (t: string) =>
      Number((t.match(/(\d[\d\s]*)\s*ml/i)?.[1] || '0').replace(/\s/g, ''));

    const avant = chiffres(await b.locator('body').innerText());

    await a.getByRole('button', { name: '+250 ml' }).click();
    // Aucun `reload` sur `b` — volontairement.
    //
    // ⚠ ON MESURE L'ECART, PAS UNE HAUSSE.
    // Premiere version : `toBeGreaterThan(avant)`. Elle a echoue en montrant
    // 2650 puis 2400 — soit exactement -250. Le nombre affiche est l'eau
    // RESTANTE avant l'objectif : boire la fait baisser. La synchronisation
    // fonctionnait donc parfaitement, c'est l'assertion qui se trompait de
    // sens. Verifier l'ecart de 250 est aussi plus fort : un changement dans
    // le bon ordre de grandeur, et pas seulement « quelque chose a bouge ».
    await expect
      .poll(async () => Math.abs(chiffres(await b.locator('body').innerText()) - avant), {
        message:
          'la seconde page n a pas vu le verre ajoute dans la premiere : ' +
          'la synchronisation temps reel ne passe pas',
        timeout: 20000,
      })
      .toBe(250);

    await a.close();
    await b.close();
  });

  test('la cascade IA repond, et par un palier gratuit', async () => {
    test.skip(!nav, 'aucun Edge authentifie sur ' + CDP + ' — voir l en-tete du fichier');
    const ctx = nav!.contexts()[0];

    const p = await ctx.newPage();
    await p.goto(RACINE + '/me', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(6000);
    test.skip(!(await connecte(p)), 'session expiree — se reconnecter dans Edge');

    // ⚠ CE TEST NE MESURE PAS LA JUSTESSE DE LA RECONNAISSANCE.
    // Le prompt renvoyait a `donnees/corpus-de-test/` (1 471 images
    // etiquetees) pour verifier la cascade. Ce dossier n'existe pas dans ce
    // depot, et n'est pas non plus ignore par git — il n'y est simplement pas.
    // Sans etiquettes, on ne peut rien affirmer sur ce que le modele RECONNAIT.
    //
    // Ce qui reste verifiable, et qui a de la valeur : la cascade repond, dans
    // le delai, et par un palier gratuit plutot que par le dernier recours
    // payant. C'est precisement ce qui etait tombe en panne le 25/08/2026.
    const resultat = await p.evaluate(async (racine) => {
      // Le jeton Firebase n'est pas expose sur `window` : le SDK le range dans
      // IndexedDB. C'est le seul moyen, depuis un test, d'appeler l'API avec
      // l'identite reelle de la session — un test ne peut pas en fabriquer une.
      const entrees: any[] = await new Promise((ok) => {
        const req = indexedDB.open('firebaseLocalStorageDb');
        req.onsuccess = () => {
          try {
            const st = req.result.transaction('firebaseLocalStorage', 'readonly')
              .objectStore('firebaseLocalStorage').getAll();
            st.onsuccess = () => ok(st.result);
            st.onerror = () => ok([]);
          } catch { ok([]); }
        };
        req.onerror = () => ok([]);
      });
      const u = entrees.map((e) => e.value).find((v: any) => v && v.stsTokenManager);
      const jeton = u?.stsTokenManager?.accessToken;
      if (!jeton) return { statut: 0, corps: 'aucun jeton Firebase dans la session' };

      // ⚠ UNE IMAGE UNIQUE A CHAQUE EXECUTION.
      // Premier essai avec une image fixe du depot : la reponse revenait avec
      // `engine: "cache"`. Le test passait donc sans jamais solliciter un seul
      // palier — il prouvait que le cache repond, ce que personne ne
      // demandait. On dessine ici une image differente a chaque fois, ce qui
      // garantit un calcul reel.
      const toile = document.createElement('canvas');
      toile.width = 224;
      toile.height = 224;
      const ctx2 = toile.getContext('2d')!;
      ctx2.fillStyle = '#c8963c';
      ctx2.fillRect(0, 0, 224, 224);
      for (let i = 0; i < 40; i++) {
        ctx2.fillStyle = `hsl(${Math.floor(Math.random() * 360)} 60% 50%)`;
        ctx2.beginPath();
        ctx2.arc(Math.random() * 224, Math.random() * 224, 6 + Math.random() * 18, 0, 7);
        ctx2.fill();
      }
      const b64: string = toile.toDataURL('image/png').split(',')[1];

      const r = await fetch('https://api.salorie.com/ai/vision', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + jeton },
        body: JSON.stringify({
          prompt: 'Decris cette image en trois mots.',
          imageBase64: b64,
          mimeType: 'image/png',
        }),
      });
      return { statut: r.status, corps: (await r.text()).slice(0, 400) };
    }, RACINE);

    console.log('  cascade IA → ' + resultat.statut + '  ' + resultat.corps.slice(0, 200));

    expect(resultat.statut, 'la cascade doit repondre 2xx').toBeLessThan(300);
    const j = JSON.parse(resultat.corps);
    expect(j.text, 'une reponse sans texte est un echec silencieux').toBeTruthy();
    // `engine` n'est renseigne QUE par la cascade. Son absence signifie que la
    // requete est allee jusqu'au dernier recours payant. Le prompt demandait
    // explicitement une reponse « servie par un palier gratuit » : c'est donc
    // un echec, et non un simple avertissement. Une facture qui monte sans que
    // personne ne s'en apercoive est exactement ce que la cascade evite.
    expect(
      j.engine,
      'servi par le dernier recours payant : aucun palier gratuit n a repondu',
    ).toBeTruthy();

    await p.close();
  });
});
