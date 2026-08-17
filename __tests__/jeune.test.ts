import { etatJeune, formaterReste, PROTOCOLES } from '../web/lib/jeune';

/**
 * Le minuteur de jeûne répond à une question à laquelle une réponse
 * approximative ne sert à rien : « est-ce que je peux manger maintenant ? »
 *
 * `etatJeune` prend l'heure courante en PARAMÈTRE plutôt que de lire
 * `Date.now()` — c'est ce qui rend ces cas testables sans attendre seize heures.
 */

const H = 3600_000;

describe('etatJeune', () => {
  it('donne le temps restant au milieu du jeûne', () => {
    const debut = 1_000_000;
    const e = etatJeune(debut, 16, debut + 4 * H);
    expect(e.fini).toBe(false);
    expect(e.resteMs).toBe(12 * H);
    expect(e.pourcent).toBe(25);
  });

  it('bascule à « fini » exactement à l’échéance, pas après', () => {
    // La minute de trop compte : quelqu'un qui attend la fin de son jeune
    // regarde cet ecran, et « encore 1 seconde » a l'heure pile serait faux.
    const debut = 0;
    expect(etatJeune(debut, 16, 16 * H).fini).toBe(true);
    expect(etatJeune(debut, 16, 16 * H - 1).fini).toBe(false);
  });

  it('ne descend jamais sous zéro une fois l’échéance passée', () => {
    const e = etatJeune(0, 16, 40 * H);
    expect(e.resteMs).toBe(0);
    expect(e.pourcent).toBe(100);
  });

  it('traite une durée nulle comme déjà finie', () => {
    // Sinon : barre vide et jeune eternellement en cours.
    const e = etatJeune(0, 0, 0);
    expect(e.fini).toBe(true);
    expect(e.pourcent).toBe(100);
  });

  it('supporte un début dans le futur sans partir en négatif', () => {
    // Horloge du telephone en avance sur celle de l'ordinateur : l'ecart est
    // reel, et un pourcentage negatif dessinerait une barre a l'envers.
    const e = etatJeune(10 * H, 16, 0);
    expect(e.pourcent).toBe(0);
    expect(e.fini).toBe(false);
  });

  it('couvre les quatre protocoles du mobile', () => {
    expect(PROTOCOLES.map((p) => p.id)).toEqual(['16:8', '18:6', '20:4', 'OMAD']);
    // 16:8 doit laisser 8 h de fenetre alimentaire.
    expect(24 - PROTOCOLES[0].heuresJeune).toBe(8);
  });
});

describe('formaterReste', () => {
  it('affiche toujours deux chiffres par champ', () => {
    expect(formaterReste(3 * H + 5 * 60_000 + 7000)).toBe('03:05:07');
  });

  it('affiche zéro plutôt qu’un temps négatif', () => {
    expect(formaterReste(-5000)).toBe('00:00:00');
  });

  it('ne repasse pas à zéro au-delà de 24 h', () => {
    // OMAD frole les 24 h : un format qui boucle afficherait « 01:00:00 »
    // pour 25 h restantes.
    expect(formaterReste(25 * H)).toBe('25:00:00');
  });
});
