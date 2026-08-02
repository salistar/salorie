// Épingle le comportement du client IA backend (lib/aiProxy.ts).
// But : garantir que les endpoints (/ai/generate, /ai/transcribe, /ai/vision,
// /ml/vision) construisent la bonne requête (URL, méthode POST, en-têtes d'auth,
// corps JSON), renvoient le texte, propagent les erreurs, et que le shim Gemini
// route vers aiGenerate/aiVision selon l'entrée.
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
import * as aiProxy from '../lib/aiProxy';

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
describe('headers / auth (via aiGenerate)', () => {
  test('sans utilisateur connecté → pas d\'en-tête Authorization, Content-Type JSON présent', async () => {
    (global as any).fetch.mockResolvedValue(mockResponse({ text: 'hi' }));
    await aiProxy.aiGenerate('p');
    const [, init] = (global as any).fetch.mock.calls[0];
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.headers.Authorization).toBeUndefined();
  });

  test('utilisateur connecté → en-tête Authorization Bearer <token>', async () => {
    authState.currentUser = { getIdToken: jest.fn().mockResolvedValue('TOK123') };
    (global as any).fetch.mockResolvedValue(mockResponse({ text: 'hi' }));
    await aiProxy.aiGenerate('p');
    const [, init] = (global as any).fetch.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer TOK123');
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  test('getIdToken qui rejette → catch → pas d\'Authorization (la requête passe quand même)', async () => {
    authState.currentUser = { getIdToken: jest.fn().mockRejectedValue(new Error('boom')) };
    (global as any).fetch.mockResolvedValue(mockResponse({ text: 'hi' }));
    await aiProxy.aiGenerate('p');
    const [, init] = (global as any).fetch.mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
  });

  test('token vide ("") → considéré falsy → pas d\'Authorization', async () => {
    authState.currentUser = { getIdToken: jest.fn().mockResolvedValue('') };
    (global as any).fetch.mockResolvedValue(mockResponse({ text: 'hi' }));
    await aiProxy.aiGenerate('p');
    const [, init] = (global as any).fetch.mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
describe('aiGenerate', () => {
  test('URL /ai/generate, POST, corps {prompt, model}, renvoie j.text', async () => {
    (global as any).fetch.mockResolvedValue(mockResponse({ text: 'bonjour' }));
    const r = await aiProxy.aiGenerate('salut', 'gemini-pro');
    const [url, init] = (global as any).fetch.mock.calls[0];
    expect(url).toBe(`${API}/ai/generate`);
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ prompt: 'salut', model: 'gemini-pro' });
    expect(r).toBe('bonjour');
  });

  test('sans model → model undefined absent du JSON', async () => {
    (global as any).fetch.mockResolvedValue(mockResponse({ text: 'x' }));
    await aiProxy.aiGenerate('p');
    const [, init] = (global as any).fetch.mock.calls[0];
    const parsed = JSON.parse(init.body);
    expect(parsed.prompt).toBe('p');
    expect('model' in parsed).toBe(false); // undefined → omis par JSON.stringify
  });

  test('réponse sans champ text → chaîne vide', async () => {
    (global as any).fetch.mockResolvedValue(mockResponse({}));
    const r = await aiProxy.aiGenerate('p');
    expect(r).toBe('');
  });

  test('text non-string → coercé via String()', async () => {
    (global as any).fetch.mockResolvedValue(mockResponse({ text: 42 }));
    const r = await aiProxy.aiGenerate('p');
    expect(r).toBe('42');
  });

  test('réponse non-ok → throw avec le status', async () => {
    (global as any).fetch.mockResolvedValue(mockResponse({}, false, 500));
    await expect(aiProxy.aiGenerate('p')).rejects.toThrow('/ai/generate 500');
  });
});

// ---------------------------------------------------------------------------
describe('aiTranscribe', () => {
  test('défaut mimeType=audio/mp4, corps {audioBase64, mimeType, language}, POST', async () => {
    (global as any).fetch.mockResolvedValue(mockResponse({ text: 'transcript' }));
    const r = await aiProxy.aiTranscribe('AUDIO64');
    const [url, init] = (global as any).fetch.mock.calls[0];
    expect(url).toBe(`${API}/ai/transcribe`);
    expect(init.method).toBe('POST');
    const parsed = JSON.parse(init.body);
    expect(parsed.audioBase64).toBe('AUDIO64');
    expect(parsed.mimeType).toBe('audio/mp4');
    expect('language' in parsed).toBe(false); // language undefined → omis
    expect(r).toBe('transcript');
  });

  test('mimeType & language explicites → repris tels quels', async () => {
    (global as any).fetch.mockResolvedValue(mockResponse({ text: 't' }));
    await aiProxy.aiTranscribe('A', 'audio/wav', 'fr');
    const [, init] = (global as any).fetch.mock.calls[0];
    const parsed = JSON.parse(init.body);
    expect(parsed.mimeType).toBe('audio/wav');
    expect(parsed.language).toBe('fr');
  });

  test('avec token → Authorization présent', async () => {
    authState.currentUser = { getIdToken: jest.fn().mockResolvedValue('ABC') };
    (global as any).fetch.mockResolvedValue(mockResponse({ text: 't' }));
    await aiProxy.aiTranscribe('A');
    const [, init] = (global as any).fetch.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer ABC');
  });

  test('réponse non-ok → throw avec le status', async () => {
    (global as any).fetch.mockResolvedValue(mockResponse({}, false, 502));
    await expect(aiProxy.aiTranscribe('A')).rejects.toThrow('/ai/transcribe 502');
  });
});

// ---------------------------------------------------------------------------
describe('aiVision', () => {
  test('défaut mimeType=image/jpeg, corps {prompt, imageBase64, mimeType, model}, POST', async () => {
    (global as any).fetch.mockResolvedValue(mockResponse({ text: 'desc' }));
    const r = await aiProxy.aiVision('décris', 'IMG64');
    const [url, init] = (global as any).fetch.mock.calls[0];
    expect(url).toBe(`${API}/ai/vision`);
    expect(init.method).toBe('POST');
    const parsed = JSON.parse(init.body);
    expect(parsed.prompt).toBe('décris');
    expect(parsed.imageBase64).toBe('IMG64');
    expect(parsed.mimeType).toBe('image/jpeg');
    expect('model' in parsed).toBe(false);
    expect(r).toBe('desc');
  });

  test('mimeType & model explicites → repris tels quels', async () => {
    (global as any).fetch.mockResolvedValue(mockResponse({ text: 'd' }));
    await aiProxy.aiVision('p', 'IMG', 'image/png', 'gemini-vision');
    const [, init] = (global as any).fetch.mock.calls[0];
    const parsed = JSON.parse(init.body);
    expect(parsed.mimeType).toBe('image/png');
    expect(parsed.model).toBe('gemini-vision');
  });

  test('avec token → Authorization présent', async () => {
    authState.currentUser = { getIdToken: jest.fn().mockResolvedValue('XYZ') };
    (global as any).fetch.mockResolvedValue(mockResponse({ text: 'd' }));
    await aiProxy.aiVision('p', 'IMG');
    const [, init] = (global as any).fetch.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer XYZ');
  });

  test('réponse non-ok → throw avec le status', async () => {
    (global as any).fetch.mockResolvedValue(mockResponse({}, false, 400));
    await expect(aiProxy.aiVision('p', 'IMG')).rejects.toThrow('/ai/vision 400');
  });
});

// ---------------------------------------------------------------------------
describe('aiVisionLocal', () => {
  test('URL /ml/vision, défaut mimeType=image/jpeg, corps {prompt, imageBase64, mimeType}, POST', async () => {
    (global as any).fetch.mockResolvedValue(mockResponse({ text: 'local' }));
    const r = await aiProxy.aiVisionLocal('quoi', 'IMG64');
    const [url, init] = (global as any).fetch.mock.calls[0];
    expect(url).toBe(`${API}/ml/vision`);
    expect(init.method).toBe('POST');
    const parsed = JSON.parse(init.body);
    expect(parsed.prompt).toBe('quoi');
    expect(parsed.imageBase64).toBe('IMG64');
    expect(parsed.mimeType).toBe('image/jpeg');
    expect(r).toBe('local');
  });

  test('mimeType explicite → repris tel quel', async () => {
    (global as any).fetch.mockResolvedValue(mockResponse({ text: 'l' }));
    await aiProxy.aiVisionLocal('p', 'IMG', 'image/webp');
    const [, init] = (global as any).fetch.mock.calls[0];
    expect(JSON.parse(init.body).mimeType).toBe('image/webp');
  });

  test('avec token → Authorization présent', async () => {
    authState.currentUser = { getIdToken: jest.fn().mockResolvedValue('LOC') };
    (global as any).fetch.mockResolvedValue(mockResponse({ text: 'l' }));
    await aiProxy.aiVisionLocal('p', 'IMG');
    const [, init] = (global as any).fetch.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer LOC');
  });

  test('réponse non-ok → throw avec le status', async () => {
    (global as any).fetch.mockResolvedValue(mockResponse({}, false, 501));
    await expect(aiProxy.aiVisionLocal('p', 'IMG')).rejects.toThrow('/ml/vision 501');
  });
});

// ---------------------------------------------------------------------------
describe('geminiShim', () => {
  test('input string → route vers aiGenerate (/ai/generate), response.text() renvoie le texte', async () => {
    (global as any).fetch.mockResolvedValue(mockResponse({ text: 'gen' }));
    const m = aiProxy.geminiShim.getGenerativeModel({ model: 'gemini-pro' });
    const out = await m.generateContent('mon prompt');
    expect(out.response.text()).toBe('gen');
    const [url, init] = (global as any).fetch.mock.calls[0];
    expect(url).toBe(`${API}/ai/generate`);
    expect(JSON.parse(init.body)).toEqual({ prompt: 'mon prompt', model: 'gemini-pro' });
  });

  test('input array texte seul → join + aiGenerate', async () => {
    (global as any).fetch.mockResolvedValue(mockResponse({ text: 'joined' }));
    const m = aiProxy.geminiShim.getGenerativeModel();
    const out = await m.generateContent(['ligne1', { text: 'ligne2' }, null]);
    expect(out.response.text()).toBe('joined');
    const [url, init] = (global as any).fetch.mock.calls[0];
    expect(url).toBe(`${API}/ai/generate`);
    expect(JSON.parse(init.body).prompt).toBe('ligne1\nligne2');
  });

  test('input array avec inlineData → route vers aiVision (/ai/vision) avec data + mimeType', async () => {
    (global as any).fetch.mockResolvedValue(mockResponse({ text: 'vis' }));
    const m = aiProxy.geminiShim.getGenerativeModel({ model: 'gemini-vision' });
    const out = await m.generateContent([
      'décris ceci',
      { inlineData: { data: 'IMGDATA', mimeType: 'image/png' } },
    ]);
    expect(out.response.text()).toBe('vis');
    const [url, init] = (global as any).fetch.mock.calls[0];
    expect(url).toBe(`${API}/ai/vision`);
    expect(JSON.parse(init.body)).toEqual({
      prompt: 'décris ceci',
      imageBase64: 'IMGDATA',
      mimeType: 'image/png',
      model: 'gemini-vision',
    });
  });

  test('inlineData sans mimeType → défaut image/jpeg', async () => {
    (global as any).fetch.mockResolvedValue(mockResponse({ text: 'v' }));
    const m = aiProxy.geminiShim.getGenerativeModel();
    await m.generateContent(['p', { inlineData: { data: 'D' } }]);
    const [url, init] = (global as any).fetch.mock.calls[0];
    expect(url).toBe(`${API}/ai/vision`);
    expect(JSON.parse(init.body).mimeType).toBe('image/jpeg');
  });

  test('input ni string ni array (objet) → String(input) via aiGenerate', async () => {
    (global as any).fetch.mockResolvedValue(mockResponse({ text: 'o' }));
    const m = aiProxy.geminiShim.getGenerativeModel();
    await m.generateContent({ foo: 'bar' } as any);
    const [url, init] = (global as any).fetch.mock.calls[0];
    expect(url).toBe(`${API}/ai/generate`);
    expect(JSON.parse(init.body).prompt).toBe(String({ foo: 'bar' }));
  });

  test('input null/undefined → String(input ?? "") → prompt vide', async () => {
    (global as any).fetch.mockResolvedValue(mockResponse({ text: '' }));
    const m = aiProxy.geminiShim.getGenerativeModel();
    await m.generateContent(null);
    const [, init] = (global as any).fetch.mock.calls[0];
    expect(JSON.parse(init.body).prompt).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Branche « API_URL non configuré » : nécessite de RECHARGER le module avec
// EXPO_PUBLIC_API_URL vide, car la const est figée à l'import.
describe('API_URL non configuré → erreur immédiate', () => {
  let unconfigured: typeof aiProxy;

  beforeEach(() => {
    jest.resetModules();
    const prev = process.env.EXPO_PUBLIC_API_URL;
    process.env.EXPO_PUBLIC_API_URL = '';
    jest.isolateModules(() => {
      jest.doMock('../lib/firebaseAuth', () => ({ auth: authState }));
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      unconfigured = require('../lib/aiProxy');
    });
    process.env.EXPO_PUBLIC_API_URL = prev; // restaurer pour les autres suites
  });

  test('aiGenerate → throw "not configured"', async () => {
    await expect(unconfigured.aiGenerate('p')).rejects.toThrow('EXPO_PUBLIC_API_URL not configured');
  });

  test('aiTranscribe → throw "not configured"', async () => {
    await expect(unconfigured.aiTranscribe('A')).rejects.toThrow('EXPO_PUBLIC_API_URL not configured');
  });

  test('aiVision → throw "not configured"', async () => {
    await expect(unconfigured.aiVision('p', 'IMG')).rejects.toThrow('EXPO_PUBLIC_API_URL not configured');
  });

  test('aiVisionLocal → throw "not configured"', async () => {
    await expect(unconfigured.aiVisionLocal('p', 'IMG')).rejects.toThrow('EXPO_PUBLIC_API_URL not configured');
  });

  test('aucune requête réseau émise quand non configuré', async () => {
    (global as any).fetch = jest.fn();
    await expect(unconfigured.aiGenerate('p')).rejects.toThrow();
    expect((global as any).fetch).not.toHaveBeenCalled();
  });
});

// EXPO_PUBLIC_API_URL est .trim()'é : valeur avec espaces → conserve le contenu utile.
describe('API_URL est trimé au chargement', () => {
  test('espaces autour de l\'URL retirés', async () => {
    jest.resetModules();
    const prev = process.env.EXPO_PUBLIC_API_URL;
    process.env.EXPO_PUBLIC_API_URL = `  ${API}  `;
    let trimmed: typeof aiProxy;
    jest.isolateModules(() => {
      jest.doMock('../lib/firebaseAuth', () => ({ auth: authState }));
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      trimmed = require('../lib/aiProxy');
    });
    (global as any).fetch = jest.fn().mockResolvedValue(mockResponse({ text: 'x' }));
    await trimmed!.aiGenerate('p');
    const [url] = (global as any).fetch.mock.calls[0];
    expect(url).toBe(`${API}/ai/generate`); // pas d'espaces dans l'URL
    process.env.EXPO_PUBLIC_API_URL = prev;
  });
});
