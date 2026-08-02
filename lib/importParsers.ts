// Import de journaux alimentaires depuis un export CSV (MyFitnessPal, Yazio, Cronometer…).
// Parseur CSV robuste (guillemets, ; ou , ou tab) + détection FLOUE des colonnes par
// mots-clés d'en-tête → mappe chaque ligne vers un log. Aucun format codé en dur →
// marche pour la plupart des exports concurrents. Tolérant : ignore les lignes invalides.

export interface ImportedLog {
  name: string; calories: number; protein: number; carbs: number; fat: number;
  date: string; slot: string;
}

/** Devine le séparateur (virgule / point-virgule / tab) à partir de la 1re ligne. */
function detectDelim(firstLine: string): string {
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  let inQ = false;
  for (const c of firstLine) {
    if (c === '"') inQ = !inQ;
    else if (!inQ && (c === ',' || c === ';' || c === '\t')) counts[c]++;
  }
  if (counts[';'] > counts[','] && counts[';'] >= counts['\t']) return ';';
  if (counts['\t'] > counts[','] && counts['\t'] >= counts[';']) return '\t';
  return ',';
}

/** Parse un texte CSV en lignes de champs (gère les guillemets et le séparateur donné). */
export function parseCSV(text: string, delim = ','): string[][] {
  const rows: string[][] = [];
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  let field = '', row: string[] = [], inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim().length));
}

/** Index de la 1re colonne dont l'en-tête CONTIENT un des mots-clés (hors exclusions). */
function find(headers: string[], keys: string[], exclude: string[] = []): number {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toLowerCase();
    if (keys.some((k) => h.includes(k)) && !exclude.some((e) => h.includes(e))) return i;
  }
  return -1;
}

function slotFromMeal(meal: string): string {
  const m = (meal || '').toLowerCase();
  if (/break|petit|فطور|morning/.test(m)) return 'breakfast';
  if (/lunch|déj|dej|غداء|midi|noon/.test(m)) return 'lunch';
  if (/dinner|dîner|diner|عشاء|soir|supper|evening/.test(m)) return 'dinner';
  return 'snack';
}

/** Convertit une date d'export (ISO, DD/MM/YYYY, MM/DD/YYYY…) en 'YYYY-MM-DD', ou null. */
export function toYmd(raw: string): string | null {
  const s = (raw || '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);          // YYYY-MM-DD
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);              // DD/MM/YYYY ou MM/DD/YYYY
  if (m) {
    let d = +m[1], mo = +m[2];
    if (mo > 12 && d <= 12) { const t = d; d = mo; mo = t; }        // clairement MM/DD → on inverse
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return `${m[3]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return null;
}

const num = (v: string): number => {
  const n = parseFloat(String(v ?? '').replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? Math.max(0, n) : 0;
};

/** Parse un export alimentaire → logs importables + compteurs (total lignes, ignorées). */
export function parseFoodExport(text: string): { logs: ImportedLog[]; total: number; skipped: number } {
  const firstLine = (text.split(/\r?\n/)[0]) || '';
  const rows = parseCSV(text, detectDelim(firstLine));
  if (rows.length < 2) return { logs: [], total: 0, skipped: 0 };

  const headers = rows[0].map((h) => h.trim());
  const iDate = find(headers, ['date', 'jour', 'day']);
  const iName = find(headers, ['food', 'name', 'product', 'description', 'item', 'aliment', 'produit', 'nom']);
  const iKcal = find(headers, ['calor', 'energy', 'kcal', 'énergie', 'energie']);
  const iProt = find(headers, ['protein', 'protéine', 'proteine', 'بروتين']);
  const iCarb = find(headers, ['carb', 'glucide', 'كربوهيدرات']);
  const iFat = find(headers, ['fat', 'lipide', 'graisse', 'دهون'], ['satur', 'trans', 'poly', 'mono', 'unsatur']);
  const iMeal = find(headers, ['meal', 'repas', 'وجبة', 'category']);

  const logs: ImportedLog[] = [];
  let skipped = 0;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const name = iName >= 0 ? (row[iName] || '').trim() : '';
    const kcal = iKcal >= 0 ? num(row[iKcal]) : 0;
    const date = iDate >= 0 ? toYmd(row[iDate]) : null;
    if (!name || kcal <= 0 || !date) { skipped++; continue; }
    logs.push({
      name: name.slice(0, 80),
      calories: Math.round(kcal),
      protein: iProt >= 0 ? +num(row[iProt]).toFixed(1) : 0,
      carbs: iCarb >= 0 ? +num(row[iCarb]).toFixed(1) : 0,
      fat: iFat >= 0 ? +num(row[iFat]).toFixed(1) : 0,
      date,
      slot: iMeal >= 0 ? slotFromMeal(row[iMeal]) : 'snack',
    });
  }
  return { logs, total: rows.length - 1, skipped };
}
