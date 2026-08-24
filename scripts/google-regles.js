// Le strict necessaire pour parler a l'API Firebase Rules — sans dependance.
// ---------------------------------------------------------------------------
// Le jeton d'acces est signe a la main avec `crypto`. Installer une
// bibliotheque d'authentification pour trois lignes de JWT ferait dependre la
// publication des regles de securite d'un `npm install` dans un runner — et
// c'est precisement ce qu'on veut pouvoir faire meme un jour ou tout casse.
const https = require('https');
const crypto = require('crypto');

const b64url = (x) =>
  Buffer.from(x).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Requete HTTPS qui rend toujours { code, json } — jamais d'exception sur un 4xx. */
function appel(methode, hote, chemin, corps, entetes) {
  return new Promise((resolve, reject) => {
    const r = https.request(
      { hostname: hote, path: chemin, method: methode, headers: entetes || {} },
      (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => {
          let j;
          try { j = JSON.parse(b); } catch (e) { j = { brut: b.slice(0, 400) }; }
          resolve({ code: res.statusCode, json: j });
        });
      },
    );
    r.on('error', reject);
    if (corps) r.write(corps);
    r.end();
  });
}

/** Le compte de service, lu depuis l'environnement. Jamais depuis un fichier du depot. */
function compteDeService() {
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  if (!sa.client_email || !sa.private_key || !sa.project_id) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT absent ou incomplet');
  }
  return sa;
}

/** Jeton d'acces Google (portee cloud-platform), valable une heure. */
async function jetonAcces(sa) {
  const now = Math.floor(Date.now() / 1000);
  const tete = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const corps = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  // La cle peut arriver avec de vrais sauts de ligne (JSON deja analyse) ou
  // avec des `\n` litteraux selon la facon dont le secret a ete colle.
  const sig = crypto.createSign('RSA-SHA256').update(tete + '.' + corps)
    .sign(sa.private_key.replace(/\\n/g, '\n'));
  const assertion = tete + '.' + corps + '.' +
    sig.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const form = 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') +
    '&assertion=' + assertion;
  const r = await appel('POST', 'oauth2.googleapis.com', '/token', form, {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(form),
  });
  if (r.code !== 200 || !r.json.access_token) {
    throw new Error('jeton refuse : ' + r.code + ' ' + JSON.stringify(r.json).slice(0, 200));
  }
  return r.json.access_token;
}

/** Appel a firebaserules.googleapis.com, deja authentifie. */
function regles(methode, chemin, jeton, objet) {
  const corps = objet ? JSON.stringify(objet) : null;
  const entetes = { Authorization: 'Bearer ' + jeton };
  if (corps) {
    entetes['Content-Type'] = 'application/json';
    entetes['Content-Length'] = Buffer.byteLength(corps);
  }
  return appel(methode, 'firebaserules.googleapis.com', chemin, corps, entetes);
}

/** Comparaison indifferente aux fins de ligne et aux espaces de fin. */
const nette = (x) => String(x).replace(/\r/g, '').replace(/[ \t]+$/gm, '').trim();

module.exports = { appel, compteDeService, jetonAcces, regles, nette };
