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
}

main();
