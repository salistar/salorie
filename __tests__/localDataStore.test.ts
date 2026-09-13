/**
 * Le miroir local : ce que l'application montre quand le réseau n'est pas là.
 * ---------------------------------------------------------------------------
 * `lib/LocalDataStore.ts` tient dans AsyncStorage une copie des données
 * Firestore de l'utilisateur. C'est lui qui permet d'ouvrir l'application dans
 * le métro et d'y voir ses repas. Quand il se trompe, il ne se trompe pas en
 * plantant : il montre **moins** de données qu'il n'y en a, ou les montre en
 * double — deux choses qu'on attribue spontanément à l'application « qui rame »
 * plutôt qu'à un cache.
 *
 * Écrans concernés : `/log-food-details` (591 lignes), `/log-manual` (203) et
 * `/scan-camera` (375).
 */
const magasin = new Map<string, string>();
let enPanne = false;

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => {
    if (enPanne) throw new Error('stockage indisponible');
    return magasin.has(k) ? magasin.get(k)! : null;
  }),
  setItem: jest.fn(async (k: string, v: string) => {
    if (enPanne) throw new Error('stockage indisponible');
    magasin.set(k, v);
  }),
  multiRemove: jest.fn(async (cles: string[]) => {
    if (enPanne) throw new Error('stockage indisponible');
    cles.forEach((k) => magasin.delete(k));
  }),
}));

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  setNotificationHandler: jest.fn(),
}));

jest.mock('../lib/firebase', () => ({
  emailToDocId: (email: string) => (email ? String(email).trim().toLowerCase() : ''),
  fetchAllUserData: jest.fn(async () => ({})),
  getNotificationsHistory: jest.fn(async () => []),
  saveNotificationToHistory: jest.fn(async () => undefined),
  seedTestNotifications: jest.fn(async () => undefined),
}));

import {
  clearAllLocalData, getLocal, isCacheEmpty, updateLocalCollection, updateLocalProfile,
} from '../lib/LocalDataStore';

const MAIL = 'Idriss@Salistar.com';
const DOC = 'idriss@salistar.com';

