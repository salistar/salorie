import { composerPanier, parEtal, proteinesParDirham, type Produit } from '../lib/panierSouk';
import table from '../assets/data/prix-souk.json';

const PRODUITS = (table as any).produits as Produit[];

// La règle non négociable de ce module : NE JAMAIS dépasser le budget. Quelqu'un
// qui donne 200 DH n'en a pas 250. Un panier qui déborde n'est pas « presque bon »,
// il est inutilisable — et humiliant à la caisse.
describe('composerPanier — le budget est une frontière, pas une cible', () => {
  it('ne dépasse jamais le budget, quel qu’il soit', () => {
    for (const budget of [50, 120, 200, 350, 500, 800, 1500]) {
      for (const personnes of [1, 2, 4, 6]) {
        const p = composerPanier(PRODUITS, budget, personnes, 7);
        expect(p.cout).toBeLessThanOrEqual(budget);
      }
    }
  });

  it('rend un panier vide plutôt qu’un panier impayable', () => {
    expect(composerPanier(PRODUITS, 0).lignes).toHaveLength(0);
    expect(composerPanier(PRODUITS, -100).lignes).toHaveLength(0);
    expect(composerPanier([], 500).lignes).toHaveLength(0);
  });

  it('n’achète jamais de quantité négative ou nulle', () => {
    const p = composerPanier(PRODUITS, 400, 2, 7);
    for (const l of p.lignes) {
      expect(l.quantite).toBeGreaterThan(0);
      expect(l.cout).toBeGreaterThan(0);
    }
  });
});

describe('composerPanier — les priorités', () => {
  it('sert d’abord le socle : sans farine ni huile, on ne cuisine pas', () => {
    const p = composerPanier(PRODUITS, 400, 2, 7);
    const ids = p.lignes.map((l) => l.produit.id);
    expect(ids).toContain('farine');
    expect(ids).toContain('huile-table');
    expect(ids).toContain('oignon');
  });

  it('privilégie les protéines au meilleur rapport, pas la viande rouge', () => {
    // Au Maroc, l'œuf et la sardine battent largement le bœuf au dirham dépensé.
    // C'est ce qui rend un panier serré vivable.
    const oeuf = PRODUITS.find((x) => x.id === 'oeuf')!;
    const sardine = PRODUITS.find((x) => x.id === 'sardine')!;
    const boeuf = PRODUITS.find((x) => x.id === 'boeuf')!;
    expect(proteinesParDirham(oeuf)).toBeGreaterThan(proteinesParDirham(boeuf));
    expect(proteinesParDirham(sardine)).toBeGreaterThan(proteinesParDirham(boeuf));

    const p = composerPanier(PRODUITS, 300, 2, 7);
    const ids = p.lignes.map((l) => l.produit.id);
    expect(ids.some((i) => ['oeuf', 'sardine', 'lentille', 'pois-chiche'].includes(i))).toBe(true);
  });

  it('ne fait pas un panier d’un seul produit', () => {
    // Optimiser à l'aveugle donnerait sept kilos de sardines : optimal sur le
    // papier, immangeable dans une vraie cuisine.
    const p = composerPanier(PRODUITS, 500, 2, 7);
    const parProduit = p.lignes.map((l) => l.cout / p.cout);
    expect(Math.max(...parProduit)).toBeLessThan(0.4);
    expect(p.lignes.length).toBeGreaterThan(6);
  });

  it('achète plus quand le budget grandit', () => {
    const petit = composerPanier(PRODUITS, 200, 2, 7);
    const grand = composerPanier(PRODUITS, 700, 2, 7);
    expect(grand.cout).toBeGreaterThan(petit.cout);
    expect(grand.kcal).toBeGreaterThan(petit.kcal);
  });

  it('tient compte du nombre de personnes', () => {
    const deux = composerPanier(PRODUITS, 600, 2, 7);
    const six = composerPanier(PRODUITS, 600, 6, 7);
    // À budget égal, six personnes sont moins bien couvertes que deux : le module
    // doit le DIRE, pas prétendre que tout va bien.
    expect(six.couverture).toBeLessThan(deux.couverture);
  });
});

describe('composerPanier — honnêteté du résultat', () => {
  it('annonce une couverture énergétique cohérente', () => {
    const p = composerPanier(PRODUITS, 600, 2, 7);
    expect(p.kcal).toBeGreaterThan(0);
    expect(p.couverture).toBeGreaterThan(0);
    // 600 DH pour deux personnes une semaine est un budget serré mais tenable :
    // la couverture doit être significative sans être fantaisiste.
    expect(p.couverture).toBeLessThan(5);
  });

  it('un budget minuscule donne une couverture minuscule, pas un mensonge', () => {
    const p = composerPanier(PRODUITS, 60, 4, 7);
    expect(p.couverture).toBeLessThan(0.5);
  });
});

describe('parEtal', () => {
  it('regroupe par étal, dans l’ordre du trajet au souk', () => {
    const p = composerPanier(PRODUITS, 600, 2, 7);
    const groupes = parEtal(p);
    expect(groupes.length).toBeGreaterThan(1);
    const ordre = ['epicier', 'legumes', 'fruits', 'boucher', 'poissonnier'];
    const rangs = groupes.map((g) => ordre.indexOf(g.etal));
    expect(rangs).toEqual([...rangs].sort((a, b) => a - b));
  });

  it('la somme des étals fait le total du panier', () => {
    const p = composerPanier(PRODUITS, 600, 2, 7);
    const somme = parEtal(p).reduce((s, g) => s + g.cout, 0);
    expect(Math.abs(somme - p.cout)).toBeLessThan(1);
  });

  it('chaque produit de la table a un étal connu', () => {
    const etals = Object.keys((table as any).etals);
    for (const p of PRODUITS) expect(etals).toContain(p.etal);
  });
});
