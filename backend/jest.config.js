// Harnais de tests backend (NestJS). Unit specs (*.spec.ts) sous src/ ; integration sous test/.
// ts-jest transpile-only (isolatedModules) → pas de type-check global, rapide.
/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.spec.ts', '<rootDir>/test/**/*.spec.ts'],
  // ⚠ LE `.js` N'EST PAS LA POUR NOTRE CODE : IL EST LA POUR `jose`.
  // `firebase-admin/auth` (14.x) tire `jwks-rsa`, qui tire `jose` 6 — publie en
  // ESM PUR, sans construction CommonJS. Jest tourne en CommonJS et s'arrete sur
  // « Cannot use import statement outside a module » : huit suites sur seize
  // refusaient de demarrer, sans qu'aucun test n'echoue — le compte de tests
  // BAISSAIT en silence, ce qui est la pire facon de casser une suite.
  transform: { '^.+\\.[tj]s$': ['ts-jest', { isolatedModules: true }] },
  // Par defaut Jest ne transforme RIEN dans node_modules. On ouvre une exception
  // nommee, et une seule : elargir a `node_modules` entier ralentirait chaque
  // suite pour transformer des milliers de fichiers deja en CommonJS.
  transformIgnorePatterns: ['/node_modules/(?!jose/)'],
  testEnvironment: 'node',
  testTimeout: 30000,
};
