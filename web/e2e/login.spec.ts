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

test('la racine redirige vers /login (auth-gate)', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
});
