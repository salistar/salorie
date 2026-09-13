/**
 * Le rapport santé : un document que quelqu'un montre à son médecin.
 * ---------------------------------------------------------------------------
 * `lib/rapportSanteHtml.ts` fabrique l'export de `/health-export` (377 lignes,
 * aucun test avant le 13/09/2026) — en HTML pour l'impression, en texte pour le
 * partage. Ce n'est pas un écran : c'est une pièce qui sort de l'application et
 * qui sera lue ailleurs, parfois par un soignant, parfois des mois plus tard.
 *
 * Deux familles de risques, et elles ne se ressemblent pas :
 *
 *   1. **Un chiffre faux ou manquant.** Une moyenne qui compte une mesure vide,
 *      une dernière valeur prise au mauvais bout de la liste : le document reste
 *      parfaitement présentable et raconte autre chose que la réalité.
 *   2. **Du HTML injecté.** Le rapport emporte des champs saisis par
 *      l'utilisateur — son nom, ses conditions. `escapeHtml` est la seule
 *      barrière, et tout ce qui la contourne finit dans un fichier partagé.
 */
import {
  REPORT_DAYS, buildReportHtml, buildReportText, conditionLabel, dayStr,
  escapeHtml, num, summarize,
  type HealthReport, type ReportLabels,
} from '../lib/rapportSanteHtml';

const LIBELLES: ReportLabels = {
  title: 'Rapport santé', subtitle: 'Récapitulatif — 30 derniers jours',
  profile: 'Profil', name: 'Nom', goal: 'Objectif', weight: 'Poids',
  targetKcal: 'Objectif calorique', conditions: 'Conditions',
  noConditions: 'Aucune', nutrition: 'Nutrition',
  basedOn: 'Moyennes sur {n} jour(s)', calories: 'Calories', protein: 'Protéines',
  carbs: 'Glucides', fat: 'Lipides', water: 'Eau', weightTrend: 'Poids',
  glucose: 'Glycémie', bloodPressure: 'Tension', avg: 'moy.', min: 'min',
  max: 'max', latest: 'dernière', measures: 'mesures', none: '—',
  disclaimer: 'Ce document ne remplace pas un avis médical.',
  generatedOn: 'Généré le', locale: 'fr-FR', rtl: false,
};

const RAPPORT: HealthReport = {
  name: 'Idriss', goal: 'perte', weightKg: 78, targetCalories: 2100,
  conditions: ['high_cholesterol'],
  nutrition: { days: 24, calories: 1980, protein: 120, carbs: 190, fat: 70, water: 1800 },
  weightSeries: [{ date: '2026-09-12', kg: 78 }, { date: '2026-09-05', kg: 79.4 }],
  glucose: { count: 12, avg: 104.2, min: 82, max: 141, latest: 98 },
  bpSystolic: { count: 8, avg: 128, min: 118, max: 142, latest: 124 },
  bpDiastolic: { count: 8, avg: 82, min: 74, max: 91, latest: 80 },
  generatedAt: Date.parse('2026-09-13T10:00:00Z'),
};

