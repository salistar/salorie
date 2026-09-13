/**
 * Glycémie et tension : le seul module de cette liste où se tromper a un coût médical.
 * ---------------------------------------------------------------------------
 * `lib/vitals.ts` évalue une mesure et décide s'il faut alerter. `/vitals`
 * (383 lignes) n'avait aucun test avant le 13/09/2026.
 *
 * ⚠ CE MODULE N'EST PAS UN DIAGNOSTIC, et les seuils qu'il applique sont des
 * repères de vulgarisation. Ce que les tests ci-dessous verrouillent, c'est
 * qu'il fasse **exactement ce qu'il annonce** — ni plus (une alerte de trop
 * inquiète pour rien et apprend à ignorer les suivantes), ni moins (une alerte
 * manquée est une hypoglycémie qu'on n'a pas vue passer).
 *
 * ⚠ ET UNE BORNE EST À TRANCHER PAR UN HUMAIN — voir le test marqué plus bas :
 * `140/90` pile ne déclenche AUCUNE alerte de tension, alors que les repères
 * usuels sont « à partir de 140 ou 90 ». Je le consigne, je ne le change pas.
 */
import {
  BP_DIA_HIGH, BP_DIA_LOW, BP_SYS_HIGH, BP_SYS_LOW,
  GLUCOSE_HIGH, GLUCOSE_LOW,
  bpAlert, bpTrend, glucoseAlert, glucoseTrend, trend,
} from '../lib/vitals';

const J = 86_400_000;
const T = 1_700_000_000_000;

describe('glucoseAlert — hypo et hyperglycemie', () => {
  it('une valeur normale ne dit rien', () => {
    // Le silence est le cas nominal : une application qui alerte a chaque
    // mesure finit par n'etre plus lue du tout.
    for (const v of [70, 90, 110, 140, 180]) expect(glucoseAlert(v)).toBeNull();
  });

  it('sous 70 mg/dL : hypoglycemie', () => {
    expect(glucoseAlert(69)?.kind).toBe('glucose_low');
    expect(glucoseAlert(69)?.severity).toBe('warning');
    expect(glucoseAlert(69)?.value).toBe('69 mg/dL');
  });

  it('sous 54 mg/dL : hypoglycemie SEVERE', () => {
    // 54 est le seuil clinique du niveau 2 : en dessous, on ne conseille plus,
    // on alerte. La borne elle-meme reste un avertissement.
    expect(glucoseAlert(53)?.severity).toBe('danger');
    expect(glucoseAlert(54)?.severity).toBe('warning');
  });

  it('au-dessus de 180 mg/dL : hyperglycemie, et 250 la fait basculer', () => {
    expect(glucoseAlert(181)?.kind).toBe('glucose_high');
    expect(glucoseAlert(181)?.severity).toBe('warning');
    expect(glucoseAlert(250)?.severity).toBe('warning');
    expect(glucoseAlert(251)?.severity).toBe('danger');
  });

  it('les bornes annoncees sont celles qui sont appliquees', () => {
    // Les constantes sont exportees et affichees a l'ecran : si elles
    // divergeaient du code, l'application afficherait un seuil et en
    // appliquerait un autre.
    expect(GLUCOSE_LOW).toBe(70);
    expect(GLUCOSE_HIGH).toBe(180);
    expect(glucoseAlert(GLUCOSE_LOW)).toBeNull();
    expect(glucoseAlert(GLUCOSE_LOW - 1)).not.toBeNull();
    expect(glucoseAlert(GLUCOSE_HIGH)).toBeNull();
    expect(glucoseAlert(GLUCOSE_HIGH + 1)).not.toBeNull();
  });

  it('« diabetes » declare rend l alerte PERSONNELLE', () => {
    // `related` change le ton du conseil a l'ecran : appuye pour qui est
    // concerne, informatif pour les autres.
    expect(glucoseAlert(200, ['diabetes'])?.related).toBe(true);
    expect(glucoseAlert(200, ['DIABETES'])?.related).toBe(true);
    expect(glucoseAlert(200, ['hypertension'])?.related).toBe(false);
    expect(glucoseAlert(200)?.related).toBe(false);
    expect(glucoseAlert(200, null as any)?.related).toBe(false);
  });

  it('une mesure absente ou absurde n alerte PAS', () => {
    // Zero n'est pas une glycemie : c'est un champ vide. Alerter dessus
    // ferait crier « hypoglycemie severe » a chaque formulaire ouvert.
    for (const v of [0, -5, NaN, undefined as any, null as any, 'abc' as any]) {
      expect(glucoseAlert(v)).toBeNull();
    }
  });
});

