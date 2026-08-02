// Harnais de tests backend (NestJS). Unit specs (*.spec.ts) sous src/ ; integration sous test/.
// ts-jest transpile-only (isolatedModules) → pas de type-check global, rapide.
/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.spec.ts', '<rootDir>/test/**/*.spec.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { isolatedModules: true }] },
  testEnvironment: 'node',
  testTimeout: 30000,
};
