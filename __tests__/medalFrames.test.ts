// Épingle le comportement du générateur de médailles SVG (lib/medalFrames.ts).
// Module 100% PUR et DÉTERMINISTE : pas de réseau, pas de Firebase, pas d'aléa
// → aucun mock nécessaire (aucun appel I/O n'est émis).
//
// On vérifie :
//  - les helpers de couleur (colorPalette, METALS, PALETTES, shapeFor) ;
//  - que buildMedalSvg produit une string SVG bien formée contenant les
//    éléments attendus selon les params (mode template vs full, couleur/metal,
//    forme, centre photo vs geo, échappement XML, déterminisme).

import {
  colorPalette,
  buildMedalSvg,
  shapeFor,
  SHAPES,
  METALS,
  PALETTES,
  type MedalParams,
} from '../lib/medalFrames';

// Base de params minimale valide (title + km requis par l'interface).
const base = (over: Partial<MedalParams> = {}): MedalParams => ({
  title: 'Test Course',
  km: 10,
  ...over,
});

// ---------------------------------------------------------------------------
describe('colorPalette', () => {
  test('garde la couleur choisie comme émail e1, dérive e0 (clair) / e2 (sombre) / stroke (très sombre)', () => {
    const p = colorPalette('#2e74b0');
    expect(p.e1).toBe('#2e74b0'); // émail = couleur exacte
    // e0 = lighten(0.42) → plus clair que la base
    expect(p.e0.toLowerCase()).not.toBe('#2e74b0');
    // l'anneau or par défaut est conservé
    expect(p.g1).toBe('#f4c430');
  });

  test('hex court (#abc) est étendu en #aabbcc avant dérivation', () => {
    const p = colorPalette('#abc');
    // e1 reprend la chaîne brute fournie
    expect(p.e1).toBe('#abc');
    // les dérivés sont des hex 6 chiffres valides
    expect(p.e0).toMatch(/^#[0-9a-f]{6}$/i);
    expect(p.e2).toMatch(/^#[0-9a-f]{6}$/i);
    expect(p.stroke).toMatch(/^#[0-9a-f]{6}$/i);
  });

  test('lighten produit un hex plus clair, darken un hex plus sombre (rouge pur)', () => {
    const p = colorPalette('#ff0000');
    // lighten du rouge → composantes G/B augmentées
    expect(p.e0).toBe('#ff6b6b');
    // darken(0.45) du rouge → #8c0000
    expect(p.e2).toBe('#8c0000');
    // darken(0.65) → #590000
    expect(p.stroke).toBe('#590000');
  });

  test('toutes les clés de palette sont présentes', () => {
    const p = colorPalette('#123456');
    for (const k of ['g0', 'g1', 'g2', 'g3', 'e0', 'e1', 'e2', 'stroke'] as const) {
      expect(typeof p[k]).toBe('string');
      expect(p[k].length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
describe('shapeFor', () => {
  test('forme explicite valide → renvoyée telle quelle', () => {
    expect(shapeFor('rabat', 'hexagon')).toBe('hexagon');
    expect(shapeFor(undefined, 'star5')).toBe('star5');
  });

  test('forme explicite invalide → ignorée, fallback sur le hash du frame', () => {
    const r = shapeFor('rabat', 'pas-une-forme');
    expect((SHAPES as readonly string[]).includes(r)).toBe(true);
  });

  test('déterministe : même frame → même forme', () => {
    expect(shapeFor('casablanca')).toBe(shapeFor('casablanca'));
  });

  test('renvoie toujours une forme appartenant à SHAPES', () => {
    for (const f of ['rabat', 'fes', 'meknes', '', 'xyz', 'default']) {
      expect((SHAPES as readonly string[]).includes(shapeFor(f))).toBe(true);
    }
  });

  test('frame undefined → fallback "default" sans crash', () => {
    const r = shapeFor(undefined);
    expect((SHAPES as readonly string[]).includes(r)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('constantes exportées', () => {
  test('SHAPES contient les formes de base attendues', () => {
    for (const s of ['circle', 'hexagon', 'star5', 'gear', 'shield', 'cross']) {
      expect(SHAPES).toContain(s);
    }
  });

  test('METALS expose or / argent / bronze', () => {
    expect(Object.keys(METALS).sort()).toEqual(['argent', 'bronze', 'or']);
    expect(METALS.argent.g1).toBe('#e7ecf3');
  });

  test('PALETTES contient les villes marocaines (rétro-compat)', () => {
    expect(PALETTES.casablanca.e1).toBe('#2e74b0');
    expect(PALETTES.rabat.e1).toBe('#d33329');
  });
});

// ---------------------------------------------------------------------------
describe('buildMedalSvg — structure de base', () => {
  test('renvoie une string SVG bien encadrée (<svg …> … </svg>)', () => {
    const svg = buildMedalSvg(base());
    expect(typeof svg).toBe('string');
    expect(svg.trimStart().startsWith('<svg')).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('viewBox="0 0 264 384"');
  });

  test('contient les défs de gradients (g_, gb_, en_) et les paths du ruban (top_, bot_)', () => {
    const svg = buildMedalSvg(base());
    expect(svg).toContain('<linearGradient id="g_');
    expect(svg).toContain('<linearGradient id="gb_');
    expect(svg).toContain('<radialGradient id="en_');
    expect(svg).toContain('id="top_');
    expect(svg).toContain('id="bot_');
  });

  test('le titre est inséré en MAJUSCULES dans le textPath supérieur', () => {
    const svg = buildMedalSvg(base({ title: 'marathon' }));
    expect(svg).toContain('MARATHON');
  });

  test('le titre est tronqué à 16 caractères', () => {
    const svg = buildMedalSvg(base({ title: 'abcdefghijklmnopqrstuvwxyz' }));
    expect(svg).toContain('ABCDEFGHIJKLMNOP'); // 16 premiers
    expect(svg).not.toContain('ABCDEFGHIJKLMNOPQ'); // 17e exclu
  });

  test('le kilométrage est rendu avec le suffixe " KM"', () => {
    const svg = buildMedalSvg(base({ km: 21 }));
    expect(svg).toContain('21 KM');
  });

  test('km fourni en string → rendu tel quel', () => {
    const svg = buildMedalSvg(base({ km: '42.2' }));
    expect(svg).toContain('42.2 KM');
  });
});

// ---------------------------------------------------------------------------
describe('buildMedalSvg — mode template vs full', () => {
  test('mode "full" (défaut) inclut rang, badge RANG, temps et bloc nom/dates', () => {
    const svg = buildMedalSvg(base({ rank: 3, time: '01:23:45', name: 'Sally', dates: '2026' }));
    expect(svg).toContain('RANG');
    expect(svg).toContain('3ᵉ'); // rang formaté
    expect(svg).toContain('TEMPS DE COURSE');
    expect(svg).toContain('01:23:45');
    expect(svg).toContain('Sally');
    expect(svg).toContain('2026');
  });

  test('mode "template" masque rang / temps / nom / dates', () => {
    const svg = buildMedalSvg(
      base({ mode: 'template', rank: 3, time: '01:23:45', name: 'Sally', dates: '2026' }),
    );
    expect(svg).not.toContain('RANG');
    expect(svg).not.toContain('TEMPS DE COURSE');
    expect(svg).not.toContain('01:23:45');
    expect(svg).not.toContain('Sally');
    expect(svg).not.toContain('2026');
  });

  test('mode "template" conserve le titre et le kilométrage', () => {
    const svg = buildMedalSvg(base({ mode: 'template', title: 'Modele', km: 5 }));
    expect(svg).toContain('MODELE');
    expect(svg).toContain('5 KM');
  });

  test('rank absent ou <= 0 → affiche le tiret "—" en mode full', () => {
    expect(buildMedalSvg(base())).toContain('>—<'); // pas de rank
    expect(buildMedalSvg(base({ rank: 0 }))).toContain('>—<');
    expect(buildMedalSvg(base({ rank: -1 }))).toContain('>—<');
  });

  test('time absent → "—" dans le bandeau temps (mode full)', () => {
    const svg = buildMedalSvg(base());
    // le badge temps affiche le tiret quand p.time manque
    expect(svg).toContain('>—<');
  });
});

// ---------------------------------------------------------------------------
describe('buildMedalSvg — couleurs', () => {
  test('param color → la palette dérivée injecte la couleur dans le radialGradient émail', () => {
    const svg = buildMedalSvg(base({ color: '#2e74b0' }));
    // e1 = la couleur exacte, utilisée comme stop médian de l'émail
    expect(svg).toContain('stop-color="#2e74b0"');
  });

  test('sans color ni frame → émail vert par défaut (#2E8B57)', () => {
    const svg = buildMedalSvg(base());
    expect(svg).toContain('#2E8B57');
  });

  test('frame nommé connu → palette de la ville (casablanca → bleu #2e74b0)', () => {
    const svg = buildMedalSvg(base({ frame: 'casablanca' }));
    expect(svg).toContain('#2e74b0');
  });

  test('metal "argent" écrase le gradient or (g1 = #e7ecf3)', () => {
    const svg = buildMedalSvg(base({ color: '#2e74b0', metal: 'argent' }));
    expect(svg).toContain('stop-color="#e7ecf3"'); // argent g1
    expect(svg).not.toContain('stop-color="#f4c430"'); // plus l'or
  });

  test('metal "bronze" applique le gradient bronze (g1 = #e8a36a)', () => {
    const svg = buildMedalSvg(base({ metal: 'bronze' }));
    expect(svg).toContain('stop-color="#e8a36a"');
  });

  test('metal inconnu → ignoré, anneau or conservé', () => {
    const svg = buildMedalSvg(base({ metal: 'platine' }));
    expect(svg).toContain('stop-color="#f4c430"'); // or par défaut
  });
});

// ---------------------------------------------------------------------------
describe('buildMedalSvg — forme & centre', () => {
  test('shape explicite "hexagon" → polygone (6 côtés) dans la sortie', () => {
    const svg = buildMedalSvg(base({ shape: 'hexagon' }));
    expect(svg).toContain('<polygon');
  });

  test('shape "circle" → le médaillon est un cercle (pas de polygon de forme)', () => {
    const svg = buildMedalSvg(base({ shape: 'circle' }));
    expect(svg).toContain('<circle');
  });

  test('shape "tag" → utilise un <rect> arrondi', () => {
    const svg = buildMedalSvg(base({ shape: 'tag' }));
    expect(svg).toContain('<rect');
  });

  test('shape "shield" / "cross" → un <path> de contour', () => {
    expect(buildMedalSvg(base({ shape: 'shield' }))).toContain('<path');
    expect(buildMedalSvg(base({ shape: 'cross' }))).toContain('<path');
  });

  test('customPath fourni → un <path d="…"> avec le path exact remplace la forme', () => {
    const d = 'M 0 0 L 10 10 Z';
    const svg = buildMedalSvg(base({ customPath: d }));
    expect(svg).toContain(`<path d="${d}"`);
  });

  test('centerType "geo" diffère du centre photo (défaut)', () => {
    const geo = buildMedalSvg(base({ centerType: 'geo' }));
    const photo = buildMedalSvg(base({ centerType: 'photo' }));
    expect(geo).not.toBe(photo);
  });

  test('shape invalide → fallback déterministe sur shapeFor (toujours du SVG valide)', () => {
    const svg = buildMedalSvg(base({ shape: 'pas-une-forme' }));
    expect(svg.trimStart().startsWith('<svg')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('buildMedalSvg — échappement XML', () => {
  test('les caractères &, <, > du nom sont échappés', () => {
    const svg = buildMedalSvg(base({ name: 'Tom & <Jerry>' }));
    expect(svg).toContain('Tom &amp; &lt;Jerry&gt;');
    expect(svg).not.toContain('Tom & <Jerry>');
  });

  test('le titre est échappé puis mis en majuscules', () => {
    const svg = buildMedalSvg(base({ title: 'a&b' }));
    expect(svg).toContain('A&amp;B');
  });

  test('km en string contenant & est échappé', () => {
    const svg = buildMedalSvg(base({ km: '5 & 6' }));
    expect(svg).toContain('5 &amp; 6 KM');
  });
});

// ---------------------------------------------------------------------------
describe('buildMedalSvg — id sanitisé & déterminisme', () => {
  test('mêmes params → sortie strictement identique (pur)', () => {
    const params = base({ frame: 'rabat', rank: 1, time: '00:30', name: 'A', dates: '2025' });
    expect(buildMedalSvg(params)).toBe(buildMedalSvg(params));
  });

  test('id de gradient dérivé du frame, caractères non alphanum retirés', () => {
    const svg = buildMedalSvg(base({ frame: 'ra-bat!' }));
    // les caractères spéciaux sont strippés → id "rabat"
    expect(svg).toContain('id="g_rabat"');
  });

  test('aucune source d\'id valide → id de repli "m"', () => {
    const svg = buildMedalSvg(base({ frame: '!!!' }));
    expect(svg).toContain('id="g_m"');
  });

  test('frame différent → id de gradient différent', () => {
    const a = buildMedalSvg(base({ frame: 'rabat' }));
    const b = buildMedalSvg(base({ frame: 'casablanca' }));
    expect(a).toContain('id="g_rabat"');
    expect(b).toContain('id="g_casablanca"');
  });
});