describe('bpAlert — tension', () => {
  it('une tension normale ne dit rien', () => {
    for (const [s, d] of [[120, 80], [130, 85], [110, 70]]) {
      expect(bpAlert(s, d)).toBeNull();
    }
  });

  it('au-dessus de 140 ou 90 : alerte', () => {
    expect(bpAlert(141, 80)?.kind).toBe('bp_high');
    expect(bpAlert(120, 91)?.kind).toBe('bp_high');
    expect(bpAlert(141, 80)?.value).toBe('141/80');
  });

  it('180 ou 120 : crise hypertensive', () => {
    // Ici la borne est INCLUSIVE (`>=`), contrairement a celle de 140.
    expect(bpAlert(180, 80)?.severity).toBe('danger');
    expect(bpAlert(120, 120)?.severity).toBe('danger');
    expect(bpAlert(179, 119)?.severity).toBe('warning');
  });

  it('hypotension sous 90 ou 60', () => {
    expect(bpAlert(89, 70)?.kind).toBe('bp_low');
    expect(bpAlert(100, 59)?.kind).toBe('bp_low');
    expect(bpAlert(89, 59)?.severity).toBe('warning');
  });

  it('⚠ 140/90 PILE NE DECLENCHE RIEN — A TRANCHER', () => {
    // `sys > 140 || dia > 90` : la valeur exacte passe entre les mailles. Les
    // reperes usuels disent « a partir de 140 ou 90 », donc inclusif.
    //
    // Deux indices que c'est un oubli et non un choix : la borne de la CRISE
    // juste au-dessus est ecrite `>=` (180, 120), et les constantes exportees
    // s'appellent BP_SYS_HIGH — « haut », pas « au-dela duquel ».
    //
    // Je NE le corrige PAS de ma propre initiative : deplacer un seuil medical
    // d'un cran change ce que des gens lisent sur leur tension, et ce n'est pas
    // une decision technique. Ce test dit ce que fait le code AUJOURD'HUI ; le
    // jour ou la borne devient inclusive, il echouera, et c'est exactement ce
    // qu'on veut d'un changement pareil : qu'il soit deliberate.
    expect(bpAlert(140, 90)).toBeNull();
    expect(bpAlert(140, 80)).toBeNull();
    expect(bpAlert(120, 90)).toBeNull();
    // Un cran au-dessus, l'alerte arrive.
    expect(bpAlert(141, 90)).not.toBeNull();
    expect(bpAlert(140, 91)).not.toBeNull();
    // Les constantes, elles, annoncent bien 140 et 90.
    expect([BP_SYS_HIGH, BP_DIA_HIGH, BP_SYS_LOW, BP_DIA_LOW]).toEqual([140, 90, 90, 60]);
  });

  it('« hypertension » declaree rend l alerte personnelle', () => {
    expect(bpAlert(150, 95, ['hypertension'])?.related).toBe(true);
    expect(bpAlert(150, 95, ['Hypertension'])?.related).toBe(true);
    expect(bpAlert(150, 95, ['diabetes'])?.related).toBe(false);
  });

  it('une mesure incomplete n alerte pas', () => {
    // Saisir la systolique sans la diastolique est un formulaire a moitie
    // rempli, pas une hypotension.
    expect(bpAlert(150, 0)).toBeNull();
    expect(bpAlert(0, 95)).toBeNull();
    expect(bpAlert(NaN, 80)).toBeNull();
    expect(bpAlert(150, undefined as any)).toBeNull();
  });
});

