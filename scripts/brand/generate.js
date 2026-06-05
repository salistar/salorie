/**
 * Salorie brand asset generator.
 * Builds a cohesive flame-energy logo (white flame + amber core on green gradient)
 * and rasterizes every icon/splash/marketing asset the app + Play Store need.
 */
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const IMG = path.resolve(__dirname, '../../assets/images');
const OUT = path.resolve(__dirname, 'out');
const PLAY = 'C:/Users/21266/Desktop/playstore/salorie/assets';
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(PLAY, { recursive: true });

// ---- brand palette ---------------------------------------------------------
const C = {
  greenLight: '#3fc06f',
  green: '#298f50',
  greenDark: '#175e34',
  greenDeep: '#0f3a22',
  amber: '#f59e0b',
  amberLight: '#fbbf24',
  amberPale: '#fde68a',
  white: '#ffffff',
};

// Flame paths in a 1024 viewBox — classic twin-lick flame. bbox x[212,812] y[120,970], center (512,545)
const OUTER =
  'M512 120 C 548 240 560 280 600 350 C 612 270 600 230 612 180 ' +
  'C 672 270 700 350 700 430 C 770 510 812 580 812 670 A 300 300 0 1 1 212 670 ' +
  'C 212 580 254 510 324 430 C 392 352 430 286 452 200 C 470 270 486 270 512 120 Z';
const INNER =
  'M512 440 C 540 520 580 560 612 600 C 656 650 678 690 678 730 ' +
  'A 166 166 0 1 1 346 730 C 346 686 372 642 410 600 C 460 552 496 520 512 440 Z';

// place the flame group so its bbox-center sits at canvas center, scaled to `frac` of size
function flameGroup({ size, frac, outerFill, innerFill, withHighlight = true }) {
  const bboxCx = 512, bboxCy = 545, bboxH = 850, bboxW = 600;
  const target = size * frac;
  const s = target / Math.max(bboxW, bboxH);
  const tx = size / 2 - bboxCx * s;
  const ty = size / 2 - bboxCy * s;
  const hl = withHighlight
    ? `<path d="${INNER}" fill="url(#coreHi)" opacity="0.55"/>`
    : '';
  return `<g transform="translate(${tx} ${ty}) scale(${s})">
      <path d="${OUTER}" fill="${outerFill}"/>
      <path d="${INNER}" fill="${innerFill}"/>
      ${hl}
    </g>`;
}

const defs = `<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${C.greenLight}"/>
    <stop offset="0.55" stop-color="${C.green}"/>
    <stop offset="1" stop-color="${C.greenDark}"/>
  </linearGradient>
  <linearGradient id="bgDeep" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${C.green}"/>
    <stop offset="1" stop-color="${C.greenDeep}"/>
  </linearGradient>
  <radialGradient id="glow" cx="0.5" cy="0.32" r="0.75">
    <stop offset="0" stop-color="#ffffff" stop-opacity="0.22"/>
    <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="core" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${C.amberLight}"/>
    <stop offset="1" stop-color="${C.amber}"/>
  </linearGradient>
  <linearGradient id="coreHi" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${C.amberPale}"/>
    <stop offset="0.6" stop-color="${C.amberPale}" stop-opacity="0"/>
    <stop offset="1" stop-color="${C.amberPale}" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="flameGreen" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${C.greenLight}"/>
    <stop offset="1" stop-color="${C.greenDark}"/>
  </linearGradient>
</defs>`;

