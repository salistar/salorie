import { macroTexte } from '../lib/macroFormat';

/**
 * Ce test existe parce que l'écran d'analyse d'un scan affichait « undefined » dans
 * les quatre cartes de macros — calories, protéines, glucides, lipides — quand la
 * cascade rendait un résultat sans valeurs nutritionnelles. Constaté sur appareil.
 */
describe('macroTexte', () => {
  it('affiche un tiret plutôt que « undefined »', () => {
    expect(macroTexte(undefined)).toBe('—');
    expect(macroTexte(null)).toBe('—');
    expect(macroTexte('')).toBe('—');
    expect(macroTexte(NaN)).toBe('—');
    expect(macroTexte('pas un nombre')).toBe('—');
  });

  it('distingue une valeur inconnue d’un vrai zéro', () => {
    expect(macroTexte(0)).toBe('0');
    expect(macroTexte(undefined)).not.toBe('0');
  });

  it('arrondit les valeurs réelles', () => {
    expect(macroTexte(412.4)).toBe('412');
    expect(macroTexte(412.6)).toBe('413');
    expect(macroTexte('37.2')).toBe('37');
  });
});
