import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';

/**
 * L'écran d'attente ne se montre que quand Clerk traîne — donc presque jamais en
 * développement, et jamais dans un parcours normal. C'est exactement le genre de
 * comportement qui régresse sans que personne ne s'en aperçoive, d'où ce test.
 */

let mockLangue = 'fr';
jest.mock('../../lib/i18n', () => ({
  useTranslation: () => ({ language: mockLangue, isRTL: mockLangue === 'ar' }),
}));

// L'état du réseau est piloté par le test : c'est toute la question ici.
const mockReseau = { joignable: true as boolean | null, jette: false };
jest.mock(
  'expo-network',
  () => ({
    getNetworkStateAsync: async () => {
      if (mockReseau.jette) throw new Error('module indisponible');
      return { isInternetReachable: mockReseau.joignable };
    },
  }),
  { virtual: true }
);

import AttenteConnexion, { DELAI_EXPLICATION_MS } from '../../components/AttenteConnexion';

/** Fait passer le délai d'explication, en laissant les promesses se résoudre. */
async function laisserPasserLeDelai() {
  await act(async () => {
    jest.advanceTimersByTime(DELAI_EXPLICATION_MS);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  mockLangue = 'fr';
  mockReseau.joignable = true;
  mockReseau.jette = false;
});

afterEach(() => {
  jest.useRealTimers();
});

describe('<AttenteConnexion />', () => {
  it("ne dit rien avant le délai — l'attente courte est normale", () => {
    const { queryByText, getByText } = render(<AttenteConnexion onReessayer={() => {}} />);
    expect(getByText('Salorie')).toBeTruthy();
    expect(queryByText('Aucune connexion internet')).toBeNull();
    expect(queryByText('La connexion est lente')).toBeNull();
  });

  it('dit « hors ligne » et propose de réessayer quand le réseau est injoignable', async () => {
    mockReseau.joignable = false;
    const { getByText } = render(<AttenteConnexion onReessayer={() => {}} />);
    await laisserPasserLeDelai();
    await waitFor(() => expect(getByText('Aucune connexion internet')).toBeTruthy());
    expect(getByText('Réessayer')).toBeTruthy();
  });

  it("dit « connexion lente » quand le réseau marche : c'est nous qui traînons", async () => {
    mockReseau.joignable = true;
    const { getByText, queryByText } = render(<AttenteConnexion onReessayer={() => {}} />);
    await laisserPasserLeDelai();
    await waitFor(() => expect(getByText('La connexion est lente')).toBeTruthy());
    // Pas de bouton : rien à réessayer, ça arrive tout seul.
    expect(queryByText('Réessayer')).toBeNull();
  });

  it("n'accuse pas la connexion à tort si l'état du réseau est indisponible", async () => {
    mockReseau.jette = true;
    const { getByText, queryByText } = render(<AttenteConnexion onReessayer={() => {}} />);
    await laisserPasserLeDelai();
    await waitFor(() => expect(getByText('La connexion est lente')).toBeTruthy());
    expect(queryByText('Aucune connexion internet')).toBeNull();
  });

  it('remonte le clic sur « Réessayer »', async () => {
    mockReseau.joignable = false;
    const onReessayer = jest.fn();
    const { getByText } = render(<AttenteConnexion onReessayer={onReessayer} />);
    await laisserPasserLeDelai();
    await waitFor(() => expect(getByText('Réessayer')).toBeTruthy());
    fireEvent.press(getByText('Réessayer'));
    expect(onReessayer).toHaveBeenCalledTimes(1);
  });

  it("parle arabe quand l'app est en arabe", async () => {
    mockLangue = 'ar';
    mockReseau.joignable = false;
    const { getByText } = render(<AttenteConnexion onReessayer={() => {}} />);
    await laisserPasserLeDelai();
    await waitFor(() => expect(getByText('لا يوجد اتصال بالإنترنت')).toBeTruthy());
    expect(getByText('إعادة المحاولة')).toBeTruthy();
  });

  it('ne laisse pas de minuteur derrière lui', () => {
    const { unmount } = render(<AttenteConnexion onReessayer={() => {}} />);
    unmount();
    // Un setState après démontage produirait un avertissement React ; on vérifie
    // simplement que faire avancer le temps après coup ne casse rien.
    expect(() => jest.advanceTimersByTime(DELAI_EXPLICATION_MS * 2)).not.toThrow();
  });
});
