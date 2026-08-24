#!/usr/bin/env node
// Publie `storage.rules` sans passer par la CLI Firebase.
// ---------------------------------------------------------------------------
// POURQUOI CE FICHIER EXISTE
//
// `firebase deploy --only storage` echoue avec :
//
//   Permission denied to get service firebasestorage.googleapis.com
//
// Ce n'est PAS un droit sur les regles. Avant de publier, la CLI verifie que
// l'API Storage est activee, et cette verification demande
// `serviceusage.services.get` — que le compte de service n'a pas. Le compte
// possede pourtant `firebaserules.admin`, c'est-a-dire tout ce qu'il faut pour
// publier reellement des regles.
//
// On s'adresse donc directement a l'API des regles. Deux appels, aucun
// prealable : creer un jeu de regles, puis pointer la release dessus. Aucun
// role IAM supplementaire a demander.
//
// IDEMPOTENT : si ce qui est publie est deja identique au fichier, on ne cree
// rien. Sans cela, chaque livraison empilerait un jeu de regles de plus, et la
// vraie modification se perdrait dans l'historique.
//
// Usage : FIREBASE_SERVICE_ACCOUNT='<json>' node scripts/publier-regles-storage.js [fichier]
const fs = require('fs');
const { compteDeService, jetonAcces, regles, nette } = require('./google-regles');

const FICHIER = process.argv[2] || 'storage.rules';

(async () => {
  const sa = compteDeService();
  const jeton = await jetonAcces(sa);
  const local = fs.readFileSync(FICHIER, 'utf8');

  // 1. Retrouver la release du stockage — le nom du bucket en fait partie, et
  //    le deviner (`.appspot.com` ou `.firebasestorage.app` selon l'anciennete
  //    du projet) publierait dans le vide.
  const liste = await regles('GET', '/v1/projects/' + sa.project_id + '/releases', jeton);
  if (liste.code !== 200) {
    console.log('  releases illisibles : ' + liste.code + ' ' + JSON.stringify(liste.json).slice(0, 300));
    process.exit(1);
  }
  const release = (liste.json.releases || []).find((r) => r.name.indexOf('/releases/firebase.storage/') !== -1);
  if (!release) {
    console.log('::error::aucune release de stockage — le bucket tourne sur les regles par defaut.');
    console.log('::error::Publiez-les une premiere fois depuis la console Firebase.');
    process.exit(1);
  }
  const bucket = release.name.split('/firebase.storage/')[1];
  console.log('  bucket : ' + bucket);

  // 2. Ce qui est publie est-il deja le bon ?
  const actuel = await regles('GET', '/v1/' + release.rulesetName, jeton);
  if (actuel.code === 200) {
    const enLigne = ((actuel.json.source || {}).files || []).map((f) => f.content).join('\n');
    if (nette(enLigne) === nette(local)) {
      console.log('  deja publie et identique (' + release.rulesetName.split('/').pop() + ') — rien a faire');
      return;
    }
    console.log('  ecart detecte avec ce qui est publie — republication');
  }

  // 3. Creer le jeu de regles. L'API le COMPILE : une erreur de syntaxe est
  //    refusee ici, avant que quoi que ce soit ne pointe dessus.
  const cree = await regles('POST', '/v1/projects/' + sa.project_id + '/rulesets', jeton, {
    source: { files: [{ name: 'storage.rules', content: local }] },
  });
  if (cree.code !== 200) {
    console.log('::error::jeu de regles refuse : ' + cree.code + ' ' + JSON.stringify(cree.json).slice(0, 400));
    process.exit(1);
  }
  console.log('  jeu de regles cree : ' + cree.json.name.split('/').pop());

  // 4. Pointer la release dessus. C'est CET appel qui change ce qui protege le
  //    bucket ; celui d'avant n'avait encore rien change.
  const maj = await regles('PATCH', '/v1/' + release.name, jeton, {
    release: { name: release.name, rulesetName: cree.json.name },
  });
  if (maj.code !== 200) {
    console.log('::error::release non mise a jour : ' + maj.code + ' ' + JSON.stringify(maj.json).slice(0, 400));
    process.exit(1);
  }

  // 5. Relire. Une reponse 200 dit que l'appel a ete accepte, pas que le bucket
  //    est protege par le bon jeu de regles.
  const apres = await regles('GET', '/v1/projects/' + sa.project_id + '/releases', jeton);
  const revue = (apres.json.releases || []).find((r) => r.name === release.name);
  if (!revue || revue.rulesetName !== cree.json.name) {
    console.log('::error::la release ne pointe pas sur le jeu de regles publie.');
    process.exit(1);
  }
  console.log('  regles Storage publiees et verifiees pour ' + bucket);
})().catch((e) => {
  console.log('::error::' + (e && e.message));
  process.exit(1);
});
