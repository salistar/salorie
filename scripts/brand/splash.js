/**
 * Salorie full-screen splash composer.
 * splash_bg.jpg (healthy meal photo) + green veil + white flame + "Salorie".
 * Output: assets/images/splash.png  (used by expo-splash-screen, resizeMode cover).
 */
const sharp = require('sharp');
const path = require('path');

const IMG = path.resolve(__dirname, '../../assets/images');
const BG = path.join(IMG, 'illustrations/splash_bg.jpg');

const C = {
  green: '#298f50', greenDark: '#175e34', greenDeep: '#0f3a22',
  amber: '#f59e0b', amberLight: '#fbbf24', amberPale: '#fde68a', white: '#ffffff',
};

const OUTER =
  'M512 120 C 548 240 560 280 600 350 C 612 270 600 230 612 180 ' +
  'C 672 270 700 350 700 430 C 770 510 812 580 812 670 A 300 300 0 1 1 212 670 ' +
  'C 212 580 254 510 324 430 C 392 352 430 286 452 200 C 470 270 486 270 512 120 Z';
const INNER =
  'M512 440 C 540 520 580 560 612 600 C 656 650 678 690 678 730 ' +
  'A 166 166 0 1 1 346 730 C 346 686 372 642 410 600 C 460 552 496 520 512 440 Z';

const W = 1242, H = 2688;

// place flame so its bbox-center lands at (cx, cy), longest side = target px
function flame(cx, cy, target) {
  const bboxCx = 512, bboxCy = 545, bboxH = 850, bboxW = 600;
  const s = target / Math.max(bboxW, bboxH);
  const tx = cx - bboxCx * s, ty = cy - bboxCy * s;
  return `<g transform="translate(${tx} ${ty}) scale(${s})">
    <path d="${OUTER}" fill="${C.white}"/>
    <path d="${INNER}" fill="url(#core)"/>
    <path d="${INNER}" fill="url(#coreHi)" opacity="0.55"/>
  </g>`;
}

const cy = H * 0.40;
const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="veil" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0"    stop-color="${C.greenDeep}" stop-opacity="0.50"/>
      <stop offset="0.40" stop-color="${C.greenDark}" stop-opacity="0.74"/>
      <stop offset="1"    stop-color="${C.greenDeep}" stop-opacity="0.94"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.40" r="0.55">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="core" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C.amberLight}"/>
      <stop offset="1" stop-color="${C.amber}"/>
    </linearGradient>
    <linearGradient id="coreHi" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0"   stop-color="${C.amberPale}"/>
      <stop offset="0.6" stop-color="${C.amberPale}" stop-opacity="0"/>
      <stop offset="1"   stop-color="${C.amberPale}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#veil)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  ${flame(W / 2, cy, 520)}
  <text x="${W / 2}" y="${cy + 470}" text-anchor="middle" font-family="Arial, Segoe UI, sans-serif" font-size="184" font-weight="900" letter-spacing="-6" fill="#ffffff">Salorie</text>
  <text x="${W / 2}" y="${cy + 566}" text-anchor="middle" font-family="Arial, Segoe UI, sans-serif" font-size="56" font-weight="700" fill="#d8f3e1">Track calories. Burn smarter.</text>
</svg>`;

(async () => {
  const base = await sharp(BG).resize(W, H, { fit: 'cover', position: 'center' }).toBuffer();
  await sharp(base)
    .composite([{ input: Buffer.from(overlay), top: 0, left: 0 }])
    .png()
    .toFile(path.join(IMG, 'splash.png'));
  console.log('  ✓ splash.png', `(${W}x${H}) — bg + veil + flame + wordmark`);
})().catch((e) => { console.error(e); process.exit(1); });
