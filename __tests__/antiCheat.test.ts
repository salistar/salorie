/**
 * L'anti-triche : le seul module dont une erreur ne se voit jamais.
 * ---------------------------------------------------------------------------
 * `lib/antiCheat.ts` décide, point GPS par point GPS, si un déplacement est
 * assez vraisemblable pour compter dans la distance d'une course. Il n'affiche
 * rien, ne lève rien, et se trompe en silence dans les deux sens :
 *
 *   - trop laxiste → un trajet en voiture devient un record de course, et le
 *     classement d'un défi est faussé pour tout le monde ;
 *   - trop strict  → un coureur honnête voit sa distance cesser d'avancer, sans
 *     un mot d'explication, et conclut que l'application est cassée.
 *
 * Aucun des deux ne produit d'erreur. C'est pour ça qu'il est testé ici, et
 * c'est pour ça qu'il figurait en tête des seize écrans « qui portent de la
 * logique sans aucun test » (audit du 10/09/2026).
 *
 * ⚠ CE QUE CE MODULE NE FAIT PAS : il ne détecte pas la triche, il borne une
 * VITESSE. La nuance a des conséquences, mesurées plus bas.
 */
import { isPlausibleMove, maxSpeedFor } from '../lib/antiCheat';

/**
 * Mètres par degré de latitude, selon la formule du module (rayon 6 371 km).
 * On déplace toujours vers le NORD : un décalage de latitude donne la même
 * distance quelle que soit la longitude, ce qui rend les cas lisibles.
 */
const M_PAR_DEGRE = 111194.92664455873;

const BASE = { lat: 33.5731, lng: -7.5898 }; // Casablanca
const T0 = 1_700_000_000_000;

/** Un point à `metres` au nord de la base, `secondes` plus tard. */
function apres(metres: number, secondes: number) {
  return {
    lat: BASE.lat + metres / M_PAR_DEGRE,
    lng: BASE.lng,
    ts: T0 + secondes * 1000,
  };
}

/** Le déplacement est-il retenu ? (signature aplatie, plus lisible ici) */
function retenu(metres: number, secondes: number, activite?: string): boolean {
  const p = apres(metres, secondes);
  return isPlausibleMove(BASE.lat, BASE.lng, T0, p.lat, p.lng, p.ts, activite);
}

describe('maxSpeedFor — le seuil depend de l activite', () => {
  it('marche et course : 30 km/h, dans les trois langues', () => {
    // Un sprinteur d'elite plafonne vers 37 km/h sur 100 m ; 30 laisse la marge
    // utile tout en coupant le vehicule.
    for (const a of ['run', 'running', 'walk', 'jog', 'hike', 'marche', 'course', 'rando', 'جري', 'مشي']) {
      expect(maxSpeedFor(a)).toBe(30);
    }
  });

  it('velo : 80 km/h', () => {
    for (const a of ['bike', 'cycling', 'ride', 'velo', 'vélo', 'دراجة']) {
      expect(maxSpeedFor(a)).toBe(80);
    }
  });

  it('inconnu, vide ou absent : 120 km/h, filet large', () => {
    // Un seuil par defaut TROP bas rejetterait une activite legitime qu'on n'a
    // pas prevue ; 120 ne laisse passer que ce qui est clairement motorise.
    expect(maxSpeedFor('natation')).toBe(120);
    expect(maxSpeedFor('')).toBe(120);
    expect(maxSpeedFor(undefined)).toBe(120);
  });

  it('la casse ne compte pas', () => {
    expect(maxSpeedFor('RUN')).toBe(30);
    expect(maxSpeedFor('Vélo')).toBe(80);
  });

  it('⚠ un libelle AMBIGU recoit le seuil le plus STRICT', () => {
    // « course cycliste » contient `course` (30) ET `cycl` (80). Le test marche
    // passant en premier, c'est 30 qui gagne. C'est le bon sens pour un
    // anti-triche — on prefere sous-compter que gonfler — mais il faut le
    // savoir : un cycliste dont l'activite porte ce libelle verrait sa distance
    // cesser d'avancer au-dela de 30 km/h, sans explication.
    expect(maxSpeedFor('course cycliste')).toBe(30);
    expect(maxSpeedFor('randonnée à vélo')).toBe(30);
  });

  it('⚠ AUJOURD HUI, SEUL LE SEUIL DE 30 EST ATTEINT EN PRODUCTION', () => {
    // `run.tsx` et `ar-ghost.tsx` passent tous deux la chaine 'run' EN DUR
    // (verifie le 13/09/2026). Les paliers velo et defaut existent, sont justes,
    // et ne servent a rien tant qu'aucun appelant ne transmet l'activite reelle.
    // Ce test ne fait que le CONSIGNER : le jour ou un ecran passera 'bike', la
    // ligne au-dessus deviendra vraie en production aussi.
    expect(maxSpeedFor('run')).toBe(30);
  });
});

