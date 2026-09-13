/**
 * La progression de course hors ligne : ne rien perdre, ne rien inventer.
 * ---------------------------------------------------------------------------
 * `lib/racesApi.ts` parle au backend Mongo (courses virtuelles, médailles,
 * organisations). Son cœur est `raceProgress` : quand le réseau tombe pendant
 * une course — ce qui est le cas normal, pas le cas rare, puisqu'on court
 * dehors — les kilomètres doivent attendre en file et repartir au retour.
 *
 * ⚠ LA FILE GARDE LE MAXIMUM, PAS LA SOMME, et c'est la décision centrale du
 * module : l'écran envoie un CUMUL. Additionner deux cumuls successifs
 * doublerait la distance ; garder le plus grand la conserve exactement.
 *
 * Écrans concernés : `/races` (627 lignes) et `/medals` (153).
 */
const magasin = new Map<string, string>();
let stockageCasse = false;

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => {
    if (stockageCasse) throw new Error('stockage indisponible');
    return magasin.has(k) ? magasin.get(k)! : null;
  }),
  setItem: jest.fn(async (k: string, v: string) => {
    if (stockageCasse) throw new Error('stockage indisponible');
    magasin.set(k, v);
  }),
}));

let jeton: string | null = 'jeton';
jest.mock('../lib/firebaseAuth', () => ({
  auth: { get currentUser() { return { getIdToken: async () => jeton }; } },
}));

const appels: Array<{ url: string; init: any }> = [];
let reseauCoupe = false;

const CLE = 'pending_race_progress_v1';

/** Recharge le module avec l'URL d'API voulue (lue AU CHARGEMENT). */
function charger(api = 'https://api.salorie.test') {
  jest.resetModules();
  process.env.EXPO_PUBLIC_API_URL = api;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../lib/racesApi');
}

const file = () => JSON.parse(magasin.get(CLE) || '{}');

beforeEach(() => {
  magasin.clear();
  appels.length = 0;
  reseauCoupe = false;
  stockageCasse = false;
  jeton = 'jeton';
  (global as any).fetch = jest.fn(async (url: string, init: any) => {
    if (reseauCoupe) throw new Error('hors ligne');
    appels.push({ url, init });
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  });
});

describe('authFetch — la forme des appels', () => {
  it('joint le jeton Firebase a chaque requete', async () => {
    await charger().getActiveRaces();
    expect(appels[0].url).toBe('https://api.salorie.test/races/active');
    expect(appels[0].init.headers.Authorization).toBe('Bearer jeton');
    expect(appels[0].init.headers['Content-Type']).toBe('application/json');
  });

  it('part sans en-tete si le jeton manque', async () => {
    jeton = null;
    await charger().getActiveRaces();
    expect(appels[0].init.headers.Authorization).toBeUndefined();
  });

  it('⚠ SANS URL D API, IL JETTE AU LIEU DE FAIRE SEMBLANT', async () => {
    // Contrairement a la collecte de corrections, qui se tait, ici l'ecran DOIT
    // savoir : une course dont la progression n'est pas envoyee est une course
    // perdue pour le classement.
    await expect(charger('').getActiveRaces()).rejects.toThrow(/non configuré/);
  });

  it('une reponse en erreur devient une exception nommee', async () => {
    (global as any).fetch = jest.fn(async () => ({ ok: false, status: 403, json: async () => ({}) }));
    await expect(charger().getRaceBoard('r1')).rejects.toThrow('/races/r1/leaderboard 403');
  });

  it('les routes sont bien celles du backend', async () => {
    const api = charger();
    await api.getRace('r1');
    await api.getRaceBoard('r1');
    await api.joinRace('r1', 'Idriss');
    await api.finishRace('r1');
    await api.getMyMedals();
    await api.getNews();
    await api.getMyOrgs();
    expect(appels.map((a) => a.url.replace('https://api.salorie.test', ''))).toEqual([
      '/races/r1', '/races/r1/leaderboard', '/races/r1/join', '/races/r1/finish',
      '/races/medals/me', '/news', '/orgs/mine',
    ]);
    expect(JSON.parse(appels[2].init.body)).toEqual({ userName: 'Idriss' });
  });
});

