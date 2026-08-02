// Deux PROJETS isolés :
//  - 'logic' : logique pure (ts-jest, env node) → 146 tests existants, inchangés.
//  - 'ui'    : composants RN (jest-expo + @testing-library/react-native).
// Lancer tout : `npm test`. Cibler : `npx jest --selectProjects ui` (ou logic).
/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      displayName: 'logic',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/__tests__/**/*.test.ts'],
      transform: { '^.+\\.ts$': ['ts-jest', { isolatedModules: true }] },
      testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/', '/web/', '/backend/', '/server/'],
      modulePathIgnorePatterns: ['<rootDir>/.claude/'],
    },
    {
      displayName: 'ui',
      preset: 'jest-expo',
      testMatch: ['<rootDir>/__tests__/ui/**/*.test.tsx'],
      setupFilesAfterEnv: ['<rootDir>/jest.setup.ui.js'],
      modulePathIgnorePatterns: ['<rootDir>/.claude/'],
    },
  ],
};
