/**
 * Aucun écran n'appelle le paywall natif directement.
 * ---------------------------------------------------------------------------
 * `PurchasesService.showPaywall()` repose sur `PurchasesUI.presentPaywall`, qui
 * exige **deux** choses : une clé RevenueCat de production, et un paywall
 * configuré côté tableau de bord. S'il en manque une, il sort **en silence**.
 *
 * Un bouton « Passer Premium » qui ne fait rien est pire qu'un bouton absent :
 * l'utilisateur croit que l'application est cassée, et rien ne remonte — pas
 * d'erreur, pas de log, pas d'événement Sentry.
 *
 * ⚠ CE N'EST PAS UNE HYPOTHÈSE. Le binaire distribué par la landing est
 * exactement dans ce cas : vérifié le 10/09/2026 dans son bundle par comptage
 * de préfixes — **4 clés `test_`, 0 `goog_`**. Chaque chemin vers l'abonnement
 * y était mort.
 *
 * Le geste retenu (Profil, 31/08/2026) est de router vers `/(app)/upgrade`, qui
 * porte notre propre `PaywallView` : s'il n'y a aucune offre, il se referme
 * tout seul. Jamais de page de vente vide, jamais un appui sans effet.
 *
 * Ce test a mis trois corrections successives à devenir vrai — Profil, puis
 * l'écran Premium, puis la caméra de scan et `FeatureGate`. Il existe pour
 * qu'il n'y en ait pas une quatrième.
 */
import fs from 'fs';
import path from 'path';

const RACINE = path.join(__dirname, '..');

function fichiers(dossier: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    const p = path.join(dossier, e.name);
    if (/node_modules|__tests__/.test(p)) continue;
    if (e.isDirectory()) fichiers(p, acc);
    else if (e.name.endsWith('.tsx') || e.name.endsWith('.ts')) acc.push(p);
  }
  return acc;
}

/** Retire les commentaires : ce module PARLE de `showPaywall` sans l'appeler. */
function sansCommentaires(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/[^\n]*$/gm, '');
}

const SOURCES = [
  ...fichiers(path.join(RACINE, 'app')),
  ...fichiers(path.join(RACINE, 'components')),
].map((f) => ({
  nom: path.relative(RACINE, f).replace(/\\/g, '/'),
  code: sansCommentaires(fs.readFileSync(f, 'utf8')),
}));

describe('le chemin vers Premium ne peut pas etre muet', () => {
  // `PaywallView` est le seul composant autorisé : c'est lui qui sait se
  // refermer quand il n'y a rien à vendre, et c'est ce que `/upgrade` rend.
  const AUTORISES = ['components/PaywallView.tsx', 'lib/PurchasesService.ts'];

  it('aucun ecran n appelle showPaywall() directement', () => {
    const fautifs = SOURCES
      .filter((s) => !AUTORISES.includes(s.nom))
      .filter((s) => /\.showPaywall\s*\(/.test(s.code))
      .map((s) => s.nom);
    expect(fautifs).toEqual([]);
  });

  it('aucun ecran n appelle showPaywallIfNeeded() hors du demarrage', () => {
    // `app/_layout.tsx` le fait AU LANCEMENT pour restaurer un achat déjà payé :
    // ce n'est pas un bouton, personne n'attend de réaction à un appui.
    const fautifs = SOURCES
      .filter((s) => !AUTORISES.includes(s.nom) && s.nom !== 'app/_layout.tsx')
      .filter((s) => /\.showPaywallIfNeeded\s*\(/.test(s.code))
      .map((s) => s.nom);
    expect(fautifs).toEqual([]);
  });

  it('l ecran /upgrade existe et rend PaywallView', () => {
    // Sans lui, router vers `/upgrade` remplacerait un bouton mort par un 404.
    const upgrade = fs.readFileSync(
      path.join(RACINE, 'app', '(app)', 'upgrade.tsx'), 'utf8',
    );
    expect(upgrade).toMatch(/PaywallView/);
  });

  it('les trois chemins vers Premium mènent bien a /upgrade', () => {
    for (const nom of ['app/(tabs)/profile.tsx', 'app/(app)/scan-camera.tsx', 'components/FeatureGate.tsx']) {
      const s = SOURCES.find((x) => x.nom === nom);
      expect(s).toBeDefined();
      expect(s!.code).toMatch(/\(app\)\/upgrade/);
    }
  });
});
