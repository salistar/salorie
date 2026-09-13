/**
 * Le coureur fantôme : des maths pures, sur un écran qui n'en a jamais eu.
 * ---------------------------------------------------------------------------
 * `lib/ghostRoute.ts` place un adversaire virtuel dans la réalité augmentée de
 * `/ar-ghost` (560 lignes, aucun test avant le 13/09/2026). Le module a été
 * écrit testable — aucune dépendance, aucun `Date.now()`, le temps écoulé passe
 * toujours en argument — et personne n'était venu le tester.
 *
 * Ce qu'une erreur ici produit : un fantôme dessiné **du mauvais côté**. Le
 * coureur se retourne pour chercher quelqu'un qui est devant lui, ou accélère en
 * croyant mener. Rien ne plante, rien ne s'affiche en rouge : l'écran reste
 * parfaitement crédible et ment.
 *
 * ⚠ CONVENTION DE SIGNE, ET C'EST LE PIÈGE DU FICHIER. Les caps sont **signés**
 * dans [-180, 180), pas dans [0, 360). Plein ouest vaut −90, pas 270. Et 180 est
 * ramené à −180. Un écran qui testerait `angle > 0` pour choisir un côté
 * enverrait donc le fantome plein sud du mauvais bord.
 */
import {
  bearingDeg, gapM, ghostDistanceM, ghostScreenAngle, ghostSize, hav, norm180, paceToSpeed,
} from '../lib/ghostRoute';

const CASA = { lat: 33.5731, lng: -7.5898 };
const d = 0.01;

describe('norm180 — ramener un angle dans [-180, 180)', () => {
  it('laisse tranquille ce qui est deja dedans', () => {
    for (const a of [0, 45, -45, 179, -179]) expect(norm180(a)).toBe(a);
  });

  it('⚠ 180 devient -180, ET C EST VOULU', () => {
    // L'intervalle est semi-ouvert : +180 n'existe pas. Les deux ecrans (AR
    // fantome et defi AR) partagent cette convention ; en changer un seul
    // ferait diverger deux affichages censes etre identiques.
    expect(norm180(180)).toBe(-180);
    expect(norm180(-180)).toBe(-180);
    expect(norm180(540)).toBe(-180);
  });

  it('ramene les tours complets et les valeurs negatives', () => {
    expect(norm180(360)).toBe(0);
    expect(norm180(720)).toBe(0);
    expect(norm180(-190)).toBe(170);
    expect(norm180(370)).toBe(10);
  });
});

describe('paceToSpeed et ghostDistanceM — ou en est le fantome', () => {
  it('6:00/km font 2,78 m/s', () => {
    expect(paceToSpeed(360)).toBeCloseTo(2.7778, 4);
    expect(paceToSpeed(300)).toBeCloseTo(3.3333, 4); // 5:00/km
  });

  it('⚠ une allure absurde met le fantome A L ARRET, jamais en NaN', () => {
    // Une allure a zero donnerait 1000/0 = Infinity : le fantome partirait a
    // l'infini au premier rendu, et `gap` deviendrait Infinity. Un NaN, lui, se
    // propagerait jusqu'a la taille du sprite et ferait disparaitre l'image
    // sans erreur.
    for (const mauvaise of [0, -60, NaN, Infinity, undefined as any, null as any]) {
      expect(paceToSpeed(mauvaise)).toBe(0);
      expect(ghostDistanceM(mauvaise, 600)).toBe(0);
    }
  });

  it('la distance est vitesse x temps', () => {
    expect(ghostDistanceM(360, 600)).toBeCloseTo(1666.667, 3); // 10 min a 6:00/km
    expect(ghostDistanceM(300, 1200)).toBeCloseTo(4000, 6);    // 20 min a 5:00/km
  });

  it('avant le depart, le fantome est au point zero', () => {
    // Un temps negatif ou nul ne doit pas le faire reculer derriere la ligne.
    expect(ghostDistanceM(360, 0)).toBe(0);
    expect(ghostDistanceM(360, -10)).toBe(0);
    expect(ghostDistanceM(360, NaN)).toBe(0);
  });
});

describe('gapM — qui mene', () => {
  it('positif quand le fantome devance', () => {
    expect(gapM(1000, 900)).toBe(100);
  });

  it('negatif quand le coureur mene', () => {
    // C'est le signe qui commande le cote de l'ecran : l'inverser retournerait
    // tout l'affichage sans rien casser d'autre.
    expect(gapM(900, 1000)).toBe(-100);
  });

  it('une entree non finie compte pour zero', () => {
    // Au premier rendu, la distance utilisateur n'existe pas encore.
    expect(gapM(500, NaN)).toBe(500);
    expect(gapM(NaN, 500)).toBe(-500);
    expect(gapM(undefined as any, undefined as any)).toBe(0);
  });
});

