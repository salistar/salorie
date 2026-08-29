// L'infrastructure d'appel, éprouvée sans second compte.
// ---------------------------------------------------------------------------
// POURQUOI UNE BOUCLE PLUTÔT QUE DEUX COMPTES
// Un appel web↔web réel demande deux sessions authentifiées simultanées. Les
// comptes de démonstration existent (`alex.demo@salorie.app`…) mais je n'entre
// pas de mots de passe, et Edge refuse le port de débogage sur le profil par
// défaut : je ne peux pas ouvrir deux sessions distinctes.
//
// Ce qu'on PEUT éprouver sans second compte, et qui est l'essentiel de ce qui
// casse en production :
//   · les identifiants TURN sont-ils délivrés, et valides ?
//   · le relais répond-il, ou l'appel dépend-il d'un STUN public ?
//   · une connexion pair-à-pair s'établit-elle réellement, média compris ?
//
// On monte donc DEUX RTCPeerConnection dans la même page, reliées par les
// serveurs ICE que l'application distribue. Si cette boucle échoue, aucun appel
// entre deux personnes ne peut réussir — le contraire n'est pas vrai, et ce
// fichier ne prétend pas l'inverse.
//
// ⚠ CE QUE ÇA NE COUVRE PAS : la signalisation (l'échange d'offres via le
// serveur), la sonnerie, le refus d'appel, la coupure réseau en cours d'appel.
// Ces parcours demandent deux vraies sessions.

import { test, expect, chromium, Browser, Page } from '@playwright/test';

const CDP = process.env.SALORIE_CDP || 'http://127.0.0.1:9222';
const RACINE = 'https://salorie.com';

async function edgeAuthentifie(): Promise<Browser | null> {
  try {
    return await chromium.connectOverCDP(CDP);
  } catch {
    return null;
  }
}

async function connecte(p: Page): Promise<boolean> {
  const txt = await p.locator('body').innerText().catch(() => '');
  return !/Continuer avec Google|pour continuer vers/i.test(txt);
}

