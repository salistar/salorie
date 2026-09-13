#!/usr/bin/env node
/**
 * Toute clé réécrite par le déploiement doit être retirée avant d'être réécrite.
 * ---------------------------------------------------------------------------
 * Le workflow construit le `.env` de production de façon ADDITIVE : il filtre
 * les clés qu'il gère (`grep -vE`), puis réécrit leurs valeurs. C'est voulu —
 * ça préserve les variables posées à la main sur le serveur, qu'un `>` aurait
 * effacées.
 *
 * ⚠ MAIS UNE CLÉ AJOUTÉE SANS ÊTRE FILTRÉE N'EST JAMAIS RETIRÉE.
 * Elle s'empile, une copie par déploiement. Constaté le 13/09/2026 sur la
 * production : **1 924 lignes pour 28 clés**, dont 205 copies d'`ADMIN_API_KEY`
 * et 189 de chaque `NEXT_PUBLIC_*`.
 *
 * Ce n'est pas qu'une question de propreté. `dotenv` retient la DERNIÈRE
 * occurrence, donc la valeur servie était juste — mais le fichier gardait sur
 * disque, en clair, **toute valeur qu'une clé a eue dans sa vie**. Faire tourner
 * `ADMIN_API_KEY`, qui protège les routes d'administration et le webhook du
 * pipeline, n'effaçait donc pas l'ancienne. Une rotation qui ne retire pas
 * l'ancien secret n'est pas une rotation.
 *
 * ⚠ LA DISTINCTION EST DANS LE FICHIER DE DESTINATION, et c'est elle qui rend
 * ce contrôle possible :
 *
 *   `>> .env.next`  → réécrite à CHAQUE déploiement. Doit être filtrée.
 *   `>> .env`       → écrite sous condition (`MONGO_PASS` n'est générée qu'une
 *                     fois, `TURN_SECRET` seulement lors d'une rotation). La
 *                     filtrer la SUPPRIMERAIT : le backend perdrait sa base de
 *                     données, ou les appels leur relais.
 */
const fs = require('fs');
const path = require('path');

const CHEMIN = path.join(__dirname, '..', '.github', 'workflows', 'deploy-backend-web.yml');
const src = fs.readFileSync(CHEMIN, 'utf8');

// 1. Les clés que le filtre retire avant réécriture.
//
// Deux formes sont acceptées, parce que le fichier a porté les deux : la liste
// écrite d'un bloc dans le `grep -vE`, et la même assemblée en plusieurs
// affectations `CLES=`. Ce contrôle vérifie un CONTENU, pas une mise en forme.
const filtrees = new Set();

const enUnBloc = src.match(/grep -vE '\^ \*\(export \+\)\?\(([^)]+)\)/);
if (enUnBloc) for (const c of enUnBloc[1].split('|')) if (c) filtrees.add(c);

for (const m of src.matchAll(/^\s*CLES=(?:"\$CLES\|)?'?([A-Z_0-9|]+)'?"?\s*$/gm)) {
  for (const c of m[1].split('|')) if (c) filtrees.add(c);
}

if (!filtrees.size) {
  console.error('✗ Liste des cles filtrees introuvable dans le workflow.');
  console.error('  Elle alimente le `grep -vE` qui construit le .env de production ;');
  console.error('  sans elle, chaque cle reecrite s empile a chaque deploiement.');
  process.exit(1);
}

// 2. Les clés réécrites à chaque déploiement (destination `.env.next`).
//
// ⚠ ON RAISONNE SUR LA LIGNE, PAS SUR LA STRUCTURE DES GUILLEMETS.
// Ma première version cherchait `'CLE=…'` entre apostrophes. Elle ratait
// `printf '%s\n' 'FOOD4K_MIN_CONF=${{ vars.FOOD4K_MIN_CONF || '0.80' }}'`,
// dont la valeur par défaut contient elle-même des apostrophes — et annonçait
// donc que la clé n'était jamais réécrite, ce qui était faux. Un outil de
// vérification qui se trompe est pire que pas d'outil : on lui fait confiance.
const reecrites = new Set();
for (const ligne of src.split('\n')) {
  if (!/>>\s*\.env\.next/.test(ligne)) continue;
  for (const m of ligne.matchAll(/\b([A-Z][A-Z_0-9]{2,})=/g)) reecrites.add(m[1]);
}

// ⚠ ON COMPILE LE FILTRE, ON NE COMPARE PAS DES NOMS.
// La liste contient des CLASSES, pas seulement des noms : `NEXT_PUBLIC_[A-Z_]+`
// couvre les dix clés `NEXT_PUBLIC_*` d'un coup. Ce raccourci n'est pas
// cosmétique — écrites une par une, elles portaient la ligne à 565 caractères,
// et GitHub refusait alors le fichier au démarrage (voir l'en-tête du workflow).
//
// Comparer des chaînes ferait donc croire que les dix clés ne sont pas
// filtrées. On teste ce que `grep` testera : la même expression, appliquée à
// chaque nom.
const motif = new RegExp(`^(?:${[...filtrees].join('|')})$`);
const oubliees = [...reecrites].filter((c) => !motif.test(c)).sort();

if (oubliees.length) {
  console.error('✗ Ces cles sont reecrites a chaque deploiement SANS etre filtrees avant :');
  for (const c of oubliees) console.error(`    ${c}`);
  console.error('');
  console.error('  Chacune ajoutera une ligne au .env de production a CHAQUE deploiement,');
  console.error('  et le fichier conservera en clair toutes ses valeurs passees.');
  console.error('  → Ajoute-les au `grep -vE` de l etape « docker compose up on VPS ».');
  process.exit(1);
}

console.log(`✓ ${reecrites.size} cle(s) reecrite(s) a chaque deploiement, toutes filtrees avant.`);

// 3. Signalé sans faire échouer : les clés filtrées que plus rien ne réécrit.
// Une clé filtrée mais jamais réécrite est SUPPRIMÉE à chaque déploiement — ce
// qui est parfois voulu (une clé retirée du projet), parfois un oubli.
// Les classes (`NEXT_PUBLIC_[A-Z_]+`) sont écartées de ce relevé : elles ne
// désignent pas une clé mais une famille, et n'ont donc pas à être « réécrites ».
const estUneClasse = (c) => /[[\]+*?]/.test(c);
const jamais = [...filtrees]
  .filter((c) => !estUneClasse(c) && !reecrites.has(c))
  .sort();
if (jamais.length) {
  console.log('');
  console.log('  ℹ Filtrees mais jamais reecrites dans .env.next — donc SUPPRIMEES');
  console.log('    du .env a chaque deploiement. Volontaire pour une cle retiree du');
  console.log('    projet ; a verifier sinon :');
  for (const c of jamais) console.log(`      ${c}`);
}
