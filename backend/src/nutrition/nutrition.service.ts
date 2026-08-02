import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { RedisService } from '../redis.service';

export interface FoodInput { name: string; calories?: number; barcode?: string; }

function norm(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Curated CIQUAL (ANSES) subset, loaded once → name → micros/100g (RDI units).
const CIQUAL: Map<string, { micros100: Record<string, number>; kcal100: number }> = (() => {
  const map = new Map<string, any>();
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), 'data', 'ciqual.json'), 'utf8');
    const j = JSON.parse(raw);
    const labels: string[] = j.labels;
    for (const f of j.foods || []) {
      const micros100: Record<string, number> = {};
      labels.forEach((lab, i) => { micros100[lab] = Number(f.m[i]) || 0; });
      const entry = { micros100, kcal100: Number(f.kcal) || 0 };
      for (const n of f.names) map.set(norm(n), entry);
    }
  } catch (e) { new Logger('CIQUAL').warn('ciqual.json not loaded: ' + (e as Error).message); }
  return map;
})();

// Reference Daily Intake (adult) used to express % of needs.
const RDI: Record<string, { rdi: number; unit: string }> = {
  Fibres:      { rdi: 30,   unit: 'g' },
  Sodium:      { rdi: 2300, unit: 'mg' },
  Potassium:   { rdi: 3500, unit: 'mg' },
  Calcium:     { rdi: 1000, unit: 'mg' },
  Fer:         { rdi: 14,   unit: 'mg' },
  Magnésium:   { rdi: 400,  unit: 'mg' },
  'Vitamine C':{ rdi: 90,   unit: 'mg' },
  'Vitamine D':{ rdi: 20,   unit: 'mcg' },
  'Vitamine A':{ rdi: 900,  unit: 'mcg' },
  'Vitamine B12':{ rdi: 2.4, unit: 'mcg' },
};
// OpenFoodFacts nutriment keys (_100g, in grams) → our label + unit conversion to RDI unit.
const OFF_MAP: Record<string, { key: string; toUnit: (grams: number) => number }> = {
  Fibres:      { key: 'fiber_100g',       toUnit: (g) => g },          // g
  Sodium:      { key: 'sodium_100g',      toUnit: (g) => g * 1000 },   // g→mg
  Potassium:   { key: 'potassium_100g',   toUnit: (g) => g * 1000 },
  Calcium:     { key: 'calcium_100g',     toUnit: (g) => g * 1000 },
  Fer:         { key: 'iron_100g',        toUnit: (g) => g * 1000 },
  Magnésium:   { key: 'magnesium_100g',   toUnit: (g) => g * 1000 },
  'Vitamine C':{ key: 'vitamin-c_100g',   toUnit: (g) => g * 1000 },
  'Vitamine D':{ key: 'vitamin-d_100g',   toUnit: (g) => g * 1e6 },    // g→mcg
  'Vitamine A':{ key: 'vitamin-a_100g',   toUnit: (g) => g * 1e6 },
  'Vitamine B12':{ key: 'vitamin-b12_100g', toUnit: (g) => g * 1e6 },
};
// USDA FoodData Central nutrient numbers → label (FDC values already in RDI units).
const USDA_MAP: Record<string, string> = {
  '291': 'Fibres', '307': 'Sodium', '306': 'Potassium', '301': 'Calcium', '303': 'Fer',
  '304': 'Magnésium', '401': 'Vitamine C', '328': 'Vitamine D', '320': 'Vitamine A', '418': 'Vitamine B12',
};

@Injectable()
export class NutritionService {
  private readonly logger = new Logger(NutritionService.name);
  private usdaKeyWarned = false;

  constructor(private redis: RedisService) {}

