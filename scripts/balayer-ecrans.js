#!/usr/bin/env node
// Visite TOUS les écrans sur un téléphone, et cherche le vert d'avant.
// ---------------------------------------------------------------------------
// POURQUOI PAR LES PIXELS ET NON À L'ŒIL
// L'application compte 95 écrans. Les regarder un par un prendrait une heure et
// raterait ce qui est petit — une bordure, une icône, un liseré. Le test qui
// compte est mécanique : après la migration, aucun écran ne doit plus contenir
// le vert de marque d'avant (#2E8B57 en clair, #4ADE80 en sombre) SI le thème
// choisi n'est pas vert.
//
// On choisit donc un thème franchement différent — Rose ou Doré — et on compte
// les pixels verts. Un seul suffit à désigner l'écran à regarder.
//
//   node scripts/balayer-ecrans.js [--appareil R83L20HWJTE] [--max 30]
//
// ⚠ CE QU'IL SIGNALE À TORT, ET QU'IL FAUT SAVOIR ÉCARTER
// Trois sources de faux positifs, observées lors du premier balayage complet :
//   · les PHOTOS. Une grappe de raisin ou une salade contient du vert par
//     nature. Deux écrans sur 83 ont été signalés pour cela.
//   · les couleurs d'IDENTITÉ (Nutri-Score, médailles, logos de marque), vertes
//     à dessein.
//   · le VOLET DE NOTIFICATIONS, s'il s'ouvre pendant le balayage : l'icône de
//     Salorie y est verte, et la capture n'est alors plus celle de l'écran visé.
//
// Le rapport désigne donc des écrans À REGARDER, pas des défauts. C'est
// volontaire : mieux vaut trois captures à ouvrir qu'un défaut manqué.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const args = process.argv.slice(2);
const val = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : d;
};

const APPAREIL = val('--appareil', null);
const MAX = Number(val('--max', 40));
const PAQUET = 'com.idriss.kriouile.salorie';
const SORTIE = val('--sortie', path.join(os.tmpdir(), 'balayage-salorie'));

const adb = (...a) =>
  execFileSync('adb', APPAREIL ? ['-s', APPAREIL, ...a] : a, { encoding: 'buffer', maxBuffer: 64 << 20 });
const adbTxt = (...a) => adb(...a).toString('utf8').trim();

// Les écrans, dans l'ordre du dossier — moins ceux qui demandent une caméra ou
// un capteur, qui ouvrent une permission système et bloquent le balayage.
const SANS_CAMERA = /scan-camera|scan-barcode|label-scan|equipment-scan|receipt-ocr|ar-ghost|challenge-ar|rep-counter|voice-log|run|race-live/;

const RACINE = path.resolve(__dirname, '..');
const ecrans = fs
  .readdirSync(path.join(RACINE, 'app', '(app)'))
  .filter((f) => f.endsWith('.tsx') && !f.startsWith('_'))
  .map((f) => f.replace(/\.tsx$/, ''))
  .filter((r) => !SANS_CAMERA.test(r))
  .slice(0, MAX);

// Le vert d'avant, sous ses deux formes, avec une tolérance : la compression
// PNG est sans perte, mais un dégradé ou une ombre décale de quelques unités.
const CIBLES = [
  [46, 139, 87],   // #2E8B57 — l'accent clair d'avant
  [74, 222, 128],  // #4ADE80 — l'accent sombre d'avant
  [41, 143, 80],   // #298F50 — la variante du web
];
const TOLERANCE = 10;

