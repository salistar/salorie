// @couleurs-identite
// ---------------------------------------------------------------------------
// Ce fichier porte des couleurs qui NE SUIVENT PAS le theme, et ne doivent
// jamais etre converties en jetons.
//
// Le marqueur ci-dessus n'est pas decoratif : les outils de migration le
// LISENT et sautent le fichier. Un simple commentaire en francais ne protege
// rien — ce fichier a ete abime trois fois avant que ce marqueur existe.
// Les cadres de medaille : bronze, argent, or. La couleur EST le rang.

// Générateur de médailles paramétrable (builder). On génère le SVG en code :
//  - COULEUR libre (n'importe quel hex → palette émail dérivée) — plus de noms de thème.
//  - des dizaines de FORMES (paramétriques : étoiles, polygones, engrenages, écusson…).
//  - CENTRE = photo (overlay RN) OU motif géométrique.
//  - FORME PERSONNALISÉE possible (path SVG fourni).
// Rendu via react-native-svg <SvgXml> (app) ou dangerouslySetInnerHTML (web).

export interface Palette { g0: string; g1: string; g2: string; g3: string; e0: string; e1: string; e2: string; stroke: string; }

const GOLD = { g0: '#fff7d6', g1: '#f4c430', g2: '#d99c1c', g3: '#9a6708', stroke: '#5e3f06' };

// ── Couleurs : dérive une palette émail depuis n'importe quel hex ──
const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
function hexToRgb(h: string): [number, number, number] {
  let s = (h || '#2e74b0').replace('#', '');
  if (s.length === 3) s = s.split('').map((x) => x + x).join('');
  return [parseInt(s.slice(0, 2), 16) || 0, parseInt(s.slice(2, 4), 16) || 0, parseInt(s.slice(4, 6), 16) || 0];
}
const toHex = (r: number, g: number, b: number) => '#' + [r, g, b].map((x) => clamp(x).toString(16).padStart(2, '0')).join('');
function lighten(h: string, a: number) { const [r, g, b] = hexToRgb(h); return toHex(r + (255 - r) * a, g + (255 - g) * a, b + (255 - b) * a); }
function darken(h: string, a: number) { const [r, g, b] = hexToRgb(h); return toHex(r * (1 - a), g * (1 - a), b * (1 - a)); }

/** Palette à partir d'une couleur libre : anneau or + émail = la couleur choisie. */
export function colorPalette(hex: string): Palette {
  return { ...GOLD, e0: lighten(hex, 0.42), e1: hex, e2: darken(hex, 0.45), stroke: darken(hex, 0.65) };
}
/** Métal de l'anneau (or / argent / bronze). */
export const METALS: Record<string, Partial<Palette>> = {
  or: { g0: '#fff7d6', g1: '#f4c430', g2: '#d99c1c', g3: '#9a6708' },
  argent: { g0: '#ffffff', g1: '#e7ecf3', g2: '#bcc5d2', g3: '#8b94a6' },
  bronze: { g0: '#ffe2c4', g1: '#e8a36a', g2: '#c8743c', g3: '#8a431d' },
};

// Rétro-compat : anciennes palettes nommées (l'app / les courses existantes les passent encore via `frame`).
export const PALETTES: Record<string, Palette> = {
  rabat: { ...GOLD, e0: '#f0726a', e1: '#d33329', e2: '#8c1a13' },
  casablanca: { ...GOLD, e0: '#79b6e8', e1: '#2e74b0', e2: '#1b4d83' },
  marrakech: { ...GOLD, e0: '#f0726a', e1: '#d33329', e2: '#8c1a13' },
  fes: { ...GOLD, e0: '#8a93d6', e1: '#414a93', e2: '#2a3066' },
  meknes: { ...GOLD, e0: '#e8c682', e1: '#c79a4e', e2: '#97702f' },
  merzouga: { g0: '#ffe2c4', g1: '#e8a36a', g2: '#c8743c', g3: '#8a431d', stroke: '#522a10', e0: '#e8c682', e1: '#c79a4e', e2: '#97702f' },
};
function pal(frame?: string): Palette { return (frame && PALETTES[frame]) || { ...GOLD, e0: '#5fd6a2', e1: '#2E8B57', e2: '#0e5e3f', stroke: '#0e5e3f' }; }