describe('escapeHtml — la seule barriere du document', () => {
  it('neutralise les caracteres qui ouvrent une balise', () => {
    expect(escapeHtml('<script>alert(1)</script>'))
      .toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(escapeHtml('a & b')).toBe('a &amp; b');
    expect(escapeHtml('dit "bonjour"')).toBe('dit &quot;bonjour&quot;');
  });

  it('l esperluette est traitee EN PREMIER', () => {
    // Sinon `&lt;` produit par l'echappement du chevron serait re-echappe en
    // `&amp;lt;` et le document afficherait le code au lieu du texte.
    expect(escapeHtml('<')).toBe('&lt;');
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('⚠ L APOSTROPHE N EST PAS ECHAPPEE — et pourquoi ca tient quand meme', () => {
    // `'` traverse la fonction. Ce n'est exploitable que dans un attribut ecrit
    // avec des apostrophes ; or le gabarit n'utilise QUE des guillemets
    // doubles, eux echappes. La barriere tient donc par une convention du
    // gabarit, pas par la fonction.
    expect(escapeHtml("l'aïd")).toBe("l'aïd");
    // Le gabarit ne doit jamais passer aux apostrophes : si quelqu'un ecrit
    // `<span class='...'>`, ce test-la ne le verra pas, mais celui d'en dessous
    // sur le document complet, si.
    const html = buildReportHtml({ ...RAPPORT, name: "x' onload='alert(1)" }, LIBELLES);
    expect(html).not.toMatch(/=\s*'[^']*onload/);
  });

  it('accepte autre chose qu une chaine sans jeter', () => {
    expect(escapeHtml(null as any)).toBe('null');
    expect(escapeHtml(42 as any)).toBe('42');
  });
});

describe('summarize — le resume d une serie', () => {
  it('rend null sur une serie vide ou illisible', () => {
    expect(summarize([])).toBeNull();
    expect(summarize(null as any)).toBeNull();
    expect(summarize([NaN, Infinity])).toBeNull();
  });

  it('compte, moyenne et extremes, arrondis au dixieme', () => {
    const s = summarize([100, 110, 121])!;
    expect(s).toEqual({ count: 3, avg: 110.3, min: 100, max: 121, latest: 100 });
  });

  it('⚠ « latest » EST LE PREMIER ELEMENT : la serie doit venir triee', () => {
    // Meme contrat implicite que `trend()` dans lib/vitals.ts. Nourri a
    // l'envers, le rapport annonce comme derniere mesure la plus ancienne — et
    // c'est precisement la ligne qu'un soignant lit en premier.
    expect(summarize([98, 104, 141])!.latest).toBe(98);
    expect(summarize([141, 104, 98])!.latest).toBe(141);
  });

  it('les valeurs illisibles sont ecartees, pas comptees comme zero', () => {
    // Une mesure absente qui compterait pour 0 mg/dL ferait chuter la moyenne
    // et inventerait une hypoglycemie sur le papier.
    const s = summarize([100, NaN, 120, undefined as any])!;
    expect(s.count).toBe(2);
    expect(s.avg).toBe(110);
    expect(s.min).toBe(100);
  });
});

describe('num, dayStr, conditionLabel', () => {
  it('num ramene tout a un nombre fini', () => {
    expect(num('12.5')).toBe(12.5);
    expect(num('abc')).toBe(0);
    expect(num(undefined, 7)).toBe(7);
    expect(num(Infinity)).toBe(0);
  });

  it('dayStr suit le fuseau LOCAL, comme les autres cles de date', () => {
    // Trois modules fabriquent cette chaine (format.ymd, tracking.todayStr,
    // dayStr). S'ils divergeaient, une journee de mesures se retrouverait
    // rangee sous deux cles et le rapport en perdrait la moitie.
    const d = new Date(2026, 0, 5, 23, 30);
    expect(dayStr(d.getTime())).toBe('2026-01-05');
    expect(dayStr(new Date(2026, 11, 31).getTime())).toBe('2026-12-31');
  });

  it('conditionLabel rend la cle lisible', () => {
    expect(conditionLabel('high_cholesterol')).toBe('high cholesterol');
    expect(conditionLabel('')).toBe('');
    expect(conditionLabel(null as any)).toBe('');
  });

  it('la fenetre du rapport est de 30 jours', () => {
    expect(REPORT_DAYS).toBe(30);
  });
});

describe('buildReportHtml — le document imprimable', () => {
  it('porte les chiffres du rapport', () => {
    const html = buildReportHtml(RAPPORT, LIBELLES);
    expect(html).toContain('Idriss');
    expect(html).toContain('1980');          // calories moyennes
    expect(html).toContain('104.2');         // glycemie moyenne
    expect(html).toContain('128/82');        // tension moyenne
    expect(html).toContain('high cholesterol');
    expect(html).toContain(LIBELLES.disclaimer);
  });

  it('⚠ LE NOM DE L UTILISATEUR EST ECHAPPE', () => {
    // Le nom vient d'un champ libre et finit dans un fichier partage.
    const html = buildReportHtml({ ...RAPPORT, name: '<img src=x onerror=alert(1)>' }, LIBELLES);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('⚠ LES CONDITIONS AUSSI', () => {
    const html = buildReportHtml({ ...RAPPORT, conditions: ['<b>faux</b>'] }, LIBELLES);
    expect(html).not.toContain('<b>faux</b>');
    expect(html).toContain('&lt;b&gt;faux&lt;/b&gt;');
  });

  it('⚠ MAIS LES NOMBRES SONT INTERPOLES TELS QUELS — CONTRAT AMONT', () => {
    // `${w.kg} kg`, `${s.avg}`, `${r.bpSystolic.latest}` : aucun echappement.
    // Ca tient parce que `buildHealthReport` passe tout par `num()` avant. Le
    // gabarit FAIT DONC CONFIANCE a son appelant pour les numeriques.
    //
    // Ce test le montre plutot que de le supposer : nourri a la main avec une
    // chaine hostile, le document la rend telle quelle. Toute future voie qui
    // construirait un `HealthReport` sans passer par `num()` rouvrirait la
    // porte — et c'est ici qu'il faudra revenir.
    const hostile = {
      ...RAPPORT,
      weightSeries: [{ date: '2026-09-12', kg: '<script>1</script>' as any }],
    };
    const html = buildReportHtml(hostile, LIBELLES);
    expect(html).toContain('<script>1</script>'); // NON echappe : c'est le constat
    // La date, elle, passe bien par l'echappement.
    const html2 = buildReportHtml(
      { ...RAPPORT, weightSeries: [{ date: '<b>x</b>', kg: 78 }] }, LIBELLES,
    );
    expect(html2).toContain('&lt;b&gt;x&lt;/b&gt;');
  });

  it('sans constantes vitales, les blocs disparaissent au lieu d afficher du vide', () => {
    const sansVitaux: HealthReport = {
      ...RAPPORT, glucose: null, bpSystolic: null, bpDiastolic: null,
    };
    const html = buildReportHtml(sansVitaux, LIBELLES);
    expect(html).not.toContain('mg/dL');
    expect(html).not.toContain('mmHg');
    // Le reste du rapport tient debout.
    expect(html).toContain('Idriss');
    expect(html).toContain('<!DOCTYPE html>');
  });

  it('une tension a moitie renseignee n est pas affichee a moitie', () => {
    // Une systolique sans diastolique n'est pas une tension : afficher
    // « 128/undefined » sur un document medical serait pire que de se taire.
    const html = buildReportHtml({ ...RAPPORT, bpDiastolic: null }, LIBELLES);
    expect(html).not.toContain('mmHg');
    expect(html).not.toContain('undefined');
  });

  it('l arabe bascule le document en RTL', () => {
    const ar: ReportLabels = { ...LIBELLES, locale: 'ar-MA', rtl: true };
    const html = buildReportHtml(RAPPORT, ar);
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('direction: rtl');
    expect(html).toContain('lang="ar"');
  });

  it('aucune valeur « undefined » ne doit apparaitre dans le document', () => {
    // Le filet le plus simple, et celui qui attrape le plus de betises : un
    // champ optionnel oublie dans un gabarit se voit a l'oeil nu.
    const minimal: HealthReport = {
      name: '', goal: '', weightKg: null, targetCalories: null, conditions: [],
      nutrition: { days: 0, calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 },
      weightSeries: [], glucose: null, bpSystolic: null, bpDiastolic: null,
      generatedAt: Date.parse('2026-09-13T10:00:00Z'),
    };
    for (const doc of [buildReportHtml(minimal, LIBELLES), buildReportText(minimal, LIBELLES)]) {
      expect(doc).not.toContain('undefined');
      expect(doc).not.toContain('NaN');
      expect(doc).not.toContain('[object Object]');
    }
  });
});

describe('buildReportText — la version partageable', () => {
  it('dit la meme chose que le HTML, en texte', () => {
    const txt = buildReportText(RAPPORT, LIBELLES);
    expect(txt).toContain('RAPPORT SANTÉ — SALORIE');
    expect(txt).toContain('Nom: Idriss');
    expect(txt).toContain('Calories: 1980');
    expect(txt).toContain('moy. 104.2 mg/dL');
    expect(txt).toContain('moy. 128/82 mmHg');
    expect(txt).toContain('high cholesterol');
  });

  it('remplace le {n} du libelle par le nombre de jours REELS', () => {
    // « Moyennes sur 24 jour(s) » : c'est ce qui distingue un rapport nourri
    // d'un rapport presque vide. Laisser « {n} » afficherait un gabarit brut au
    // milieu d'un document medical.
    const txt = buildReportText(RAPPORT, LIBELLES);
    expect(txt).toContain('Moyennes sur 24 jour(s)');
    expect(txt).not.toContain('{n}');
  });

  it('omet les sections vides plutot que d afficher des tirets', () => {
    const txt = buildReportText(
      { ...RAPPORT, weightSeries: [], glucose: null, bpSystolic: null, bpDiastolic: null },
      LIBELLES,
    );
    expect(txt).not.toContain('Glycémie');
    expect(txt).not.toContain('Tension');
    expect(txt).toContain('Ce document ne remplace pas un avis médical.');
  });

  it('un profil vide affiche un tiret, pas une ligne cassee', () => {
    const txt = buildReportText({ ...RAPPORT, name: '', goal: '', weightKg: null, targetCalories: null }, LIBELLES);
    expect(txt).toContain('Nom: —');
    expect(txt).not.toContain('Objectif: ');
  });

  it('⚠ LE TEXTE N ECHAPPE RIEN, ET C EST NORMAL', () => {
    // Ce n'est pas du balisage : il n'y a rien a neutraliser. Le consigner
    // evite qu'on « aligne » un jour les deux gabarits en croyant corriger un
    // oubli, et qu'on affiche `&lt;` a un lecteur humain.
    const txt = buildReportText({ ...RAPPORT, name: '<b>Idriss</b>' }, LIBELLES);
    expect(txt).toContain('Nom: <b>Idriss</b>');
  });

  it('la mise en garde est TOUJOURS presente', () => {
    // Un rapport de sante sans son avertissement est un document qui se fait
    // passer pour ce qu'il n'est pas.
    for (const r of [RAPPORT, { ...RAPPORT, glucose: null, bpSystolic: null, bpDiastolic: null }]) {
      expect(buildReportText(r, LIBELLES)).toContain(LIBELLES.disclaimer);
      expect(buildReportHtml(r, LIBELLES)).toContain(LIBELLES.disclaimer);
    }
  });
});
