import { fusionner, normaliser, purger, visibles, JOURS_TOMBE, type ArticleCourses } from '../lib/listeCourses';

/**
 * La fusion de la liste de courses.
 *
 * C'est la seule partie du code qui peut FAIRE DISPARAÎTRE les courses de
 * quelqu'un. Elle est écrite comme une fonction pure exactement pour ça : elle
 * se teste sans Firestore, sans téléphone et sans réseau.
 *
 * Chaque cas ci-dessous correspond à une situation réelle entre le téléphone et
 * le web, pas à une combinaison inventée.
 */

const a = (id: string, name: string, updatedAt: number, done = false, supprime = false): ArticleCourses => ({
  id, name, done, updatedAt, ...(supprime ? { supprime: true } : {}),
});

describe('fusionner', () => {
  it('garde les articles ajoutés de chaque côté', () => {
    // Le téléphone ajoute du lait, le web ajoute du pain, à la même seconde.
    // C'est précisément ce qu'un document unique contenant un tableau perdrait.
    const tel = [a('1', 'lait', 1000)];
    const web = [a('2', 'pain', 1000)];
    const r = fusionner(tel, web);
    expect(r.map((x) => x.name).sort()).toEqual(['lait', 'pain']);
  });

  it('garde la version la plus récente d’un même article', () => {
    // Coché sur le téléphone après avoir été laissé décoché sur le web.
    const web = [a('1', 'lait', 1000, false)];
    const tel = [a('1', 'lait', 2000, true)];
    const r = fusionner(web, tel);
    expect(r).toHaveLength(1);
    expect(r[0].done).toBe(true);
  });

  it('ne ressuscite pas un article supprimé ailleurs', () => {
    // Le cas qui justifie les pierres tombales : le web supprime, le téléphone
    // a encore l'article en mémoire. Sans tombe, il le renverrait indéfiniment.
    const tel = [a('1', 'lait', 1000)];
    const web = [a('1', 'lait', 2000, false, true)];
    const r = fusionner(tel, web);
    expect(r).toHaveLength(1);
    expect(r[0].supprime).toBe(true);
    expect(visibles(r)).toHaveLength(0);
  });

  it('laisse revenir un article ré-ajouté APRÈS sa suppression', () => {
    // On supprime le lait, puis on se ravise et on le remet. Une tombe qui
    // gagnerait toujours empêcherait de jamais racheter du lait.
    const ancien = [a('1', 'lait', 1000, false, true)];
    const neuf = [a('1', 'lait', 3000)];
    const r = fusionner(ancien, neuf);
    expect(visibles(r)).toHaveLength(1);
  });

  it('à date égale, la suppression l’emporte', () => {
    // Rare mais possible avec deux horloges proches. Faire réapparaître un
    // article qu'on vient d'enlever déroute plus que d'en perdre un qu'on
    // vient de cocher — le premier ressemble à un bug, le second à un oubli.
    const x = [a('1', 'lait', 5000, true)];
    const y = [a('1', 'lait', 5000, false, true)];
    expect(fusionner(x, y)[0].supprime).toBe(true);
    // Et dans l'autre sens : la fusion ne doit pas dépendre de l'ordre.
    expect(fusionner(y, x)[0].supprime).toBe(true);
  });

  it('n’invente rien à partir de deux listes vides', () => {
    expect(fusionner([], [])).toEqual([]);
  });

  it('rend la liste distante quand la locale est vide', () => {
    // Un compte ouvert sur un nouvel appareil : il n'a rien en local et doit
    // tout recevoir, pas effacer le serveur.
    const r = fusionner([], [a('1', 'lait', 1000), a('2', 'pain', 1000)]);
    expect(r).toHaveLength(2);
  });
});

describe('normaliser', () => {
  it('donne une date de secours aux listes d’avant la synchronisation', () => {
    // L'ancien format n'avait pas d'`updatedAt`. À 0, ces articles perdraient
    // contre n'importe quelle version distante — donc la liste déjà saisie par
    // quelqu'un serait balayée à la première synchronisation.
    const x = normaliser({ id: '1', name: 'lait', done: false }, 7777);
    expect(x?.updatedAt).toBe(7777);
  });

  it('écarte ce qui n’a ni identifiant ni nom', () => {
    expect(normaliser({ name: 'lait' })).toBeNull();
    expect(normaliser({ id: '1', name: '   ' })).toBeNull();
    expect(normaliser(null)).toBeNull();
  });

  it('coupe un nom démesuré plutôt que de le refuser', () => {
    const x = normaliser({ id: '1', name: 'a'.repeat(500) });
    expect(x?.name.length).toBe(120);
  });
});

describe('purger', () => {
  it('retire les tombes anciennes et garde les récentes', () => {
    const maintenant = 1_000_000_000_000;
    const vieille = a('1', 'lait', maintenant - (JOURS_TOMBE + 1) * 86400000, false, true);
    const fraiche = a('2', 'pain', maintenant - 86400000, false, true);
    const vivant = a('3', 'oeufs', maintenant - 999 * 86400000);
    const r = purger([vieille, fraiche, vivant], maintenant);
    expect(r.map((x) => x.id).sort()).toEqual(['2', '3']);
  });

  it('ne touche jamais à un article vivant, même très ancien', () => {
    // Un article noté il y a deux ans et jamais acheté reste sur la liste :
    // c'est une liste de courses, pas un journal.
    const maintenant = 1_000_000_000_000;
    const r = purger([a('1', 'lait', 1)], maintenant);
    expect(r).toHaveLength(1);
  });
});
