import React from 'react';
import { render } from '@testing-library/react-native';
import { Image } from 'react-native';

// Hooks de contexte mockés (sinon useTranslation throw hors provider) — on teste le
// RENDU du composant selon ses props, pas les providers.
jest.mock('../../lib/ThemeContext', () => ({ useTheme: () => ({ resolved: 'light' }) }));
jest.mock('../../lib/i18n', () => ({ langueActuelle: () => 'fr', useTranslation: () => ({ language: 'fr', isRTL: false }) }));

import PhotoStrip from '../../components/PhotoStrip';

describe('<PhotoStrip />', () => {
  it('affiche le titre FR de la catégorie food', () => {
    const { getByText } = render(<PhotoStrip category="food" />);
    expect(getByText('Inspiration')).toBeTruthy();
  });

  it('catégorie sport → titre "Bouger"', () => {
    const { getByText } = render(<PhotoStrip category="sport" />);
    expect(getByText('Bouger')).toBeTruthy();
  });

  it('showTitle=false → aucun titre rendu', () => {
    const { queryByText } = render(<PhotoStrip category="food" showTitle={false} />);
    expect(queryByText('Inspiration')).toBeNull();
  });

  it('rend bien 6 images pour la catégorie food', () => {
    const { UNSAFE_getAllByType } = render(<PhotoStrip category="food" />);
    expect(UNSAFE_getAllByType(Image).length).toBe(6);
  });

  it('catégorie inconnue → fallback sur food (6 images)', () => {
    const { UNSAFE_getAllByType } = render(<PhotoStrip category={'inconnue' as any} />);
    expect(UNSAFE_getAllByType(Image).length).toBe(6);
  });
});
