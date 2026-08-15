import {
  suggererSuhoor, suggererIftar, indiceSatiete, graineDuJour, nomAliment, type Aliment,
} from '../lib/ramadanAssiettes';
import base from '../assets/data/local-foods.json';

const BASE = base as Aliment[];

describe('la base locale est exploitable', () => {
  it('contient les 653 plats attendus, avec leurs macros', () => {
    expect(BASE.length).toBeGreaterThan(600);
    for (const a of BASE.slice(0, 50)) {
      expect(typeof a.n).toBe('string');
      expect(Number.isFinite(a.k)).toBe(true);
    }
  });

  it('contient les deux piliers de l’iftar marocain', () => {
    // Si ces deux-là disparaissaient de la base, `suggererIftar` retomberait
    // silencieusement sur un plat quelconque : le test protège la tradition
    // autant que le code.
    expect(BASE.some((a) => /dattes?/i.test(a.n))).toBe(true);
    expect(BASE.some((a) => /harira|chorba|soupe/i.test(a.n))).toBe(true);
  });
});

describe('indiceSatiete', () => {
  it('classe un plat protéique au-dessus d’un plat sucré', () => {
    const poulet: Aliment = { n: 'Poulet grillé', k: 165, p: 31, c: 0, f: 3.6 };
    const patisserie: Aliment = { n: 'Chebakia', k: 480, p: 5, c: 60, f: 24 };
    expect(indiceSatiete(poulet)).toBeGreaterThan(indiceSatiete(patisserie));
  });

  it('reste borné entre 0 et 1, même sur des valeurs absurdes', () => {
    for (const a of [
      { n: 'x', k: 0, p: 0, c: 0, f: 0 },
      { n: 'y', k: 900, p: 0, c: 0, f: 100 },
      { n: 'z', k: 100, p: 999, c: 0, f: 0 },
    ] as Aliment[]) {
      const i = indiceSatiete(a);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThanOrEqual(1);
    }
  });
});

describe('suggererSuhoor', () => {
  it('propose une assiette proche du budget', () => {
    const a = suggererSuhoor(BASE, 700, '2026-03-15');
    expect(a.portions.length).toBeGreaterThan(0);
    // Les portions sont arrondies et bornées : on vise l'ordre de grandeur, pas
    // l'exactitude au gramme — promettre 700 kcal pile serait une fausse précision.
    expect(a.kcal).toBeGreaterThan(350);
    expect(a.kcal).toBeLessThan(1050);
  });

  it('donne des portions réalistes', () => {
    const a = suggererSuhoor(BASE, 700, '2026-03-15');
    for (const p of a.portions) {
      // Bornes des plats : 60 a 450 g (cf. PLAT dans le module). Les
      // accompagnements legers, eux, descendent plus bas — d'ou le minimum a 15.
      expect(p.grammes).toBeGreaterThanOrEqual(15);
      expect(p.grammes).toBeLessThanOrEqual(450);
    }
  });

  it('est STABLE : même jour, même suggestion', () => {
    const a = suggererSuhoor(BASE, 700, '2026-03-15');
    const b = suggererSuhoor(BASE, 700, '2026-03-15');
    expect(a.portions.map((p) => p.aliment.n)).toEqual(b.portions.map((p) => p.aliment.n));
  });

  it('VARIE d’un jour à l’autre', () => {
    // Manger le même plat trente soirs de suite ferait abandonner n'importe qui.
    const jours = ['2026-03-15', '2026-03-16', '2026-03-17', '2026-03-18', '2026-03-19'];
    const noms = jours.map((j) => suggererSuhoor(BASE, 700, j).portions[0]?.aliment.n);
    expect(new Set(noms).size).toBeGreaterThan(1);
  });
});

describe('suggererIftar', () => {
  it('respecte l’ordre traditionnel : dattes, soupe, puis plat', () => {
    const a = suggererIftar(BASE, 1200, '2026-03-15');
    const noms = a.portions.map((p) => p.aliment.n.toLowerCase());
    expect(noms[0]).toMatch(/dattes?/);
    expect(noms[1]).toMatch(/harira|chorba|soupe/);
    expect(a.portions.length).toBeGreaterThanOrEqual(3);
  });

  it('ne noie pas le repas dans les dattes', () => {
    // Trois dattes, pas trois cents grammes : la rupture doit rester légère.
    const a = suggererIftar(BASE, 1200, '2026-03-15');
    expect(a.portions[0].kcal).toBeLessThan(150);
  });

  it('reste dans l’ordre de grandeur du budget', () => {
    const a = suggererIftar(BASE, 1200, '2026-03-15');
    expect(a.kcal).toBeGreaterThan(600);
    expect(a.kcal).toBeLessThan(1800);
  });

  it('ne répète pas le même plat dans une assiette', () => {
    const a = suggererIftar(BASE, 1200, '2026-03-15');
    const noms = a.portions.map((p) => p.aliment.n);
    expect(new Set(noms).size).toBe(noms.length);
  });
});

describe('cas dégradés', () => {
  it('ne plante pas sur une base vide ou un budget nul', () => {
    expect(suggererSuhoor([], 700, '2026-03-15').portions).toHaveLength(0);
    expect(suggererIftar([], 1200, '2026-03-15').portions).toHaveLength(0);
    expect(suggererSuhoor(BASE, 0, '2026-03-15').portions).toHaveLength(0);
    expect(suggererIftar(BASE, -5, '2026-03-15').portions).toHaveLength(0);
  });

  it('rend un nom dans la langue demandée', () => {
    const avecArabe = BASE.find((a) => a.ar);
    expect(nomAliment(avecArabe!, 'ar')).toBe(avecArabe!.ar);
    expect(nomAliment(avecArabe!, 'fr')).toBe(avecArabe!.n);
    // Sans traduction disponible, on rend le français plutôt qu'une chaîne vide.
    expect(nomAliment({ n: 'Test', k: 100, p: 1, c: 1, f: 1 }, 'ar')).toBe('Test');
  });

  it('la graine du jour est déterministe', () => {
    expect(graineDuJour('2026-03-15')).toBe(graineDuJour('2026-03-15'));
    expect(graineDuJour('2026-03-15')).not.toBe(graineDuJour('2026-03-16'));
  });
});
