/**
 * Les modules métier de l'écran Défi — le plus gros trou de couverture.
 * ---------------------------------------------------------------------------
 * `app/(app)/challenge.tsx` fait 1 229 lignes, importe neuf modules métier, et
 * n'avait **aucun test** — c'est le pire cas relevé par l'audit du 10/09/2026.
 * Aucun de ses sept modules de calcul n'était couvert non plus.
 *
 * On ne teste pas l'écran : c'est du rendu, et un test de rendu dirait surtout
 * que le rendu n'a pas changé. On teste ce qui CALCULE, parce qu'un calcul faux
 * ne se voit pas — il produit un itinéraire tronqué, un nombre de pas plausible
 * mais faux, une météo d'il y a trois heures.
 */
// ⚠ LES DOUBLES VIENNENT AVANT LES IMPORTS, ET C'EST OBLIGATOIRE ICI.
// `lib/routes` importe `lib/firebaseAuth`, qui appelle `initializeApp` AU
// CHARGEMENT DU MODULE. Sans ces doubles, la suite ne demarre meme pas :
// « No Firebase App '[DEFAULT]' has been created ». Jest remonte les
// `jest.mock` au-dessus des imports, mais seulement ceux qu'on ecrit.
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined),
}));
jest.mock('firebase/firestore', () => ({
  doc: jest.fn(), getDoc: jest.fn(), setDoc: jest.fn(), collection: jest.fn(),
  query: jest.fn(), where: jest.fn(), getDocs: jest.fn(async () => ({ forEach: () => {} })),
}));
jest.mock('../lib/firebase', () => ({ db: {}, emailToDocId: (e: string) => e }));
jest.mock('../lib/firebaseAuth', () => ({ auth: {}, jetonFirebase: async () => null }));
// `lib/steps` lit les fichiers partages avec le service natif de podometre.
// Le paquet est publie en ESM et Jest ne le transforme pas : sans ce double,
// la suite echoue sur « Unexpected token 'export' » avant le premier test.
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: '/tmp/', readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => undefined),
  getInfoAsync: jest.fn(async () => ({ exists: false })),
}));

import { limiterEtapes, type LatLng } from '../lib/routes';
import { kmToSteps, stepsDay, STEPS_PER_KM } from '../lib/steps';
import { getWeather } from '../lib/weather';

const pts = (n: number): LatLng[] =>
  Array.from({ length: n }, (_, i) => ({ lat: i, lng: i * 2 }));

describe('limiterEtapes — l API refuse au-dela de 25 points', () => {
  it('ne touche pas a un trajet deja assez court', () => {
    const p = pts(10);
    expect(limiterEtapes(p)).toBe(p);
    expect(limiterEtapes(pts(25))).toHaveLength(25);
  });

  it('ramene un long trajet a la limite exacte', () => {
    expect(limiterEtapes(pts(300))).toHaveLength(25);
    expect(limiterEtapes(pts(300), 10)).toHaveLength(10);
  });

  it('⚠ GARDE TOUJOURS LES DEUX EXTREMITES', () => {
    // C'est LE point. Un `slice(0, 25)` couperait la fin : l'itineraire
    // s'arreterait au milieu du parcours, et l'ecran afficherait un trace
    // parfaitement credible qui ne mene nulle part.
    for (const n of [26, 51, 300, 1001]) {
      const p = pts(n);
      const r = limiterEtapes(p);
      expect(r[0]).toEqual(p[0]);
      expect(r[r.length - 1]).toEqual(p[n - 1]);
    }
  });

  it('echantillonne regulierement, sans revenir en arriere', () => {
    // Des points dans le desordre feraient serpenter l'itineraire.
    const r = limiterEtapes(pts(300));
    const lats = r.map((x) => x.lat);
    expect(lats).toEqual([...lats].sort((a, b) => a - b));
    expect(new Set(lats).size).toBe(lats.length);
  });

  it('cas limites : liste vide, un seul point', () => {
    expect(limiterEtapes([])).toEqual([]);
    const un = [{ lat: 1, lng: 2 }];
    expect(limiterEtapes(un)).toEqual(un);
  });
});

