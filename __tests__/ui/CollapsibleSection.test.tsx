import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('../../lib/ThemeContext', () => ({ useTheme: () => ({ resolved: 'light' }) }));
jest.mock('lucide-react-native', () => ({
  ChevronDown: () => null,
  ChevronRight: () => null,
}));

import CollapsibleSection from '../../components/CollapsibleSection';

describe('<CollapsibleSection />', () => {
  it('affiche le titre et cache le contenu par défaut (fermé)', () => {
    const { getByText, queryByText } = render(
      <CollapsibleSection title="Détails">
        <Text>Contenu secret</Text>
      </CollapsibleSection>
    );
    expect(getByText('Détails')).toBeTruthy();
    expect(queryByText('Contenu secret')).toBeNull();
  });

  it('affiche le contenu quand defaultOpen', () => {
    const { getByText } = render(
      <CollapsibleSection title="Détails" defaultOpen>
        <Text>Contenu secret</Text>
      </CollapsibleSection>
    );
    expect(getByText('Détails')).toBeTruthy();
    expect(getByText('Contenu secret')).toBeTruthy();
  });

  it('bascule ouvert/fermé via press sur l’en-tête', () => {
    const { getByText, queryByText } = render(
      <CollapsibleSection title="Détails">
        <Text>Contenu secret</Text>
      </CollapsibleSection>
    );
    // fermé au départ
    expect(queryByText('Contenu secret')).toBeNull();
    // ouvre
    fireEvent.press(getByText('Détails'));
    expect(getByText('Contenu secret')).toBeTruthy();
    // referme
    fireEvent.press(getByText('Détails'));
    expect(queryByText('Contenu secret')).toBeNull();
  });
});
