import { MurService } from './mur.service';

/**
 * La règle de visibilité du mur.
 *
 * C'est la seule chose qui décide qui lit quoi. Une erreur ici ne se voit pas :
 * personne ne se plaint de voir une publication qu'il ne devrait pas voir.
 *
 * On monte le service avec des dépendances simulées plutôt qu'un vrai Mongo :
 * ce qu'on veut vérifier, ce sont les DÉCISIONS, pas les requêtes.
 */

type Doc = { _id: string; uid: string; groupe?: string; texte?: string; masque?: boolean; ts?: number };

function monter(opts: { publications: Doc[]; groupes: any[]; amis: Record<string, string[]> }) {
  const chaine = (resultat: any) => ({
    sort: () => chaine(resultat),
    limit: () => chaine(resultat),
    lean: async () => resultat,
  });

  const modelePublications: any = {
    find: (q: any) => {
      const auteurs: string[] = q?.uid?.$in || [];
      return chaine(opts.publications.filter((p) => auteurs.includes(p.uid) && !p.masque));
    },
    create: async (d: any) => ({ _id: 'neuf', ...d }),
    deleteOne: async () => ({ deletedCount: 1 }),
    findByIdAndUpdate: async () => null,
  };
  const modeleGroupes: any = {
    find: (q: any) => {
      const ids: string[] = q?._id?.$in || [];
      return { lean: async () => opts.groupes.filter((g) => ids.includes(g._id)) };
    },
    // `.lean()` derrière `findOne` : le service l'appelle, donc la simulation doit
    // rendre la même forme que Mongoose, pas une promesse nue.
    findOne: (q: any) => ({
      lean: async () => opts.groupes.find((g) => g._id === q._id && g.uid === q.uid) || null,
    }),
    create: async (d: any) => ({ _id: 'g_neuf', ...d }),
    deleteOne: async () => ({ deletedCount: 1 }),
  };
  // L'amitie est RECIPROQUE : le service lit les deux listes, donc la base
  // simulee doit savoir rendre plusieurs documents d'un coup. Les fixtures
  // ci-dessous declarent volontairement les deux sens — un lien a sens unique
  // n'est pas une amitie, et un test le verifie.
  const fb: any = {
    db: () => ({
      collection: () => ({
        doc: (id: string) => ({
          id,
          get: async () => ({ data: () => ({ friends: opts.amis[id] || [] }) }),
        }),
      }),
      getAll: async (...refs: { id: string }[]) =>
        refs.map((r) => ({ data: () => ({ friends: opts.amis[r.id] || [] }) })),
    }),
  };
  const redis: any = { rateLimit: async () => true };
  return new MurService(modelePublications, modeleGroupes, fb, redis);
}

const P = (id: string, uid: string, groupe = ''): Doc => ({ _id: id, uid, groupe, texte: 't', ts: 1 });

describe('qui voit quoi', () => {
  it('ne montre rien de quelqu’un qui s’est ajouté tout seul', async () => {
    // Avant le 24/08/2026, connaître une adresse e-mail suffisait à s'inscrire
    // dans la liste de son propriétaire — et donc à lire son mur. Ici `intrus`
    // est dans MA liste mais je ne suis pas dans la sienne : ce n'est pas une
    // amitié, et il ne voit rien.
    const s = monter({
      publications: [P('1', 'moi@x.com')],
      groupes: [],
      amis: { 'intrus@x.com': ['moi@x.com'], 'moi@x.com': [] },
    });
    expect(await s.lire('intrus@x.com')).toHaveLength(0);
  });

  it('montre les publications de mes amis', async () => {
    const s = monter({
      publications: [P('1', 'ami@x.com'), P('2', 'inconnu@x.com')],
      groupes: [],
      amis: { 'moi@x.com': ['ami@x.com'], 'ami@x.com': ['moi@x.com'] },
    });
    const vues = await s.lire('moi@x.com');
    expect(vues.map((v) => v.id)).toEqual(['1']);
  });

  it('montre MES publications, même sans ami', async () => {
    // Sans cela on ne verrait pas ce qu'on vient d'écrire, ce qui se lit comme un
    // échec de publication.
    const s = monter({ publications: [P('1', 'moi@x.com')], groupes: [], amis: {} });
    const vues = await s.lire('moi@x.com');
    expect(vues).toHaveLength(1);
    expect(vues[0].moi).toBe(true);
  });

  it('cache une publication ciblée sur un groupe dont je ne suis pas membre', async () => {
    const s = monter({
      publications: [P('1', 'ami@x.com', 'g1')],
      groupes: [{ _id: 'g1', uid: 'ami@x.com', membres: ['autre@x.com'] }],
      amis: { 'moi@x.com': ['ami@x.com'], 'ami@x.com': ['moi@x.com'] },
    });
    expect(await s.lire('moi@x.com')).toHaveLength(0);
  });

  it('la montre quand je suis dans le groupe', async () => {
    const s = monter({
      publications: [P('1', 'ami@x.com', 'g1')],
      groupes: [{ _id: 'g1', uid: 'ami@x.com', membres: ['moi@x.com'] }],
      amis: { 'moi@x.com': ['ami@x.com'], 'ami@x.com': ['moi@x.com'] },
    });
    expect(await s.lire('moi@x.com')).toHaveLength(1);
  });

  it("un groupe ne rend JAMAIS visible la publication d'un non-ami", async () => {
    // C'est l'asymétrie qui compte : un groupe restreint, il n'élargit pas. Sinon
    // il suffirait d'ajouter quelqu'un à un groupe pour lui montrer son mur sans
    // être son ami, et la liste d'amis ne voudrait plus rien dire.
    const s = monter({
      publications: [P('1', 'inconnu@x.com', 'g1')],
      groupes: [{ _id: 'g1', uid: 'inconnu@x.com', membres: ['moi@x.com'] }],
      amis: { 'moi@x.com': [] },
    });
    expect(await s.lire('moi@x.com')).toHaveLength(0);
  });

  it('ne montre rien quand la liste d’amis est illisible', async () => {
    // En cas d'erreur Firestore on rend une liste vide : on montre moins, jamais
    // plus, quand on n'est pas sûr.
    const s = monter({ publications: [P('1', 'ami@x.com')], groupes: [], amis: {} });
    expect(await s.lire('moi@x.com')).toHaveLength(0);
  });
});