describe('isPlausibleMove — ce qui compte dans la distance', () => {
  it('une allure de marche ou de course passe', () => {
    expect(retenu(4.17, 3, 'run')).toBe(true);   // ~5 km/h
    expect(retenu(10, 3, 'run')).toBe(true);     // 12 km/h
    expect(retenu(20, 3, 'run')).toBe(true);     // 24 km/h
  });

  it('le seuil coupe la ou il est annonce : 25 m en 3 s', () => {
    // 30 km/h = 8,333 m/s, soit 25 m en 3 s.
    //
    // ⚠ ET ON NE TESTE PAS ICI `<=` CONTRE `<`, PARCE QUE C'EST INOBSERVABLE.
    // Construire un point « exactement a 30 km/h » demande de convertir des
    // metres en degres avec une constante arrondie : la vitesse recalculee
    // retombe a 29,9999999998 km/h, jamais sur 30. Ma premiere version de ce
    // test affirmait le contraire — elle etait fausse, et le flottant l'a dit.
    // Ce qui est verrouille est donc le seuil PRATIQUE, qui est ce qui compte.
    expect(retenu(25, 3, 'run')).toBe(true);
    expect(retenu(24.9, 3, 'run')).toBe(true);
    expect(retenu(25.1, 3, 'run')).toBe(false);
  });

  it('le meme deplacement est juge selon l activite', () => {
    // 99 m en 3 s = 118,8 km/h : impossible a pied, impossible a velo, tolere
    // par le filet par defaut. (A 100 m pile on tombe sur 120,0000000003 km/h,
    // soit un cheveu AU-DESSUS du seuil : le cas limite exact n'est pas
    // atteignable par cette voie, cf. le test precedent.)
    expect(retenu(99, 3, 'run')).toBe(false);
    expect(retenu(99, 3, 'bike')).toBe(false);
    expect(retenu(99, 3)).toBe(true);
    // 60 m en 3 s = 72 km/h : refuse a pied, accepte a velo (descente).
    expect(retenu(60, 3, 'run')).toBe(false);
    expect(retenu(60, 3, 'bike')).toBe(true);
  });

  it('⚠ UN TELEPORT EST REFUSE... TANT QU IL EST RAPIDE', () => {
    // Casablanca -> Rabat, 85,2 km. Refuse en 10 secondes, evidemment.
    const rabat = { lat: 34.0209, lng: -6.8416 };
    expect(isPlausibleMove(BASE.lat, BASE.lng, T0, rabat.lat, rabat.lng, T0 + 10_000, 'run')).toBe(false);

    // Mais le module borne une VITESSE, pas un saut : le MEME bond devient
    // « plausible » passe 2 h 50 (85,2 km a 30 km/h). Ce n'est pas un defaut du
    // calcul, c'est sa definition — et ca compte, parce que les deux appelants
    // ne mettent PAS a jour leur horodatage quand ils rejettent un point : le
    // Δt grandit a chaque rejet, et le seuil devient de plus en plus facile.
    //
    // Ce qui protege la DISTANCE ensuite, c'est le filtre de gigue (`d < 80 m`)
    // dans l'ecran. Le TRACE publie, lui, n'a pas cette seconde barriere.
    const troisHeures = T0 + 3 * 3600 * 1000;
    expect(isPlausibleMove(BASE.lat, BASE.lng, T0, rabat.lat, rabat.lng, troisHeures, 'run')).toBe(true);
  });

  it('a la cadence reelle du GPS, c est l anti-triche qui mord en premier', () => {
    // Les deux ecrans echantillonnent toutes les 3 s. L'anti-triche coupe a
    // 25 m, le filtre de gigue a 80 m : c'est donc bien l'anti-triche qui
    // decide, et le filtre de gigue ne rattrape que ce qu'il laisse passer.
    // Si un jour la cadence passait a 10 s, le seuil monterait a 83 m et
    // l'ordre s'inverserait — le filtre de gigue deviendrait le vrai plafond.
    expect(retenu(79, 3, 'run')).toBe(false);
    expect(retenu(79, 10, 'run')).toBe(true);
  });

  it('rester immobile est plausible', () => {
    // Un coureur a l'arret a un feu rouge envoie des points identiques. Les
    // rejeter figerait `lastPt` et fausserait le segment suivant.
    expect(retenu(0, 3, 'run')).toBe(true);
    expect(isPlausibleMove(BASE.lat, BASE.lng, T0, BASE.lat, BASE.lng, T0 + 1, 'run')).toBe(true);
  });
});

