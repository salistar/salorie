/**
 * La collecte de corrections : une photo de repas qui quitte le téléphone.
 * ---------------------------------------------------------------------------
 * `lib/mlFeedback.ts` envoie au serveur l'image d'un scan corrigé, pour
 * reconstituer un jeu de données réel et ré-entraîner le modèle embarqué.
 * C'est le module dont une erreur coûte le plus cher dans les deux sens :
 *
 *   - un envoi qui part SANS consentement, et c'est la photo du dîner de
 *     quelqu'un qui se retrouve sur un serveur qu'il n'a pas autorisé ;
 *   - un envoi qui ne part JAMAIS, et le pipeline reste vide — ce qu'il est :
 *     7 enregistrements, 0 correction au 09/09/2026, alors que le code marche.
 *
 * Aucun des deux ne lève d'erreur. Le module est « fire-and-forget » par
 * conception : il n'embête jamais l'utilisateur, donc il ne dit jamais rien.
 *
 * ⚠ LE PORTAIL DE CONSENTEMENT EST LA PREMIÈRE CHOSE TESTÉE ICI, et on vérifie
 * qu'il ferme AVANT le redimensionnement de l'image, pas seulement avant
 * l'envoi. Sans consentement, la photo ne doit même pas être lue.
 *
 * Écran concerné : `/log-food-details` (591 lignes).
 */
const manipule: any[] = [];
let manipulationCasse = false;
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  manipulateAsync: jest.fn(async (uri: string, actions: any[], opts: any) => {
    if (manipulationCasse) throw new Error('image illisible');
    manipule.push({ uri, actions, opts });
    return { base64: 'AAAA', width: 384, height: 384, uri };
  }),
}));

let jeton: string | null = 'jeton-valide';
let jetonCasse = false;
jest.mock('../lib/firebaseAuth', () => ({
  auth: {
    get currentUser() {
      return {
        getIdToken: async () => {
          if (jetonCasse) throw new Error('jeton indisponible');
          return jeton;
        },
      };
    },
  },
}));

let consentement = true;
jest.mock('../lib/alConsent', () => ({
  getMLConsent: jest.fn(async () => consentement),
}));

const appels: Array<{ url: string; init: any }> = [];

/** Recharge le module avec l'URL d'API voulue (elle est lue AU CHARGEMENT). */
function charger(apiUrl = 'https://api.salorie.test') {
  jest.resetModules();
  process.env.EXPO_PUBLIC_API_URL = apiUrl;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../lib/mlFeedback').submitScanFeedback as
    (p: any) => Promise<void>;
}

const CORRECTION = {
  imageUri: 'file:///photo.jpg',
  predicted: 'tajine',
  predictedScore: 0.42,
  finalName: 'rfissa',
  tier: 'device' as const,
  userEdited: true,
  language: 'fr',
};

/** Le corps JSON envoyé au serveur lors du dernier appel. */
const corps = () => JSON.parse(appels[appels.length - 1].init.body);

beforeEach(() => {
  appels.length = 0;
  manipule.length = 0;
  consentement = true;
  jeton = 'jeton-valide';
  jetonCasse = false;
  manipulationCasse = false;
  (global as any).fetch = jest.fn(async (url: string, init: any) => {
    appels.push({ url, init });
    return { ok: true, status: 200 };
  });
});

describe('⚠ le portail de consentement', () => {
  it('SANS consentement, rien ne part — ET LA PHOTO N EST MEME PAS LUE', async () => {
    // L'ordre compte : le controle est fait AVANT `manipulateAsync`. Lire et
    // redimensionner l'image d'abord serait deja un traitement de donnee
    // personnelle, meme si l'envoi n'a pas lieu.
    consentement = false;
    await charger()(CORRECTION);
    expect(appels).toHaveLength(0);
    expect(manipule).toHaveLength(0);
  });

  it('AVEC consentement, la correction part', async () => {
    await charger()(CORRECTION);
    expect(appels).toHaveLength(1);
    expect(appels[0].url).toBe('https://api.salorie.test/ml/feedback');
    expect(appels[0].init.method).toBe('POST');
  });
});

describe('ce qui empeche un envoi, en amont du consentement', () => {
  it('pas d URL d API configuree : rien, et pas de consultation du consentement', async () => {
    const { getMLConsent } = require('../lib/alConsent');
    (getMLConsent as jest.Mock).mockClear();
    await charger('')(CORRECTION);
    expect(appels).toHaveLength(0);
    expect(manipule).toHaveLength(0);
  });

  it('pas d image, ou pas de nom final : rien', async () => {
    const envoyer = charger();
    await envoyer({ ...CORRECTION, imageUri: '' });
    await envoyer({ ...CORRECTION, finalName: '' });
    await envoyer({ ...CORRECTION, finalName: undefined });
    expect(appels).toHaveLength(0);
  });
});

