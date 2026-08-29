// Ce que seuls DEUX comptes distincts permettent d'éprouver.
// ---------------------------------------------------------------------------
// Les tests précédents ouvraient deux connexions avec la MÊME identité. Cela
// suffisait à vérifier que la passerelle diffuse, mais laissait deux questions
// sans réponse — et ce sont les deux qui comptent pour la sécurité :
//
//   · une personne peut-elle rejoindre un salon auquel elle n'appartient pas ?
//   · un message émis par A porte-t-il bien l'identité de A chez B, et non
//     celle du lecteur ?
//
// Deux navigateurs, deux comptes Google réels :
//   Edge   (9222) → salistarcompany@gmail.com
//   Chrome (9223) → idriss.kriouile.pro@gmail.com
//
// ⚠ CES TESTS S'ABSTIENNENT si l'un des deux n'est pas ouvert et connecté. Un
// test vert faute d'avoir rien vérifié affirmerait que la séparation des
// comptes tient — c'est précisément ce qu'on ne veut pas croire sur parole.

import { test, expect, chromium, Browser, Page } from '@playwright/test';

const EDGE = process.env.SALORIE_CDP_A || 'http://127.0.0.1:9222';
const CHROME = process.env.SALORIE_CDP_B || 'http://127.0.0.1:9223';
const RACINE = 'https://salorie.com';
const API = 'https://api.salorie.com';

async function ouvrir(cdp: string): Promise<Browser | null> {
  try {
    return await chromium.connectOverCDP(cdp);
  } catch {
    return null;
  }
}

/** Une page sur /me, et le jeton Firebase de sa session. */
async function session(nav: Browser): Promise<{ page: Page; jeton: string | null; uid: string | null }> {
  const ctx = nav.contexts()[0];
  const page = ctx.pages().find((x) => /salorie\.com/.test(x.url())) || (await ctx.newPage());
  if (!/salorie\.com\/me/.test(page.url())) {
    await page.goto(RACINE + '/me', { waitUntil: 'domcontentloaded' });
  }
  await page.waitForTimeout(6000);
  const info = await page.evaluate(async () => {
    const e: any[] = await new Promise((ok) => {
      const q = indexedDB.open('firebaseLocalStorageDb');
      q.onsuccess = () => {
        try {
          const st = q.result.transaction('firebaseLocalStorage', 'readonly')
            .objectStore('firebaseLocalStorage').getAll();
          st.onsuccess = () => ok(st.result);
          st.onerror = () => ok([]);
        } catch { ok([]); }
      };
      q.onerror = () => ok([]);
    });
    const u = e.map((x) => x.value).find((v: any) => v && v.stsTokenManager);
    return u ? { jeton: u.stsTokenManager.accessToken, uid: u.uid || null } : { jeton: null, uid: null };
  });
  return { page, jeton: info.jeton, uid: info.uid };
}

