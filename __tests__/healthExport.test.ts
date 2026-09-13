/**
 * L'agrégation du rapport médecin : trente jours ramenés à huit chiffres.
 * ---------------------------------------------------------------------------
 * `lib/healthExport.buildHealthReport()` rassemble profil, conditions, nutrition,
 * poids et constantes vitales pour `/health-export` (377 lignes, aucun test
 * avant le 13/09/2026). Le RENDU est testé à part (`rapportSante.test.ts`) ;
 * ici on teste ce qui produit les nombres.
 *
 * ⚠ CHAQUE SOURCE EST ISOLÉE, ET C'EST LA PROPRIÉTÉ CENTRALE. Un profil
 * Firestore injoignable ne doit pas vider la nutrition ; un module de
 * constantes vitales absent ne doit pas emporter le poids. Un rapport partiel
 * reste utile à un soignant ; un rapport vide ne l'est pas, et un rapport qui
 * plante ne sort jamais.
 */
const profil: any = { valeur: null, casse: false };
const logsParJour = new Map<string, any[]>();
let logsCassent = false;
const pesees: any[] = [];
let peseesCassent = false;
let conditions: string[] = [];
let prefsCassent = false;
let glycemies: any[] = [];
let tensions: any[] = [];
let vitauxCassent = false;

jest.mock('../lib/firebase', () => ({
  getUserFromFirestore: jest.fn(async () => {
    if (profil.casse) throw new Error('firestore indisponible');
    return profil.valeur;
  }),
  getNutritionLogs: jest.fn(async (_email: string, jour: string) => {
    if (logsCassent) throw new Error('logs indisponibles');
    return logsParJour.get(jour) || [];
  }),
}));

jest.mock('../lib/tracking', () => ({
  getEntries: jest.fn(async () => {
    if (peseesCassent) throw new Error('pesees indisponibles');
    return pesees;
  }),
}));

jest.mock('../lib/dietPrefs', () => ({
  getDietPrefs: jest.fn(async () => {
    if (prefsCassent) throw new Error('prefs indisponibles');
    return { conditions } as any;
  }),
}));

jest.mock('../lib/vitals', () => ({
  listGlucose: jest.fn(async () => {
    if (vitauxCassent) throw new Error('vitaux indisponibles');
    return glycemies;
  }),
  listBP: jest.fn(async () => {
    if (vitauxCassent) throw new Error('vitaux indisponibles');
    return tensions;
  }),
}));

import { buildHealthReport, REPORT_DAYS } from '../lib/healthExport';
import { dayStr } from '../lib/rapportSanteHtml';

const MAIL = 'idriss@salistar.com';
const JOUR = (decalage: number) => dayStr(Date.now() - decalage * 86_400_000);

beforeEach(() => {
  profil.valeur = { firstName: 'Idriss', goal: 'perte', weight: 78, nutritionalPlan: { dailyCalories: 2100 } };
  profil.casse = false;
  logsParJour.clear();
  logsCassent = false;
  pesees.length = 0;
  peseesCassent = false;
  conditions = [];
  prefsCassent = false;
  glycemies = [];
  tensions = [];
  vitauxCassent = false;
});

describe('le profil', () => {
  it('reprend le prenom, l objectif, le poids et l objectif calorique', async () => {
    const r = await buildHealthReport(MAIL);
    expect(r).toMatchObject({ name: 'Idriss', goal: 'perte', weightKg: 78, targetCalories: 2100 });
    expect(r.generatedAt).toBeGreaterThan(0);
  });

  it('sans prenom, retombe sur la partie locale du courriel', async () => {
    // Un rapport medical sans nom du tout serait difficile a classer.
    profil.valeur = {};
    expect((await buildHealthReport(MAIL)).name).toBe('idriss');
  });

  it('⚠ UN PROFIL INJOIGNABLE NE VIDE PAS LE RESTE DU RAPPORT', async () => {
    profil.casse = true;
    logsParJour.set(JOUR(0), [{ type: 'meal', calories: 600, protein: 30 }]);
    const r = await buildHealthReport(MAIL);
    expect(r.name).toBe('idriss');      // repli sur le courriel
    expect(r.weightKg).toBeNull();
    expect(r.nutrition.calories).toBe(600);  // la nutrition, elle, est la
  });

  it('un poids ou un objectif calorique a zero vaut « non renseigne »', async () => {
    // `0 kg` sur un document medical serait lu comme une donnee, pas comme une
    // absence.
    profil.valeur = { weight: 0, nutritionalPlan: { dailyCalories: 0 } };
    const r = await buildHealthReport(MAIL);
    expect(r.weightKg).toBeNull();
    expect(r.targetCalories).toBeNull();
  });

  it('accepte les deux noms du champ objectif', async () => {
    profil.valeur = { objective: 'maintien' };
    expect((await buildHealthReport(MAIL)).goal).toBe('maintien');
  });
});