describe('raceProgress — quand le reseau est la', () => {
  it('envoie les kilometres et ne met rien en file', async () => {
    await charger().raceProgress('r1', 5.2);
    expect(JSON.parse(appels[0].init.body)).toEqual({ km: 5.2 });
    expect(magasin.has(CLE)).toBe(false);
  });
});

describe('raceProgress — quand le reseau tombe', () => {
  it('met les kilometres en file ET previent l appelant', async () => {
    // Le `throw` est conserve apres la mise en file : l'ecran doit pouvoir
    // afficher « hors ligne », sinon l'utilisateur croit sa course enregistree.
    reseauCoupe = true;
    await expect(charger().raceProgress('r1', 5.2)).rejects.toThrow('hors ligne');
    expect(file()).toEqual({ r1: 5.2 });
  });

  it('⚠ GARDE LE MAXIMUM, PAS LA SOMME', async () => {
    // L'ecran envoie un CUMUL. Trois envois rates a 3, 5 puis 8 km doivent
    // laisser 8 en file — pas 16. C'est la difference entre une course juste et
    // un classement fausse par une simple coupure reseau.
    reseauCoupe = true;
    const api = charger();
    for (const km of [3, 5, 8]) {
      await expect(api.raceProgress('r1', km)).rejects.toThrow();
    }
    expect(file()).toEqual({ r1: 8 });
  });

  it('un cumul en retard ne fait pas reculer la file', async () => {
    // Les envois peuvent arriver dans le desordre au retablissement.
    reseauCoupe = true;
    const api = charger();
    await expect(api.raceProgress('r1', 8)).rejects.toThrow();
    await expect(api.raceProgress('r1', 6)).rejects.toThrow();
    expect(file()).toEqual({ r1: 8 });
  });

  it('chaque course a sa propre entree', async () => {
    reseauCoupe = true;
    const api = charger();
    await expect(api.raceProgress('r1', 4)).rejects.toThrow();
    await expect(api.raceProgress('r2', 9)).rejects.toThrow();
    expect(file()).toEqual({ r1: 4, r2: 9 });
  });

  it('un stockage en panne ne masque pas l erreur reseau', async () => {
    reseauCoupe = true;
    stockageCasse = true;
    await expect(charger().raceProgress('r1', 4)).rejects.toThrow('hors ligne');
  });
});

describe('flushPendingRaceProgress — le retour du reseau', () => {
  it('rejoue la file et la vide', async () => {
    magasin.set(CLE, JSON.stringify({ r1: 8, r2: 3 }));
    const n = await charger().flushPendingRaceProgress();
    expect(n).toBe(2);
    expect(file()).toEqual({});
    expect(appels.map((a) => JSON.parse(a.init.body).km).sort()).toEqual([3, 8]);
  });

  it('file vide : aucun appel', async () => {
    expect(await charger().flushPendingRaceProgress()).toBe(0);
    expect(appels).toHaveLength(0);
  });

  it('⚠ CE QUI ECHOUE RESTE EN FILE, CE QUI PASSE EN SORT', async () => {
    // Un vidage partiel est le cas normal quand le reseau revient par
    // a-coups. Tout supprimer perdrait les kilometres ; ne rien supprimer les
    // renverrait en double a chaque tentative.
    magasin.set(CLE, JSON.stringify({ r1: 8, r2: 3 }));
    (global as any).fetch = jest.fn(async (url: string, init: any) => {
      if (url.includes('/races/r2/')) throw new Error('toujours hors ligne');
      appels.push({ url, init });
      return { ok: true, status: 200, json: async () => ({}) };
    });
    const n = await charger().flushPendingRaceProgress();
    expect(n).toBe(1);
    expect(file()).toEqual({ r2: 3 });
  });

  it('une file illisible rend 0 sans jeter', async () => {
    // Mieux vaut perdre une file corrompue que faire echouer le retour en
    // ligne de toute l'application.
    magasin.set(CLE, '{pas du json');
    expect(await charger().flushPendingRaceProgress()).toBe(0);
  });

  it('un stockage en panne rend 0', async () => {
    stockageCasse = true;
    expect(await charger().flushPendingRaceProgress()).toBe(0);
  });
});
