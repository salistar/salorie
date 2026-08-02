// Épingle le comportement du client ML backend (lib/mlApi.ts).
// But : garantir que les 3 endpoints (/ml/weight-forecast, /ml/meal-reco,
// /ml/portion-estimate) construisent la bonne requête (URL, méthode, en-têtes
// d'auth, corps JSON), gèrent les défauts/branches, et propagent les erreurs.
//
// Réseau et Firebase sont MOQUÉS — jamais d'appel réel.
// API_URL est lu au CHARGEMENT du module depuis EXPO_PUBLIC_API_URL : on fixe
// donc la variable d'env AVANT d'importer, et on isole les modules pour tester
// la branche « non configuré ».

// --- Firebase Auth moqué (currentUser mutable via le handle exporté) -------
const authState: { currentUser: any } = { currentUser: null };
jest.mock('../lib/firebaseAuth', () => ({
  auth: authState,
}));

const API = 'https://api.test.local';

// Le module capture API_URL à l'import → fixer l'env d'abord, puis importer.
process.env.EXPO_PUBLIC_API_URL = API;
// eslint-disable-next-line @typescript-eslint/no-var-requires
import * as mlApi from '../lib/mlApi';

// Petit fabricant de réponse fetch.
function mockResponse(body: any, ok = true, status = 200) {
  return { ok, status, json: jest.fn().mockResolvedValue(body) } as any;
}

beforeEach(() => {
  authState.currentUser = null;
  (global as any).fetch = jest.fn();
});

afterEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
describe('headers / auth (via mlWeightForecast)', () => {
  test('sans utilisateur connecté → pas d\'en-tête Authorization, Content-Type JSON présent', async () => {
    (global as any).fetch.mockResolvedValue(mockResponse({ ok: true }));
    await mlApi.mlWeightForecast();
    const [, init] = (global as any).fetch.mock.calls[0];
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.headers.Authorization).toBeUndefined();
  });

  test('utilisateur connecté → en-tête Authorization Bearer <token>', async () => {
    authState.currentUser = { getIdToken: jest.fn().mockResolvedValue('TOK123') };
    (global as any).fetch.mockResolvedValue(mockResponse({ ok: true }));
    await mlApi.mlWeightForecast();
    const [, init] = (global as any).fetch.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer TOK123');
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  test('getIdToken qui rejette → catch → pas d\'Authorization (la requête passe quand même)', async () => {
    authState.currentUser = { getIdToken: jest.fn().mockRejectedValue(new Error('boom')) };
    (global as any).fetch.mockResolvedValue(mockResponse({ ok: true }));
    await mlApi.mlWeightForecast();
    const [, init] = (global as any).fetch.mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
  });

  test('token vide ("") → considéré falsy → pas d\'Authorization', async () => {
    authState.currentUser = { getIdToken: jest.fn().mockResolvedValue('') };
    (global as any).fetch.mockResolvedValue(mockResponse({ ok: true }));
    await mlApi.mlWeightForecast();
    const [, init] = (global as any).fetch.mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
describe('mlWeightForecast', () => {
  test('sans targetWeight → URL sans query, GET (pas de method), renvoie le JSON', async () => {
    const payload = { ok: true, count: 12, direction: 'losing' };
    (global as any).fetch.mockResolvedValue(mockResponse(payload));
    const r = await mlApi.mlWeightForecast();
    const [url, init] = (global as any).fetch.mock.calls[0];
    expect(url).toBe(`${API}/ml/weight-forecast`);
    expect(init.method).toBeUndefined(); // GET implicite
    expect(r).toEqual(payload);
  });

  test('avec targetWeight → query ?targetWeight=… encodée', async () => {
    (global as any).fetch.mockResolvedValue(mockResponse({ ok: true }));
    await mlApi.mlWeightForecast(72.5);
    const [url] = (global as any).fetch.mock.calls[0];
    expect(url).toBe(`${API}/ml/weight-forecast?targetWeight=72.5`);
  });

  test('targetWeight = 0 → 0 est != null → query présente (?targetWeight=0)', async () => {
    (global as any).fetch.mockResolvedValue(mockResponse({ ok: true }));
    await mlApi.mlWeightForecast(0);
    const [url] = (global as any).fetch.mock.calls[0];
    expect(url).toBe(`${API}/ml/weight-forecast?targetWeight=0`);
  });

  test('targetWeight = undefined → pas de query', async () => {
    (global as any).fetch.mockResolvedValue(mockResponse({ ok: true }));
    await mlApi.mlWeightForecast(undefined);
    const [url] = (global as any).fetch.mock.calls[0];
    expect(url).toBe(`${API}/ml/weight-forecast`);
  });

  test('réponse non-ok → throw avec le status', async () => {
    (global as any).fetch.mockResolvedValue(mockResponse({}, false, 503));
    await expect(mlApi.mlWeightForecast()).rejects.toThrow('/ml/weight-forecast 503');
  });
});

// ---------------------------------------------------------------------------
describe('mlMealReco', () => {
  const remaining = { kcal: 800, p: 40, c: 60, f: 20 };

  test('défauts goal=maintain & limit=5 → corps JSON correct, POST, en-têtes', async () => {
    (global as any).fetch.mockResolvedValue(mockResponse({ ok: true, goal: 'maintain', remaining, recommendations: [] }));
    const r = await mlApi.mlMealReco(remaining);
    const [url, init] = (global as any).fetch.mock.calls[0];
    expect(url).toBe(`${API}/ml/meal-reco`);
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ remaining, goal: 'maintain', limit: 5 });
    expect(r.ok).toBe(true);
  });

  test('goal & limit explicites → repris tels quels dans le corps', async () => {
    (global as any).fetch.mockResolvedValue(mockResponse({ ok: true }));
    await mlApi.mlMealReco(remaining, 'gain', 3);
    const [, init] = (global as any).fetch.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ remaining, goal: 'gain', limit: 3 });
  });

  test('goal=lose → propagé', async () => {
    (global as any).fetch.mockResolvedValue(mockResponse({ ok: true }));
    await mlApi.mlMealReco(remaining, 'lose');
    const [, init] = (global as any).fetch.mock.calls[0];
    expect(JSON.parse(init.body).goal).toBe('lose');
    expect(JSON.parse(init.body).limit).toBe(5); // défaut conservé
  });

  test('remaining à zéro → transmis tel quel', async () => {
    const zero = { kcal: 0, p: 0, c: 0, f: 0 };
    (global as any).fetch.mockResolvedValue(mockResponse({ ok: true }));
    await mlApi.mlMealReco(zero);
    const [, init] = (global as any).fetch.mock.calls[0];
    expect(JSON.parse(init.body).remaining).toEqual(zero);
  });

  test('avec token → Authorization présent sur la requête POST', async () => {
    authState.currentUser = { getIdToken: jest.fn().mockResolvedValue('ABC') };
    (global as any).fetch.mockResolvedValue(mockResponse({ ok: true }));
    await mlApi.mlMealReco(remaining);
    const [, init] = (global as any).fetch.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer ABC');
  });

  test('réponse non-ok → throw avec le status', async () => {
    (global as any).fetch.mockResolvedValue(mockResponse({}, false, 500));
    await expect(mlApi.mlMealReco(remaining)).rejects.toThrow('/ml/meal-reco 500');
  });
});

// ---------------------------------------------------------------------------
describe('mlPortionEstimate', () => {
  test('avec foodName → corps JSON {imageBase64, foodName}, POST', async () => {
    const payload = { ok: true, food: 'riz', estimatedGrams: 150, calories: 200, confidence: 0.8 };
    (global as any).fetch.mockResolvedValue(mockResponse(payload));
    const r = await mlApi.mlPortionEstimate('BASE64DATA', 'riz');
    const [url, init] = (global as any).fetch.mock.calls[0];
    expect(url).toBe(`${API}/ml/portion-estimate`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ imageBase64: 'BASE64DATA', foodName: 'riz' });
    expect(r).toEqual(payload);
  });

  test('sans foodName → foodName undefined absent du JSON', async () => {
    (global as any).fetch.mockResolvedValue(mockResponse({ ok: true }));
    await mlApi.mlPortionEstimate('IMG');
    const [, init] = (global as any).fetch.mock.calls[0];
    const parsed = JSON.parse(init.body);
    expect(parsed.imageBase64).toBe('IMG');
    expect('foodName' in parsed).toBe(false); // undefined → omis par JSON.stringify
  });

  test('imageBase64 vide → transmis (chaîne vide)', async () => {
    (global as any).fetch.mockResolvedValue(mockResponse({ ok: true }));
    await mlApi.mlPortionEstimate('');
    const [, init] = (global as any).fetch.mock.calls[0];
    expect(JSON.parse(init.body).imageBase64).toBe('');
  });

  test('avec token → Authorization présent', async () => {
    authState.currentUser = { getIdToken: jest.fn().mockResolvedValue('XYZ') };
    (global as any).fetch.mockResolvedValue(mockResponse({ ok: true }));
    await mlApi.mlPortionEstimate('IMG', 'pomme');
    const [, init] = (global as any).fetch.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer XYZ');
  });

  test('réponse non-ok → throw avec le status', async () => {
    (global as any).fetch.mockResolvedValue(mockResponse({}, false, 422));
    await expect(mlApi.mlPortionEstimate('IMG')).rejects.toThrow('/ml/portion-estimate 422');
  });
});