describe('les conditions medicales', () => {
  it('viennent des preferences locales, opt-in', async () => {
    conditions = ['diabetes', 'hypertension'];
    expect((await buildHealthReport(MAIL)).conditions).toEqual(['diabetes', 'hypertension']);
  });

  it('une lecture ratee donne une liste vide, pas undefined', async () => {
    // `r.conditions.length` est lu directement par le gabarit : `undefined`
    // ferait planter le rendu du rapport.
    prefsCassent = true;
    expect((await buildHealthReport(MAIL)).conditions).toEqual([]);
  });
});

describe('la nutrition, moyennee sur les jours ENREGISTRES', () => {
  it('⚠ LA MOYENNE PORTE SUR LES JOURS AVEC DONNEES, PAS SUR TRENTE', async () => {
    // Trois jours a 600 kcal donnent 600, pas 60. C'est ce que le libelle
    // « Moyennes sur {n} jour(s) enregistre(s) » annonce, et c'est ce qui rend
    // le chiffre lisible : un mois a moitie rempli ne doit pas diviser par deux
    // l'apport quotidien d'un patient.
    for (const j of [0, 1, 2]) {
      logsParJour.set(JOUR(j), [{ type: 'meal', calories: 600, protein: 30, carbs: 60, fat: 20 }]);
    }
    const r = await buildHealthReport(MAIL);
    expect(r.nutrition.days).toBe(3);
    expect(r.nutrition.calories).toBe(600);
    expect(r.nutrition.protein).toBe(30);
  });

  it('⚠ L ACTIVITE SE SOUSTRAIT : le chiffre est un apport NET', async () => {
    // Un medecin qui lit « 1 400 kcal » doit savoir que c'est repas moins
    // depense, pas l'ingere. La nuance change l'interpretation.
    logsParJour.set(JOUR(0), [
      { type: 'meal', calories: 2000, protein: 100 },
      { type: 'activity', calories: 600 },
    ]);
    expect((await buildHealthReport(MAIL)).nutrition.calories).toBe(1400);
  });

  it('⚠ ET IL PEUT DONC ETRE NEGATIF', async () => {
    // Rien ne borne le resultat a zero. Une journee ou l'activite est
    // enregistree et les repas oublies rend un apport negatif — un chiffre
    // physiologiquement impossible sur un document medical.
    //
    // Consigne, pas corrige : ramener a zero masquerait le desequilibre au lieu
    // de le montrer, et c'est un arbitrage de presentation qui revient a qui
    // signe le document.
    logsParJour.set(JOUR(0), [{ type: 'activity', calories: 800 }]);
    expect((await buildHealthReport(MAIL)).nutrition.calories).toBe(-800);
  });

  it('⚠ L EAU EST STOCKEE DANS LE CHAMP `calories`', async () => {
    // Quirk du modele de donnees : un log d'eau porte son volume en mL dans
    // `calories`. Le lire dans `log.water` — ce que tout le monde essaie
    // d'abord — rendrait zero, et la ligne hydratation du rapport serait vide
    // sans explication.
    logsParJour.set(JOUR(0), [
      { type: 'water', calories: 1500 },
      { type: 'meal', calories: 700 },
    ]);
    const r = await buildHealthReport(MAIL);
    expect(r.nutrition.water).toBe(1500);
    expect(r.nutrition.calories).toBe(700); // l'eau ne compte pas en kcal
  });

  it('aucun log : des zeros, et zero jour', async () => {
    const r = await buildHealthReport(MAIL);
    expect(r.nutrition).toEqual({ days: 0, calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 });
  });

  it('des logs illisibles ne font pas des NaN', async () => {
    logsParJour.set(JOUR(0), [{ type: 'meal', calories: 'beaucoup', protein: null }]);
    const r = await buildHealthReport(MAIL);
    expect(r.nutrition.calories).toBe(0);
    expect(Number.isNaN(r.nutrition.protein)).toBe(false);
  });

  it('une source de logs en panne rend un rapport vide, pas une exception', async () => {
    logsCassent = true;
    await expect(buildHealthReport(MAIL)).resolves.toBeTruthy();
    expect((await buildHealthReport(MAIL)).nutrition.days).toBe(0);
  });

  it('sans courriel, la nutrition est vide sans interroger quoi que ce soit', async () => {
    const { getNutritionLogs } = require('../lib/firebase');
    (getNutritionLogs as jest.Mock).mockClear();
    const r = await buildHealthReport('');
    expect(r.nutrition.days).toBe(0);
    expect(getNutritionLogs).not.toHaveBeenCalled();
  });
});

