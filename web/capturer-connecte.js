// Captures des pages qui exigent une session : espace membre /me (68) et
// back-office (19), en clair et en sombre.
//
// POURQUOI CE SCRIPT NE LANCE PAS EDGE LUI-MEME
// -----------------------------------------------------------------------------
// Playwright sait ouvrir Edge (`channel: 'msedge'`). Mais **Google refuse
// l'authentification dans un navigateur pilote par Playwright** : il detecte
// l'automatisation et repond « ce navigateur ou cette application n'est peut-etre
// pas securise ». Constate le 26/08/2026 — aucun reglage du script n'y change
// rien, la protection est chez Google.
//
// La parade : on lance le VRAI Edge, en processus normal, avec le port de
// debogage ouvert. Vous vous y connectez comme d'habitude — Google n'y voit
// qu'un navigateur ordinaire, parce que c'en est un. Playwright s'y RACCORDE
// ensuite, une fois la session etablie.
//
// Le profil est a part (`profil-captures`) : il ne touche pas a votre Edge
// habituel, et il persiste — la connexion n'est demandee qu'une fois.
//
// Usage : node capturer-connecte.js
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const RACINE = 'https://salorie.com';
const BASE = 'C:/Users/21266/Desktop/salorie_8-26_2026/captures';
const PROFIL = path.join(__dirname, 'profil-captures');
const PORT = 9222;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const ADMIN = [
  'admin', 'admins', 'ai-keys', 'achievements', 'emails', 'feedback', 'flags',
  'marketplace', 'medal-builder', 'medals-history', 'moderation', 'news',
  'notify', 'orgs', 'premium', 'races', 'reports', 'sport-fields', 'users',
];

const ME = [
  '', 'abonnement', 'activite', 'agenda', 'aliments', 'amis', 'analytics',
  'annonces', 'bienvenue', 'coach', 'code-barres', 'composer', 'composition',
  'conditions', 'confidentialite', 'constantes', 'contact', 'courses', 'diary',
  'dicter', 'duel', 'duo', 'eau', 'equipement', 'etiquette', 'exercices',
  'famille', 'forme', 'frigo', 'import', 'jeune', 'journal', 'ligues', 'matchs',
  'medailles', 'mesures', 'metabolisme', 'microbiote', 'micronutriments',
  'modeles', 'mur', 'notifications', 'nutri-score', 'panier', 'parcours',
  'parrainage', 'photos', 'plan-ia', 'plans', 'poids', 'profile', 'progression',
  'projection', 'races', 'ramadan', 'rapport', 'recette-url', 'recettes',
  'reglages', 'restaurant', 'sadaqa', 'saisie', 'scan', 'seance',
  'substitutions', 'terrains', 'ticket', 'villes',
];

const ATTENTE_MS = 15 * 60 * 1000;

const FORMULAIRE = 'text=/Continuer avec Google|pour continuer vers Salorie|reserve aux administrateurs/i';
const DEDANS = 'text=/Bon retour|Repas du jour|Saisie manuelle/i';

function attendrePort(ms) {
  const fin = Date.now() + ms;
  return new Promise((resolve, reject) => {
    const essai = () => {
      http.get({ host: '127.0.0.1', port: PORT, path: '/json/version', timeout: 2000 }, (r) => {
        r.resume(); resolve();
      }).on('error', () => {
        if (Date.now() > fin) reject(new Error('Edge n a pas ouvert le port ' + PORT));
        else setTimeout(essai, 500);
      });
    };
    essai();
  });
}

/**
 * Session active ?
 *
 * ⚠ Ne JAMAIS conclure « connecte » sur l'ABSENCE du formulaire. C'est l'erreur
 * qui a produit 18 captures d'un meme ecran de connexion : Clerk met plus de
 * deux secondes a rendre son formulaire, et un test trop tot le trouve absent.
 * On attend une preuve POSITIVE.
 */
async function connecte(page) {
  try {
    await page.goto(RACINE + '/me', { waitUntil: 'domcontentloaded', timeout: 25000 });
    const dedans = page.locator(DEDANS).first().waitFor({ timeout: 15000 }).then(() => true);
    const dehors = page.locator(FORMULAIRE).first().waitFor({ timeout: 15000 }).then(() => false);
    return await Promise.race([dedans, dehors]);
  } catch { return false; }
}