describe('l image envoyee', () => {
  it('est reduite a 384 px, en JPEG compresse', async () => {
    await charger()(CORRECTION);
    expect(manipule[0].actions).toEqual([{ resize: { width: 384 } }]);
    expect(manipule[0].opts).toMatchObject({ base64: true, compress: 0.6, format: 'jpeg' });
  });

  it('⚠ 384 ET NON 288 : la marge est deliberate', () => {
    // L'entree du modele fait 288 px. Collecter a 288 ferait perdre toute marge
    // et rendrait impossible un re-entrainement a une resolution superieure
    // sans TOUT re-collecter. Le jour ou quelqu'un « optimise » ce chiffre vers
    // le bas, ce test le retiendra.
    return charger()(CORRECTION).then(() => {
      expect(manipule[0].actions[0].resize.width).toBeGreaterThan(288);
    });
  });

  it('part en base64 avec son type declare', async () => {
    await charger()(CORRECTION);
    expect(corps().imageBase64).toBe('AAAA');
    expect(corps().mimeType).toBe('image/jpeg');
  });
});

describe('le corps de la correction', () => {
  it('porte la prediction, le label retenu, le palier et la langue', async () => {
    await charger()(CORRECTION);
    expect(corps()).toMatchObject({
      predicted: 'tajine',
      predictedScore: 0.42,
      finalName: 'rfissa',
      tier: 'device',
      userEdited: true,
      language: 'fr',
    });
  });

  it('⚠ PORTE LA VERSION DU MODELE, SANS QUOI LA COLLECTE EST INEXPLOITABLE', async () => {
    // Sans provenance, on ne sait plus quelle version s'est trompee sur quelle
    // photo — donc plus mesurer si la suivante a corrige le defaut. C'est la
    // difference entre un jeu de donnees et un tas d'images.
    await charger()(CORRECTION);
    expect(corps().modelVersion).toBe('food_salorie_v6_288px');
  });

  it('une version passee par l appelant l emporte', async () => {
    await charger()({ ...CORRECTION, modelVersion: 'food_salorie_v7_320px' });
    expect(corps().modelVersion).toBe('food_salorie_v7_320px');
  });

  it('une prediction absente vaut null, pas « undefined »', async () => {
    // `undefined` disparait de JSON.stringify : le serveur recevrait un champ
    // manquant au lieu d'un « le modele n a rien propose », deux choses
    // differentes pour qui analyse le jeu ensuite.
    await charger()({ ...CORRECTION, predicted: undefined, predictedScore: undefined });
    expect(corps().predicted).toBeNull();
    expect(corps().predictedScore).toBeNull();
  });

  it('un score non numerique est ramene a null', async () => {
    await charger()({ ...CORRECTION, predictedScore: '0.9' as any });
    expect(corps().predictedScore).toBeNull();
  });

  it('⚠ `userEdited` NON BOOLEEN EST OMIS, pas mis a false', async () => {
    // C'est ce champ qui distingue une VRAIE correction d'un simple
    // enregistrement — la difference entre « 7 enregistrements » et « 0
    // correction ». L'omettre laisse le serveur decider ; le forcer a `false`
    // aurait invente une donnee.
    await charger()({ ...CORRECTION, userEdited: undefined });
    expect('userEdited' in corps()).toBe(false);
    await charger()({ ...CORRECTION, userEdited: 'oui' as any });
    expect('userEdited' in corps()).toBe(false);
    await charger()({ ...CORRECTION, userEdited: false });
    expect(corps().userEdited).toBe(false);
  });
});

describe('l authentification de l envoi', () => {
  it('joint le jeton quand il y en a un', async () => {
    await charger()(CORRECTION);
    expect(appels[0].init.headers.Authorization).toBe('Bearer jeton-valide');
  });

  it('part SANS en-tete si le jeton manque', async () => {
    // La collecte est pseudonymisee cote serveur : une correction anonyme vaut
    // mieux qu'une correction perdue.
    jeton = null;
    await charger()(CORRECTION);
    expect(appels[0].init.headers.Authorization).toBeUndefined();
    expect(appels).toHaveLength(1);
  });

  it('un jeton qui echoue ne bloque pas l envoi', async () => {
    // `.catch(() => null)` : la panne d'authentification ne doit pas emporter
    // la collecte.
    jetonCasse = true;
    await charger()(CORRECTION);
    expect(appels).toHaveLength(1);
    expect(appels[0].init.headers.Authorization).toBeUndefined();
  });
});

describe('fire-and-forget : ne jamais embeter l utilisateur', () => {
  it('un reseau qui tombe ne jette pas', async () => {
    (global as any).fetch = jest.fn(async () => { throw new Error('hors ligne'); });
    await expect(charger()(CORRECTION)).resolves.toBeUndefined();
  });

  it('une image illisible ne jette pas', async () => {
    manipulationCasse = true;
    await expect(charger()(CORRECTION)).resolves.toBeUndefined();
    expect(appels).toHaveLength(0);
  });

  it('⚠ ET C EST POURQUOI UN PIPELINE VIDE NE SE VOIT PAS', () => {
    // Aucun de ces echecs ne remonte : ni a l'ecran, ni dans une promesse
    // rejetee, ni dans un compteur. Le module se tait quoi qu'il arrive — ce
    // qui est le bon choix pour l'utilisateur, et la raison pour laquelle
    // « 0 correction collectee » a pu durer sans que personne ne s'en apercoive.
    // La seule facon de le savoir est de regarder cote serveur.
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'lib', 'mlFeedback.ts'), 'utf8',
    );
    expect(source).toMatch(/catch\s*\{/);
    expect(source).not.toMatch(/console\.(warn|error)/);
  });
});
