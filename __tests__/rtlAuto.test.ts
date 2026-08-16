/**
 * Les deux aides RTL « sans crochet » : flipAuto et directionAuto.
 *
 * Elles sont posées sur 16 modales et 16 icônes, mais ne se voient sur aucun
 * écran tant qu'on ne bascule pas l'app en arabe — un retour en arrière y
 * passerait donc inaperçu. D'où ce test.
 *
 * Elles lisent la langue dans le MIROIR hors React de lib/i18n (`langueActuelle`)
 * et non dans le contexte : c'est ce qui leur permet de vivre dans un composant
 * qui n'appelle pas `useTranslation`. On simule donc ce miroir.
 */

const miroir = { valeur: 'fr' as string, casse: false };
jest.mock('../lib/i18n', () => ({
  langueActuelle: () => {
    if (miroir.casse) throw new Error('miroir i18n indisponible');
    return miroir.valeur;
  },
}));

afterEach(() => {
  miroir.casse = false;
});

import { flipAuto, directionAuto, flipForRTL, rowDir, txtAlign } from '../lib/rtl';

describe('flipAuto — miroir des icônes de lecture', () => {
  it('retourne les icônes en arabe', () => {
    miroir.valeur = 'ar';
    expect(flipAuto()).toEqual({ transform: [{ scaleX: -1 }] });
  });

  it('ne touche à rien en français ni en anglais', () => {
    miroir.valeur = 'fr';
    expect(flipAuto()).toBeUndefined();
    miroir.valeur = 'en';
    expect(flipAuto()).toBeUndefined();
  });
});

describe('directionAuto — sens de lecture des modales', () => {
  it('donne rtl en arabe', () => {
    miroir.valeur = 'ar';
    expect(directionAuto()).toEqual({ direction: 'rtl' });
  });

  it('donne ltr autrement', () => {
    miroir.valeur = 'fr';
    expect(directionAuto()).toEqual({ direction: 'ltr' });
  });

  it("s'ajoute au style de base au lieu de le remplacer", () => {
    // Il est posé en SECOND dans `style={[styles.overlay, directionAuto()]}`.
    // React Native aplatit un tel tableau comme un Object.assign de la gauche
    // vers la droite : le fond et le flex de la modale doivent survivre.
    miroir.valeur = 'ar';
    const aplati = Object.assign({}, { flex: 1, backgroundColor: '#000' }, directionAuto());
    expect(aplati).toEqual({ flex: 1, backgroundColor: '#000', direction: 'rtl' });
  });
});

describe('ne jamais jeter quand le miroir est indisponible', () => {
  it('rend un style neutre plutôt que de casser le rendu', () => {
    // Un composant monté avant le fournisseur i18n, ou un test qui ne simule pas
    // le module : mieux vaut une modale à l'endroit qu'un écran blanc.
    miroir.casse = true;
    expect(flipAuto()).toBeUndefined();
    expect(directionAuto()).toBeUndefined();
  });
});

describe('les aides à crochet restent intactes', () => {
  it('flipForRTL, rowDir et txtAlign suivent leur argument, pas la langue', () => {
    miroir.valeur = 'fr'; // volontairement contraire à l'argument
    expect(flipForRTL(true)).toEqual({ transform: [{ scaleX: -1 }] });
    expect(rowDir(true)).toBe('row-reverse');
    expect(txtAlign(true)).toBe('right');
  });
});