describe('isPlausibleMove — tout ce qui n est pas un vrai deplacement', () => {
  it('⚠ deux points au MEME instant sont refuses', () => {
    // Δt = 0 donnerait une division par zero : vitesse Infinity. C'est le cas
    // d'un GPS qui repete son horodatage, et c'est exactement la forme que
    // prend un teleport instantane.
    expect(isPlausibleMove(BASE.lat, BASE.lng, T0, BASE.lat + 0.001, BASE.lng, T0, 'run')).toBe(false);
    // Meme immobile : sans temps ecoule, il n'y a rien a valider.
    expect(isPlausibleMove(BASE.lat, BASE.lng, T0, BASE.lat, BASE.lng, T0, 'run')).toBe(false);
  });

  it('un horodatage qui RECULE est refuse', () => {
    // Les points GPS arrivent parfois dans le desordre. Un Δt negatif rendrait
    // une vitesse negative, donc « inferieure au seuil » : le point serait
    // accepte, et la distance gonflee par un point deja compte.
    expect(retenu(10, -3, 'run')).toBe(false);
    expect(retenu(10_000, -1, 'run')).toBe(false);
  });

  it('une coordonnee ou un horodatage invalide est refuse', () => {
    // `NaN <= 30` vaut false, donc le rejet arriverait quand meme pour les
    // coordonnees — mais pas pour un `prevTs` absent, ou `(ts - undefined)`
    // donne NaN et `NaN <= 0` vaut false : le point serait PASSE au calcul.
    // D'ou le controle explicite en tete de fonction.
    const n = undefined as unknown as number;
    expect(isPlausibleMove(n, BASE.lng, T0, BASE.lat, BASE.lng, T0 + 3000, 'run')).toBe(false);
    expect(isPlausibleMove(BASE.lat, BASE.lng, n, BASE.lat, BASE.lng, T0 + 3000, 'run')).toBe(false);
    expect(isPlausibleMove(BASE.lat, BASE.lng, T0, NaN, BASE.lng, T0 + 3000, 'run')).toBe(false);
    expect(isPlausibleMove(BASE.lat, BASE.lng, T0, BASE.lat, Infinity, T0 + 3000, 'run')).toBe(false);
    expect(isPlausibleMove(BASE.lat, BASE.lng, T0, BASE.lat, BASE.lng, NaN, 'run')).toBe(false);
  });

  it('⚠ le calcul ne fait pas le tour du monde a l antimeridien', () => {
    // De 179,9999° a -179,9999° il y a 22 m, pas 40 000 km. Une formule qui
    // soustrairait betement les longitudes rejetterait chaque point d'un
    // coureur sur ce meridien — et le ferait en silence.
    expect(isPlausibleMove(0, 179.9999, T0, 0, -179.9999, T0 + 3000, 'run')).toBe(true);
    // Et le vrai demi-tour du monde reste refuse.
    expect(isPlausibleMove(0, 0, T0, 0, 180, T0 + 3000, 'run')).toBe(false);
  });

  it('la distance est juste : un degre de latitude vaut 111,2 km', () => {
    // Repere de controle de la formule elle-meme. A 30 km/h il faut 3 h 42 pour
    // le parcourir ; en 3 h 41 c'est encore trop rapide.
    const unDegre = { lat: BASE.lat + 1, lng: BASE.lng };
    const heures = (h: number) => T0 + h * 3600 * 1000;
    expect(isPlausibleMove(BASE.lat, BASE.lng, T0, unDegre.lat, unDegre.lng, heures(3.71), 'run')).toBe(true);
    expect(isPlausibleMove(BASE.lat, BASE.lng, T0, unDegre.lat, unDegre.lng, heures(3.70), 'run')).toBe(false);
  });
});
