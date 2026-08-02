import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('../../lib/ThemeContext', () => ({ useTheme: () => ({ resolved: 'light' }) }));
jest.mock('../../lib/i18n', () => ({ useTranslation: () => ({ language: 'fr', isRTL: false }) }));
jest.mock('lucide-react-native', () => ({ Heart: () => null }));

let mockNutrition: any = {
  goals: { calories: 2000, protein: 150, water: 2000 },
  consumed: { calories: 2000, protein: 150, water: 2000 },
};
jest.mock('../../hooks/useNutritionData', () => ({ useNutritionData: () => mockNutrition }));

import DailyHealthScore from '../../components/DailyHealthScore';

describe('<DailyHealthScore />', () => {
  it('affiche caption + 3 labels macro (FR) sans crash', () => {
    mockNutrition = {
      goals: { calories: 2000, protein: 150, water: 2000 },
      consumed: { calories: 2000, protein: 150, water: 2000 },
    };
    const { getByText } = render(<DailyHealthScore />);
    expect(getByText('Score santé du jour')).toBeTruthy();
    expect(getByText('Calories')).toBeTruthy();
    expect(getByText('Protéines')).toBeTruthy();
    expect(getByText('Hydratation')).toBeTruthy();
  });

  it('score=100 + label Excellent quand tout est atteint', () => {
    // calScore=1, protScore=1, waterScore=1 => round((0.4+0.3+0.3)*100)=100
    mockNutrition = {
      goals: { calories: 2000, protein: 150, water: 2000 },
      consumed: { calories: 2000, protein: 150, water: 2000 },
    };
    const { getByText } = render(<DailyHealthScore />);
    expect(getByText('100')).toBeTruthy();
    expect(getByText('Excellent')).toBeTruthy();
  });

  it('score=0 + label "À démarrer" quand rien de consommé', () => {
    // tous scores=0 => score=0 (<30) => tx.start
    mockNutrition = {
      goals: { calories: 2000, protein: 150, water: 2000 },
      consumed: { calories: 0, protein: 0, water: 0 },
    };
    const { getByText } = render(<DailyHealthScore />);
    expect(getByText('0')).toBeTruthy();
    expect(getByText('À démarrer')).toBeTruthy();
  });

  it('label "Bien" pour un score intermédiaire (>=55)', () => {
    // calScore=1(0.4), protScore=0.5(0.15), waterScore=0.5(0.15) => 0.70*100=70 => Bien
    mockNutrition = {
      goals: { calories: 2000, protein: 150, water: 2000 },
      consumed: { calories: 2000, protein: 75, water: 1000 },
    };
    const { getByText } = render(<DailyHealthScore />);
    expect(getByText('70')).toBeTruthy();
    expect(getByText('Bien')).toBeTruthy();
  });

  it('label "En cours" pour un score bas (>=30)', () => {
    // calScore=1(0.4), prot=0, water=0 => 40 => "En cours" (ongoing)
    mockNutrition = {
      goals: { calories: 2000, protein: 150, water: 2000 },
      consumed: { calories: 2000, protein: 0, water: 0 },
    };
    const { getByText } = render(<DailyHealthScore />);
    expect(getByText('40')).toBeTruthy();
    expect(getByText('En cours')).toBeTruthy();
  });

  it('utilise les valeurs par défaut quand useNutritionData renvoie null', () => {
    mockNutrition = null;
    const { getByText } = render(<DailyHealthScore />);
    // defaults: consumed all 0 => score 0 => "À démarrer"
    expect(getByText('0')).toBeTruthy();
    expect(getByText('À démarrer')).toBeTruthy();
  });
});
