import fs from 'fs';
const UA = { headers: { 'User-Agent': 'Salorie/1.0 (contact@salorie.app)' } };
const OUT = process.env.OUT || '/tmp/salorie-prod';
fs.mkdirSync(OUT, { recursive: true });

async function wikiPhoto(title) {
  const u = 'https://fr.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=thumbnail&pithumbsize=800&redirects=1&titles=' + encodeURIComponent(title);
  const j = await (await fetch(u, UA)).json();
  const p = j.query.pages;
  for (const k in p) if (p[k].thumbnail) return p[k].thumbnail.source;
  return null;
}
async function dl(url, dest) {
  const r = await fetch(url, UA);
  if (!r.ok) throw new Error('http ' + r.status);
  const b = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(dest, b);
  return b.length;
}

const main = async () => {
  const jus = (await wikiPhoto("Jus d'orange")) || (await wikiPhoto('Orange juice'));
  const choc = (await wikiPhoto('Tablette de chocolat')) || (await wikiPhoto('Chocolate bar'));
  if (jus) console.log('produit1_jus', ((await dl(jus, OUT + '/produit1_jus.jpg')) / 1024 | 0) + 'KB');
  if (choc) console.log('produit2_chocolat', ((await dl(choc, OUT + '/produit2_chocolat.jpg')) / 1024 | 0) + 'KB');
  const codes = { 'codebarre1_2000000000015.png': '2000000000015', 'codebarre2_2000000000022.png': '2000000000022' };
  for (const [f, c] of Object.entries(codes)) {
    try { console.log(f, ((await dl('https://barcodeapi.org/api/ean13/' + c, OUT + '/' + f)) / 1024 | 0) + 'KB'); }
    catch (e) { console.log('barcode fail ' + c, e.message); }
  }
  console.log('FILES:', fs.readdirSync(OUT).join(', '));
};
main();
