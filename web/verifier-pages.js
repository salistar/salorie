// Balayage de TOUTES les pages, dans la session authentifiee d'Edge.
//
// Ce que ce script cherche, et qu'un test e2e ne voit pas : les erreurs de
// console, les pages qui rendent VIDE, et celles qui retombent sur un ecran de
// connexion. Une page qui repond 200 peut tres bien n'afficher qu'un cadre.
const { chromium } = require('playwright');

const RACINE = 'https://salorie.com';

const LANDING = ['/', '/en', '/ar', '/contact', '/privacy', '/terms', '/refund', '/delete-account'];

const ADMIN = ['/admin', '/admins', '/ai-keys', '/achievements', '/emails', '/feedback', '/flags',
  '/marketplace', '/medal-builder', '/medals-history', '/moderation', '/news', '/notify',
  '/orgs', '/premium', '/races', '/reports', '/sport-fields'];

const ME = ['', 'abonnement', 'activite', 'agenda', 'aliments', 'amis', 'analytics', 'annonces',
  'bienvenue', 'coach', 'code-barres', 'composer', 'composition', 'conditions', 'confidentialite',
  'constantes', 'contact', 'courses', 'diary', 'dicter', 'duel', 'duo', 'eau', 'equipement',
  'etiquette', 'exercices', 'famille', 'forme', 'frigo', 'import', 'jeune', 'journal', 'ligues',
  'matchs', 'medailles', 'mesures', 'metabolisme', 'microbiote', 'micronutriments', 'modeles',
  'mur', 'notifications', 'nutri-score', 'panier', 'parcours', 'parrainage', 'photos', 'plan-ia',
  'plans', 'poids', 'profile', 'progression', 'projection', 'races', 'ramadan', 'rapport',
  'recette-url', 'recettes', 'reglages', 'restaurant', 'sadaqa', 'saisie', 'scan', 'seance',
  'substitutions', 'terrains', 'ticket', 'villes'].map((r) => '/me' + (r ? '/' + r : ''));

// Le bruit connu et sans consequence, qu'il ne sert a rien de rapporter.
const BRUIT = /favicon|ResizeObserver|Download the React DevTools|clerk.*telemetry|net::ERR_ABORTED.*\.map/i;

(async () => {
  const nav = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = nav.contexts()[0];
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 1440, height: 900 });

  const rapport = [];

  for (const [groupe, chemins] of [['landing', LANDING], ['admin', ADMIN], ['me', ME]]) {
    console.log('\n═══ ' + groupe.toUpperCase() + ' (' + chemins.length + ') ═══');
    for (const c of chemins) {
      const erreurs = [];
      const onErr = (m) => { if (m.type() === 'error' && !BRUIT.test(m.text())) erreurs.push(m.text().slice(0, 90)); };
      p.on('console', onErr);
      p.on('pageerror', (e) => { if (!BRUIT.test(String(e))) erreurs.push('PAGEERROR ' + String(e.message).slice(0, 80)); });

      let statut = 0;
      try {
        const r = await p.goto(RACINE + c, { waitUntil: 'domcontentloaded', timeout: 30000 });
        statut = r ? r.status() : 0;
        await p.waitForTimeout(2600);
      } catch (e) {
        erreurs.push('NAV ' + String(e.message).split('\n')[0].slice(0, 60));
      }

      const texte = await p.locator('body').innerText().catch(() => '');
      const vide = texte.trim().length < 120;
      const connexion = /Continuer avec Google|Continue with Google|réservé aux administrateurs|to continue to/i.test(texte);

      p.off('console', onErr);
      p.removeAllListeners('pageerror');

      const souci = statut >= 400 || vide || connexion || erreurs.length;
      rapport.push({ groupe, c, statut, vide, connexion, erreurs });
      if (souci) {
        console.log('  ⚠ ' + c.padEnd(24) + statut
          + (vide ? '  VIDE' : '')
          + (connexion ? '  -> CONNEXION' : '')
          + (erreurs.length ? '  ' + erreurs.length + ' err' : ''));
        erreurs.slice(0, 2).forEach((e) => console.log('       ' + e));
      }
    }
  }

  console.log('\n═══ BILAN ═══');
  for (const g of ['landing', 'admin', 'me']) {
    const l = rapport.filter((r) => r.groupe === g);
    const ok = l.filter((r) => r.statut < 400 && !r.vide && !r.connexion && !r.erreurs.length);
    console.log('  ' + g.padEnd(9) + ok.length + ' / ' + l.length + ' sans souci');
  }
  const tot = rapport.filter((r) => r.statut < 400 && !r.vide && !r.connexion && !r.erreurs.length);
  console.log('  TOTAL    ' + tot.length + ' / ' + rapport.length);

  await p.close();
  await nav.close();
})();