/** Décode un PNG en RVB via la bibliothèque de Node — sans dépendance. */
function pixelsVerts(png) {
  // On ne décode pas le PNG : on cherche les octets du vert dans le flux brut
  // ne marcherait pas (les données sont compressées). On passe donc par
  // `zlib` sur les blocs IDAT, puis on relit les scanlines.
  const zlib = require('zlib');
  let pos = 8; // signature
  let largeur = 0, hauteur = 0, profondeur = 0, type = 0;
  const idat = [];
  while (pos < png.length) {
    const taille = png.readUInt32BE(pos);
    const nom = png.toString('ascii', pos + 4, pos + 8);
    const data = png.subarray(pos + 8, pos + 8 + taille);
    if (nom === 'IHDR') {
      largeur = data.readUInt32BE(0);
      hauteur = data.readUInt32BE(4);
      profondeur = data[8];
      type = data[9];
    } else if (nom === 'IDAT') idat.push(data);
    else if (nom === 'IEND') break;
    pos += 12 + taille;
  }
  if (profondeur !== 8 || (type !== 6 && type !== 2)) return null;
  const canaux = type === 6 ? 4 : 3;
  const brut = zlib.inflateSync(Buffer.concat(idat));

  const ligne = largeur * canaux;
  const prec = Buffer.alloc(ligne);
  const cur = Buffer.alloc(ligne);
  let n = 0;
  let o = 0;
  for (let y = 0; y < hauteur; y++) {
    const filtre = brut[o++];
    brut.copy(cur, 0, o, o + ligne);
    o += ligne;
    // Défiltrage PNG (types 0 à 4).
    for (let i = 0; i < ligne; i++) {
      const a = i >= canaux ? cur[i - canaux] : 0;
      const b = prec[i];
      const c = i >= canaux ? prec[i - canaux] : 0;
      let v = cur[i];
      if (filtre === 1) v += a;
      else if (filtre === 2) v += b;
      else if (filtre === 3) v += (a + b) >> 1;
      else if (filtre === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 0xff;
    }
    // ⚠ ON SAUTE LA BARRE D'ÉTAT ET LA BARRE DE NAVIGATION D'ANDROID.
    // Elles n'appartiennent pas à l'application : l'icône de notification de
    // Salorie y est un flamme verte, présente sur TOUS les écrans. Sans cette
    // exclusion, le détecteur trouvait exactement 95 pixels verts partout — un
    // compte identique d'un écran à l'autre, ce qui aurait dû me sauter aux
    // yeux plus tôt : c'est la signature d'un artefact, pas d'un défaut.
    if (y < 70 || y > hauteur - 90) { cur.copy(prec); continue; }
    // On échantillonne une colonne sur trois : dix fois plus rapide, et une
    // zone colorée fait toujours plus de trois pixels de large.
    for (let x = 0; x < largeur; x += 3) {
      const i = x * canaux;
      for (const [r, g, b] of CIBLES) {
        if (Math.abs(cur[i] - r) <= TOLERANCE &&
            Math.abs(cur[i + 1] - g) <= TOLERANCE &&
            Math.abs(cur[i + 2] - b) <= TOLERANCE) { n++; break; }
      }
    }
    cur.copy(prec);
  }
  return n;
}

fs.mkdirSync(SORTIE, { recursive: true });
console.log('  ' + ecrans.length + ' ecrans a visiter\n');

const suspects = [];
const comptes = [];
let visites = 0;
for (const r of ecrans) {
  try {
    execFileSync('adb', (APPAREIL ? ['-s', APPAREIL] : []).concat([
      'shell', 'am', 'start', '-a', 'android.intent.action.VIEW',
      '-d', 'salorie://' + r, PAQUET,
    ]), { stdio: 'ignore' });
  } catch { /* route inconnue : on passe */ }

  execFileSync('adb', (APPAREIL ? ['-s', APPAREIL] : []).concat(['shell', 'sleep', '2.5']), { stdio: 'ignore' });
  const png = adb('exec-out', 'screencap', '-p');
  if (png.length < 1000) continue;
  visites++;
  fs.writeFileSync(path.join(SORTIE, r + '.png'), png);

  let n = null;
  try { n = pixelsVerts(png); } catch { n = null; }
  if (n === null) { console.log('  ?     ' + r + '  (PNG non lisible)'); continue; }
  comptes.push([r, n]);
}

// ⚠ UNE LIGNE DE BASE, PAS UN SEUIL FIXE.
// Le logo flamme de l en-tete est vert, et il est sur TOUS les ecrans. Un seuil
// absolu les signalait donc tous, avec le meme compte — ce qui est la signature
// d un artefact, pas d un defaut. On ne signale que ce qui depasse nettement ce
// fond constant.
//
// ⚠ LA MEDIANE, PAS LE MINIMUM.
// Le minimum valait 0 : un ecran sans en-tete (une modale plein ecran) n a pas
// le logo, et tirait la ligne de base a zero — tous les autres etaient alors
// signales. La mediane represente le cas ORDINAIRE, qui est justement ce qu on
// veut soustraire.
const tries = comptes.map(([, n]) => n).sort((a, b) => a - b);
const base = tries.length ? tries[Math.floor(tries.length / 2)] : 0;
const MARGE = 60;
for (const [r, n] of comptes) {
  if (n > base + MARGE) {
    suspects.push([r, n - base]);
    console.log('  VERT  +' + String(n - base).padStart(5) + '  ' + r);
  }
}
console.log('\n  fond constant mesure : ' + base + ' pixels (le logo de l en-tete)');

console.log('\n  ' + visites + ' ecrans visites, ' + suspects.length + ' avec du vert d avant');
console.log('  captures : ' + SORTIE);
if (suspects.length) {
  console.log('\n  A REGARDER (les couleurs d identite sont attendues ici) :');
  suspects.sort((a, b) => b[1] - a[1]).forEach(([r, n]) => console.log('    ' + String(n).padStart(6) + '  ' + r));
}