const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const R1 = (v: number) => v.toFixed(1);
function ptsPoly(cx: number, cy: number, n: number, R: number, rot = 0): string {
  const p: string[] = []; for (let i = 0; i < n; i++) { const a = rot + (i / n) * 2 * Math.PI; p.push(`${R1(cx + R * Math.cos(a))},${R1(cy + R * Math.sin(a))}`); } return p.join(' ');
}
function ptsStar(cx: number, cy: number, n: number, rO: number, rI: number, rot = -Math.PI / 2): string {
  const p: string[] = []; for (let i = 0; i < n * 2; i++) { const a = rot + (i / (n * 2)) * 2 * Math.PI; const r = i % 2 === 0 ? rO : rI; p.push(`${R1(cx + r * Math.cos(a))},${R1(cy + r * Math.sin(a))}`); } return p.join(' ');
}
function dots(cx: number, cy: number, r: number, n: number, color: string): string {
  let out = ''; for (let i = 0; i < n; i++) { const a = (i / n) * 2 * Math.PI; out += `<circle cx="${R1(cx + r * Math.cos(a))}" cy="${R1(cy + r * Math.sin(a))}" r="1.3" fill="${color}" opacity="0.55"/>`; } return out;
}

// ── Formes du médaillon (des dizaines, inspirées The Conqueror) ──
export const SHAPES = [
  'circle', 'hexagon', 'octagon', 'pentagon', 'heptagon', 'triangle', 'square', 'diamond',
  'star5', 'star6', 'star7', 'star8', 'star12', 'gear', 'gearFine', 'bobbles', 'bobbles12',
  'clover', 'quatrefoil', 'scallop', 'scallop24', 'sunburst', 'flower8', 'shield', 'tag', 'rounded',
  // +10 formes "perso" prêtes
  'star9', 'star10', 'star16', 'nonagon', 'decagon', 'gear12', 'gear36', 'flower12', 'cross', 'burst32',
] as const;
export type MedalShape = typeof SHAPES[number];

export function shapeFor(frame?: string, explicit?: string): MedalShape {
  if (explicit && (SHAPES as readonly string[]).includes(explicit)) return explicit as MedalShape;
  const f = frame || 'default'; let h = 0; for (let i = 0; i < f.length; i++) h = (h * 31 + f.charCodeAt(i)) | 0;
  return SHAPES[Math.abs(h) % SHAPES.length];
}