describe('trend — la pente d une serie de mesures', () => {
  /** Les listes arrivent du plus RECENT au plus ancien (contrat de listGlucose). */
  const serie = (...valeurs: number[]) =>
    valeurs.map((value, i) => ({ ts: T - i * J, value }));

  it('une serie vide n a pas de tendance', () => {
    expect(trend([])).toBeNull();
    expect(trend(null as any)).toBeNull();
    expect(trend([{ ts: T, value: NaN }])).toBeNull();
  });

  it('resume une serie : compte, moyenne, extremes, derniere valeur', () => {
    const t = trend(serie(160, 140, 120, 100))!;
    expect(t.count).toBe(4);
    expect(t.avg).toBe(130);
    expect(t.min).toBe(100);
    expect(t.max).toBe(160);
    expect(t.latest).toBe(160);
  });

  it('⚠ « latest » EST LE PREMIER ELEMENT, PAS LE PLUS RECENT', () => {
    // Le module suppose une liste triee du plus recent au plus ancien. Nourri
    // dans l'autre sens, il annonce comme « derniere mesure » la plus VIEILLE —
    // sans se plaindre, et avec une tendance juste a cote. C'est un contrat
    // implicite entre `listGlucose` et `trend` ; le voici rendu explicite.
    const croissant = [
      { ts: T - 2 * J, value: 100 },
      { ts: T - J, value: 140 },
      { ts: T, value: 160 },
    ];
    expect(trend(croissant)!.latest).toBe(100);   // la PLUS ANCIENNE
    expect(trend([...croissant].reverse())!.latest).toBe(160);
    // La direction, elle, reste juste : la regression lit les horodatages.
    expect(trend(croissant)!.direction).toBe('up');
  });

  it('monte, descend, ou reste plate', () => {
    expect(trend(serie(160, 140, 120, 100))!.direction).toBe('up');
    expect(trend(serie(100, 120, 140, 160))!.direction).toBe('down');
    // Un bruit de +/-1 mg/dL autour de 100 n'est pas une tendance.
    expect(trend(serie(100, 101, 99, 100))!.direction).toBe('flat');
  });

  it('le seuil de platitude s adapte a la grandeur mesuree', () => {
    // eps = max(1, 5 % de la moyenne) : le meme ecart absolu ne pese pas pareil
    // selon ce qu'on mesure. +3 sur une glycemie a 131 (eps 6,6) est du bruit ;
    // +6 sur un pouls a 63 (eps 3,2) est une tendance.
    expect(trend(serie(133, 132, 131, 130))!.direction).toBe('flat');
    expect(trend(serie(66, 64, 62, 60))!.direction).toBe('up');
    // ⚠ ET LA FRONTIERE EST SERREE : +3 sur ce meme pouls (eps 3,1) reste plat.
    // Ma premiere version de ce test l'annonçait « up » — elle etait fausse.
    expect(trend(serie(63, 62, 61, 60))!.direction).toBe('flat');
  });

  it('une seule mesure : pas de pente, mais un resume', () => {
    const t = trend([{ ts: T, value: 123.45 }])!;
    expect(t.count).toBe(1);
    expect(t.slope).toBe(0);
    expect(t.direction).toBe('flat');
    expect(t.latest).toBe(123.5); // arrondi au dixieme
  });

  it('deux mesures au MEME instant ne divisent pas par zero', () => {
    // Deux saisies dans la meme seconde : `span` retombe sur 1 et la variance
    // des x est nulle. Sans le garde-fou `den > 0`, la pente serait NaN et la
    // direction deviendrait « flat » par accident plutot que par calcul.
    const t = trend([{ ts: T, value: 100 }, { ts: T, value: 200 }])!;
    expect(t.slope).toBe(0);
    expect(t.direction).toBe('flat');
    expect(t.avg).toBe(150);
  });

  it('les mesures illisibles sont ecartees, pas comptees', () => {
    const t = trend([
      { ts: T, value: 100 },
      { ts: T - J, value: NaN },
      { ts: T - 2 * J, value: 120 },
    ])!;
    expect(t.count).toBe(2);
    expect(t.avg).toBe(110);
  });
});

describe('glucoseTrend et bpTrend — les entrees reelles', () => {
  it('la glycemie passe par le meme calcul', () => {
    const t = glucoseTrend([
      { ts: T, mgdl: 160 } as any,
      { ts: T - J, mgdl: 120 } as any,
    ])!;
    expect(t.count).toBe(2);
    expect(t.latest).toBe(160);
  });

  it('la tension rend TROIS tendances separees', () => {
    const t = bpTrend([
      { ts: T, systolic: 150, diastolic: 95, pulse: 70 } as any,
      { ts: T - J, systolic: 130, diastolic: 85, pulse: 65 } as any,
    ]);
    expect(t.systolic!.latest).toBe(150);
    expect(t.diastolic!.latest).toBe(95);
    expect(t.pulse!.latest).toBe(70);
  });

  it('⚠ un pouls non renseigne est EXCLU, pas compte comme zero', () => {
    // Un tensiometre sans capteur de pouls rend 0. Le moyenner ferait chuter la
    // tendance du pouls vers zero et afficherait une bradycardie imaginaire.
    const t = bpTrend([
      { ts: T, systolic: 120, diastolic: 80, pulse: 0 } as any,
      { ts: T - J, systolic: 120, diastolic: 80 } as any,
    ]);
    expect(t.pulse).toBeNull();
    expect(t.systolic!.count).toBe(2);
  });

  it('une liste vide ne casse rien', () => {
    expect(glucoseTrend([])).toBeNull();
    expect(bpTrend([])).toEqual({ systolic: null, diastolic: null, pulse: null });
    expect(bpTrend(null as any).systolic).toBeNull();
  });
});
