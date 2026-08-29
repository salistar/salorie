// Le chat et le transfert d'images, éprouvés de bout en bout.
// ---------------------------------------------------------------------------
// POURQUOI DEUX SOCKETS ET NON DEUX COMPTES
// Un second compte demanderait une seconde session Google, donc un mot de passe.
// Une seule identité est disponible dans ce navigateur.
//
// Mais ce n'est pas une limite pour ce qui est testé ici. Le chat passe par une
// passerelle WebSocket qui DIFFUSE à tous les participants d'un salon : ouvrir
// deux connexions et vérifier qu'un message envoyé par l'une arrive à l'autre
// éprouve exactement le chemin qu'emprunterait le message d'une autre personne.
// Ce que deux comptes ajouteraient, c'est le contrôle des DROITS — qui a le
// droit de rejoindre quel salon —, et ce fichier ne le couvre pas.
//
// ⚠ CE QUE ÇA NE COUVRE PAS : les droits d'accès à un salon, la modération
// serveur (elle est testée à part côté backend), la persistance après
// déconnexion.

import { test, expect, chromium, Browser, Page } from '@playwright/test';

const CDP = process.env.SALORIE_CDP || 'http://127.0.0.1:9222';
const RACINE = 'https://salorie.com';
const API = 'https://api.salorie.com';

async function edge(): Promise<Browser | null> {
  try {
    return await chromium.connectOverCDP(CDP);
  } catch {
    return null;
  }
}

/** Le jeton Firebase de la session, lu dans IndexedDB. */
async function jetonDe(p: Page): Promise<string | null> {
  return p.evaluate(async () => {
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
    return u?.stsTokenManager?.accessToken || null;
  });
}