describe('kmToSteps — la conversion distance vers pas', () => {
  it('applique la foulee annoncee', () => {
    expect(kmToSteps(1)).toBe(STEPS_PER_KM);
    expect(kmToSteps(5)).toBe(Math.round(5 * STEPS_PER_KM));
  });

  it('ne rend JAMAIS un nombre negatif', () => {
    // Une distance negative viendrait d'un GPS qui recule ; afficher « -430 pas »
    // dans un defi casserait le classement en silence.
    expect(kmToSteps(-3)).toBe(0);
    expect(kmToSteps(0)).toBe(0);
  });

  it('une valeur absente vaut zero, pas NaN', () => {
    // `NaN` se propagerait dans le total du jour sans lever d'erreur.
    expect(kmToSteps(undefined as any)).toBe(0);
    expect(kmToSteps(null as any)).toBe(0);
    expect(Number.isNaN(kmToSteps('x' as any))).toBe(false);
  });
});

describe('stepsDay — la cle du jour', () => {
  it('rend une date locale au format ISO court', () => {
    expect(stepsDay(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(stepsDay(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('⚠ suit le fuseau LOCAL, pas UTC', () => {
    // `toISOString()` aurait bascule au lendemain des 23 h a Casablanca en ete :
    // les pas du soir auraient ete comptes sur le jour suivant, et la serie
    // cassee pour tout le monde a la meme heure.
    const soir = new Date(2026, 5, 15, 23, 30);
    expect(stepsDay(soir)).toBe('2026-06-15');
  });

  it('remplit les zeros', () => {
    expect(stepsDay(new Date(2026, 2, 7))).toBe('2026-03-07');
  });
});

describe('getWeather — le cache evite de marteler le reseau', () => {
  const reponse = {
    current: { temperature_2m: 21.4, weather_code: 0, wind_speed_10m: 12 },
  };

  beforeEach(() => {
    (global as any).fetch = jest.fn(async () => ({ json: async () => reponse }));
  });

  it('rend la meteo et son libelle', async () => {
    const m = await getWeather(33.59, -7.61);
    // Le module ARRONDIT : un badge meteo n'affiche pas de decimale.
    expect(m).toMatchObject({ tempC: 21, code: 0, wind: 12 });
    expect(m!.label).toContain('Clear');
  });

  it('deux points a moins d un kilometre partagent le cache', async () => {
    // La cle est arrondie a deux decimales : les waypoints d'une meme course
    // sont proches, et sans ce partage l'ecran declencherait une requete par
    // point a chaque rendu.
    await getWeather(31.111, 2.222);
    const avant = (global as any).fetch.mock.calls.length;
    await getWeather(31.1112, 2.2223);
    expect((global as any).fetch.mock.calls.length).toBe(avant);
  });

  it('des coordonnees invalides ne partent pas sur le reseau', async () => {
    (global as any).fetch.mockClear();
    expect(await getWeather(NaN, 3)).toBeNull();
    expect(await getWeather(1, undefined as any)).toBeNull();
    expect((global as any).fetch).not.toHaveBeenCalled();
  });

  it('une reponse sans temperature rend null au lieu de jeter', async () => {
    (global as any).fetch = jest.fn(async () => ({ json: async () => ({ current: {} }) }));
    expect(await getWeather(48.85, 2.35)).toBeNull();
  });

  it('le reseau qui tombe ne fait pas planter l ecran', async () => {
    // La meteo est un badge decoratif : sa perte ne doit pas emporter le defi.
    (global as any).fetch = jest.fn(async () => { throw new Error('hors ligne'); });
    await expect(getWeather(12.34, 56.78)).resolves.toBeNull();
  });
});