function svg(size, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${defs}${body}</svg>`;
}

async function render(svgStr, file, size) {
  const buf = await sharp(Buffer.from(svgStr)).png().toBuffer();
  await sharp(buf).resize(size, size).toFile(file);
  console.log('  ✓', path.basename(file), `(${size}px)`);
}

// full-bleed green square + glow + white flame + amber core  (app icon / store icon)
function iconBleed(size) {
  return svg(size, `
    <rect width="${size}" height="${size}" fill="url(#bg)"/>
    <rect width="${size}" height="${size}" fill="url(#glow)"/>
    ${flameGroup({ size, frac: 0.6, outerFill: C.white, innerFill: 'url(#core)' })}
  `);
}

// rounded-corner version (favicon / web logo tile)
function iconRounded(size) {
  const r = size * 0.22;
  return svg(size, `
    <rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="url(#bg)"/>
    <rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="url(#glow)"/>
    ${flameGroup({ size, frac: 0.6, outerFill: C.white, innerFill: 'url(#core)' })}
  `);
}

async function main() {
  console.log('Salorie brand assets →');

  // App icon (full bleed, OS masks corners)
  await render(iconBleed(1024), path.join(IMG, 'icon.png'), 1024);

  // Android adaptive icon — foreground (flame in safe zone, transparent bg)
  await render(
    svg(1024, flameGroup({ size: 1024, frac: 0.46, outerFill: C.white, innerFill: 'url(#core)' })),
    path.join(IMG, 'android-icon-foreground.png'), 1024
  );
  // background (green gradient, system masks)
  await render(
    svg(1024, `<rect width="1024" height="1024" fill="url(#bg)"/><rect width="1024" height="1024" fill="url(#glow)"/>`),
    path.join(IMG, 'android-icon-background.png'), 1024
  );
  // monochrome (Android 13 themed icon — single-colour flame silhouette)
  await render(
    svg(1024, flameGroup({ size: 1024, frac: 0.46, outerFill: '#000000', innerFill: '#000000', withHighlight: false })),
    path.join(IMG, 'android-icon-monochrome.png'), 1024
  );

  // Splash logo — flame on transparent (sits on green splash bg)
  await render(
    svg(1024, flameGroup({ size: 1024, frac: 0.74, outerFill: C.white, innerFill: 'url(#core)' })),
    path.join(IMG, 'splash-icon.png'), 1024
  );

  // fire.png — green-bodied flame used inside the in-app AppBrand pale-green chip
  await render(
    svg(512, flameGroup({ size: 512, frac: 0.82, outerFill: 'url(#flameGreen)', innerFill: 'url(#core)' })),
    path.join(IMG, 'fire.png'), 512
  );

  // favicon
  await render(iconRounded(256), path.join(IMG, 'favicon.png'), 196);

  // Play Store icon (512, full bleed)
  await render(iconBleed(512), path.join(PLAY, 'icon-512.png'), 512);

  // Horizontal wordmark logo (web + marketing) — flame + "Salorie"
  const logoW = 1280, logoH = 384;
  const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${logoW}" height="${logoH}" viewBox="0 0 ${logoW} ${logoH}">${defs}
    <g transform="translate(40 8) scale(0.36)">
      <path d="${OUTER}" fill="url(#flameGreen)"/>
      <path d="${INNER}" fill="url(#core)"/>
    </g>
    <text x="380" y="248" font-family="Arial, Segoe UI, sans-serif" font-size="200" font-weight="900" letter-spacing="-6" fill="${C.green}">Salorie</text>
  </svg>`;
  await sharp(Buffer.from(logoSvg)).png().toFile(path.join(IMG, 'logo.png'));
  console.log('  ✓ logo.png (wordmark)');

  // Feature graphic 1024x500 (Play Store banner)
  const fg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">${defs}
    <rect width="1024" height="500" fill="url(#bgDeep)"/>
    <rect width="1024" height="500" fill="url(#glow)"/>
    <g transform="translate(70 70) scale(0.44)">
      <path d="${OUTER}" fill="${C.white}"/>
      <path d="${INNER}" fill="url(#core)"/>
      <path d="${INNER}" fill="url(#coreHi)" opacity="0.55"/>
    </g>
    <text x="430" y="220" font-family="Arial, Segoe UI, sans-serif" font-size="108" font-weight="900" letter-spacing="-3" fill="#ffffff">Salorie</text>
    <text x="433" y="288" font-family="Arial, Segoe UI, sans-serif" font-size="38" font-weight="700" fill="#d8f3e1">Track calories. Burn smarter.</text>
    <text x="434" y="342" font-family="Arial, Segoe UI, sans-serif" font-size="27" font-weight="400" fill="#a7d9bb">AI food scan · macros · water · workouts</text>
  </svg>`;
  await sharp(Buffer.from(fg)).png().toFile(path.join(PLAY, 'feature-graphic-1024x500.png'));
  console.log('  ✓ feature-graphic-1024x500.png');

  console.log('Done.');
}
main().catch(e => { console.error(e); process.exit(1); });
