/**
 * Les défis virtuels : un catalogue figé, et un compteur qui crédite des km réels.
 * ---------------------------------------------------------------------------
 * `lib/races.ts` sert `/races` (627 lignes), `/challenge-ar` (284) et `/medals`
 * (153) — trois écrans sans aucun test avant le 13/09/2026.
 *
 * Deux choses à surveiller, de natures très différentes :
 *
 *   1. **Le catalogue.** Quatre parcours écrits à la main, avec des points
 *      d'intérêt placés à un kilométrage donné. Une borne au-delà de l'arrivée
 *      ou dans le désordre place un marqueur au mauvais endroit du parcours :
 *      rien ne plante, la carte est simplement fausse.
 *   2. **`setChallengeProgress`.** Il crédite le défi annuel, l'XP et les
 *      kilomètres que l'écran Sadaqa convertit en repas financés. Créditer deux
 *      fois, ou créditer une simulation, fabrique des kilomètres qui n'ont pas
 *      été courus.
 */
const firestore: any = {};
let lectureCasse = false;
let docExistant: any = null;
const ecritures: any[] = [];

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(), query: jest.fn(), where: jest.fn(), orderBy: jest.fn(),
  onSnapshot: jest.fn(), updateDoc: jest.fn(), addDoc: jest.fn(),
  increment: jest.fn(), limit: jest.fn(), getDocs: jest.fn(),
  serverTimestamp: () => 'HORODATAGE',
  doc: (...args: any[]) => ({ chemin: args.slice(1).join('/') }),
  getDoc: jest.fn(async () => {
    if (lectureCasse) throw new Error('firestore indisponible');
    return {
      exists: () => docExistant !== null,
      data: () => docExistant,
    };
  }),
  setDoc: jest.fn(async (ref: any, data: any, opts: any) => {
    ecritures.push({ ref, data, opts });
  }),
}));

jest.mock('../lib/firebase', () => ({
  db: firestore,
  emailToDocId: (e: string) => String(e || '').trim().toLowerCase(),
  logEvent: jest.fn(),
}));

const credites: number[] = [];
jest.mock('../lib/progressHooks', () => ({
  creditKm: jest.fn(async (km: number) => { credites.push(km); }),
}));

const publiees: any[] = [];
jest.mock('../lib/socialFeed', () => ({
  publishActivity: jest.fn(async (email: string, a: any) => { publiees.push({ email, ...a }); }),
}));

import {
  CHALLENGES, getChallenge, setChallengeProgress, staticMapUrl, streetViewUrl,
} from '../lib/races';

