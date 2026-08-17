import { objectifRetenu, OBJECTIF_DEFAUT } from '../lib/progression';

/**
 * L'arbitrage de l'objectif annuel.
 *
 * C'est le SEUL champ de la progression que deux appareils peuvent écrire :
 * l'XP et les kilomètres ne viennent que du téléphone, l'objectif peut se fixer
 * des deux côtés. Sans horodatage propre, le téléphone — qui se synchronise
 * bien plus souvent — ramènerait l'objectif à son ancienne valeur à chaque
 * passage, et un objectif fixé sur le web ne tiendrait jamais.
 */

describe('objectifRetenu', () => {
  it('garde le local quand il n’y a rien à distance', () => {
    const r = objectifRetenu({ objectifKm: 1500, objectifTs: 100 }, null);
    expect(r.objectifKm).toBe(1500);
    expect(r.vientDuWeb).toBe(false);
  });

  it('adopte l’objectif du web quand il est plus récent', () => {
    // Le cas qui justifie tout : on se fixe 2 000 km devant l'ordinateur, et le
    // téléphone doit s'aligner au lieu d'imposer son ancien 1 000.
    const r = objectifRetenu({ objectifKm: 1000, objectifTs: 100 }, { objectifKm: 2000, objectifTs: 500 });
    expect(r.objectifKm).toBe(2000);
    expect(r.vientDuWeb).toBe(true);
  });

  it('garde le local quand c’est LUI le plus récent', () => {
    // On change d'avis depuis le téléphone après avoir réglé sur le web.
    const r = objectifRetenu({ objectifKm: 1200, objectifTs: 900 }, { objectifKm: 2000, objectifTs: 500 });
    expect(r.objectifKm).toBe(1200);
    expect(r.vientDuWeb).toBe(false);
  });

  it('à horodatage égal, ne réécrit pas le stockage du téléphone', () => {
    // Cas de loin le plus fréquent : rien n'a changé depuis la dernière
    // synchronisation. `vientDuWeb: false` évite une écriture locale inutile à
    // chaque ouverture de l'écran.
    const r = objectifRetenu({ objectifKm: 1000, objectifTs: 700 }, { objectifKm: 1000, objectifTs: 700 });
    expect(r.vientDuWeb).toBe(false);
  });

  it('ignore un objectif distant vide ou nul', () => {
    // Un document créé à moitié, ou un champ absent, ne doit pas effacer un
    // objectif valable — sinon la barre de progression tomberait à zéro.
    expect(objectifRetenu({ objectifKm: 1500, objectifTs: 1 }, { objectifKm: 0, objectifTs: 999 }).objectifKm).toBe(1500);
  });

  it('accepte un objectif distant même si le local n’a jamais été fixé', () => {
    // Un nouveau téléphone : `objectifTs` local vaut 0, tout objectif distant
    // horodaté doit gagner.
    const r = objectifRetenu({ objectifKm: OBJECTIF_DEFAUT, objectifTs: 0 }, { objectifKm: 3000, objectifTs: 1 });
    expect(r.objectifKm).toBe(3000);
    expect(r.vientDuWeb).toBe(true);
  });
});
