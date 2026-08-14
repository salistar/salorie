import { verdictHalal, libelleStatut, libelleRaison, avertissementHalal } from '../lib/halal';

// Ce moteur décide de ce que quelqu'un mange ou repose. L'erreur grave n'est pas
// symétrique : déclarer halal un produit qui ne l'est pas fait manger à une personne
// ce qu'elle refuse, sur la foi de notre app. L'inverse lui fait seulement reposer un
// paquet. Les tests vérifient donc d'abord qu'on ne se trompe JAMAIS dans ce sens.
describe('verdictHalal — le sens grave : jamais de faux « bon »', () => {
  it('ne déclare rien compatible sans liste d’ingrédients', () => {
    const v = verdictHalal('', [], 'Biscuits artisanaux');
    expect(v.statut).toBe('doute');
    expect(v.raison).toBe('sans-ingredients');
  });

  it('ne déclare rien compatible sur un simple nom rassurant', () => {
    expect(verdictHalal(undefined, [], 'Poulet fermier').statut).toBe('doute');
  });

  it('signale le porc même si le produit se dit halal (étiquetage contradictoire)', () => {
    const v = verdictHalal('viande de porc, sel', ['en:halal'], 'Terrine');
    expect(v.statut).toBe('incompatible');
    expect(v.detecte.join(' ')).toContain('porc');
  });
});

describe('verdictHalal — haram', () => {
  it.each([
    ['gelatine de porc, sucre', 'porc'],
    ['jambon sec, sel', 'porc'],
    ['arome au rhum, sucre', 'alcool'],
    ['colorant E120, sirop', 'E120'],
    ['presure animale, lait', 'présure animale'],
    ['E441, eau', 'E441'],
  ])('refuse « %s »', (ingredients, attendu) => {
    const v = verdictHalal(ingredients, [], '');
    expect(v.statut).toBe('incompatible');
    expect(v.detecte.join(' ')).toContain(attendu);
  });
});

describe('verdictHalal — mashbouh (douteux, pas interdit)', () => {
  it.each([
    'gelatine, sucre, eau',
    'emulsifiant E471, farine',
    'glycerine, cacao',
    'aromes naturels, eau',
    'E920, farine de ble',
  ])('met en doute « %s »', (ingredients) => {
    const v = verdictHalal(ingredients, [], '');
    expect(v.statut).toBe('doute');
    expect(v.raison).toBe('mashbouh');
  });

  it('ne confond pas le douteux avec l’interdit', () => {
    // La gélatine SEULE est douteuse (elle existe en bovin certifié) ; « gélatine
    // de porc » est interdite. Confondre les deux ferait rejeter à tort la moitié
    // des confiseries certifiées du marché.
    expect(verdictHalal('gelatine bovine, sucre').statut).toBe('doute');
    expect(verdictHalal('gelatine de porc, sucre').statut).toBe('incompatible');
  });
});

describe('verdictHalal — compatible et certifié', () => {
  it('reconnaît une certification revendiquée', () => {
    const v = verdictHalal('poulet, sel, epices', ['en:halal', 'en:no-preservatives'], 'Nuggets');
    expect(v.statut).toBe('certifie');
  });

  it('déclare compatible une liste connue et sans problème', () => {
    const v = verdictHalal('pois chiches, huile d olive, sel, cumin', [], 'Houmous');
    expect(v.statut).toBe('compatible');
    expect(v.detecte).toHaveLength(0);
  });

  it('ne se laisse pas piéger par « sans alcool »', () => {
    // Le mot « alcool » apparaît, mais le produit s'en revendique dépourvu. Un
    // filtre naïf sur « alcool » rejetterait toutes les bières sans alcool du rayon.
    expect(verdictHalal('biere sans alcool').statut).toBe('incompatible');
    expect(verdictHalal('boisson maltee, eau, houblon, sans alcool').statut).toBe('compatible');
  });

  it('tolère les accents et la casse', () => {
    expect(verdictHalal('Gélatine de Porc, Sucre').statut).toBe('incompatible');
    expect(verdictHalal('PRÉSURE ANIMALE').statut).toBe('incompatible');
  });
});

describe('libellés', () => {
  it('parle les trois langues', () => {
    expect(libelleStatut('incompatible', 'fr')).toBe('Non halal');
    expect(libelleStatut('incompatible', 'en')).toBe('Not halal');
    expect(libelleStatut('incompatible', 'ar')).toBe('غير حلال');
  });

  it('énumère ce qui a été détecté', () => {
    const v = verdictHalal('gelatine de porc, sucre');
    expect(libelleRaison(v, 'fr')).toContain('porc');
  });

  it('accompagne toujours d’un avertissement, dans toutes les langues', () => {
    // Un verdict automatique sur une base publique incomplète ne doit jamais se
    // présenter comme une certitude religieuse.
    for (const l of ['fr', 'en', 'ar']) expect(avertissementHalal(l).length).toBeGreaterThan(20);
  });

  it('retombe sur le français pour une langue inconnue', () => {
    expect(libelleStatut('doute', 'es')).toBe(libelleStatut('doute', 'fr'));
  });
});
