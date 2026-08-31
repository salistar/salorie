// Le code et le docker-compose disent-ils la MEME chose sur les seuils du tier-0 ?
// ---------------------------------------------------------------------------
// POURQUOI CE CONTROLE EXISTE
// `FOOD4K_MIN_CONF` vit a deux endroits : un defaut dans `ml.service.ts`, et une
// valeur dans `docker-compose.override.yml`. C'est l'override qui gagne.
//
// Les 30 et 31/08/2026, le seuil a ete porte a 0,80 puis 0,90 DANS LE CODE. Les
// deux changements n'ont rien produit : la production lisait 0,60 depuis
// l'override. Deux mesures ont ete attribuees a un reglage qui n'avait jamais
// pris — et rien, nulle part, ne le signalait.
//
// ⚠⚠ ET IL Y A UNE TROISIEME SOURCE, QUI GAGNE SUR LES DEUX AUTRES. ⚠⚠
// Le fichier `.env` du VPS est ADDITIF par conception : le deploiement le
// preserve d'une fois sur l'autre, expressement pour que les reglages faits a la
// main sur le serveur survivent (cf. deploy-backend-web.yml, qui cite
// « un FOOD4K_MIN_CONF ajuste » comme exemple a ne pas perdre).
//
// Constate le 31/08/2026 en sondant la production : une reponse du tier-0 est
// passee a 0,53 de confiance — sous les 0,60 du compose, sous les 0,90 du code.
// Le serveur porte donc sa propre valeur, plus basse que les deux.
//
// CE SCRIPT NE PEUT PAS LA LIRE. Il verifie l'accord entre le code et le
// compose, ce qui reste utile ; mais un accord ici ne dit RIEN de ce que la
// production applique. Pour cela : `node scripts/seuil-effectif.js`, qui
// interroge l'API et lit la confiance minimale reellement servie.
//
// Usage :  node scripts/verifier-seuils.js

const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');

/** Le defaut ecrit dans le code : `process.env.X || '0.9'`. */
function defautCode(variable) {
  const src = fs.readFileSync(path.join(RACINE, 'backend/src/ml/ml.service.ts'), 'utf8');
  const m = src.match(new RegExp(`process\\.env\\.${variable}\\s*\\|\\|\\s*'([\\d.]+)'`));
  return m ? m[1] : null;
}

/** La valeur du compose : `X: ${X:-0.90}`. */
function defautCompose(variable) {
  const src = fs.readFileSync(path.join(RACINE, 'docker-compose.override.yml'), 'utf8');
  const m = src.match(new RegExp(`${variable}:\\s*\\$\\{${variable}:-([\\d.]+)\\}`));
  return m ? m[1] : null;
}

const SEUILS = ['FOOD4K_MIN_CONF', 'FOOD4K_MIN_CONF_LOCALE'];

let divergent = false;
for (const v of SEUILS) {
  const code = defautCode(v);
  const compose = defautCompose(v);

  if (code === null) {
    console.error(`  ECHEC : ${v} n'a plus de defaut dans ml.service.ts.`);
    divergent = true;
    continue;
  }
  if (compose === null) {
    // Absent du compose = le defaut du code s'applique. Ce n'est pas faux, mais
    // c'est exactement l'asymetrie qui a induit en erreur : un seuil pilote par
    // le compose, l'autre par le code.
    console.error(`  ECHEC : ${v} est absent de docker-compose.override.yml.`);
    console.error(`  Un seuil pilote par le compose et l'autre par le code, c'est`);
    console.error(`  l'asymetrie qui a fait attribuer une mesure au mauvais reglage.`);
    divergent = true;
    continue;
  }

  const egaux = Math.abs(Number(code) - Number(compose)) < 1e-9;
  console.log(`  ${v.padEnd(24)} code ${code}   compose ${compose}   ${egaux ? 'accord' : 'DIVERGENT'}`);
  if (!egaux) divergent = true;
}

if (divergent) {
  console.error('\n  Le compose GAGNE sur le code. Tant qu ils different, modifier le');
  console.error('  code ne change rien en production — et la mesure suivante sera');
  console.error('  attribuee a un reglage qui n a pas pris.');
  process.exit(1);
}

console.log('\n  Le code et le compose disent la meme chose.');
console.log('  ATTENTION : le .env du VPS gagne sur les deux et n est pas lisible');
console.log('  d ici. Pour connaitre le seuil REELLEMENT applique :');
console.log('    node scripts/seuil-effectif.js 40 --sauter 15');