// ---------------------------------------------------------------------------
// Branche « API_URL non configuré » : nécessite de RECHARGER le module avec
// EXPO_PUBLIC_API_URL vide, car la const est figée à l'import.
describe('API_URL non configuré → erreur immédiate (toutes les fonctions)', () => {
  let unconfigured: typeof mlApi;

  beforeEach(() => {
    jest.resetModules();
    const prev = process.env.EXPO_PUBLIC_API_URL;
    process.env.EXPO_PUBLIC_API_URL = '';
    jest.isolateModules(() => {
      jest.doMock('../lib/firebaseAuth', () => ({ auth: authState }));
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      unconfigured = require('../lib/mlApi');
    });
    process.env.EXPO_PUBLIC_API_URL = prev; // restaurer pour les autres suites
  });

  test('mlWeightForecast → throw "not configured"', async () => {
    await expect(unconfigured.mlWeightForecast()).rejects.toThrow('EXPO_PUBLIC_API_URL not configured');
  });

  test('mlMealReco → throw "not configured"', async () => {
    await expect(unconfigured.mlMealReco({ kcal: 1, p: 1, c: 1, f: 1 })).rejects.toThrow(
      'EXPO_PUBLIC_API_URL not configured',
    );
  });

  test('mlPortionEstimate → throw "not configured"', async () => {
    await expect(unconfigured.mlPortionEstimate('IMG')).rejects.toThrow('EXPO_PUBLIC_API_URL not configured');
  });

  test('aucune requête réseau émise quand non configuré', async () => {
    (global as any).fetch = jest.fn();
    await expect(unconfigured.mlWeightForecast()).rejects.toThrow();
    expect((global as any).fetch).not.toHaveBeenCalled();
  });
});

// EXPO_PUBLIC_API_URL est .trim()'é : valeur avec espaces → conserve le contenu utile.
describe('API_URL est trimé au chargement', () => {
  test('espaces autour de l\'URL retirés', async () => {
    jest.resetModules();
    const prev = process.env.EXPO_PUBLIC_API_URL;
    process.env.EXPO_PUBLIC_API_URL = `  ${API}  `;
    let trimmed: typeof mlApi;
    jest.isolateModules(() => {
      jest.doMock('../lib/firebaseAuth', () => ({ auth: authState }));
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      trimmed = require('../lib/mlApi');
    });
    (global as any).fetch = jest.fn().mockResolvedValue(mockResponse({ ok: true }));
    await trimmed!.mlWeightForecast();
    const [url] = (global as any).fetch.mock.calls[0];
    expect(url).toBe(`${API}/ml/weight-forecast`); // pas d'espaces dans l'URL
    process.env.EXPO_PUBLIC_API_URL = prev;
  });
});