beforeEach(() => {
  magasin.clear();
  enPanne = false;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('l identifiant derive du courriel', () => {
  it('⚠ LA CASSE ET LES ESPACES SONT NORMALISES', async () => {
    // `Idriss@Salistar.com` et `  idriss@salistar.com ` doivent viser LA MEME
    // cle. Sans ca, se reconnecter en tapant son adresse avec une majuscule
    // ouvrirait un cache vide — l'application aurait l'air d'avoir tout perdu.
    await updateLocalProfile(MAIL, { poids: 78 });
    expect(magasin.has(`profile_${DOC}`)).toBe(true);
    expect(await getLocal(' idriss@salistar.com ', 'profile')).toEqual({ poids: 78 });
  });

  it('sans courriel, aucune ecriture et aucune lecture', async () => {
    await updateLocalProfile('', { poids: 78 });
    await updateLocalCollection('', 'logs', { id: 'a' });
    expect(magasin.size).toBe(0);
    expect(await getLocal('', 'profile')).toBeNull();
    expect(await clearAllLocalData('')).toBe(0);
    expect(await isCacheEmpty('')).toBe(true);
  });
});

describe('updateLocalCollection — ajouter sans perdre', () => {
  it('prepend par defaut : le plus recent en tete', async () => {
    // Les ecrans affichent la liste telle quelle : l'ordre EST l'information.
    await updateLocalCollection(MAIL, 'logs', { id: 'a', nom: 'tajine' });
    await updateLocalCollection(MAIL, 'logs', { id: 'b', nom: 'rfissa' });
    expect(JSON.parse(magasin.get(`logs_${DOC}`)!).map((x: any) => x.id)).toEqual(['b', 'a']);
  });

  it('append ajoute en queue', async () => {
    await updateLocalCollection(MAIL, 'weight', { id: 'a' }, 'append');
    await updateLocalCollection(MAIL, 'weight', { id: 'b' }, 'append');
    expect(JSON.parse(magasin.get(`weight_${DOC}`)!).map((x: any) => x.id)).toEqual(['a', 'b']);
  });

  it('upsert remplace l element de meme identifiant, et le remonte', async () => {
    await updateLocalCollection(MAIL, 'logs', { id: 'a', kcal: 100 });
    await updateLocalCollection(MAIL, 'logs', { id: 'b', kcal: 200 });
    await updateLocalCollection(MAIL, 'logs', { id: 'a', kcal: 150 }, 'upsert');
    const arr = JSON.parse(magasin.get(`logs_${DOC}`)!);
    expect(arr).toHaveLength(2);
    expect(arr[0]).toEqual({ id: 'a', kcal: 150 });
  });

  it('⚠ UPSERT SANS IDENTIFIANT NE DUPLIQUE PLUS — corrige le 13/09/2026', async () => {
    // Avant : `mode === 'upsert' && item.id` tombait, le code retombait sur un
    // ajout en tete, et corriger un repas qui n'avait pas encore recu son
    // identifiant Firestore l'affichait DEUX fois — calories comprises.
    //
    // Sans identifiant, rien ne dit QUEL element remplacer : on ne peut pas
    // faire un vrai upsert. Ce qu'on peut faire, et qui suffit au cas reel,
    // c'est refuser d'ajouter un doublon a l'identique.
    await updateLocalCollection(MAIL, 'logs', { nom: 'tajine' } as any, 'upsert');
    await updateLocalCollection(MAIL, 'logs', { nom: 'tajine' } as any, 'upsert');
    expect(JSON.parse(magasin.get(`logs_${DOC}`)!)).toHaveLength(1);
  });

  it('mais deux entrees DIFFERENTES sans identifiant coexistent', async () => {
    // Deux cafes du matin ne sont pas le meme evenement : la deduplication ne
    // doit porter que sur l'identique.
    await updateLocalCollection(MAIL, 'logs', { nom: 'cafe' } as any, 'upsert');
    await updateLocalCollection(MAIL, 'logs', { nom: 'cafe', kcal: 5 } as any, 'upsert');
    expect(JSON.parse(magasin.get(`logs_${DOC}`)!)).toHaveLength(2);
  });

  it('⚠ UN CACHE CORROMPU FAIT PERDRE L ECRITURE, EN SILENCE', async () => {
    // `JSON.parse` jette, le `catch` journalise un `console.warn` que personne
    // ne lit sur un telephone, et la nouvelle entree n'est jamais ecrite. Le
    // repas que l'utilisateur vient de saisir disparait de l'ecran hors ligne
    // — alors qu'il est bien parti chez Firestore.
    magasin.set(`logs_${DOC}`, '{pas du json');
    await updateLocalCollection(MAIL, 'logs', { id: 'a' });
    expect(magasin.get(`logs_${DOC}`)).toBe('{pas du json');
  });

  it('un stockage en panne ne fait pas echouer la saisie', async () => {
    enPanne = true;
    await expect(updateLocalCollection(MAIL, 'logs', { id: 'a' })).resolves.toBeUndefined();
  });
});

describe('updateLocalProfile — fusion, pas remplacement', () => {
  it('ajoute un champ sans effacer les autres', async () => {
    // Un `setItem` brut aurait efface le reste du profil a chaque pesee.
    await updateLocalProfile(MAIL, { poids: 78, objectif: 'perte' });
    await updateLocalProfile(MAIL, { poids: 77.4 });
    expect(JSON.parse(magasin.get(`profile_${DOC}`)!)).toEqual({ poids: 77.4, objectif: 'perte' });
  });

  it('la fusion est de SURFACE : un objet imbrique est remplace en entier', async () => {
    // `{...curr, ...patch}` ne descend pas. Ecrire `{ prefs: { halal: true } }`
    // puis `{ prefs: { keto: true } }` perd `halal`.
    await updateLocalProfile(MAIL, { prefs: { halal: true, keto: false } });
    await updateLocalProfile(MAIL, { prefs: { keto: true } });
    expect(JSON.parse(magasin.get(`profile_${DOC}`)!).prefs).toEqual({ keto: true });
  });

  it('un profil corrompu repart d un objet vide plutot que de jeter', async () => {
    magasin.set(`profile_${DOC}`, 'nimporte quoi');
    await updateLocalProfile(MAIL, { poids: 78 });
    // L'ecriture est perdue elle aussi (meme `catch` que la collection).
    expect(magasin.get(`profile_${DOC}`)).toBe('nimporte quoi');
  });
});

describe('getLocal — la lecture hors ligne', () => {
  it('rend ce qui a ete ecrit, par sorte', async () => {
    await updateLocalCollection(MAIL, 'logs', { id: 'a' });
    await updateLocalProfile(MAIL, { poids: 78 });
    expect(await getLocal(MAIL, 'logs')).toEqual([{ id: 'a' }]);
    expect(await getLocal(MAIL, 'profile')).toEqual({ poids: 78 });
  });

  it('rend null sur une sorte absente, jamais undefined', async () => {
    // Les ecrans testent `if (cache)` : `undefined` passerait aussi, mais un
    // `null` explicite distingue « rien en cache » de « sorte inconnue ».
    expect(await getLocal(MAIL, 'insights')).toBeNull();
  });

  it('un contenu illisible rend null, sans jeter', async () => {
    magasin.set(`logs_${DOC}`, '{{{');
    expect(await getLocal(MAIL, 'logs')).toBeNull();
  });

  it('un stockage en panne rend null', async () => {
    enPanne = true;
    expect(await getLocal(MAIL, 'profile')).toBeNull();
  });
});

describe('isCacheEmpty — a-t-on deja synchronise', () => {
  it('vide tant que la cle de synchronisation n existe pas', async () => {
    expect(await isCacheEmpty(MAIL)).toBe(true);
    magasin.set(`synced_${DOC}`, '2026-09-13T00:00:00Z');
    expect(await isCacheEmpty(MAIL)).toBe(false);
  });

  it('⚠ SEULE LA CLE `synced_` COMPTE, pas les donnees', async () => {
    // On peut avoir des repas en cache et etre declare « vide » : la question
    // posee est « une synchronisation complete a-t-elle eu lieu », pas « y
    // a-t-il quelque chose ». C'est ce qui declenche le re-telechargement
    // integral a la premiere connexion.
    await updateLocalCollection(MAIL, 'logs', { id: 'a' });
    expect(await isCacheEmpty(MAIL)).toBe(true);
  });

  it('une chaine vide compte comme non synchronise', async () => {
    magasin.set(`synced_${DOC}`, '');
    expect(await isCacheEmpty(MAIL)).toBe(true);
  });
});

describe('clearAllLocalData — la purge', () => {
  it('emporte les six sortes et les marqueurs d onboarding', async () => {
    for (const k of ['profile', 'logs', 'weight', 'notifications', 'insights', 'synced']) {
      magasin.set(`${k}_${DOC}`, '[]');
    }
    magasin.set(`onboarded_${DOC}`, 'true');
    magasin.set('last_session_onboarded', 'true');
    magasin.set('autre_chose', 'garde');

    await clearAllLocalData(MAIL);

    expect([...magasin.keys()]).toEqual(['autre_chose']);
  });

  it('le compte rendu est EXACT — corrige le 13/09/2026', async () => {
    // La liste contenait `K.profile(docId)` ET un litteral `profile_${docId}`
    // identique : `multiRemove` s'en moquait, mais la fonction rend
    // `keys.length` et annoncait « 9 cles supprimees » pour 8 distinctes.
    // Le doublon est retire ; le nombre veut de nouveau dire quelque chose.
    const n = await clearAllLocalData(MAIL);
    expect(n).toBe(8);
  });

  it('une panne de stockage rend 0 au lieu de jeter', async () => {
    enPanne = true;
    expect(await clearAllLocalData(MAIL)).toBe(0);
  });
});
