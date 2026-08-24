/**
 * La liste d'amis, et surtout la question qu'elle sert à trancher :
 * ai-je le droit d'ouvrir le micro et la caméra de cette personne ?
 *
 * Un appel se joue en direct. Une erreur ici ne se rattrape pas après coup,
 * contrairement à un message qu'on peut masquer.
 */

const mockDocs: Record<string, any> = {};
const mockEcritures: any[] = [];

jest.mock('firebase/firestore', () => ({
  doc: (_db: any, col: string, id: string) => ({ path: `${col}/${id}` }),
  getDoc: async (r: any) => ({ data: () => mockDocs[r.path] }),
  setDoc: async (r: any, v: any) => { mockEcritures.push({ path: r.path, ...v }); },
  arrayRemove: (...v: any[]) => ({ __retire: v }),
  arrayUnion: (...v: any[]) => ({ __ajoute: v }),
}));
jest.mock('../lib/firebase', () => ({
  db: {},
  emailToDocId: (e: string) => String(e || '').trim().toLowerCase(),
}));
jest.mock('../lib/publicProfile', () => ({
  readPublicProfile: async (id: string) =>
    id === 'connu@x.com' ? { name: 'Yassine' } : null,
}));

import {
  listerEmailsAmis,
  listerAmis,
  listerDemandes,
  listerInvitations,
  listerTout,
  sontAmis,
  retirerAmi,
  accepterDemande,
  refuserDemande,
  annulerInvitation,
} from '../lib/amis';

beforeEach(() => {
  for (const k of Object.keys(mockDocs)) delete mockDocs[k];
  mockEcritures.length = 0;
});

describe('listerEmailsAmis', () => {
  it('rend une liste vide plutôt que de jeter quand le compte n’a pas de doc', () => {
    return expect(listerEmailsAmis('moi@x.com')).resolves.toEqual([]);
  });

  it('normalise et dédoublonne', async () => {
    // Le même compte a pu être ajouté deux fois avec des casses différentes ; il
    // apparaîtrait alors deux fois dans la liste.
    mockDocs['users/moi@x.com'] = { friends: ['A@X.com', 'a@x.com', ' a@x.com ', 'b@x.com'] };
    expect(await listerEmailsAmis('moi@x.com')).toEqual(['a@x.com', 'b@x.com']);
  });
});

describe('sontAmis — la barrière avant le micro', () => {
  it('dit oui entre amis', async () => {
    mockDocs['users/moi@x.com'] = { friends: ['ami@x.com'] };
    expect(await sontAmis('moi@x.com', 'ami@x.com')).toBe(true);
  });

  it('dit non pour un inconnu', async () => {
    mockDocs['users/moi@x.com'] = { friends: ['ami@x.com'] };
    expect(await sontAmis('moi@x.com', 'inconnu@x.com')).toBe(false);
  });

  it('ignore la casse et les espaces', async () => {
    mockDocs['users/moi@x.com'] = { friends: ['ami@x.com'] };
    expect(await sontAmis('moi@x.com', '  AMI@X.com ')).toBe(true);
  });

  it('dit non à soi-même', async () => {
    // Sinon on ouvrirait un duo avec son propre compte, qui n'a pas de sens et
    // ferait passer la vérification pour n'importe quel identifiant deviné.
    mockDocs['users/moi@x.com'] = { friends: [] };
    expect(await sontAmis('moi@x.com', 'moi@x.com')).toBe(false);
  });

  it('dit non sur une entrée vide', async () => {
    expect(await sontAmis('moi@x.com', '')).toBe(false);
    expect(await sontAmis('', 'ami@x.com')).toBe(false);
  });
});

describe('retirerAmi', () => {
  it('n’écrit que dans MON document', async () => {
    // Ce test disait l'inverse jusqu'au 24/08/2026 : « retire des DEUX côtés ».
    // C'était faux en production. Les règles Firestore interdisent — à raison —
    // de retirer quoi que ce soit chez autrui : la seconde écriture était
    // REFUSÉE à chaque fois, l'exception tombait dans le `catch`, et la fonction
    // rendait { ok: false } alors que le retrait venait de réussir. L'écran
    // affichait donc une erreur à chaque suppression.
    //
    // Ce qui rompt vraiment le lien des deux côtés, c'est la réciprocité exigée
    // par le serveur (backend/src/social/amis.ts) : vider ma liste suffit.
    const r = await retirerAmi('moi@x.com', 'ami@x.com');
    expect(r.ok).toBe(true);
    expect(mockEcritures.map((e) => e.path)).toEqual(['users/moi@x.com']);
  });

  it('efface aussi une invitation en cours vers cette personne', async () => {
    // Sans cela, un `friend_pending` oublié laisserait la personne libre de se
    // réinscrire dans mes amis — la règle Firestore ne lui demanderait rien de
    // plus — alors que je viens précisément de la retirer.
    await retirerAmi('moi@x.com', 'ami@x.com');
    expect(mockEcritures[0].friend_pending).toHaveProperty('__retire');
  });

  it('emploie arrayRemove et non une réécriture du tableau', async () => {
    // Deux suppressions simultanées depuis deux appareils s'écraseraient l'une
    // l'autre, et un ami supprimé réapparaîtrait.
    await retirerAmi('moi@x.com', 'ami@x.com');
    expect(mockEcritures[0].friends).toHaveProperty('__retire');
  });

  it('refuse de se retirer soi-même', async () => {
    const r = await retirerAmi('moi@x.com', 'MOI@x.com');
    expect(r).toEqual({ ok: false, motif: 'invalide' });
    expect(mockEcritures).toHaveLength(0);
  });
});