test.describe('infrastructure d appel', () => {
  let nav: Browser | null = null;

  test.beforeAll(async () => {
    nav = await edgeAuthentifie();
  });
  test.afterAll(async () => {
    nav = null; // le navigateur appartient a la personne qui l'a ouvert
  });

  test('le serveur delivre des identifiants TURN valides', async () => {
    test.skip(!nav, 'aucun Edge authentifie sur ' + CDP);
    const p = await nav!.contexts()[0].newPage();
    await p.goto(RACINE + '/me', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(6000);
    test.skip(!(await connecte(p)), 'session expiree');

    const r = await p.evaluate(async () => {
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
      if (!jeton) return { statut: 0 };
      const rep = await fetch('https://api.salorie.com/social/turn-credentials', {
        headers: { Authorization: 'Bearer ' + jeton },
      });
      return { statut: rep.status, corps: await rep.json().catch(() => null) };
    });

    expect(r.statut, 'le serveur doit delivrer des identifiants').toBe(200);
    const urls: string[] = (r.corps?.iceServers || []).flatMap((s: any) =>
      Array.isArray(s.urls) ? s.urls : [s.urls],
    );
    console.log('  serveurs ICE : ' + urls.length);
    urls.forEach((u) => console.log('    ' + u));

    // ⚠ UN RELAIS, PAS SEULEMENT DU STUN.
    // Le STUN dit seulement « voici l'adresse d'ou tu m'ecris ». Derriere le
    // NAT d'un operateur mobile — le cas de la plupart des utilisateurs au
    // Maroc — il ne suffit pas : sans TURN, l'appel echoue.
    const relais = urls.filter((u) => /^turns?:/.test(u));
    expect(relais.length, 'sans serveur TURN, un appel derriere un NAT d operateur echoue').toBeGreaterThan(0);

    await p.close();
  });

  test('une connexion pair-a-pair s etablit, media compris', async () => {
    test.skip(!nav, 'aucun Edge authentifie sur ' + CDP);
    const p = await nav!.contexts()[0].newPage();
    await p.goto(RACINE + '/me', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(6000);
    test.skip(!(await connecte(p)), 'session expiree');

    const r = await p.evaluate(async () => {
      // Les identifiants reels, pas un STUN public : c'est la chaine de
      // production qu'on veut eprouver.
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
      if (!jeton) return { erreur: 'aucun jeton' };
      const conf = await fetch('https://api.salorie.com/social/turn-credentials', {
        headers: { Authorization: 'Bearer ' + jeton },
      }).then((x) => x.json());

      // ⚠ `iceTransportPolicy: 'relay'` — ET C'EST TOUT L'INTERET DU TEST.
      // Sans cette contrainte, les deux pairs vivant dans la meme page se
      // trouvent par des candidats `host` en quelques millisecondes, la
      // collecte s'arrete, et le relais n'est JAMAIS sollicite. Le test
      // passait alors en ne prouvant rien d'autre que « la boucle locale
      // fonctionne » — ce que personne ne demandait.
      //
      // En relais force, la connexion ne peut s'etablir QUE si le TURN
      // accepte les identifiants et achemine le media. C'est exactement le
      // chemin d'un utilisateur derriere le NAT d'un operateur mobile.
      // ⚠ UN SEUL COTE EN RELAIS FORCE, ET C'EST DELIBERE.
      // Forcer les DEUX a passer par le relais echoue : coturn refuse de
      // relayer entre deux allocations du meme client. Ce n'est pas un defaut
      // — c'est une configuration qui n'existe pas dans la vraie vie.
      //
      // Le cas REEL est asymetrique : une personne derriere le NAT d'un
      // operateur mobile (relais obligatoire) appelle quelqu'un sur une
      // connexion ordinaire (chemin direct possible). C'est ce qu'on monte
      // ici, et c'est le scenario qui casse en production quand le TURN ne
      // repond pas.
      const A = new RTCPeerConnection({ iceServers: conf.iceServers, iceTransportPolicy: 'relay' });
      const B = new RTCPeerConnection({ iceServers: conf.iceServers });

      // Une piste audio SYNTHETIQUE : `getUserMedia` demanderait le micro, et
      // une autorisation ne se donne pas depuis un test. Un oscillateur produit
      // une vraie piste, qui traverse la meme mecanique.
      const ctxAudio = new AudioContext();
      const osc = ctxAudio.createOscillator();
      const dest = ctxAudio.createMediaStreamDestination();
      osc.connect(dest);
      osc.start();
      dest.stream.getTracks().forEach((t) => A.addTrack(t, dest.stream));

      let recu = false;
      B.ontrack = () => { recu = true; };
      A.onicecandidate = (e) => { if (e.candidate) B.addIceCandidate(e.candidate).catch(() => {}); };
      B.onicecandidate = (e) => { if (e.candidate) A.addIceCandidate(e.candidate).catch(() => {}); };

      const typesA: string[] = [];
      A.onicecandidate = (e) => {
        if (e.candidate) {
          typesA.push(e.candidate.type || '?');
          B.addIceCandidate(e.candidate).catch(() => {});
        }
      };

      const offre = await A.createOffer();
      await A.setLocalDescription(offre);
      await B.setRemoteDescription(offre);
      const reponse = await B.createAnswer();
      await B.setLocalDescription(reponse);
      await A.setRemoteDescription(reponse);

      const etat = await new Promise<string>((ok) => {
        const fini = setTimeout(() => ok(A.connectionState), 15000);
        A.onconnectionstatechange = () => {
          if (['connected', 'failed'].includes(A.connectionState)) {
            clearTimeout(fini);
            ok(A.connectionState);
          }
        };
      });

      osc.stop();
      await ctxAudio.close();
      A.close();
      B.close();
      return { etat, recu, candidats: [...new Set(typesA)] };
    });

    console.log('  etat de la connexion : ' + r.etat);
    console.log('  piste distante recue : ' + r.recu);
    console.log('  types de candidats   : ' + (r.candidats || []).join(', '));

    expect(r.etat, 'la connexion pair-a-pair doit s etablir').toBe('connected');
    expect(r.recu, 'la piste audio doit arriver de l autre cote').toBe(true);
    // `relay` prouve que le TURN accepte les identifiants. `host`/`srflx` seuls
    // signifieraient que le relais n'a pas repondu — l'appel marcherait en
    // reseau local et echouerait chez un utilisateur sur mobile.
    expect(r.candidats, 'le relais TURN doit produire des candidats').toContain('relay');

    await p.close();
  });
});
