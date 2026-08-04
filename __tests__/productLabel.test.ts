import { productLabel } from '../lib/fatsecret';

/**
 * Ce test existe parce que la recherche d'aliments affichait « Poulet Poulet » et
 * « Poulet Rôti Poulet Rôti » sur l'appareil : les fiches génériques d'Open Food Facts
 * répètent le nom du produit dans le champ marque, et le libellé était une simple
 * concaténation des deux.
 */
describe('productLabel', () => {
  it('ne répète pas la marque quand elle est identique au nom du produit', () => {
    expect(productLabel('Poulet', 'Poulet')).toBe('Poulet');
    expect(productLabel('Poulet Rôti', 'Poulet Rôti')).toBe('Poulet Rôti');
  });

  it('ignore la casse, les accents et les espaces en trop dans la comparaison', () => {
    expect(productLabel('Poulet rôti', 'POULET ROTI')).toBe('Poulet rôti');
    expect(productLabel('Poulet  rôti', 'poulet rôti')).toBe('Poulet  rôti');
  });

  it('ajoute la marque quand elle apporte une information nouvelle', () => {
    expect(productLabel('Yaourt nature', 'Danone')).toBe('Yaourt nature Danone');
  });

  it('ne garde que la première marque de la liste séparée par des virgules', () => {
    expect(productLabel('Yaourt', 'Danone,Activia')).toBe('Yaourt Danone');
  });

  it('accepte un tableau de marques, comme le renvoie la recherche', () => {
    expect(productLabel('Yaourt', ['Danone', 'Activia'])).toBe('Yaourt Danone');
  });

  it('ne duplique pas une marque déjà contenue dans le nom', () => {
    expect(productLabel('Yaourt Danone nature', 'Danone')).toBe('Yaourt Danone nature');
  });

  it('se rabat sur ce qui existe quand un champ manque', () => {
    expect(productLabel('', 'Danone')).toBe('Danone');
    expect(productLabel('Yaourt', '')).toBe('Yaourt');
    expect(productLabel(null, null, 'Code-barres 123')).toBe('Code-barres 123');
    expect(productLabel(undefined, 'Danone', 'repli')).toBe('repli Danone');
  });
});