async function capturer(page, url, fichier) {
  try {
    const r = await page.goto(url, { waitUntil: 'networkidle', timeout: 40000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: fichier, fullPage: true });
    return { ok: true, url: page.url() };
  } catch (e) {
    // `networkidle` n'arrive JAMAIS sur les pages a socket permanente (mur, duo,
    // duel, jumeau) : la connexion temps reel ne se tait pas. Sans ce repli, on
    // perdrait exactement les pages les plus interessantes.
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
      await page.screenshot({ path: fichier, fullPage: true });
      return { ok: true, url: page.url(), repli: true };
    } catch (e2) {
      return { ok: false, err: e2.message.split('\n')[0] };
    }
  }
}

(async () => {
  fs.mkdirSync(PROFIL, { recursive: true });

  console.log('  Lancement d Edge (processus normal, non pilote).\n');
  const edge = spawn(EDGE, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFIL}`,
    '--no-first-run',
    '--no-default-browser-check',
    RACINE + '/me',
  ], { detached: true, stdio: 'ignore' });
  edge.unref();

  await attendrePort(60000);
  const nav = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  const ctx = nav.contexts()[0];
  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {});

  console.log('  Edge est ouvert sur /me.');
  console.log('    1. « Continuer avec Google »');
  console.log('    2. choisissez salistarcompany@gmail.com');
  console.log('  Google acceptera : ce navigateur n est pas pilote au demarrage.');
  console.log('  Le script detecte la session et enchaine seul.\n');

  const limite = Date.now() + ATTENTE_MS;
  let pret = false;
  while (Date.now() < limite) {
    if (await connecte(page)) { pret = true; break; }
    await page.waitForTimeout(5000);
  }
  if (!pret) {
    console.log('  Aucune session au bout de quinze minutes. Rien capture.');
    await nav.close();
    process.exit(1);
  }
  console.log('  Session detectee. Captures en cours.\n');

  let ok = 0, redir = 0, ko = 0;
  const rates = [], renvoyees = [];

  for (const [nomTheme, schema] of [['clair', 'light'], ['sombre', 'dark']]) {
    const p = await ctx.newPage();
    await p.setViewportSize({ width: 1440, height: 900 });
    await p.emulateMedia({ colorScheme: schema });

    for (const [dossier, liste, prefixe] of [
      ['web-user', ME, '/me'],
      ['web-admin', ADMIN, ''],
    ]) {
      const sortie = path.join(BASE, dossier);
      fs.mkdirSync(sortie, { recursive: true });

      for (const route of liste) {
        const chemin = prefixe + (route ? '/' + route : '');
        // `/me` seul s'appelle `me-accueil` : sinon il ecrase la capture de la
        // page d'accueil publique qui porte deja le nom `accueil`.
        const nom = route ? route.replace(/\//g, '-') : 'me-accueil';
        const f = path.join(sortie, `${nom}-${nomTheme}.png`);
        const r = await capturer(p, RACINE + chemin, f);

        if (!r.ok) { console.log(`  ECHEC ${dossier}/${nom}-${nomTheme} : ${r.err}`); ko++; rates.push(chemin); continue; }

        // Garde-fou par page : l'URL peut rester `/me/...` alors que Clerk a
        // rendu sa porte fermee par-dessus. On regarde la PAGE, pas l'URL.
        const porte = await p.locator(FORMULAIRE).first().isVisible().catch(() => false);
        if (porte || /\/login|accounts\.google|clerk\./i.test(r.url)) {
          console.log(`  REDIR ${dossier}/${nom}-${nomTheme}`);
          redir++; renvoyees.push(chemin);
          try { fs.unlinkSync(f); } catch {}
          if (redir >= 5 && ok === 0) {
            console.log('\n  ARRET : cinq pages de suite renvoient vers la connexion.');
            await nav.close();
            process.exit(1);
          }
        } else {
          ok++;
        }
      }
    }
    await p.close();
  }

  await nav.close();
  console.log(`\n  captures utiles              : ${ok}`);
  console.log(`  renvoyees vers la connexion  : ${redir}${renvoyees.length ? '  ' + [...new Set(renvoyees)].join(' ') : ''}`);
  console.log(`  echecs                       : ${ko}${rates.length ? '  ' + [...new Set(rates)].join(' ') : ''}`);
  console.log('\n  Edge reste ouvert : fermez-le quand vous voulez.');
})();
