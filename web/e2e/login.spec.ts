import { test, expect } from '@playwright/test';

// Smoke e2e (sans auth) de l'admin web déployé : la page de connexion rend, et la
// racine est bien protégée (redirige vers /login).
test('la page /login rend le formulaire admin', async ({ page }) => {
  await page.goto('/login');
  await expect(page).toHaveTitle(/Salorie Admin/i);
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
  // un bouton de soumission présent
  await expect(page.getByRole('button')).toBeVisible();
});

// ⚠ CE TEST AFFIRMAIT L'INVERSE, ET IL ECHOUAIT DEJA AVANT LE LOT 6.
// Il exigeait que la racine redirige vers /login. C'etait vrai quand ce domaine
// ne servait que le back-office ; depuis la fusion, la racine sert la LANDING
// PUBLIQUE. Ce n'est donc pas la fonctionnalite qui etait cassee, c'est le test
// qui decrivait une architecture disparue — et il criait au loup depuis.
//
// Ce qui compte reellement se verifie plus bas : les pages d'administration,
// elles, restent protegees.
test('la racine sert la landing publique, pas le back-office', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/salorie\.com\/?$/);
  await expect(page.locator('text=/Télécharger|Download|تحميل/i').first()).toBeVisible();
});

test('les pages d administration restent protegees', async ({ page }) => {
  // C'est CELA que l'ancien test voulait dire. On le verifie sur une vraie page
  // d'admin plutot que sur la racine, qui a change de role.
  await page.goto('/moderation');
  await expect(page).toHaveURL(/\/login/);
});
