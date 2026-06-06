// Downloads real landmark photos (Wikipedia/Wikimedia, free) for each challenge POI
// and writes them to assets/challenges/<challengeId>/<index>.jpg
// Run: node scripts/dl-challenge-photos.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'assets', 'challenges');

// One entry per POI, in the SAME order as CHALLENGES[*].pois in lib/races.ts.
// Each has candidate Wikipedia titles (first that yields an image wins).
const PLAN = {
  'casa-loop': [
    ['Hassan II Mosque'],
    ['El Hank Lighthouse', 'Casablanca'],
    ['Ain Diab', 'Corniche, Casablanca', 'Casablanca'],
    ['Morocco Mall'],
  ],
  'paris-marathon': [
    ['Arc de Triomphe'],
    ['Place de la Concorde'],
    ['Louvre'],
    ['Notre-Dame de Paris'],
    ['Place de la Bastille', 'July Column'],
  ],
  'great-wall': [
    ['Mutianyu'],
    ['Great Wall of China'],
    ['Jinshanling'],
  ],
  'route66': [
    ['Albuquerque, New Mexico'],
    ['Nob Hill, Albuquerque, New Mexico', 'U.S. Route 66 in New Mexico'],
    ['Sandia Mountains'],
  ],
};

async function thumbFor(title) {
  const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=thumbnail&pithumbsize=1000&redirects=1&titles=${encodeURIComponent(title)}`;
  const r = await fetch(url, { headers: { 'User-Agent': 'SalorieApp/1.0 (contact@salorie.app)' } });
  const j = await r.json();
  const pages = j?.query?.pages || {};
  for (const k of Object.keys(pages)) {
    const src = pages[k]?.thumbnail?.source;
    if (src) return src;
  }
  return null;
}

async function download(src, dest) {
  const r = await fetch(src, { headers: { 'User-Agent': 'SalorieApp/1.0 (contact@salorie.app)' } });
  if (!r.ok) throw new Error('http ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return buf.length;
}

async function main() {
  let ok = 0, fail = 0;
  for (const [cid, pois] of Object.entries(PLAN)) {
    const dir = path.join(OUT, cid);
    fs.mkdirSync(dir, { recursive: true });
    for (let i = 0; i < pois.length; i++) {
      const titles = pois[i];
      let src = null, used = null;
      for (const tt of titles) {
        try { src = await thumbFor(tt); } catch {}
        if (src) { used = tt; break; }
      }
      const dest = path.join(dir, `${i}.jpg`);
      if (!src) { console.log(`✗ ${cid}[${i}] no image for ${titles.join(' / ')}`); fail++; continue; }
      try {
        const sz = await download(src, dest);
        console.log(`✓ ${cid}[${i}] ${used} → ${(sz / 1024).toFixed(0)}KB`);
        ok++;
      } catch (e) { console.log(`✗ ${cid}[${i}] download failed: ${e.message}`); fail++; }
    }
  }
  console.log(`\nDone: ${ok} ok, ${fail} failed.`);
}
main();
