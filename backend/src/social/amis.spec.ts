import { sontAmis, amisConfirmes } from './amis';

/**
 * L'amitié vue par le serveur.
 *
 * Ce fichier existe pour UN scénario, celui du 24/08/2026 : jusque-là, il
 * suffisait de connaître l'adresse e-mail de quelqu'un pour s'inscrire dans sa
 * liste d'amis, et l'amitié ouvre le mur ET les appels du duo. Les règles
 * Firestore exigent désormais une invitation, mais une base ne se relit pas :
 * le serveur doit vérifier que le lien existe DES DEUX CÔTÉS.
 *
 * Le test qui compte est `un lien à sens unique n'ouvre rien`. S'il devient
 * vert en passant à false, quelqu'un a rétabli le trou.
 */

/** Une base minimale : des listes d'amis, et de quoi les lire en un coup. */
function base(amis: Record<string, string[]>, casse = false) {
  const snap = (id: string) => ({ data: () => ({ friends: amis[id] }) });
  const tombe = () => {
    if (casse) throw new Error('firestore injoignable');
  };
  return {
    collection: () => ({
      doc: (id: string) => ({
        id,
        get: async () => {
          tombe();
          return snap(id);
        },
      }),
    }),
    getAll: async (...refs: { id: string }[]) => {
      tombe();
      return refs.map((r) => snap(r.id));
    },
  } as any;
}

describe('sontAmis — la réciprocité est exigée', () => {
  it('dit oui quand chacun a l’autre dans sa liste', async () => {
    const b = base({ 'a@x.com': ['b@x.com'], 'b@x.com': ['a@x.com'] });
    await expect(sontAmis(b, 'a@x.com', 'b@x.com')).resolves.toBe(true);
    await expect(sontAmis(b, 'b@x.com', 'a@x.com')).resolves.toBe(true);
  });

  it('un lien à sens unique n’ouvre rien', async () => {
    // Exactement l'attaque : `intrus` s'est mis dans la liste de `moi`. Tant que
    // `moi` ne l'a pas mis dans la sienne, ce n'est pas une amitié.
    const b = base({ 'moi@x.com': ['intrus@x.com'], 'intrus@x.com': [] });
    await expect(sontAmis(b, 'moi@x.com', 'intrus@x.com')).resolves.toBe(false);
    await expect(sontAmis(b, 'intrus@x.com', 'moi@x.com')).resolves.toBe(false);
  });

  it('celui qui vous retire cesse d’être votre ami, immédiatement', async () => {
    // Retirer n'écrit que dans SA propre liste — les règles interdisent de
    // toucher au document d'autrui. Sans réciprocité, le retrait ne valait donc
    // que pour celui qui le faisait.
    const b = base({ 'parti@x.com': [], 'reste@x.com': ['parti@x.com'] });
    await expect(sontAmis(b, 'reste@x.com', 'parti@x.com')).resolves.toBe(false);
  });

  it('normalise la casse et les espaces, comme emailToDocId', async () => {
    const b = base({ 'a@x.com': ['B@x.com'], 'b@x.com': ['a@x.com'] });
    await expect(sontAmis(b, '  A@X.com ', 'b@x.com')).resolves.toBe(true);
  });

  it('refuse le vide, et refuse de se lier à soi-même', async () => {
    const b = base({ 'a@x.com': ['a@x.com'] });
    await expect(sontAmis(b, 'a@x.com', 'a@x.com')).resolves.toBe(false);
    await expect(sontAmis(b, '', 'b@x.com')).resolves.toBe(false);
    await expect(sontAmis(b, 'a@x.com', '   ')).resolves.toBe(false);
  });

  it('remonte l’erreur de lecture — c’est à l’appelant de refuser', async () => {
    // Le module ne masque pas la panne : la passerelle et le mur l'attrapent et
    // répondent « non ». Avaler l'erreur ici rendrait `false` indiscernable
    // d'une base injoignable, et personne ne verrait la panne.
    await expect(sontAmis(base({}, true), 'a@x.com', 'b@x.com')).rejects.toThrow();
  });
});

describe('amisConfirmes — la liste que voit le mur', () => {
  it('ne garde que ceux qui vous ont en retour', async () => {
    const b = base({
      'moi@x.com': ['vrai@x.com', 'intrus@x.com', 'parti@x.com'],
      'vrai@x.com': ['moi@x.com'],
      'intrus@x.com': [],
      'parti@x.com': ['quelqun@x.com'],
    });
    await expect(amisConfirmes(b, 'moi@x.com')).resolves.toEqual(['vrai@x.com']);
  });

  it('dédoublonne, et ne se compte jamais soi-même', async () => {
    const b = base({
      'moi@x.com': ['A@x.com', 'a@x.com', 'moi@x.com', ''],
      'a@x.com': ['moi@x.com'],
    });
    await expect(amisConfirmes(b, 'moi@x.com')).resolves.toEqual(['a@x.com']);
  });

  it('n’appelle pas getAll quand la liste est vide', async () => {
    // `getAll()` sans argument lève chez Firestore. Le garde-fou n'est pas
    // décoratif : sans lui, tout compte sans ami ferait tomber le mur.
    const b = base({ 'seul@x.com': [] });
    b.getAll = async () => {
      throw new Error('getAll ne doit pas être appelé sans destinataire');
    };
    await expect(amisConfirmes(b, 'seul@x.com')).resolves.toEqual([]);
  });
});
