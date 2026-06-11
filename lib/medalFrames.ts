// Générateur de médailles paramétrable (façon tes SVG) — au lieu d'embarquer 30
// gros fichiers, on génère le SVG en code : thème → palette de couleurs + tokens
// (rang, titre, km, temps, nom, dates). Rendu via react-native-svg <SvgXml>.

export interface Palette { g0: string; g1: string; g2: string; g3: string; e0: string; e1: string; e2: string; stroke: string; }

// Palettes par thème (or + émail coloré), tirées de tes médailles.
const GOLD = { g0: '#fff7d6', g1: '#f4c430', g2: '#d99c1c', g3: '#9a6708', stroke: '#5e3f06' };
export const PALETTES: Record<string, Palette> = {
  rabat:      { ...GOLD, e0: '#f0726a', e1: '#d33329', e2: '#8c1a13' },
  casablanca: { ...GOLD, e0: '#79b6e8', e1: '#2e74b0', e2: '#1b4d83' },
  marrakech:  { ...GOLD, e0: '#f0726a', e1: '#d33329', e2: '#8c1a13' },
  fes:        { ...GOLD, e0: '#8a93d6', e1: '#414a93', e2: '#2a3066' },
  meknes:     { ...GOLD, e0: '#e8c682', e1: '#c79a4e', e2: '#97702f' },
  tanger:     { ...GOLD, e0: '#79b6e8', e1: '#2e74b0', e2: '#1b4d83' },
  chefchaouen:{ ...GOLD, e0: '#79b6e8', e1: '#2e74b0', e2: '#1b4d83' },
  essaouira:  { ...GOLD, e0: '#5fd6a2', e1: '#1c9d6b', e2: '#0e5e3f' },
  ouarzazate: { ...GOLD, e0: '#e8a36a', e1: '#c8743c', e2: '#8a431d' },
  tetouan:    { ...GOLD, e0: '#5fd6a2', e1: '#1c9d6b', e2: '#0e5e3f' },
  agadir:     { ...GOLD, e0: '#5fd6a2', e1: '#1c9d6b', e2: '#0e5e3f' },
  dakhla:     { g0: '#e7ecf3', g1: '#bcc5d2', g2: '#8b94a6', g3: '#5b6472', stroke: '#454d5e', e0: '#3fd0c0', e1: '#15a99a', e2: '#0e6e63' },
  merzouga:   { g0: '#ffe2c4', g1: '#e8a36a', g2: '#c8743c', g3: '#8a431d', stroke: '#522a10', e0: '#e8c682', e1: '#c79a4e', e2: '#97702f' },
  ifrane:     { g0: '#ffffff', g1: '#e7ecf3', g2: '#bcc5d2', g3: '#8b94a6', stroke: '#454d5e', e0: '#79b6e8', e1: '#2e74b0', e2: '#1b4d83' },
  'el-jadida':{ g0: '#ffffff', g1: '#e7ecf3', g2: '#bcc5d2', g3: '#8b94a6', stroke: '#454d5e', e0: '#79b6e8', e1: '#2e74b0', e2: '#1b4d83' },
  couscous:   { ...GOLD, e0: '#f3c759', e1: '#d99423', e2: '#a56b12' },
  tajine:     { ...GOLD, e0: '#f0726a', e1: '#d33329', e2: '#8c1a13' },
  caftan:     { ...GOLD, e0: '#ef6fb0', e1: '#c0297a', e2: '#7c1850' },
  the:        { g0: '#ffffff', g1: '#e7ecf3', g2: '#bcc5d2', g3: '#8b94a6', stroke: '#454d5e', e0: '#5fd6a2', e1: '#1c9d6b', e2: '#0e5e3f' },
  gnaoua:     { ...GOLD, e0: '#8a93d6', e1: '#414a93', e2: '#2a3066' },
};
export const FRAME_IDS = Object.keys(PALETTES);
function pal(frame: string): Palette { return PALETTES[frame] || { ...GOLD, e0: '#5fd6a2', e1: '#2E8B57', e2: '#0e5e3f' }; }

// Points d'un cercle (anneau de perles).
function dots(cx: number, cy: number, r: number, n: number, color: string): string {
  let out = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI;
    const x = (cx + r * Math.cos(a)).toFixed(1);
    const y = (cy + r * Math.sin(a)).toFixed(1);
    out += `<circle cx="${x}" cy="${y}" r="1.3" fill="${color}" opacity="0.55"/>`;
  }
  return out;
}
const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface MedalParams {
  frame: string; title: string; km: number | string; time?: string;
  name?: string; dates?: string; rank?: number; photoUrl?: string;
}

