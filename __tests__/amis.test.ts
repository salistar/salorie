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
}));
jest.mock('../lib/firebase', () => ({
  db: {},
  emailToDocId: (e: string) => String(e || '').trim().toLowerCase(),
}));
jest.mock('../lib/publicProfile', () => ({
  readPublicProfile: async (id: string) =>
    id === 'connu@x.com' ? { name: 'Yassine' } : null,
}));

import { listerEmailsAmis, listerAmis, sontAmis, retirerAmi } from '../lib/amis';

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
  it('retire des DEUX côtés', async () => {
    // Retirer d'un seul côté laisserait l'autre croire au lien, voir mon activité
    // et pouvoir m'appeler. Une rupture qui ne rompt rien est pire que rien.
    const r = await retirerAmi('moi@x.com', 'ami@x.com');
    expect(r.ok).toBe(true);
    expect(mockEcritures.map((e) => e.path).sort()).toEqual(['users/ami@x.com', 'users/moi@x.com']);
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
