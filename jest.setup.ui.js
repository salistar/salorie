// Setup tests UI (jest-expo). Mocks natifs courants (étendre au besoin par écran).
/* eslint-disable @typescript-eslint/no-var-requires */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Silence les warnings RN bruyants (animations, etc.) pendant les tests.
jest.spyOn(console, 'warn').mockImplementation(() => {});