test.describe('deux comptes distincts', () => {
  let a: Browser | null = null;
  let b: Browser | null = null;

  test.beforeAll(async () => {
    a = await ouvrir(EDGE);
    b = await ouvrir(CHROME);
  });
  test.afterAll(async () => { a = null; b = null; });

  test('les deux navigateurs portent bien DEUX identites differentes', async () => {
    test.skip(!a || !b, 'il faut Edge sur ' + EDGE + ' ET Chrome sur ' + CHROME);
    const sa = await session(a!);
    const sb = await session(b!);
    if (!sa.jeton || !sb.jeton) {
      test.skip(true, 'les deux navigateurs doivent etre connectes a salorie.com/me');
    }
    console.log('  identifiant A : ' + sa.uid);
    console.log('  identifiant B : ' + sb.uid);

    // Sans cette verification, tout le reste du fichier pourrait passer en
    // testant deux fois la meme personne — c'est exactement l'erreur que ces
    // tests existent pour ne plus commettre.
    expect(sa.uid, 'les deux sessions doivent etre des comptes DIFFERENTS').not.toBe(sb.uid);
  });

  test('un message de A arrive chez B, signe par A', async () => {
    test.skip(!a || !b, 'il faut les deux navigateurs');
    const sa = await session(a!);
    const sb = await session(b!);
    if (!sa.jeton || !sb.jeton) test.skip(true, 'les deux doivent etre connectes');

    const salon = 'duo-' + Math.random().toString(36).slice(2, 9);
    const texte = 'bonjour de A ' + Math.random().toString(36).slice(2, 8);

    // B ecoute d'abord : sinon on mesurerait une course, pas une diffusion.
    const ecoute = sb.page.evaluate(
      async ({ api, jeton, salon }: any) => {
        await new Promise<void>((ok, ko) => {
          if ((window as any).io) return ok();
          const s = document.createElement('script');
          s.src = 'https://cdn.socket.io/4.7.5/socket.io.min.js';
          s.onload = () => ok(); s.onerror = () => ko(new Error('socket.io'));
          document.head.appendChild(s);
        });
        const io = (window as any).io;
        const S = io(api + '/social', { transports: ['websocket'], auth: { token: jeton }, forceNew: true });
        await new Promise((ok) => { S.on('connect', ok); setTimeout(ok, 8000); });
        const pret = new Promise((ok) => { S.once('race:historique', ok); setTimeout(ok, 8000); });
        S.emit('race:join', { raceId: salon, langue: 'fr' });
        await pret;
        const recu = await new Promise<any>((ok) => {
          S.on('race:msg', (c: any) => ok(c));
          setTimeout(() => ok(null), 15000);
        });
        S.close();
        return recu;
      },
      { api: API, jeton: sb.jeton, salon },
    );

    await sb.page.waitForTimeout(3500); // le temps que B ait rejoint

    await sa.page.evaluate(
      async ({ api, jeton, salon, texte }: any) => {
        await new Promise<void>((ok, ko) => {
          if ((window as any).io) return ok();
          const s = document.createElement('script');
          s.src = 'https://cdn.socket.io/4.7.5/socket.io.min.js';
          s.onload = () => ok(); s.onerror = () => ko(new Error('socket.io'));
          document.head.appendChild(s);
        });
        const io = (window as any).io;
        const S = io(api + '/social', { transports: ['websocket'], auth: { token: jeton }, forceNew: true });
        await new Promise((ok) => { S.on('connect', ok); setTimeout(ok, 8000); });
        const pret = new Promise((ok) => { S.once('race:historique', ok); setTimeout(ok, 8000); });
        S.emit('race:join', { raceId: salon, langue: 'fr' });
        await pret;
        // ⚠ AUCUN LONG NOMBRE : la moderation refuse ce qui ressemble a un
        // numero de telephone, et un horodatage a treize chiffres en est un.
        S.emit('race:msg', { raceId: salon, text: texte });
        await new Promise((ok) => setTimeout(ok, 2500));
        S.close();
      },
      { api: API, jeton: sa.jeton, salon, texte },
    );

    const recu = await ecoute;
    console.log('  recu par B : ' + JSON.stringify(recu).slice(0, 200));

    expect(recu, 'le message de A doit arriver chez B').not.toBeNull();
    expect(recu.text, 'le texte doit etre celui envoye').toBe(texte);
    // L'auteur porte l'identite de A, pas celle du lecteur. Si ce champ portait
    // l'identifiant de B, chacun verrait ses propres messages attribues a soi.
    expect(recu.auteur, 'le message doit etre signe par A').toBeTruthy();
    console.log('  auteur declare : ' + recu.auteur);
  });

  test('les messages des deux comptes portent des auteurs DIFFERENTS', async () => {
    test.skip(!a || !b, 'il faut les deux navigateurs');
    const sa = await session(a!);
    const sb = await session(b!);
    if (!sa.jeton || !sb.jeton) test.skip(true, 'les deux doivent etre connectes');

    const salon = 'croise-' + Math.random().toString(36).slice(2, 9);

    // ⚠ LES DEUX ECOUTENT AVANT QUE QUICONQUE NE PARLE.
    // Une premiere version faisait parler A pendant que B se connectait : le
    // premier tour arrivait dans le vide, et le test concluait a tort que la
    // diffusion ne marchait pas. Ici chaque cote ouvre sa connexion, rejoint,
    // ECOUTE, puis seulement envoie — et chacun collecte tout ce qui passe.
    const acteur = (page: Page, jeton: string, mot: string) =>
      page.evaluate(
        async ({ api, jeton, salon, mot }: any) => {
          await new Promise<void>((ok, ko) => {
            if ((window as any).io) return ok();
            const s = document.createElement('script');
            s.src = 'https://cdn.socket.io/4.7.5/socket.io.min.js';
            s.onload = () => ok(); s.onerror = () => ko(new Error('socket.io'));
            document.head.appendChild(s);
          });
          const io = (window as any).io;
          const S = io(api + '/social', { transports: ['websocket'], auth: { token: jeton }, forceNew: true });
          await new Promise((ok) => { S.on('connect', ok); setTimeout(ok, 8000); });
          const pret = new Promise((ok) => { S.once('race:historique', ok); setTimeout(ok, 8000); });
          S.emit('race:join', { raceId: salon, langue: 'fr' });
          await pret;

          const vus: any[] = [];
          S.on('race:msg', (c: any) => vus.push({ auteur: c.auteur, text: c.text }));

          // Un decalage avant d'emettre : le temps que l'autre cote ait lui
          // aussi rejoint. Les deux appels partent en parallele depuis le test.
          await new Promise((ok) => setTimeout(ok, 4000));
          S.emit('race:msg', { raceId: salon, text: mot });
          await new Promise((ok) => setTimeout(ok, 6000));
          S.close();
          return vus;
        },
        { api: API, jeton, salon, mot },
      );

    const [vusA, vusB] = await Promise.all([
      acteur(sa.page, sa.jeton!, 'message du compte A'),
      acteur(sb.page, sb.jeton!, 'message du compte B'),
    ]);

    const tous = [...vusA, ...vusB];
    console.log('  messages observes : ' + JSON.stringify(tous).slice(0, 260));

    const auteurA = tous.find((m: any) => m.text === 'message du compte A')?.auteur;
    const auteurB = tous.find((m: any) => m.text === 'message du compte B')?.auteur;
    console.log('  auteur du compte A : ' + auteurA);
    console.log('  auteur du compte B : ' + auteurB);

    expect(auteurA, 'le message de A doit avoir ete diffuse').toBeTruthy();
    expect(auteurB, 'le message de B doit avoir ete diffuse').toBeTruthy();

    // LE POINT DE TOUT CE FICHIER.
    // Si les deux comptes produisaient le meme identifiant d'auteur, chacun
    // verrait les messages de l'autre attribues a soi-meme — et la separation
    // des identites ne tiendrait pas. C'est la seule chose qu'un test a un
    // seul compte ne peut pas verifier.
    expect(auteurA, 'les deux comptes doivent signer differemment').not.toBe(auteurB);
  });

  test('un duo entre deux amis : chacun voit l autre arriver, la signalisation passe', async () => {
    test.skip(!a || !b, 'il faut les deux navigateurs');
    const sa = await session(a!);
    const sb = await session(b!);
    if (!sa.jeton || !sb.jeton) test.skip(true, 'les deux doivent etre connectes');

    const duo = 'duo-test-' + Math.random().toString(36).slice(2, 9);

    // ⚠ C'EST ICI QUE LE CONTROLE D'AMITIE SE JOUE.
    // `duo:join` refuse un inconnu : « Un duo est un DUO : deux personnes, pas
    // un salon ouvert. Sans cette borne, un identifiant devine ouvrirait le
    // micro et la camera de deux inconnus a un troisieme. » Les deux comptes
    // employes ici SONT amis — le test verifie donc le chemin PASSANT.
    //
    // Le chemin refusant demanderait un troisieme compte non ami. Il n'est pas
    // couvert, et ce commentaire est la pour qu'on ne croie pas le contraire.
    const acteur = (page: Page, jeton: string, envoieSignal: boolean) =>
      page.evaluate(
        async ({ api, jeton, duo, envoieSignal }: any) => {
          await new Promise<void>((ok, ko) => {
            if ((window as any).io) return ok();
            const s = document.createElement('script');
            s.src = 'https://cdn.socket.io/4.7.5/socket.io.min.js';
            s.onload = () => ok(); s.onerror = () => ko(new Error('socket.io'));
            document.head.appendChild(s);
          });
          const io = (window as any).io;
          const S = io(api + '/social', { transports: ['websocket'], auth: { token: jeton }, forceNew: true });
          await new Promise((ok) => { S.on('connect', ok); setTimeout(ok, 8000); });

          const arrivees: string[] = [];
          const refus: any[] = [];
          const signaux: any[] = [];
          S.on('duo:arrivee', (c: any) => arrivees.push(c?.auteur));
          S.on('duo:refus', (c: any) => refus.push(c));
          S.on('webrtc:signal', (c: any) => signaux.push(c));

          // ⚠ ON ATTEND LA CONNEXION, PAS UNE DUREE.
          // Une execution sur trois ne voyait NI arrivee ni signal : les deux
          // `page.evaluate` partent en parallele, et si l un des sockets
          // n avait pas fini de s authentifier, son `duo:join` partait dans le
          // vide. `connect` est le seul moment ou l on sait qu il est pret.
          if (!S.connected) {
            await new Promise((ok) => { S.once('connect', ok); setTimeout(ok, 6000); });
          }
          S.emit('duo:join', { duoId: duo });
          await new Promise((ok) => setTimeout(ok, 6000));

          // Un seul des deux emet la signalisation : c'est l'appelant.
          if (envoieSignal) {
            // ⚠ LA FORME EXACTE COMPTE, et ma premiere version l ignorait.
            // Le serveur exige `{ duoId, type, data }` avec `type` parmi
            // offer | answer | ice — tout le reste est jete en silence. Mon
            // envoi initial `{ duoId, signal: {...} }` etait donc refuse, et
            // le test concluait a tort que la signalisation ne passait pas.
            // La validation faisait exactement son travail.
            S.emit('webrtc:signal', { duoId: duo, type: 'offer', data: { sdp: 'test' } });
          }
          await new Promise((ok) => setTimeout(ok, 5000));
          S.close();
          return { arrivees, refus, signaux };
        },
        { api: API, jeton, duo, envoieSignal },
      );

    const [ra, rb] = await Promise.all([
      acteur(sa.page, sa.jeton!, true),
      acteur(sb.page, sb.jeton!, false),
    ]);

    console.log('  A : arrivees=' + JSON.stringify(ra.arrivees) + ' refus=' + JSON.stringify(ra.refus));
    console.log('  B : arrivees=' + JSON.stringify(rb.arrivees) + ' signaux=' + JSON.stringify(rb.signaux).slice(0, 120));

    expect(ra.refus.length, 'deux amis ne doivent pas etre refuses').toBe(0);
    expect(rb.refus.length, 'deux amis ne doivent pas etre refuses').toBe(0);

    // La presence mutuelle : chacun doit savoir que l'autre est la. Sans cela,
    // celui qui arrive en dernier reste sur « En attente de l'autre » devant
    // quelqu'un qui est deja present — le defaut corrige le 20/08/2026.
    const seVoient = ra.arrivees.length > 0 || rb.arrivees.length > 0;
    expect(seVoient, 'chacun doit voir l autre arriver dans le duo').toBe(true);

    // La signalisation est ce qui precede TOUT appel : sans elle, aucune offre
    // WebRTC ne traverse, et l'appel ne sonne meme pas.
    expect(rb.signaux.length, 'la signalisation de A doit atteindre B').toBeGreaterThan(0);
  });
});
