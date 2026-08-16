import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('../../lib/ThemeContext', () => ({ useTheme: () => ({ resolved: 'light' }) }));
jest.mock('../../lib/i18n', () => ({ langueActuelle: () => 'fr', useTranslation: () => ({ language: 'fr', isRTL: false }) }));
jest.mock('lucide-react-native', () => ({ Target: () => null }));

let mockNutrition: any = {
  goals: { protein: 150, carbs: 200, fat: 60, calories: 2000 },
  consumed: { protein: 75, carbs: 100, fat: 30 },
};
jest.mock('../../hooks/useNutritionData', () => ({ useNutritionData: () => mockNutrition }));

import MacroTargets from '../../components/MacroTargets';

describe('<MacroTargets />', () => {
  it('affiche titre, kcal/jour et les 3 labels macro (FR)', () => {
    const { getByText } = render(<MacroTargets />);
    expect(getByText('Macros par objectif')).toBeTruthy();
    expect(getByText('2000 kcal/j')).toBeTruthy();
    expect(getByText('Protéines')).toBeTruthy();
    expect(getByText('Glucides')).toBeTruthy();
    expect(getByText('Lipides')).toBeTruthy();
    expect(getByText(/Cibles dérivées/)).toBeTruthy();
  });

  it('cache le badge kcal quand calories=0', () => {
    mockNutrition = { goals: { protein: 0, carbs: 0, fat: 0, calories: 0 }, consumed: { protein: 0, carbs: 0, fat: 0 } };
    const { queryByText } = render(<MacroTargets />);
    expect(queryByText(/kcal\/j/)).toBeNull();
    // les labels restent affichés
    expect(queryByText('Protéines')).toBeTruthy();
  });
});
