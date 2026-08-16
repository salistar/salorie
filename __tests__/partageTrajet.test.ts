import { allure, duree, recitTrajet, cheminTrajet } from '../lib/partageTrajet';

/**
 * Le récit d'un trajet, tel qu'il part dans la conversation de quelqu'un.
 *
 * Deux choses s'y jouent : une allure fausse discrédite l'app auprès de la seule
 * personne capable de la vérifier — un coureur — et une trace GPS qui fuit dit
 * où quelqu'un habite.
 */

describe('allure', () => {
  it('calcule les minutes par kilomètre', () => {
    expect(allure(10, 50)).toBe('5:00');
    expect(allure(8.4, 52)).toBe('6:11');
  });

  it("n'écrit jamais 6:60", () => {
    // L'arrondi des secondes peut mener à 60. Une allure « 6:60 » se lit comme
    // un bug, et c'est un coureur qui la lira.
    const a = allure(60, 359.5);
    expect(a).not.toMatch(/:60$/);
  });

  it('rend une chaîne vide plutôt qu’une division par zéro', () => {
    expect(allure(0, 30)).toBe('');
    expect(allure(10, 0)).toBe('');
    expect(allure(-5, 30)).toBe('');
  });
});

describe('duree', () => {
  it('passe en heures au-delà de 60 minutes', () => {
    // « 72 min » demande un calcul mental ; « 1 h 12 » se lit.
    expect(duree(45, 'fr')).toBe('45 min');
    expect(duree(72, 'fr')).toBe('1 h 12');
    expect(duree(120, 'fr')).toBe('2 h');
  });

  it('garde deux chiffres aux minutes', () => {
    // « 1 h 5 » se lit mal ; « 1 h 05 » est sans ambiguïté.
    expect(duree(65, 'fr')).toBe('1 h 05');
  });

  it('écrit en arabe quand la langue est arabe', () => {
    expect(duree(72, 'ar')).toMatch(/[؀-ۿ]/);
  });
});

describe('recitTrajet', () => {
  const base = { km: 8.4, minutes: 52 };

  it('raconte plutôt que de tabuler', () => {
    const r = recitTrajet(base, 'fr');
    expect(r).toContain('8,4 km');
    expect(r).toContain('52 min');
    expect(r).toContain('6:11');
  });

  it('met une virgule décimale en français et un point en anglais', () => {
    expect(recitTrajet(base, 'fr')).toContain('8,4');
    expect(recitTrajet(base, 'en')).toContain('8.4');
  });

  it('préfère le dénivelé aux calories quand il est notable', () => {
    // C'est ce dont on est fier, et c'est ce qui explique une allure lente.
    const r = recitTrajet({ ...base, denivele: 320, kcal: 600 }, 'fr');
    expect(r).toContain('320 m');
    expect(r).not.toContain('kcal');
  });

  it('retombe sur les calories quand le dénivelé est négligeable', () => {
    const r = recitTrajet({ ...base, denivele: 12, kcal: 600 }, 'fr');
    expect(r).toContain('600 kcal');
    expect(r).not.toContain('dénivelé');
  });

  it("n'empile pas les détails", () => {
    // Tout mettre transformerait la phrase en tableau, ce qu'on évite.
    const r = recitTrajet({ ...base, denivele: 320, kcal: 600 }, 'fr');
    expect(r.split('.').length).toBeLessThanOrEqual(3);
  });

  it('nomme le lieu quand on le connaît', () => {
    expect(recitTrajet({ ...base, lieu: 'Bouskoura' }, 'fr')).toContain('à Bouskoura');
    expect(recitTrajet({ ...base, lieu: 'Bouskoura' }, 'ar')).toContain('Bouskoura');
  });

  it('existe dans les trois langues', () => {
    expect(recitTrajet(base, 'ar')).toMatch(/[؀-ۿ]/);
    expect(recitTrajet(base, 'en')).toContain('Pace');
    expect(recitTrajet(base, 'zz')).toContain('Allure');
  });
});

describe('cheminTrajet', () => {
  it('ne porte QUE un identifiant, jamais de coordonnées', () => {
    // Un trajet part souvent du domicile : une trace partagée dirait où quelqu'un
    // habite et à quelle heure il n'y est pas.
    const c = cheminTrajet('abc123');
    expect(c).toBe('trajet/abc123');
    expect(c).not.toMatch(/\d+\.\d{4,}/);
  });

  it('encode et borne ce qui arrive', () => {
    expect(cheminTrajet('a/b?c=1')).not.toContain('?');
    expect(cheminTrajet('x'.repeat(200)).length).toBeLessThan(80);
  });
});
