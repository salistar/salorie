// Harnais de tests web (Next.js admin). Logique pure (jwt, helpers). ts-jest CommonJS
// → jose résout son export "require" (build CJS), pas de souci ESM.
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  // transpile .ts ET le .js ESM (jose est ESM-only) → ts-jest avec allowJs
  transform: { '^.+\\.(t|j)s$': ['ts-jest', { isolatedModules: true, tsconfig: { allowJs: true } }] },
  // ne PAS ignorer jose dans node_modules (sinon son ESM n'est pas transpilé)
  transformIgnorePatterns: ['node_modules/(?!(jose)/)'],
  testPathIgnorePatterns: ['/.next/'],
};