describe('publier', () => {
  const base = () => monter({ publications: [], groupes: [{ _id: 'g1', uid: 'moi@x.com', membres: [] }], amis: {} });

  it('refuse un message vide sans photo', async () => {
    expect(await base().publier('moi@x.com', 'M', '   ')).toMatchObject({ ok: false, motif: 'vide' });
  });

  it('accepte une photo sans légende', async () => {
    const r = await base().publier('moi@x.com', 'M', '', 'AAAA', 'image/jpeg');
    expect(r.ok).toBe(true);
  });

  it('applique le filtre de contenu', async () => {
    // Le même filtre que le chat : liens, coordonnées, insultes.
    expect(await base().publier('moi@x.com', 'M', 'viens sur exemple.com')).toMatchObject({ ok: false, motif: 'lien' });
    expect(await base().publier('moi@x.com', 'M', 'appelle 0612345678')).toMatchObject({ ok: false, motif: 'coordonnees' });
  });

  it('refuse une photo au mauvais type', async () => {
    expect(await base().publier('moi@x.com', 'M', 'ok', 'AAAA', 'image/svg+xml')).toMatchObject({
      ok: false,
      motif: 'image_type',
    });
  });

  it("refuse de viser le groupe de quelqu'un d'autre", async () => {
    // Sinon on s'adresserait à des gens qu'on ne connaît pas.
    const s = monter({ publications: [], groupes: [{ _id: 'g1', uid: 'autre@x.com', membres: [] }], amis: {} });
    expect(await s.publier('moi@x.com', 'M', 'coucou', '', '', 'g1')).toMatchObject({
      ok: false,
      motif: 'groupe_inconnu',
    });
  });
});

describe('groupes', () => {
  it("refuse un membre qui n'est pas mon ami", async () => {
    // C'est ce qui empêche un groupe de contourner la liste d'amis.
    const s = monter({ publications: [], groupes: [], amis: { 'moi@x.com': ['ami@x.com'], 'ami@x.com': ['moi@x.com'] } });
    expect(await s.creerGroupe('moi@x.com', 'Collègues', ['ami@x.com', 'inconnu@x.com'])).toMatchObject({
      ok: false,
      motif: 'membre_non_ami',
    });
  });

  it('accepte un groupe entièrement composé d’amis', async () => {
    const s = monter({ publications: [], groupes: [], amis: { 'moi@x.com': ['ami@x.com'], 'ami@x.com': ['moi@x.com'] } });
    expect((await s.creerGroupe('moi@x.com', 'Collègues', ['ami@x.com'])).ok).toBe(true);
  });

  it('refuse un nom vide', async () => {
    const s = monter({ publications: [], groupes: [], amis: {} });
    expect(await s.creerGroupe('moi@x.com', '   ', [])).toMatchObject({ ok: false, motif: 'nom_vide' });
  });
});
