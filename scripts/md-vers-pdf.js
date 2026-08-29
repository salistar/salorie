// Convertit l'audit Markdown en PDF, sans dependance externe.
//
// Ni pandoc ni wkhtmltopdf ne sont installes, et aucun convertisseur Markdown
// n'est disponible. On ecrit donc un rendu minimal — titres, tableaux, listes,
// gras, code — puis on imprime via le Chromium de Playwright, deja present.
//
// ⚠ Ce rendu ne couvre que ce que CE document emploie. Ce n'est pas un
// convertisseur Markdown general, et il ne pretend pas l'etre.

const fs = require('fs');
const path = require('path');

const SRC = process.argv[2];
const OUT = process.argv[3];
const md = fs.readFileSync(SRC, 'utf8');

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Le style en ligne : `code`, **gras**, *italique*.
const enligne = (s) =>
  esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*]+)\*/g, '$1<em>$2</em>');

const lignes = md.split('\n');
const html = [];
let dansTableau = false;
let dansListe = false;

const fermerListe = () => { if (dansListe) { html.push('</ul>'); dansListe = false; } };
const fermerTableau = () => { if (dansTableau) { html.push('</tbody></table>'); dansTableau = false; } };

for (let i = 0; i < lignes.length; i++) {
  const l = lignes[i];

  // Le separateur d'un tableau : on l'ignore, il a deja servi a l'ouvrir.
  if (/^\|[\s:|-]+\|$/.test(l.trim())) continue;

  if (l.trim().startsWith('|')) {
    const cells = l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    if (!dansTableau) {
      fermerListe();
      html.push('<table><thead><tr>' + cells.map((c) => '<th>' + enligne(c) + '</th>').join('') + '</tr></thead><tbody>');
      dansTableau = true;
    } else {
      html.push('<tr>' + cells.map((c) => '<td>' + enligne(c) + '</td>').join('') + '</tr>');
    }
    continue;
  }
  fermerTableau();

  const titre = l.match(/^(#{1,4})\s+(.*)$/);
  if (titre) {
    fermerListe();
    const n = titre[1].length;
    html.push('<h' + n + '>' + enligne(titre[2]) + '</h' + n + '>');
    continue;
  }

  if (/^[-*]\s+/.test(l)) {
    if (!dansListe) { html.push('<ul>'); dansListe = true; }
    html.push('<li>' + enligne(l.replace(/^[-*]\s+/, '')) + '</li>');
    continue;
  }
  if (/^\d+\.\s+/.test(l)) {
    if (!dansListe) { html.push('<ul>'); dansListe = true; }
    html.push('<li>' + enligne(l.replace(/^\d+\.\s+/, '')) + '</li>');
    continue;
  }
  fermerListe();

  if (/^---+$/.test(l.trim())) { html.push('<hr>'); continue; }
  if (!l.trim()) continue;
  html.push('<p>' + enligne(l) + '</p>');
}
fermerListe();
fermerTableau();

// Les paragraphes consecutifs se recollent : le Markdown coupe les lignes, le
// PDF ne doit pas les afficher comme autant de paragraphes.
const corps = html.join('\n').replace(/<\/p>\n<p>/g, ' ');

const page = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>Audit Salorie</title>
<style>
  @page { margin: 18mm 16mm; }
  body { font: 10.5pt/1.55 "Segoe UI", system-ui, sans-serif; color: #16191d; }
  h1 { font-size: 22pt; margin: 0 0 4mm; letter-spacing: -.4pt; }
  h2 { font-size: 15pt; margin: 9mm 0 3mm; padding-bottom: 2mm;
       border-bottom: 1.5pt solid #d8dce3; page-break-after: avoid; }
  h3 { font-size: 12pt; margin: 6mm 0 2mm; page-break-after: avoid; }
  h4 { font-size: 10.5pt; margin: 4mm 0 2mm; }
  p { margin: 0 0 2.5mm; }
  ul { margin: 0 0 3mm; padding-left: 6mm; }
  li { margin-bottom: 1.2mm; }
  code { font-family: "Cascadia Mono", Consolas, monospace; font-size: 9pt;
         background: #f1f3f5; padding: 0.4mm 1.2mm; border-radius: 1mm; }
  table { width: 100%; border-collapse: collapse; margin: 3mm 0 5mm;
          font-size: 9.5pt; page-break-inside: avoid; }
  th { text-align: left; background: #f1f3f5; font-weight: 700;
       padding: 1.8mm 2mm; border-bottom: 1pt solid #c9ced6; }
  td { padding: 1.6mm 2mm; border-bottom: 0.4pt solid #e2e6ea; vertical-align: top; }
  hr { border: none; border-top: 0.6pt solid #e2e6ea; margin: 6mm 0; }
  strong { font-weight: 700; }
</style></head><body>${corps}</body></html>`;

const tmpHtml = path.join(path.dirname(OUT), '.audit-tmp.html');
fs.writeFileSync(tmpHtml, page, 'utf8');

(async () => {
  const { chromium } = require('playwright');
  const nav = await chromium.launch();
  const p = await nav.newPage();
  await p.goto('file:///' + tmpHtml.replace(/\\/g, '/'), { waitUntil: 'load' });
  await p.pdf({ path: OUT, format: 'A4', printBackground: true });
  await nav.close();
  fs.unlinkSync(tmpHtml);
  console.log('  ecrit : ' + OUT + '  (' + Math.round(fs.statSync(OUT).size / 1024) + ' Ko)');
})();
