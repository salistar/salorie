import { defineConfig } from '@playwright/test';

// e2e web contre l'admin DÉPLOYÉ (app.salorie.com). Pas de serveur local à lancer.
// Lancer : npx playwright test  (séparé de jest, qui ne touche pas e2e/).
export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  expect: { timeout: 10000 },
  use: { baseURL: 'https://app.salorie.com', headless: true, ignoreHTTPSErrors: false },
  reporter: [['list']],
});