describe('ghostScreenAngle — de quel cote le dessiner', () => {
  it('fantome devant, coureur face au nord : droit devant', () => {
    expect(ghostScreenAngle(0, 0, 50)).toBe(0);
  });

  it('fantome derriere : dans le dos, a 180 degres', () => {
    expect(ghostScreenAngle(0, 0, -50)).toBe(-180);
  });

  it('⚠ A EGALITE PARFAITE, LE FANTOME EST DEVANT', () => {
    // `gap >= 0` : au coude a coude exact, on le dessine devant plutot que
    // derriere. Arbitraire, mais il faut choisir — et un `>` ferait clignoter le
    // sprite d'un bord a l'autre au moment precis ou les deux se rejoignent,
    // c'est-a-dire au moment le plus regarde de la course.
    expect(ghostScreenAngle(0, 0, 0)).toBe(0);
  });

  it('tourner la tete deplace le fantome dans le champ', () => {
    // Le coureur court vers le nord, le fantome devant lui. S'il tourne la tete
    // de 90 degres vers l'est, le fantome doit passer a gauche de l'ecran.
    expect(ghostScreenAngle(0, 90, 50)).toBe(-90);
    expect(ghostScreenAngle(0, -90, 50)).toBe(90);
    expect(ghostScreenAngle(45, 90, 50)).toBe(-45);
  });

  it('⚠ le fantome PLEIN SUD est a -180, jamais a +180', () => {
    // `bearingDeg` peut rendre exactement +180 (plein sud), mais `norm180` le
    // ramene a -180. Un ecran qui choisirait son cote avec `angle > 0` aurait
    // donc tort precisement dans ce cas.
    expect(ghostScreenAngle(180, 0, 50)).toBe(-180);
    expect(ghostScreenAngle(0, 180, 50)).toBe(-180);
  });

  it('des caps absents valent zero, pas NaN', () => {
    // Avant le premier point GPS, il n'y a ni cap de course ni boussole.
    expect(ghostScreenAngle(NaN, NaN, 10)).toBe(0);
    expect(ghostScreenAngle(undefined as any, 30, 10)).toBe(-30);
  });
});

describe('ghostSize — proche donc grand', () => {
  it('colle au coureur : taille maximale', () => {
    expect(ghostSize(0)).toBe(140);
  });

  it('decroit lineairement jusqu a 120 m', () => {
    expect(ghostSize(30)).toBe(116);
    expect(ghostSize(60)).toBe(92);
    expect(ghostSize(120)).toBe(44);
  });

  it('au-dela de 120 m, la taille est plancher', () => {
    // Sans ce plafonnement, un ecart de 500 m rendrait une taille negative et
    // le sprite disparaitrait — alors que le fantome est justement le seul
    // repere de l'ecran.
    expect(ghostSize(500)).toBe(44);
    expect(ghostSize(10_000)).toBe(44);
  });

  it('le signe de l ecart ne change pas la taille', () => {
    // Devant ou derriere, a 60 m c'est la meme distance.
    expect(ghostSize(-60)).toBe(ghostSize(60));
  });

  it('un ecart incalculable rend le sprite lointain, pas invisible', () => {
    expect(ghostSize(NaN)).toBe(44);
    expect(ghostSize(undefined as any)).toBe(44);
  });
});

describe('bearingDeg et hav — la geometrie du terrain', () => {
  it('les quatre points cardinaux, dans la convention SIGNEE', () => {
    expect(bearingDeg(CASA, { lat: CASA.lat + d, lng: CASA.lng })).toBeCloseTo(0, 3);
    expect(bearingDeg(CASA, { lat: CASA.lat - d, lng: CASA.lng })).toBeCloseTo(180, 3);
    expect(bearingDeg(CASA, { lat: CASA.lat, lng: CASA.lng + d })).toBeCloseTo(90, 2);
    // ⚠ Plein OUEST vaut -90, PAS 270.
    expect(bearingDeg(CASA, { lat: CASA.lat, lng: CASA.lng - d })).toBeCloseTo(-90, 2);
  });

  it('une diagonale tombe entre les deux', () => {
    const ne = bearingDeg(CASA, { lat: CASA.lat + d, lng: CASA.lng + d });
    expect(ne).toBeGreaterThan(0);
    expect(ne).toBeLessThan(90);
  });

  it('deux points identiques rendent 0, pas NaN', () => {
    // Le coureur a l'arret envoie deux fois le meme point.
    expect(bearingDeg(CASA, { ...CASA })).toBe(0);
    expect(hav(CASA, { ...CASA })).toBe(0);
  });

  it('hav mesure les memes metres que l anti-triche', () => {
    // Les deux modules dupliquent la formule volontairement (chacun autonome).
    // S'ils divergeaient, la distance affichee et la distance validee ne
    // parleraient plus de la meme course.
    expect(hav({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111194.93, 1);
    expect(hav(CASA, { lat: 34.0209, lng: -6.8416 })).toBeCloseTo(85201, 0);
  });
});