  // Per-food micronutrients per 100g — NORMALIZED to RDI units. Tries USDA
  // FoodData Central first for generic foods (banana, yogurt…), OpenFoodFacts
  // for barcodes / branded items. Cached in Redis (shared across users).
  private async foodMicros(food: FoodInput): Promise<{ micros100: Record<string, number>; kcal100: number } | null> {
    const cacheKey = `nut:${food.barcode || ('n:' + (food.name || '').toLowerCase())}`;
    const cached = await this.redis.getJSON<any>(cacheKey);
    if (cached) return cached;

    let micros100: Record<string, number> = {};
    let kcal100 = 0;
    let found = false;

    // 1) Barcode → OpenFoodFacts product
    try {
      if (food.barcode) {
        const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${food.barcode}.json`, { headers: { 'User-Agent': 'Salorie/1.0' } } as any);
        const j: any = await r.json();
        const n = j?.status === 1 ? j.product?.nutriments : null;
        if (n) {
          kcal100 = Number(n['energy-kcal_100g']) || 0;
          for (const [label, m] of Object.entries(OFF_MAP)) { const g = Number(n[m.key]); if (!isNaN(g)) micros100[label] = m.toUnit(g); }
          found = true;
        }
      }
    } catch {}

    // 1.5) Curated CIQUAL (ANSES) — instant, offline, FR-first for generic foods.
    if (!found && food.name) {
      const key = norm(food.name);
      let c = CIQUAL.get(key);
      if (!c && key) { for (const [k, v] of CIQUAL) { if (key.includes(k) || k.includes(key)) { c = v; break; } } }
      if (c) { micros100 = { ...c.micros100 }; kcal100 = c.kcal100; found = true; }
    }

    // 2) Generic name → USDA FoodData Central (rich micronutrients for whole foods)
    // Requires a real USDA_API_KEY. If absent, skip cleanly (no public DEMO_KEY);
    // the OpenFoodFacts text-search fallback below takes over.
    const usdaKey = process.env.USDA_API_KEY;
    if (!found && food.name && !usdaKey && !this.usdaKeyWarned) {
      this.usdaKeyWarned = true;
      this.logger.warn('USDA_API_KEY not set — skipping USDA FoodData Central lookup (cascade falls back to OpenFoodFacts).');
    }
    if (!found && food.name && usdaKey) {
      try {
        const r = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${usdaKey}&query=${encodeURIComponent(food.name)}&pageSize=5&dataType=Foundation,SR%20Legacy`, { headers: { 'User-Agent': 'Salorie/1.0' } } as any);
        const j: any = await r.json();
        const foods: any[] = j?.foods || [];
        // Pick the result that covers the MOST of our target nutrients.
        let best: any = null, bestScore = -1;
        for (const fd of foods) {
          const score = (fd.foodNutrients || []).filter((n: any) => USDA_MAP[String(n.nutrientNumber)] && n.value != null).length;
          if (score > bestScore) { bestScore = score; best = fd; }
        }
        if (best?.foodNutrients?.length) {
          for (const fn of best.foodNutrients) {
            const num = String(fn.nutrientNumber ?? fn.number ?? '');
            if (num === '208') kcal100 = Number(fn.value) || kcal100;
            const label = USDA_MAP[num];
            if (label && fn.value != null) micros100[label] = Number(fn.value); // FDC already in RDI units / 100g
          }
          if (Object.keys(micros100).length >= 3) found = true; // require a meaningful match
        }
      } catch {}
    }

    // 3) Fallback → OpenFoodFacts text search
    if (!found && food.name) {
      try {
        const r = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(food.name)}&search_simple=1&action=process&json=1&page_size=1`, { headers: { 'User-Agent': 'Salorie/1.0' } } as any);
        const j: any = await r.json();
        const n = j?.products?.[0]?.nutriments;
        if (n) {
          kcal100 = Number(n['energy-kcal_100g']) || 0;
          for (const [label, m] of Object.entries(OFF_MAP)) { const g = Number(n[m.key]); if (!isNaN(g)) micros100[label] = m.toUnit(g); }
          found = true;
        }
      } catch {}
    }

    if (!found) return null;
    const res = { micros100, kcal100 };
    await this.redis.setJSON(cacheKey, res, 7 * 24 * 3600);
    return res;
  }

  async micros(foods: FoodInput[], lang = 'fr') {
    const totals: Record<string, number> = {};
    let matched = 0;
    const names: string[] = [];
    for (const f of foods) {
      const data = await this.foodMicros(f);
      if (!data) continue;
      matched++;
      if (f.name) names.push(f.name);
      // Estimate grams eaten from logged calories vs the food's kcal/100g.
      const grams = data.kcal100 > 0 && f.calories ? (f.calories / data.kcal100) * 100 : 100;
      for (const [label, amt100] of Object.entries(data.micros100)) {
        totals[label] = (totals[label] || 0) + amt100 * (grams / 100);
      }
    }

    const micros = Object.keys(RDI).map((label) => {
      const amt = totals[label] || 0;
      const { rdi, unit } = RDI[label];
      const pct = Math.round((amt / rdi) * 100);
      const amount = unit === 'g' ? `${amt.toFixed(1)} g` : `${Math.round(amt)} ${unit}`;
      return { name: label, amount, pct };
    });

    const lowest = [...micros].sort((a, b) => a.pct - b.pct)[0];
    const highest = [...micros].sort((a, b) => b.pct - a.pct)[0];
    return {
      source: 'computed',                       // 0 AI — deterministic from OpenFoodFacts
      basis: `${matched} aliment(s)` + (names.length ? `: ${names.join(', ')}` : ''),
      micros,
      good: highest ? `Bon apport en ${highest.name}.` : '',
      lack: lowest && lowest.pct < 60 ? `Apport faible en ${lowest.name}.` : '',
    };
  }
}
