// Les deux listes d'etiquettes disent-elles la MEME chose, rang pour rang ?
// ---------------------------------------------------------------------------
// POURQUOI CE CONTROLE VAUT UN FICHIER A LUI SEUL
// Le modele ne rend pas des noms : il rend des INDICES. Ce sont ces listes qui
// leur donnent un sens. Il y en a deux, et elles vivent loin l'une de l'autre :
//
//   food4k/label_map_172.json    lue par le serveur (food4k/app.py)
//   lib/foodSalorieLabels.ts     compilee dans l'APK (lib/onDeviceVision.ts)
//
// Un decalage d'UN SEUL RANG entre elles fait dire « harira » a un tajine — sur
// le telephone seulement, ou sur le serveur seulement. Rien ne leve d'erreur :
// le modele repond, la confiance est haute, la cascade s'arrete la. Et la mesure
// de justesse ne verrait rien, parce qu'elle ne lit QUE le fichier du serveur.
//
// ⚠ CE CODE A D'ABORD ETE ECRIT DANS LE YAML DE LA CI, EN `node -e "..."`.
// Il ne s'executait pas : le guillemet du motif fermait la chaine du shell, et
// bash s'arretait sur « syntax error near unexpected token ( ». Une verification
// qui ne s'execute pas est pire que pas de verification — elle rassure.
// Un fichier a part s'eprouve localement, en une commande.
//
// Usage :  node scripts/verifier-etiquettes.js

const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const SERVEUR = 'food4k/label_map_172.json';
const TELEPHONE = 'lib/foodSalorieLabels.ts';

function main() {
  const serveur = JSON.parse(
    fs.readFileSync(path.join(RACINE, SERVEUR), 'utf8')).classes;

  // On lit les chaines du tableau TypeScript. Le motif exige une ligne qui ne
  // contient QUE la chaine : les commentaires d'en-tete en contiennent aussi,
  // et les ramasser decalerait toute la liste — precisement le defaut cherche.
  const source = fs.readFileSync(path.join(RACINE, TELEPHONE), 'utf8');
  const debut = source.indexOf('FOOD_SALORIE_LABELS');
  if (debut < 0) {
    console.log(`  ECHEC : FOOD_SALORIE_LABELS introuvable dans ${TELEPHONE}`);
    process.exit(1);
  }
  const telephone = [...source.slice(debut).matchAll(/^\s*"(.+?)",?\s*$/gm)]
    .map((m) => m[1]);

  console.log(`  serveur   : ${serveur.length} classes  (${SERVEUR})`);
  console.log(`  telephone : ${telephone.length} classes  (${TELEPHONE})`);

  const ecarts = [];
  for (let i = 0; i < Math.max(serveur.length, telephone.length); i++) {
    if (serveur[i] !== telephone[i]) {
      ecarts.push(`    rang ${i} : serveur=${serveur[i]} | telephone=${telephone[i]}`);
    }
  }

  if (ecarts.length) {
    console.log(`\n  ECHEC : ${ecarts.length} ecart(s)`);
    ecarts.slice(0, 12).forEach((e) => console.log(e));
    if (ecarts.length > 12) console.log(`    ... et ${ecarts.length - 12} autres`);
    console.log('\n  Les deux fichiers se regenerent ENSEMBLE :');
    console.log('    python food4k/deployer_modele.py <dossier du candidat> --appliquer');
    process.exit(1);
  }
  console.log('  identiques rang pour rang');

  verifierLesNoms(serveur);
}

// ── Les NOMS affichables doivent couvrir les memes classes ──────────────────
// ⚠ UN QUATRIEME FICHIER EST ENTRE DANS LA DANSE LE 09/09/2026.
// `lib/foodSalorieNoms.ts` porte le nom francais et arabe de chaque classe ;
// c'est lui qui permet au telephone de retrouver les macros dans une base
// desormais francisee. S'il prend du retard sur `label_map_172.json`, une classe
// nouvelle n'a plus de nom affichable et perd ses macros hors ligne EN SILENCE —
// l'application se contente d'attendre le reseau, sans erreur nulle part.
//
// Le projet a deja paye deux fois la divergence entre fichiers censes s'accorder.
// On la refuse une troisieme fois.
function verifierLesNoms(serveur) {
  const NOMS_TS = 'lib/foodSalorieNoms.ts';
  const NOMS_JSON = 'food4k/names_172.json';
  const chemin = path.join(RACINE, NOMS_TS);
  if (!fs.existsSync(chemin)) {
    console.log(`\n  ECHEC : ${NOMS_TS} manque.`);
    console.log('    python food4k/generer_noms_telephone.py');
    process.exit(1);
  }
  const source = fs.readFileSync(chemin, 'utf8');
  const cles = [...source.matchAll(/^ {2}"(.+?)": \{ fr:/gm)].map((m) => m[1]);
  const json = JSON.parse(fs.readFileSync(path.join(RACINE, NOMS_JSON), 'utf8'));

  console.log(`\n  noms (${NOMS_TS}) : ${cles.length} classes`);
  const manquantes = serveur.filter((c) => !cles.includes(c));
  const sansArabe = serveur.filter((c) => !((json[c] || {}).ar || '').trim());
  const enTrop = cles.filter((c) => !serveur.includes(c));

  if (manquantes.length || enTrop.length) {
    console.log(`  ECHEC : ${manquantes.length} classe(s) sans nom, `
      + `${enTrop.length} nom(s) sans classe`);
    [...manquantes.slice(0, 8), ...enTrop.slice(0, 4)].forEach((c) => console.log(`    ${c}`));
    console.log('\n  Regenerer : python food4k/generer_noms_telephone.py');
    process.exit(1);
  }
  // Un nom arabe manquant n'empeche pas l'application de tourner : elle affiche
  // le francais. On le SIGNALE sans faire echouer la CI — bloquer ici punirait
  // l'ajout d'une classe plutot que de l'encourager.
  console.log(`  toutes les classes ont un nom francais${
    sansArabe.length ? ` ; ${sansArabe.length} sans arabe : ${sansArabe.slice(0, 6).join(', ')}` : ' et arabe'}`);
}

main();
