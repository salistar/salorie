#!/usr/bin/env node
// Interroge le moteur de regles Firestore : ces regles font-elles ce qu'elles
// disent ?
// ---------------------------------------------------------------------------
// POURQUOI CE FICHIER EXISTE
//
// Le 24/08/2026, le deploiement des regles a prouve qu'elles COMPILENT. Il n'a
// rien prouve sur leur comportement. Interrogees, elles ont revele que cinq
// garde-fous ecrits contre l'auto-attribution du Premium etaient MORTS depuis
// leur ecriture : un joker recursif `{document=**}`, 90 lignes plus bas,
// couvrait aussi le document parent — et Firestore autorise des qu'UNE regle
// autorise. N'importe qui pouvait s'offrir un abonnement en une ecriture.
//
// Rien dans la relecture du fichier ne le montrait. C'est le pire genre d'ecart
// en securite : celui qu'on ne voit pas en lisant le code.
//
// Ce script pose donc les questions a la place de la relecture, et il tourne
// AVANT le deploiement — une regle trop stricte empecherait les gens d'ecrire
// leurs repas, une regle trop laxiste rouvrirait le trou. Les deux se voient
// ici, et nulle part ailleurs.
//
// AUCUNE DEPENDANCE : le jeton d'acces est signe avec `crypto` (cf.
// `scripts/google-regles.js`). Le script tourne donc aussi bien dans un runner
// nu que dans le conteneur du backend.
//
// Usage :
//   FIREBASE_SERVICE_ACCOUNT='<json>' node scripts/tester-regles-firestore.js [fichier]
//   Sans argument, il interroge le jeu de regles EN LIGNE — celui que la base
//   applique vraiment, et qui peut differer du depot.
const fs = require('fs');
const { compteDeService, jetonAcces, regles } = require('./google-regles');

const sa = compteDeService();
const PROJET = sa.project_id;
const FICHIER = process.argv[2] || '';

const T = '2026-08-24T12:00:00Z';
const chemin = (id) => '/databases/(default)/documents/users/' + id;

// (libelle, attendu, qui ecrit, chez qui, document AVANT, document APRES, methode)
function cas(libelle, attendu, qui, chez, avant, apres, methode) {
  return {
    libelle,
    tc: {
      expectation: attendu,
      request: {
        auth: { uid: qui, token: {} },
        method: methode || 'update',
        path: chemin(chez),
        time: T,
        resource: { data: apres || {} },
      },
      resource: { data: avant },
    },
  };
}

const CAS = [
  // ── L'amitie se demande (24/08/2026) ─────────────────────────────────────
  cas("l'intrus s'ajoute tout seul dans les amis de la victime", 'DENY',
      'intrus', 'victime',
      { friends: [], friend_pending: [] },
      { friends: ['intrus'], friend_pending: [] }),

  cas('sonner : deposer sa propre demande', 'ALLOW',
      'intrus', 'victime',
      { friends: [], friend_requests: [] },
      { friends: [], friend_requests: ['intrus'] }),

  cas('accepter : s inscrire chez qui vous a invite', 'ALLOW',
      'b', 'a',
      { friends: [], friend_pending: ['b'] },
      { friends: ['b'], friend_pending: ['b'] }),

  cas('le proprietaire ecrit sa propre liste', 'ALLOW',
      'a', 'a', { friends: [] }, { friends: ['b'] }),

  cas('un tiers retire un ami existant chez autrui', 'DENY',
      'c', 'a',
      { friends: ['b'], friend_pending: ['c'] },
      { friends: ['c'] }),

  cas('un tiers depose la demande de QUELQU UN D AUTRE', 'DENY',
      'c', 'a', { friend_requests: [] }, { friend_requests: ['victime'] }),

  // ── La PII et la sante restent au proprietaire ───────────────────────────
  cas('lire le document prive d autrui', 'DENY',
      'c', 'a', { friends: [] }, null, 'get'),

  cas('le proprietaire lit son propre document', 'ALLOW',
      'a', 'a', { friends: [] }, null, 'get'),

  cas('un tiers lit la sous-collection d autrui', 'DENY',
      'c', 'a/logs/repas1', { kcal: 100 }, null, 'get'),

  cas('le proprietaire ecrit dans sa sous-collection', 'ALLOW',
      'a', 'a/logs/repas1', { kcal: 100 }, { kcal: 250 }),

  // ── Le Premium ne s'achete pas en ecrivant dans son propre document ──────
  // Ces trois cas ont ETE ROUGES le 24/08/2026 : c'est ce qui a revele que le
  // joker recursif annulait les garde-fous. Ils sont la sentinelle.
  cas('s auto-accorder le premium', 'DENY',
      'a', 'a', { premiumOverride: false }, { premiumOverride: true }),

  cas('s offrir un essai premium', 'DENY',
      'a', 'a', { premiumTrialUntil: 0 }, { premiumTrialUntil: 9999999999999 }),

  cas('se compter des filleuls', 'DENY',
      'a', 'a', { referralCount: 0 }, { referralCount: 999 }),
];

(async () => {
  const jeton = await jetonAcces(sa);
  let rep;

  if (FICHIER) {
    const contenu = fs.readFileSync(FICHIER, 'utf8');
    console.log('  source candidate : ' + FICHIER + ' (' + contenu.split('\n').length + ' lignes, non publiee)');
    rep = await regles('POST', '/v1/projects/' + PROJET + ':test', jeton, {
      source: { files: [{ name: 'firestore.rules', content: contenu }] },
      testSuite: { testCases: CAS.map((c) => c.tc) },
    });
  } else {
    const rel = await regles('GET', '/v1/projects/' + PROJET + '/releases/cloud.firestore', jeton);
    if (rel.code !== 200) {
      console.log('  release illisible : ' + rel.code + ' ' + JSON.stringify(rel.json).slice(0, 200));
      process.exit(1);
    }
    console.log('  jeu de regles EN LIGNE : ' + rel.json.rulesetName);
    rep = await regles('POST', '/v1/' + rel.json.rulesetName + ':test', jeton, {
      testSuite: { testCases: CAS.map((c) => c.tc) },
    });
  }

  if (rep.code !== 200) {
    console.log('  echec de l interrogation : ' + rep.code + ' ' + JSON.stringify(rep.json).slice(0, 400));
    process.exit(1);
  }

  const res = rep.json.testResults || [];
  if (res.length !== CAS.length) {
    console.log('  reponse incomplete : ' + res.length + ' resultats pour ' + CAS.length + ' cas');
    process.exit(1);
  }
  let rates = 0;
  res.forEach((r, i) => {
    const ok = r.state === 'SUCCESS';
    if (!ok) rates++;
    console.log('  ' + (ok ? 'OK  ' : 'RATE') + ' [' + CAS[i].tc.expectation + '] ' + CAS[i].libelle);
    if (!ok && r.debugMessages) console.log('       ' + String(r.debugMessages).slice(0, 300));
  });
  console.log('  ---> ' + (res.length - rates) + '/' + res.length + ' conformes');
  process.exit(rates ? 1 : 0);
})().catch((e) => {
  console.log('  erreur : ' + (e && e.message));
  process.exit(1);
});