beforeEach(() => {
  ecritures.length = 0;
  credites.length = 0;
  publiees.length = 0;
  docExistant = null;
  lectureCasse = false;
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('le catalogue des defis', () => {
  it('chaque defi a une identite, une distance et un trace', () => {
    expect(CHALLENGES.length).toBeGreaterThan(0);
    const ids = CHALLENGES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length); // pas de doublon
    for (const c of CHALLENGES) {
      expect(c.id).toMatch(/^[a-z0-9-]+$/);
      expect(c.name.length).toBeGreaterThan(2);
      expect(c.totalKm).toBeGreaterThan(0);
      expect(c.route.length).toBeGreaterThanOrEqual(2);
      expect(c.emoji.length).toBeGreaterThan(0);
    }
  });

  it('⚠ AUCUN POINT D INTERET NE DEPASSE L ARRIVEE', () => {
    // Un `atKm` superieur au total placerait un marqueur au-dela de la ligne :
    // le coureur verrait une etape qu'il ne peut pas atteindre, et la barre de
    // progression la montrerait deja franchie.
    for (const c of CHALLENGES) {
      for (const p of c.pois || []) {
        expect(p.atKm).toBeGreaterThanOrEqual(0);
        expect(p.atKm).toBeLessThanOrEqual(c.totalKm);
      }
    }
  });

  it('les points d interet sont ranges dans l ordre du parcours', () => {
    // L'ecran les affiche dans l'ordre du tableau : desordonnes, ils
    // raconteraient un itineraire qui revient sur ses pas.
    for (const c of CHALLENGES) {
      const kms = (c.pois || []).map((p) => p.atKm);
      expect(kms).toEqual([...kms].sort((a, b) => a - b));
    }
  });

  it('chaque parcours commence au kilometre zero et finit a son total', () => {
    for (const c of CHALLENGES) {
      const kms = (c.pois || []).map((p) => p.atKm);
      if (!kms.length) continue;
      expect(kms[0]).toBe(0);
      expect(kms[kms.length - 1]).toBe(c.totalKm);
    }
  });

  it('les coordonnees sont des points terrestres plausibles', () => {
    for (const c of CHALLENGES) {
      for (const p of [...c.route, ...(c.pois || [])]) {
        expect(p.lat).toBeGreaterThanOrEqual(-90);
        expect(p.lat).toBeLessThanOrEqual(90);
        expect(p.lng).toBeGreaterThanOrEqual(-180);
        expect(p.lng).toBeLessThanOrEqual(180);
        expect(p.lat === 0 && p.lng === 0).toBe(false); // l'ile nulle
      }
    }
  });

  it('getChallenge trouve par identifiant, et rend undefined sinon', () => {
    expect(getChallenge('casa-loop')?.name).toBe('Casablanca Corniche');
    expect(getChallenge('nexistepas')).toBeUndefined();
    expect(getChallenge('')).toBeUndefined();
  });
});

describe('les URL d images de lieu', () => {
  it('streetViewUrl construit une adresse complete', () => {
    const u = streetViewUrl(33.6086, -7.6326);
    expect(u).toContain('maps.googleapis.com/maps/api/streetview');
    expect(u).toContain('location=33.6086,-7.6326');
    expect(u).toContain('size=600x360');
    // radius=50000 : sans lui, un arret rural rend « no imagery ».
    expect(u).toContain('radius=50000');
  });

  it('streetViewUrl REFUSE de mettre du texte dans l URL', () => {
    // Coercition voulue et commentee dans le module : les coordonnees peuvent
    // venir d'une saisie du back-office.
    const u = streetViewUrl('abc' as any, {} as any);
    expect(u).toContain('location=0,0');
    expect(u).not.toContain('abc');
  });

  it('⚠ staticMapUrl, LUI, N A PAS CETTE PROTECTION', () => {
    // Meme famille, meme source de donnees, une seule des deux fonctions
    // coerce. Ce n'est pas exploitable aujourd'hui — les coordonnees viennent
    // du catalogue fige ci-dessus — mais les deux fonctions se ressemblent
    // assez pour qu'on croie l'une aussi protegee que l'autre.
    const u = staticMapUrl('<script>' as any, 0);
    expect(u).toContain('<script>');
  });

  it('les deux restent des URL valides meme sans cle configuree', () => {
    // La cle vient de l'environnement ; absente, l'image ne s'affichera pas,
    // mais l'URL ne doit pas etre malformee au point de casser le rendu.
    for (const u of [streetViewUrl(0.1, 0.1), staticMapUrl(0.1, 0.1)]) {
      expect(() => new URL(u)).not.toThrow();
      expect(u).toContain('key=');
    }
  });
});

describe('setChallengeProgress — ce qui est credite, et une seule fois', () => {
  it('enregistre le cumul et credite le delta gagne', async () => {
    docExistant = { cumulativeKm: 4 };
    await setChallengeProgress('casa-loop', 'Idriss@x.com', 6);
    expect(ecritures[0].data.cumulativeKm).toBe(6);
    expect(ecritures[0].ref.chemin).toBe('challenges/casa-loop/participants/idriss@x.com');
    expect(credites).toEqual([2]); // 6 - 4, et NON 6
  });

  it('un premier enregistrement credite tout', async () => {
    docExistant = null;
    await setChallengeProgress('casa-loop', 'a@b.com', 3);
    expect(credites).toEqual([3]);
  });

  it('⚠ REJOUER LE MEME CUMUL NE CREDITE RIEN', async () => {
    // C'est la protection contre le double comptage : l'ecran envoie le CUMUL,
    // pas le delta. Sans cette soustraction, chaque rafraichissement offrirait
    // a nouveau la totalite des kilometres.
    docExistant = { cumulativeKm: 10 };
    await setChallengeProgress('casa-loop', 'a@b.com', 10);
    expect(credites).toEqual([]);
    // Et un cumul qui RECULE ne retire rien non plus.
    await setChallengeProgress('casa-loop', 'a@b.com', 4);
    expect(credites).toEqual([]);
  });

  it('une simulation ne credite jamais', async () => {
    // `credit=false` : le mode demonstration de l'ecran AR.
    docExistant = { cumulativeKm: 0 };
    await setChallengeProgress('casa-loop', 'a@b.com', 8, false);
    expect(ecritures).toHaveLength(1);   // la progression est bien ecrite
    expect(credites).toEqual([]);        // mais rien n'est credite
  });

  it('⚠ SI LA LECTURE ECHOUE, LE CUMUL ENTIER EST CREDITE A NOUVEAU', async () => {
    // Le commentaire du module dit « si la lecture echoue on n'invente pas de
    // delta ». Le code fait pourtant l'inverse : `prev` reste a 0, donc
    // `delta = next`, c'est-a-dire le PLUS GRAND credit possible.
    //
    // Consequence concrete : une coupure reseau au mauvais moment offre a
    // l'utilisateur la totalite de ses kilometres cumules une seconde fois —
    // sur le defi annuel, sur l'XP, et sur les kilometres que Sadaqa convertit
    // en repas finances.
    //
    // Je le CONSIGNE plutot que de le corriger seul : ne rien crediter en cas
    // de lecture ratee ferait perdre des kilometres reels a quelqu'un qui court
    // hors couverture, ce qui est l'erreur symetrique. Le bon remede est
    // probablement de reessayer la lecture, et c'est un choix de produit.
    docExistant = { cumulativeKm: 100 };
    lectureCasse = true;
    await setChallengeProgress('casa-loop', 'a@b.com', 105);
    expect(credites).toEqual([105]); // et non 5
  });

  it('une distance negative est ramenee a zero', async () => {
    docExistant = { cumulativeKm: 0 };
    await setChallengeProgress('casa-loop', 'a@b.com', -12);
    expect(ecritures[0].data.cumulativeKm).toBe(0);
    expect(credites).toEqual([]);
  });

  it('sans defi ou sans courriel, rien ne se passe', async () => {
    await setChallengeProgress('', 'a@b.com', 5);
    await setChallengeProgress('casa-loop', '', 5);
    expect(ecritures).toHaveLength(0);
    expect(credites).toEqual([]);
  });

  it('une ecriture qui echoue n entraine aucun credit', async () => {
    // On ne credite pas des kilometres qu'on n'a pas su enregistrer : au
    // rafraichissement suivant, le cumul distant serait reste en arriere et le
    // meme delta serait credite une seconde fois.
    const { setDoc } = require('firebase/firestore');
    (setDoc as jest.Mock).mockImplementationOnce(async () => { throw new Error('refus'); });
    docExistant = { cumulativeKm: 0 };
    await setChallengeProgress('casa-loop', 'a@b.com', 7);
    expect(credites).toEqual([]);
  });
});

describe('setChallengeProgress — la publication au feed', () => {
  it('publie UNE FOIS, au franchissement de la ligne', async () => {
    docExistant = { cumulativeKm: 9 };
    await setChallengeProgress('casa-loop', 'a@b.com', 10); // total = 10
    expect(publiees).toHaveLength(1);
    expect(publiees[0]).toMatchObject({ type: 'race_finished', km: 10, label: 'Casablanca Corniche' });
  });

  it('ne republie pas a chaque kilometre suivant', async () => {
    // `prev < totalKm` : une fois la ligne passee, la condition est fausse.
    // Sans elle, chaque mise a jour post-arrivee inonderait le feed.
    docExistant = { cumulativeKm: 12 };
    await setChallengeProgress('casa-loop', 'a@b.com', 14);
    expect(publiees).toHaveLength(0);
  });

  it('ne publie rien avant l arrivee', async () => {
    docExistant = { cumulativeKm: 2 };
    await setChallengeProgress('casa-loop', 'a@b.com', 9);
    expect(publiees).toHaveLength(0);
  });

  it('un defi inconnu ne publie rien et ne jette pas', async () => {
    docExistant = { cumulativeKm: 0 };
    await expect(setChallengeProgress('defi-fantome', 'a@b.com', 999)).resolves.toBeUndefined();
    expect(publiees).toHaveLength(0);
    expect(credites).toEqual([999]); // la progression, elle, est bien creditee
  });
});
