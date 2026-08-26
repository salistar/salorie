#!/usr/bin/env node
// Les routes produit repondent-elles encore ?
// ---------------------------------------------------------------------------
// POURQUOI CE FICHIER EXISTE
//
// Les 25 et 26/08/2026, CINQ fonctionnalites ont ete trouvees mortes, par
// hasard, en cherchant autre chose :
//
//   /ai/vision            404 — Google avait retire le modele par defaut.
//                         Trois ecrans avec : scan d'equipement, recettes du
//                         frigo, photos de progression.
//   /ai/transcribe        429 — la dictee vocale n'avait JAMAIS fonctionne :
//                         son palier local visait un conteneur inexistant.
//   /ml/portion-estimate  429 — Gemini appele sans cascade.
//
// Toutes rendaient 500 depuis des semaines. Les ecrans s'affichaient
// parfaitement ; seul le bouton echouait. Rien ne surveillait ces routes, donc
// personne ne pouvait le savoir.
//
// Ce script les appelle TOUTES, une fois par jour, avec des charges valides. Il
// echoue si l'une d'elles cesse de repondre — ou si elle repond
// « [object Object] », l'autre panne silencieuse de la semaine.
//
// AUCUNE DEPENDANCE : le jeton d'authentification est un JWT signe a la main
// avec le compte de service, puis echange contre un jeton Firebase.
//
// Usage : FIREBASE_SERVICE_ACCOUNT='<json>' FIREBASE_WEB_API_KEY='<cle>' \
//         node scripts/balayage-api.js [https://api.salorie.com]
const crypto = require('crypto');
const https = require('https');
const http = require('http');

const BASE = process.argv[2] || 'https://api.salorie.com';
const UID = 'sentinelle-api@salorie.local';

const b64url = (x) =>
  Buffer.from(x).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function requete(url, methode, corps, entetes) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const data = corps ? Buffer.from(JSON.stringify(corps)) : null;
    const h = Object.assign({ 'Content-Type': 'application/json' }, entetes || {});
    if (data) h['Content-Length'] = data.length;
    const r = mod.request(
      { hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80), path: u.pathname + u.search, method: methode, headers: h },
      (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => resolve({ code: res.statusCode, brut: b }));
      },
    );
    r.on('error', (e) => resolve({ code: 0, brut: 'ERREUR ' + e.message }));
    r.setTimeout(90000, () => { r.destroy(); resolve({ code: 0, brut: 'TIMEOUT' }); });
    if (data) r.write(data);
    r.end();
  });
}

/**
 * Un jeton Firebase, sans le SDK admin.
 *
 * Un « custom token » n'est qu'un JWT signe par le compte de service pour une
 * audience precise. On le fabrique donc a la main, puis on l'echange contre un
 * jeton d'identite — exactement ce que fait l'application.
 */
async function jetonUtilisateur(sa, cleWeb) {
  const now = Math.floor(Date.now() / 1000);
  const AUD = 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';
  const tete = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const corps = b64url(JSON.stringify({
    iss: sa.client_email, sub: sa.client_email, aud: AUD, iat: now, exp: now + 3600, uid: UID,
  }));
  const sig = crypto.createSign('RSA-SHA256').update(tete + '.' + corps)
    .sign(sa.private_key.replace(/\\n/g, '\n'))
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const r = await requete(
    'https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=' + cleWeb,
    'POST', { token: tete + '.' + corps + '.' + sig, returnSecureToken: true },
  );
  const j = JSON.parse(r.brut || '{}');
  if (!j.idToken) throw new Error('echange du jeton refuse : ' + r.code + ' ' + r.brut.slice(0, 200));
  return j.idToken;
}

// Une image et un son minuscules, fabriques ici : le script ne depend d'aucun
// fichier, donc il tourne tel quel dans un runner nu.
function imageDeTest() {
  // Un JPEG 1x1 valide, suffisant pour franchir les controles de taille.
  return Buffer.from(
    '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a'
    + 'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA'
    + 'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64',
  ).toString('base64');
}