describe('le poids', () => {
  it('ne garde que les pesees plausibles et dans la fenetre', async () => {
    pesees.push(
      { date: JOUR(1), weight: 78 },
      { date: JOUR(2), weight: 0 },              // pesee vide
      { date: '2020-01-01', weight: 90 },        // hors fenetre
      { date: JOUR(3), weight: 'abc' },          // illisible
    );
    const r = await buildHealthReport(MAIL);
    expect(r.weightSeries).toEqual([{ date: JOUR(1), kg: 78 }]);
  });

  it('⚠ LE POIDS EST COERCE ICI, ET LE GABARIT COMPTE DESSUS', async () => {
    // `kg: num(w.weight)` : c'est la seule raison pour laquelle le gabarit HTML
    // peut interpoler `${w.kg}` sans echapper. Cf. `rapportSante.test.ts`.
    pesees.push({ date: JOUR(1), weight: '77.4' });
    expect((await buildHealthReport(MAIL)).weightSeries[0].kg).toBe(77.4);
  });

  it('une source de pesees en panne laisse une serie vide', async () => {
    peseesCassent = true;
    expect((await buildHealthReport(MAIL)).weightSeries).toEqual([]);
  });
});

describe('les constantes vitales, importees de facon OPTIONNELLE', () => {
  it('resument glycemie et tension quand elles existent', async () => {
    glycemies = [{ mgdl: 98 }, { mgdl: 120 }, { mgdl: 141 }];
    tensions = [{ systolic: 128, diastolic: 82 }, { systolic: 134, diastolic: 88 }];
    const r = await buildHealthReport(MAIL);
    expect(r.glucose).toMatchObject({ count: 3, min: 98, max: 141, latest: 98 });
    expect(r.bpSystolic).toMatchObject({ count: 2, avg: 131 });
    expect(r.bpDiastolic).toMatchObject({ count: 2, avg: 85 });
  });

  it('les mesures a zero sont ecartees du resume', async () => {
    // Un tensiometre sans capteur, ou un champ laisse vide, ferait chuter la
    // moyenne et inventerait une hypotension sur le papier.
    glycemies = [{ mgdl: 100 }, { mgdl: 0 }, { mgdl: 120 }];
    expect((await buildHealthReport(MAIL)).glucose!.count).toBe(2);
  });

  it('⚠ MODULE ABSENT OU EN PANNE : LES SECTIONS SONT OMISES, PAS A ZERO', async () => {
    // `null` fait disparaitre le bloc du rapport. Un `0` aurait affiche
    // « glycemie moyenne : 0 mg/dL » a un medecin — une valeur incompatible
    // avec la vie, presentee comme une mesure.
    vitauxCassent = true;
    const r = await buildHealthReport(MAIL);
    expect(r.glucose).toBeNull();
    expect(r.bpSystolic).toBeNull();
    expect(r.bpDiastolic).toBeNull();
    // Et le reste du rapport tient debout.
    expect(r.name).toBe('Idriss');
  });

  it('aucune mesure : sections nulles aussi', async () => {
    const r = await buildHealthReport(MAIL);
    expect(r.glucose).toBeNull();
    expect(r.bpSystolic).toBeNull();
  });
});

describe('la fenetre du rapport', () => {
  it('porte sur trente jours par defaut', async () => {
    const { getNutritionLogs } = require('../lib/firebase');
    (getNutritionLogs as jest.Mock).mockClear();
    await buildHealthReport(MAIL);
    expect(REPORT_DAYS).toBe(30);
    expect((getNutritionLogs as jest.Mock).mock.calls).toHaveLength(30);
  });

  it('et se resserre a la demande', async () => {
    const { getNutritionLogs } = require('../lib/firebase');
    (getNutritionLogs as jest.Mock).mockClear();
    await buildHealthReport(MAIL, undefined, 7);
    expect((getNutritionLogs as jest.Mock).mock.calls).toHaveLength(7);
  });
});