test.describe('chat et transfert', () => {
  let nav: Browser | null = null;
  test.beforeAll(async () => { nav = await edge(); });
  test.afterAll(async () => { nav = null; });

  test('un message ecrit sur une connexion arrive sur l autre', async () => {
    test.skip(!nav, 'aucun Edge authentifie sur ' + CDP);
    const p = await nav!.contexts()[0].newPage();
    await p.goto(RACINE + '/me', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(6000);
    const jeton = await jetonDe(p);
    if (!jeton) { await p.close(); test.skip(true, 'aucun jeton Firebase — se reconnecter dans Edge'); }

    const r = await p.evaluate(
      async ({ api, jeton }: any) => {
        // socket.io est charge depuis le CDN officiel : la page de /me ne
        // l'expose pas globalement, et l'importer depuis le bundle demanderait
        // de connaitre son nom minifie — fragile a chaque build.
        await new Promise<void>((ok, ko) => {
          const s = document.createElement('script');
          s.src = 'https://cdn.socket.io/4.7.5/socket.io.min.js';
          s.onload = () => ok();
          s.onerror = () => ko(new Error('socket.io indisponible'));
          document.head.appendChild(s);
        });
        const io = (window as any).io;

        const salon = 'test-e2e-' + Math.random().toString(36).slice(2, 9);
        // ⚠ AUCUN LONG NOMBRE DANS LE MESSAGE.
        // Premiere version : `'message de test ' + Date.now()`. La moderation
        // du serveur l a REFUSE avec le motif « coordonnees » — un horodatage
        // a treize chiffres ressemble a un numero de telephone. Le test
        // signalait donc une panne du chat alors que la moderation faisait
        // exactement son travail.
        // Un marqueur en lettres reste unique sans declencher ce garde-fou.
        const texte = 'message de test ' + Math.random().toString(36).slice(2, 10);

        const A = io(api + '/social', { transports: ['websocket'], auth: { token: jeton }, forceNew: true });
        const B = io(api + '/social', { transports: ['websocket'], auth: { token: jeton }, forceNew: true });

        const connecte = (s: any) =>
          new Promise<boolean>((ok) => {
            s.on('connect', () => ok(true));
            s.on('connect_error', () => ok(false));
            setTimeout(() => ok(false), 8000);
          });

        const [ca, cb] = await Promise.all([connecte(A), connecte(B)]);
        if (!ca || !cb) { A.close(); B.close(); return { erreur: 'connexion refusee', ca, cb }; }

        // B ecoute AVANT que A n'envoie : sinon on mesurerait une course, pas
        // une diffusion.
        const recu = new Promise<any>((ok) => {
          B.onAny((nom: string, charge: any) => {
            if (typeof charge === 'object' && charge && JSON.stringify(charge).includes(texte)) {
              ok({ evenement: nom, charge });
            }
          });
          setTimeout(() => ok(null), 12000);
        });

        // ⚠ ON ATTEND LE SIGNAL DE L ADHESION, PAS UNE DUREE.
        // Premiere version : 1 500 ms d attente fixe. Le message partait avant
        // que B ait fini de rejoindre le salon, et n arrivait donc jamais — le
        // test signalait une panne du chat alors que le chat fonctionnait.
        // Le serveur emet `race:historique` a l adhesion : c est LUI qui dit
        // que la connexion est prete.
        const adhesion = (s: any) =>
          new Promise<void>((ok) => {
            s.once('race:historique', () => ok());
            setTimeout(() => ok(), 8000);
          });
        const pretA = adhesion(A);
        const pretB = adhesion(B);
        A.emit('race:join', { raceId: salon, langue: 'fr' });
        B.emit('race:join', { raceId: salon, langue: 'fr' });
        await Promise.all([pretA, pretB]);
        A.emit('race:msg', { raceId: salon, text: texte });

        const res = await recu;
        A.close();
        B.close();
        return { salon, texte, res };
      },
      { api: API, jeton },
    );

    console.log('  resultat : ' + JSON.stringify(r).slice(0, 300));
    expect(r.erreur, 'la passerelle doit accepter le jeton Firebase').toBeUndefined();
    expect(r.res, 'le message doit arriver sur la seconde connexion').not.toBeNull();
    expect(JSON.stringify(r.res)).toContain(r.texte);

    await p.close();
  });

  test('une image envoyee dans le chat est acheminee', async () => {
    test.skip(!nav, 'aucun Edge authentifie sur ' + CDP);
    const p = await nav!.contexts()[0].newPage();
    await p.goto(RACINE + '/me', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(6000);
    const jeton = await jetonDe(p);
    if (!jeton) { await p.close(); test.skip(true, 'aucun jeton Firebase'); }

    const r = await p.evaluate(
      async ({ api, jeton }: any) => {
        await new Promise<void>((ok, ko) => {
          const s = document.createElement('script');
          s.src = 'https://cdn.socket.io/4.7.5/socket.io.min.js';
          s.onload = () => ok();
          s.onerror = () => ko(new Error('socket.io indisponible'));
          document.head.appendChild(s);
        });
        const io = (window as any).io;

        // Une image REELLE, dessinee ici : un PNG minimal ne prouverait rien
        // d'une chaine qui redimensionne ou recompresse.
        const toile = document.createElement('canvas');
        toile.width = 160; toile.height = 160;
        const c = toile.getContext('2d')!;
        c.fillStyle = '#c8963c'; c.fillRect(0, 0, 160, 160);
        c.fillStyle = '#123125'; c.fillRect(30, 30, 100, 100);
        const base64 = toile.toDataURL('image/jpeg', 0.8).split(',')[1];

        const salon = 'test-img-' + Math.random().toString(36).slice(2, 9);
        const A = io(api + '/social', { transports: ['websocket'], auth: { token: jeton }, forceNew: true });
        const B = io(api + '/social', { transports: ['websocket'], auth: { token: jeton }, forceNew: true });
        const connecte = (s: any) =>
          new Promise<boolean>((ok) => {
            s.on('connect', () => ok(true));
            s.on('connect_error', () => ok(false));
            setTimeout(() => ok(false), 8000);
          });
        const [ca, cb] = await Promise.all([connecte(A), connecte(B)]);
        if (!ca || !cb) { A.close(); B.close(); return { erreur: 'connexion refusee' }; }

        const recu = new Promise<any>((ok) => {
          B.onAny((nom: string, charge: any) => {
            const s = JSON.stringify(charge || {});
            // Le serveur renvoie une URL, pas les octets : c'est le signe qu'il
            // a bien stocke l'image au lieu de la rediffuser telle quelle.
            if (/https?:\/\/|imageUrl|image/i.test(s) && nom.startsWith('race:')) {
              ok({ evenement: nom, charge });
            }
          });
          setTimeout(() => ok(null), 15000);
        });

        // ⚠ ON ATTEND LE SIGNAL DE L ADHESION, PAS UNE DUREE.
        // Premiere version : 1 500 ms d attente fixe. Le message partait avant
        // que B ait fini de rejoindre le salon, et n arrivait donc jamais — le
        // test signalait une panne du chat alors que le chat fonctionnait.
        // Le serveur emet `race:historique` a l adhesion : c est LUI qui dit
        // que la connexion est prete.
        const adhesion = (s: any) =>
          new Promise<void>((ok) => {
            s.once('race:historique', () => ok());
            setTimeout(() => ok(), 8000);
          });
        const pretA = adhesion(A);
        const pretB = adhesion(B);
        A.emit('race:join', { raceId: salon, langue: 'fr' });
        B.emit('race:join', { raceId: salon, langue: 'fr' });
        await Promise.all([pretA, pretB]);
        A.emit('race:msg', { raceId: salon, text: 'photo', image: base64, imageType: 'image/jpeg' });

        const res = await recu;
        A.close(); B.close();
        return { tailleEnvoyee: base64.length, res };
      },
      { api: API, jeton },
    );

    console.log('  image envoyee : ' + (r.tailleEnvoyee || 0) + ' octets base64');
    console.log('  recu : ' + JSON.stringify(r.res).slice(0, 300));
    expect(r.erreur, 'la passerelle doit accepter le jeton').toBeUndefined();
    expect(r.res, 'l image doit arriver sur la seconde connexion').not.toBeNull();

    await p.close();
  });
});