function sonDeTest() {
  // Un WAV de 0,3 s, silencieux : on verifie que la ROUTE repond, pas que le
  // modele entend quelque chose.
  const sr = 8000;
  const n = Math.floor(sr * 0.3);
  const data = Buffer.alloc(n * 2);
  const tete = Buffer.alloc(44);
  tete.write('RIFF', 0);
  tete.writeUInt32LE(36 + data.length, 4);
  tete.write('WAVEfmt ', 8);
  tete.writeUInt32LE(16, 16);
  tete.writeUInt16LE(1, 20);
  tete.writeUInt16LE(1, 22);
  tete.writeUInt32LE(sr, 24);
  tete.writeUInt32LE(sr * 2, 28);
  tete.writeUInt16LE(2, 32);
  tete.writeUInt16LE(16, 34);
  tete.write('data', 36);
  tete.writeUInt32LE(data.length, 40);
  return Buffer.concat([tete, data]).toString('base64');
}

(async () => {
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  const cleWeb = process.env.FIREBASE_WEB_API_KEY || '';
  if (!sa.client_email || !cleWeb) {
    console.log('::error::FIREBASE_SERVICE_ACCOUNT ou FIREBASE_WEB_API_KEY absent.');
    process.exit(1);
  }

  const jeton = await jetonUtilisateur(sa, cleWeb);
  const H = { Authorization: 'Bearer ' + jeton };
  const image = imageDeTest();
  const son = sonDeTest();
  console.log('  cible : ' + BASE);

  const routes = [
    ['POST', '/ai/generate', { prompt: 'Reponds par le mot OK.' }],
    ['POST', '/ai/vision', { prompt: 'Quel aliment ?', imageBase64: image, mimeType: 'image/jpeg' }],
    ['POST', '/ai/transcribe', { audioBase64: son, mimeType: 'audio/wav', language: 'fr' }],
    ['POST', '/ml/vision', { imageBase64: image, mimeType: 'image/jpeg' }],
    ['POST', '/ml/portion-estimate', { imageBase64: image, mimeType: 'image/jpeg' }],
    ['POST', '/ml/meal-reco', { objectif: 'perte', kcal: 1800 }],
    ['POST', '/fridge/analyze', { imageBase64: image }],
    ['POST', '/menu/analyze', { imageBase64: image }],
    ['POST', '/barcode/analyze', { barcode: '3017620422003' }],
    ['POST', '/nutrition/micros', { foods: [{ name: 'pomme', grams: 150 }], lang: 'fr' }],
    ['GET', '/ml/weight-forecast', null],
  ];

  const casses = [];
  for (const [m, chemin, corps] of routes) {
    const t0 = Date.now();
    const r = await requete(BASE + chemin, m, corps, H);
    const ms = Date.now() - t0;
    const ok = r.code >= 200 && r.code < 300;
    // « [object Object] » est non vide, donc il traverse tous les controles de
    // presence. C'est l'autre facon dont une route « repond » sans rien dire.
    const pourri = r.brut.indexOf('object Object') !== -1;
    if (!ok || pourri) casses.push([chemin, r.code, pourri, r.brut.slice(0, 220)]);
    console.log('  ' + (!ok ? 'CASSE ' : pourri ? 'POURRI' : 'ok    ')
      + String(r.code).padEnd(4) + String(ms).padStart(7) + ' ms  ' + chemin);
  }

  // Le compte de test se supprime lui-meme : sans cela le balayage quotidien
  // laisserait une trainee de comptes fantomes dans Firebase Auth.
  await requete('https://identitytoolkit.googleapis.com/v1/accounts:delete?key=' + cleWeb,
    'POST', { idToken: jeton }).catch(() => {});

  if (casses.length) {
    console.log('');
    for (const [c, code, pourri, b] of casses) {
      console.log('::error::' + c + ' — ' + (pourri ? 'repond « [object Object] »' : 'HTTP ' + code)
        + ' : ' + b.replace(/\s+/g, ' '));
    }
    process.exit(1);
  }
  console.log('');
  console.log('  les ' + routes.length + ' routes repondent.');
})().catch((e) => {
  console.log('::error::' + (e && e.message));
  process.exit(1);
});