function shapeLayer(shape: MedalShape, c: Palette, id: string): string {
  const cx = 132, cy = 192, gold = `fill="url(#g_${id})" stroke="${c.stroke}" stroke-width="1.3"`;
  const poly = (n: number, R: number, rot = -Math.PI / 2) => `<polygon points="${ptsPoly(cx, cy, n, R, rot)}" ${gold}/>`;
  const star = (n: number, rO: number, rI: number) => `<polygon points="${ptsStar(cx, cy, n, rO, rI)}" ${gold}/>`;
  switch (shape) {
    case 'hexagon': return poly(6, 99, Math.PI / 6);
    case 'octagon': return poly(8, 99, Math.PI / 8);
    case 'pentagon': return poly(5, 100);
    case 'heptagon': return poly(7, 100);
    case 'triangle': return poly(3, 110);
    case 'square': return poly(4, 104, Math.PI / 4);
    case 'diamond': return poly(4, 106, 0);
    case 'star5': return star(5, 106, 54);
    case 'star6': return star(6, 104, 60);
    case 'star7': return star(7, 104, 62);
    case 'star8': return star(8, 102, 70);
    case 'star12': return star(12, 100, 80);
    case 'gear': { const n = 16; const pts: string[] = []; for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * 2 * Math.PI, r = i % 2 === 0 ? 102 : 86; pts.push(`${R1(cx + r * Math.cos(a))},${R1(cy + r * Math.sin(a))}`); } return `<polygon points="${pts.join(' ')}" ${gold}/>`; }
    case 'gearFine': { const n = 28; const pts: string[] = []; for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * 2 * Math.PI, r = i % 2 === 0 ? 99 : 90; pts.push(`${R1(cx + r * Math.cos(a))},${R1(cy + r * Math.sin(a))}`); } return `<polygon points="${pts.join(' ')}" ${gold}/>`; }
    case 'bobbles': { let s = ''; const n = 8, R = 88; for (let i = 0; i < n; i++) { const a = (i / n) * 2 * Math.PI, x = cx + R * Math.cos(a), y = cy + R * Math.sin(a); s += `<circle cx="${R1(x)}" cy="${R1(y)}" r="20" ${gold}/><circle cx="${R1(x)}" cy="${R1(y)}" r="15" fill="url(#en_${id})"/>`; } return s + `<circle cx="${cx}" cy="${cy}" r="90" ${gold}/>`; }
    case 'bobbles12': { let s = ''; const n = 12, R = 90; for (let i = 0; i < n; i++) { const a = (i / n) * 2 * Math.PI, x = cx + R * Math.cos(a), y = cy + R * Math.sin(a); s += `<circle cx="${R1(x)}" cy="${R1(y)}" r="14" ${gold}/>`; } return s + `<circle cx="${cx}" cy="${cy}" r="90" ${gold}/>`; }
    case 'clover': { let s = ''; const R = 56; for (const a of [-Math.PI / 2, Math.PI / 6, (Math.PI * 5) / 6]) s += `<circle cx="${R1(cx + R * Math.cos(a))}" cy="${R1(cy + R * Math.sin(a))}" r="62" ${gold}/>`; return s; }
    case 'quatrefoil': { let s = ''; const R = 56; for (const a of [-Math.PI / 2, 0, Math.PI / 2, Math.PI]) s += `<circle cx="${R1(cx + R * Math.cos(a))}" cy="${R1(cy + R * Math.sin(a))}" r="58" ${gold}/>`; return s; }
    case 'scallop': { let s = ''; const n = 18, R = 90; for (let i = 0; i < n; i++) { const a = (i / n) * 2 * Math.PI; s += `<circle cx="${R1(cx + R * Math.cos(a))}" cy="${R1(cy + R * Math.sin(a))}" r="12" ${gold}/>`; } return s + `<circle cx="${cx}" cy="${cy}" r="88" ${gold}/>`; }
    case 'scallop24': { let s = ''; const n = 24, R = 92; for (let i = 0; i < n; i++) { const a = (i / n) * 2 * Math.PI; s += `<circle cx="${R1(cx + R * Math.cos(a))}" cy="${R1(cy + R * Math.sin(a))}" r="9" ${gold}/>`; } return s + `<circle cx="${cx}" cy="${cy}" r="89" ${gold}/>`; }
    case 'sunburst': { let s = `<circle cx="${cx}" cy="${cy}" r="104" fill="url(#g_${id})" opacity="0.25"/>`; const n = 24; for (let i = 0; i < n; i++) { const a = (i / n) * 2 * Math.PI; s += `<polygon points="${R1(cx + 86 * Math.cos(a - 0.05))},${R1(cy + 86 * Math.sin(a - 0.05))} ${R1(cx + 106 * Math.cos(a))},${R1(cy + 106 * Math.sin(a))} ${R1(cx + 86 * Math.cos(a + 0.05))},${R1(cy + 86 * Math.sin(a + 0.05))}" ${gold}/>`; } return s + `<circle cx="${cx}" cy="${cy}" r="88" ${gold}/>`; }
    case 'flower8': { let s = ''; const n = 8, R = 78; for (let i = 0; i < n; i++) { const a = (i / n) * 2 * Math.PI; s += `<circle cx="${R1(cx + R * Math.cos(a))}" cy="${R1(cy + R * Math.sin(a))}" r="30" ${gold}/>`; } return s + `<circle cx="${cx}" cy="${cy}" r="86" ${gold}/>`; }
    case 'shield': return `<path d="M ${cx - 92} ${cy - 96} H ${cx + 92} V ${cy + 30} Q ${cx + 92} ${cy + 110} ${cx} ${cy + 130} Q ${cx - 92} ${cy + 110} ${cx - 92} ${cy + 30} Z" ${gold}/>`;
    case 'tag': return `<rect x="${cx - 92}" y="${cy - 100}" width="184" height="200" rx="40" ${gold}/>`;
    case 'rounded': return `<rect x="${cx - 96}" y="${cy - 96}" width="192" height="192" rx="26" ${gold}/>`;
    case 'star9': return star(9, 104, 64);
    case 'star10': return star(10, 102, 66);
    case 'star16': return star(16, 100, 84);
    case 'nonagon': return poly(9, 100);
    case 'decagon': return poly(10, 100);
    case 'gear12': { const n = 12; const pts: string[] = []; for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * 2 * Math.PI, r = i % 2 === 0 ? 104 : 84; pts.push(`${R1(cx + r * Math.cos(a))},${R1(cy + r * Math.sin(a))}`); } return `<polygon points="${pts.join(' ')}" ${gold}/>`; }
    case 'gear36': { const n = 36; const pts: string[] = []; for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * 2 * Math.PI, r = i % 2 === 0 ? 99 : 92; pts.push(`${R1(cx + r * Math.cos(a))},${R1(cy + r * Math.sin(a))}`); } return `<polygon points="${pts.join(' ')}" ${gold}/>`; }
    case 'flower12': { let s = ''; const n = 12, R = 80; for (let i = 0; i < n; i++) { const a = (i / n) * 2 * Math.PI; s += `<circle cx="${R1(cx + R * Math.cos(a))}" cy="${R1(cy + R * Math.sin(a))}" r="22" ${gold}/>`; } return s + `<circle cx="${cx}" cy="${cy}" r="86" ${gold}/>`; }
    case 'cross': { const a = 36, b = 96; return `<path d="M ${cx - a} ${cy - b} H ${cx + a} V ${cy - a} H ${cx + b} V ${cy + a} H ${cx + a} V ${cy + b} H ${cx - a} V ${cy + a} H ${cx - b} V ${cy - a} H ${cx - a} Z" ${gold}/>`; }
    case 'burst32': { const n = 32; const pts: string[] = []; for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * 2 * Math.PI, r = i % 2 === 0 ? 104 : 88; pts.push(`${R1(cx + r * Math.cos(a))},${R1(cy + r * Math.sin(a))}`); } return `<polygon points="${pts.join(' ')}" ${gold}/>`; }
    default: return `<circle cx="${cx}" cy="${cy}" r="92" ${gold}/>`;
  }
}

