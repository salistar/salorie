import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

// Theme: clair par défaut (le composant lit `resolved`).
let mockResolved = 'light';
jest.mock('../../lib/ThemeContext', () => ({ useTheme: () => ({ resolved: mockResolved }) }));

// i18n: `t` mappe les clés vers des libellés stables pour des assertions déterministes.
const mockT = (key: string) => {
  const dict: Record<string, string> = {
    'home.water': 'Eau',
    'home.ml_left': ' ml restants',
  };
  return dict[key] ?? key;
};
jest.mock('../../lib/i18n', () => ({ useTranslation: () => ({ t: mockT, language: 'fr', isRTL: false }) }));

// Icône lucide → composant nul (toute var d'une factory jest.mock doit commencer par 'mock').
jest.mock('lucide-react-native', () => ({ Pencil: () => null }));

import WaterIntakeCard from '../../components/WaterIntakeCard';

describe('<WaterIntakeCard />', () => {
  beforeEach(() => {
    mockResolved = 'light';
  });

  it('rend le titre et le restant par défaut (0 consommé, objectif 2000)', () => {
    const { getByText } = render(<WaterIntakeCard />);
    expect(getByText('Eau')).toBeTruthy();
    // remainingMl = max(0, 2000 - 0) = 2000
    expect(getByText('2000 ml restants')).toBeTruthy();
  });

  it('calcule le restant = objectif - consommé', () => {
    const { getByText } = render(<WaterIntakeCard consumedMl={500} goalMl={2000} />);
    // remainingMl = 2000 - 500 = 1500
    expect(getByText('1500 ml restants')).toBeTruthy();
  });

  it('arrondit le restant et ne descend jamais sous 0 (consommé > objectif)', () => {
    const { getByText } = render(<WaterIntakeCard consumedMl={2500} goalMl={2000} />);
    // remainingMl = max(0, 2000 - 2500) = 0
    expect(getByText('0 ml restants')).toBeTruthy();
  });

  it('arrondit les valeurs fractionnaires du restant', () => {
    const { getByText } = render(<WaterIntakeCard consumedMl={123.6} goalMl={2000} />);
    // remainingMl = 2000 - 123.6 = 1876.4 → Math.round = 1876
    expect(getByText('1876 ml restants')).toBeTruthy();
  });

  it('appelle onEditPress au tap sur le bouton crayon', () => {
    const onEditPress = jest.fn();
    const { UNSAFE_getByType } = render(<WaterIntakeCard onEditPress={onEditPress} />);
    const { TouchableOpacity } = require('react-native');
    fireEvent.press(UNSAFE_getByType(TouchableOpacity));
    expect(onEditPress).toHaveBeenCalledTimes(1);
  });

  it('rend les 9 verres (images)', () => {
    const { UNSAFE_getAllByType } = render(<WaterIntakeCard consumedMl={1000} goalMl={2000} />);
    const { Image } = require('react-native');
    expect(UNSAFE_getAllByType(Image)).toHaveLength(9);
  });

  it('ne crash pas en thème sombre', () => {
    mockResolved = 'dark';
    const { getByText } = render(<WaterIntakeCard consumedMl={250} goalMl={2000} />);
    expect(getByText('Eau')).toBeTruthy();
    expect(getByText('1750 ml restants')).toBeTruthy();
  });
});