export function buildMedalSvg(p: MedalParams): string {
  const c = pal(p.frame);
  const id = (p.frame || 'm').replace(/[^a-z0-9]/gi, '');
  const rank = p.rank && p.rank > 0 ? `${p.rank}ᵉ` : '—';
  const photo = p.photoUrl
    ? `<image href="${esc(p.photoUrl)}" x="78" y="138" width="108" height="108" preserveAspectRatio="xMidYMid slice"/>`
    : `<rect x="78" y="138" width="108" height="108" fill="url(#ph_${id})"/>
       <text x="132" y="195" text-anchor="middle" font-family="monospace" font-size="9.5" fill="#9a917f">GLISSEZ UNE PHOTO</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 264 384" width="264" height="384">
<defs>
  <linearGradient id="g_${id}" x1="0" y1="0" x2="0.25" y2="1"><stop offset="0" stop-color="${c.g0}"/><stop offset="0.3" stop-color="${c.g1}"/><stop offset="0.62" stop-color="${c.g2}"/><stop offset="1" stop-color="${c.g3}"/></linearGradient>
  <linearGradient id="gb_${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.g0}"/><stop offset="0.5" stop-color="${c.g1}"/><stop offset="1" stop-color="${c.g3}"/></linearGradient>
  <radialGradient id="en_${id}" cx="0.4" cy="0.32" r="0.85"><stop offset="0" stop-color="${c.e0}"/><stop offset="0.5" stop-color="${c.e1}"/><stop offset="1" stop-color="${c.e2}"/></radialGradient>
  <pattern id="ph_${id}" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="12" height="12" fill="#ece5d6"/><rect width="6" height="12" fill="#e1dac9"/></pattern>
  <clipPath id="sc_${id}"><circle cx="132" cy="192" r="54"/></clipPath>
  <path id="top_${id}" fill="none" d="M 73 164.5 A 65 65 0 0 1 191 164.5"/>
  <path id="bot_${id}" fill="none" d="M 63 224 A 76 76 0 0 0 201 224"/>
</defs>
  <circle cx="132" cy="28" r="8" fill="none" stroke="url(#gb_${id})" stroke-width="5"/>
  <circle cx="132" cy="60" r="17" fill="url(#en_${id})" stroke="${c.stroke}" stroke-width="1.2"/>
  <text x="132" y="61" text-anchor="middle" font-family="Georgia,serif" font-weight="800" font-size="16" fill="#fff">${rank}</text>
  <text x="132" y="72" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="5.7" letter-spacing="2" fill="${c.e0}">RANG</text>
  <path d="M118 78 L122 108 H142 L146 78 Z" fill="url(#en_${id})" stroke="${c.stroke}" stroke-width="1"/>
  <circle cx="132" cy="192" r="84" fill="url(#en_${id})" stroke="${c.stroke}" stroke-width="0.8"/>
  <circle cx="132" cy="192" r="60" fill="url(#g_${id})"/>
  ${dots(132, 192, 58, 56, c.g0)}
  <circle cx="132" cy="192" r="54" fill="#0e0c08"/>
  <g clip-path="url(#sc_${id})">${photo}</g>
  <circle cx="132" cy="192" r="54" fill="none" stroke="${c.stroke}" stroke-width="2"/>
  <path d="M 73 164.5 A 65 65 0 0 1 191 164.5" fill="none" stroke="rgba(0,0,0,0.4)" stroke-width="23" stroke-linecap="round"/>
  <path d="M 63 224 A 76 76 0 0 0 201 224" fill="none" stroke="rgba(0,0,0,0.4)" stroke-width="20" stroke-linecap="round"/>
  <text font-family="Georgia,serif" font-weight="700" font-size="15" letter-spacing="1.5" fill="#fff"><textPath href="#top_${id}" startOffset="50%" text-anchor="middle">${esc((p.title || '').toUpperCase()).slice(0, 16)}</textPath></text>
  <text font-family="sans-serif" font-weight="800" font-size="13" letter-spacing="1.5" fill="#fff"><textPath href="#bot_${id}" startOffset="50%" text-anchor="middle">${esc(String(p.km))} KM</textPath></text>
  <rect x="60" y="277" width="144" height="30" rx="15" fill="#241805" stroke="url(#gb_${id})" stroke-width="1.4"/>
  <text x="132" y="291" text-anchor="middle" font-family="sans-serif" font-weight="800" font-size="13" fill="${c.g0}">${esc(p.time || '—')}</text>
  <text x="132" y="301" text-anchor="middle" font-family="sans-serif" font-weight="600" font-size="6" letter-spacing="2.5" fill="${c.g1}">TEMPS DE COURSE</text>
  <path d="M40 336 H224 L224 378 L132 368 L40 378 Z" fill="url(#en_${id})" stroke="${c.stroke}" stroke-width="1.2"/>
  <text x="132" y="354" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="14.5" fill="#fff">${esc(p.name || '')}</text>
  <text x="132" y="368" text-anchor="middle" font-family="sans-serif" font-weight="600" font-size="9" fill="${c.e0}">${esc(p.dates || '')}</text>
</svg>`;
}
