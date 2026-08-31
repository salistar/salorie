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
// Quand une valeur vit a deux endroits, c'est toujours celle qu'on n'a pas
// modifiee qui decide. Ce script refuse qu'elles divergent.
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

console.log('\n  Le code et le deploiement disent la meme chose.');