// Centre géométrique (motif type rosace) quand pas de photo.
function geoCenter(c: Palette, id: string): string {
  const cx = 132, cy = 192;
  return `<polygon points="${ptsStar(cx, cy, 8, 46, 22, 0)}" fill="url(#g_${id})" stroke="${c.stroke}" stroke-width="1"/>
  <polygon points="${ptsStar(cx, cy, 8, 46, 22, Math.PI / 8)}" fill="${c.e1}" opacity="0.55"/>
  <circle cx="${cx}" cy="${cy}" r="20" fill="url(#g_${id})" stroke="${c.stroke}" stroke-width="0.8"/>
  <circle cx="${cx}" cy="${cy}" r="10" fill="${c.e2}"/>`;
}

export interface MedalParams {
  frame?: string; color?: string; metal?: string; shape?: string; centerType?: 'photo' | 'geo';
  customPath?: string; title: string; km: number | string; time?: string;
  name?: string; dates?: string; rank?: number; photoUrl?: string;
  // 'template' = médaille MODÈLE vierge (cache rang/temps/nom) ; 'full' (défaut) = avec données user.
  mode?: 'template' | 'full';
}

export function buildMedalSvg(p: MedalParams): string {
  let c: Palette = p.color ? colorPalette(p.color) : pal(p.frame);
  if (p.metal && METALS[p.metal]) c = { ...c, ...METALS[p.metal] };
  const id = (p.frame || p.color || p.shape || 'm').replace(/[^a-z0-9]/gi, '') || 'm';
  const rank = p.rank && p.rank > 0 ? `${p.rank}ᵉ` : '—';
  const shape = (p.shape && (SHAPES as readonly string[]).includes(p.shape)) ? (p.shape as MedalShape) : shapeFor(p.frame);
  const outline = p.customPath ? `<path d="${p.customPath}" fill="url(#g_${id})" stroke="${c.stroke}" stroke-width="1.3"/>` : shapeLayer(shape, c, id);
  const center = p.centerType === 'geo'
    ? geoCenter(c, id)
    : `<circle cx="132" cy="192" r="54" fill="${c.e2}"/><circle cx="132" cy="192" r="50" fill="url(#g_${id})"/><circle cx="132" cy="192" r="50" fill="${c.e1}" opacity="0.16"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 264 384" width="264" height="384">
<defs>
  <linearGradient id="g_${id}" x1="0" y1="0" x2="0.25" y2="1"><stop offset="0" stop-color="${c.g0}"/><stop offset="0.3" stop-color="${c.g1}"/><stop offset="0.62" stop-color="${c.g2}"/><stop offset="1" stop-color="${c.g3}"/></linearGradient>
  <linearGradient id="gb_${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.g0}"/><stop offset="0.5" stop-color="${c.g1}"/><stop offset="1" stop-color="${c.g3}"/></linearGradient>
  <radialGradient id="en_${id}" cx="0.4" cy="0.32" r="0.85"><stop offset="0" stop-color="${c.e0}"/><stop offset="0.5" stop-color="${c.e1}"/><stop offset="1" stop-color="${c.e2}"/></radialGradient>
  <path id="top_${id}" fill="none" d="M 73 164.5 A 65 65 0 0 1 191 164.5"/>
  <path id="bot_${id}" fill="none" d="M 63 224 A 76 76 0 0 0 201 224"/>
</defs>
  <circle cx="132" cy="28" r="8" fill="none" stroke="url(#gb_${id})" stroke-width="5"/>
  ${p.mode === 'template' ? '' : `<circle cx="132" cy="60" r="17" fill="url(#en_${id})" stroke="${c.stroke}" stroke-width="1.2"/>
  <text x="132" y="61" text-anchor="middle" font-family="Georgia,serif" font-weight="800" font-size="16" fill={k.surface}>${rank}</text>
  <text x="132" y="72" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="5.7" letter-spacing="2" fill="${c.e0}">RANG</text>
  <path d="M118 78 L122 108 H142 L146 78 Z" fill="url(#en_${id})" stroke="${c.stroke}" stroke-width="1"/>`}
  ${outline}
  <circle cx="132" cy="192" r="84" fill="url(#en_${id})" stroke="${c.stroke}" stroke-width="0.8"/>
  <circle cx="132" cy="192" r="60" fill="url(#g_${id})"/>
  ${dots(132, 192, 58, 56, c.g0)}
  ${center}
  <circle cx="132" cy="192" r="54" fill="none" stroke="${c.stroke}" stroke-width="2"/>
  <path d="M 73 164.5 A 65 65 0 0 1 191 164.5" fill="none" stroke="rgba(0,0,0,0.4)" stroke-width="23" stroke-linecap="round"/>
  <path d="M 63 224 A 76 76 0 0 0 201 224" fill="none" stroke="rgba(0,0,0,0.4)" stroke-width="20" stroke-linecap="round"/>
  <text font-family="Georgia,serif" font-weight="700" font-size="15" letter-spacing="1.5" fill={k.surface}><textPath href="#top_${id}" startOffset="50%" text-anchor="middle">${esc((p.title || '').toUpperCase()).slice(0, 16)}</textPath></text>
  <text font-family="sans-serif" font-weight="800" font-size="13" letter-spacing="1.5" fill={k.surface}><textPath href="#bot_${id}" startOffset="50%" text-anchor="middle">${esc(String(p.km))} KM</textPath></text>
  ${p.mode === 'template' ? '' : `<rect x="60" y="277" width="144" height="30" rx="15" fill="#241805" stroke="url(#gb_${id})" stroke-width="1.4"/>
  <text x="132" y="291" text-anchor="middle" font-family="sans-serif" font-weight="800" font-size="13" fill="${c.g0}">${esc(p.time || '—')}</text>
  <text x="132" y="301" text-anchor="middle" font-family="sans-serif" font-weight="600" font-size="6" letter-spacing="2.5" fill="${c.g1}">TEMPS DE COURSE</text>
  <path d="M40 336 H224 L224 378 L132 368 L40 378 Z" fill="url(#en_${id})" stroke="${c.stroke}" stroke-width="1.2"/>
  <text x="132" y="354" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="14.5" fill={k.surface}>${esc(p.name || '')}</text>
  <text x="132" y="368" text-anchor="middle" font-family="sans-serif" font-weight="600" font-size="9" fill="${c.e0}">${esc(p.dates || '')}</text>`}
</svg>`;
}
