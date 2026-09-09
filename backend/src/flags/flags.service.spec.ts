import { FlagsService } from './flags.service';

/**
 * Ce que ces tests protègent.
 * ---------------------------------------------------------------------------
 * Le contrat de `GET /flags` n'est pas décoratif : le client déjà installé s'en
 * sert pour décider s'il doit CROIRE la réponse. Deux confusions casseraient
 * l'application sans lever la moindre erreur, et ce sont elles qu'on épingle :
 *
 *   « document absent » CONFONDU AVEC « lecture impossible »
 *      Personne n'a jamais écrit de flag → `{}` est la vérité, et le client doit
 *      l'appliquer (défaut = activé). Le rendre en `empty` ferait garder au
 *      client un vieux cache au lieu de l'état réel.
 *
 *   « lecture impossible » CONFONDUE AVEC « aucun flag désactivé »
 *      L'inverse, et c'est le plus grave : Firestore tombe, on rend `{}` sans le
 *      dire, et toutes les fonctionnalités que l'admin avait éteintes se
 *      rallument sur tous les téléphones à la fois.
 */

// Doubles minimaux : on teste la logique de décision, pas ioredis ni firebase-admin.
function redisFactice() {
  const boite: Record<string, any> = {};
  return {
    boite,
    getJSON: jest.fn(async (k: string) => (k in boite ? boite[k] : null)),
    setJSON: jest.fn(async (k: string, v: any) => { boite[k] = v; }),
    del: jest.fn(async (k: string) => { delete boite[k]; return true; }),
  };
}
function firebaseFactice(resultat: { existe: boolean; data?: any } | Error) {
  return {
    db: () => ({
      collection: () => ({
        doc: () => ({
          get: async () => {
            if (resultat instanceof Error) throw resultat;
            return { exists: resultat.existe, data: () => resultat.data };
          },
        }),
      }),
    }),
  };
}
const service = (fb: any, rd: any) => new FlagsService(fb as any, rd as any);

describe('FlagsService', () => {
  it('sert le cache Redis sans toucher Firestore', async () => {
    const rd = redisFactice();
    rd.boite['flags:v1'] = { fasting: false };
    // Un Firebase qui explose si on l'appelle : la seule preuve solide que le
    // cache court-circuite bien la lecture.
    const fb = { db: () => { throw new Error('Firestore ne doit pas etre lu'); } };

    const r = await service(fb, rd).lire();
    expect(r).toEqual({ flags: { fasting: false }, source: 'cache' });
  });

  it('lit Firestore au premier appel, puis remplit cache ET dernier bon', async () => {
    const rd = redisFactice();
    const fb = firebaseFactice({ existe: true, data: { social: false } });

    const r = await service(fb, rd).lire();
    expect(r.source).toBe('firestore');
    expect(r.flags).toEqual({ social: false });
    expect(rd.boite['flags:v1']).toEqual({ social: false });
    expect(rd.boite['flags:lastgood:v1'].flags).toEqual({ social: false });
  });

  it('document absent = {} appliquable, PAS « empty »', async () => {
    const rd = redisFactice();
    const fb = firebaseFactice({ existe: false });

    const r = await service(fb, rd).lire();
    // `firestore` et non `empty` : le client DOIT appliquer ce vide, qui veut
    // dire « aucune fonctionnalité désactivée », et non l'ignorer.
    expect(r).toMatchObject({ flags: {}, source: 'firestore' });
  });

  it('Firestore KO : ressert le dernier bon plutot qu un vide trompeur', async () => {
    const rd = redisFactice();
    rd.boite['flags:lastgood:v1'] = { flags: { races: false }, ts: Date.now() - 5000 };
    const fb = firebaseFactice(new Error('quota exhausted'));

    const r = await service(fb, rd).lire();
    expect(r.source).toBe('lastgood');
    // ⚠ LE POINT ENTIER DU MODULE : `races:false` survit à la panne. Rendre `{}`
    // ici rallumerait la fonctionnalité sur tous les telephones a la fois.
    expect(r.flags).toEqual({ races: false });
    expect(r.age).toBeGreaterThanOrEqual(4);
  });

  it('Firestore KO et aucun dernier bon : le dit avec « empty »', async () => {
    const rd = redisFactice();
    const fb = firebaseFactice(new Error('credentials manquants'));

    const r = await service(fb, rd).lire();
    expect(r).toEqual({ flags: {}, source: 'empty' });
    // Le client lit ce mot et garde SON cache local. Le changer casserait les
    // APK deja installes, qui testent la chaine exacte.
    expect(r.source).toBe('empty');
  });

  it('l invalidation supprime le cache court sans toucher au dernier bon', async () => {
    const rd = redisFactice();
    rd.boite['flags:v1'] = { a: 1 };
    rd.boite['flags:lastgood:v1'] = { flags: { a: 1 }, ts: 1 };

    await service(firebaseFactice({ existe: true }), rd).invalider();
    expect(rd.boite['flags:v1']).toBeUndefined();
    // Le filet n'est pas un cache : le vider retirerait la protection au moment
    // precis ou on manipule les flags, donc au pire moment.
    expect(rd.boite['flags:lastgood:v1']).toBeDefined();
  });

  it('Redis KO de bout en bout : Firestore reste servi', async () => {
    // `RedisService` degrade en silence (getJSON -> null, setJSON -> no-op).
    // Le service ne doit pas en dependre pour repondre.
    const rd = {
      getJSON: jest.fn(async () => null),
      setJSON: jest.fn(async () => undefined),
      del: jest.fn(async () => false),
    };
    const fb = firebaseFactice({ existe: true, data: { vitals: false } });

    const r = await service(fb, rd).lire();
    expect(r).toMatchObject({ flags: { vitals: false }, source: 'firestore' });
  });
});