describe('listerAmis', () => {
  it('donne le nom public, et se rabat sur l’e-mail sinon', async () => {
    mockDocs['users/moi@x.com'] = { friends: ['connu@x.com', 'sansprofil@x.com'] };
    const amis = await listerAmis('moi@x.com');
    // Trié par NOM affiché, pas par e-mail : c'est le nom qu'on cherche des yeux
    // dans une liste. « sansprofil » passe donc avant « Yassine ».
    expect(amis).toEqual([
      { email: 'sansprofil@x.com', nom: 'sansprofil' },
      { email: 'connu@x.com', nom: 'Yassine' },
    ]);
  });
});

describe('l’amitié se demande', () => {
  it('listerDemandes montre qui attend ma réponse, sans ceux déjà amis', async () => {
    // Deux personnes qui s'invitent en même temps : la demande n'a plus d'objet
    // une fois le lien créé, et la laisser afficherait un bouton sans effet.
    mockDocs['users/moi@x.com'] = {
      friends: ['deja@x.com'],
      friend_requests: ['NOUVEAU@x.com', 'deja@x.com', ''],
    };
    expect((await listerDemandes('moi@x.com')).map((d) => d.email)).toEqual(['nouveau@x.com']);
  });

  it('listerInvitations montre celles restées sans réponse', async () => {
    mockDocs['users/moi@x.com'] = {
      friends: ['accepte@x.com'],
      friend_pending: ['accepte@x.com', 'attend@x.com'],
    };
    expect((await listerInvitations('moi@x.com')).map((d) => d.email)).toEqual(['attend@x.com']);
  });

  it('listerTout ne lit le document qu’UNE fois', async () => {
    // Trois appels séparés feraient trois trajets réseau pour des données
    // identiques, à chaque ouverture de l'écran.
    let lectures = 0;
    mockDocs['users/moi@x.com'] = { friends: ['a@x.com'], friend_requests: ['b@x.com'] };
    const vrai = Object.getOwnPropertyDescriptor(mockDocs, 'users/moi@x.com');
    Object.defineProperty(mockDocs, 'users/moi@x.com', {
      get: () => {
        lectures++;
        return vrai!.value;
      },
      configurable: true,
    });
    await listerTout('moi@x.com');
    expect(lectures).toBe(1);
  });

  it('accepter écrit CHEZ L’AUTRE d’abord, puis chez moi', async () => {
    // L'ordre compte : l'écriture chez l'autre peut être refusée (invitation
    // annulée entre temps). Si elle passait en second, la demande aurait déjà
    // disparu de ma liste et le lien n'existerait nulle part.
    const r = await accepterDemande('moi@x.com', 'lui@x.com');
    expect(r.ok).toBe(true);
    expect(mockEcritures.map((e) => e.path)).toEqual(['users/lui@x.com', 'users/moi@x.com']);
    expect(mockEcritures[0].friends).toHaveProperty('__ajoute', ['moi@x.com']);
    expect(mockEcritures[1].friend_requests).toHaveProperty('__retire', ['lui@x.com']);
  });

  it('refuser ne touche que ma propre file, et n’annonce rien', async () => {
    const r = await refuserDemande('moi@x.com', 'LUI@x.com');
    expect(r.ok).toBe(true);
    expect(mockEcritures.map((e) => e.path)).toEqual(['users/moi@x.com']);
    expect(mockEcritures[0].friend_requests).toHaveProperty('__retire', ['lui@x.com']);
  });

  it('annuler retire mon accord ET la sonnette', async () => {
    // Le premier retrait est celui qui compte : sans mon `friend_pending`, la
    // règle Firestore n'autorise plus la personne à s'inscrire dans mes amis.
    const r = await annulerInvitation('moi@x.com', 'cible@x.com');
    expect(r.ok).toBe(true);
    expect(mockEcritures.map((e) => e.path)).toEqual(['users/moi@x.com', 'users/cible@x.com']);
    expect(mockEcritures[0].friend_pending).toHaveProperty('__retire', ['cible@x.com']);
    expect(mockEcritures[1].friend_requests).toHaveProperty('__retire', ['moi@x.com']);
  });

  it('refuse de s’accepter soi-même', async () => {
    expect(await accepterDemande('moi@x.com', 'MOI@x.com')).toEqual({ ok: false, motif: 'invalide' });
    expect(mockEcritures).toHaveLength(0);
  });
});
