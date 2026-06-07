import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis.service';

export interface FoodInput { name: string; calories?: number; barcode?: string; }

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

@Injectable()
export class NutritionService {
  constructor(private redis: RedisService) {}

  // Per-food OFF nutriments per 100g, cached in Redis (shared across users).
  private async offNutriments(food: FoodInput): Promise<{ per100: any; kcal100: number } | null> {
    const cacheKey = `off:${food.barcode || ('n:' + (food.name || '').toLowerCase())}`;
    const cached = await this.redis.getJSON<any>(cacheKey);
    if (cached) return cached;

    let product: any = null;
    try {
      if (food.barcode) {
        const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${food.barcode}.json`, { headers: { 'User-Agent': 'Salorie/1.0' } } as any);
        const j: any = await r.json();
        if (j.status === 1) product = j.product;
      }
      if (!product && food.name) {
        const r = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(food.name)}&search_simple=1&action=process&json=1&page_size=1`, { headers: { 'User-Agent': 'Salorie/1.0' } } as any);
        const j: any = await r.json();
        product = j.products?.[0] || null;
      }
    } catch { /* network — skip this food */ }
    if (!product?.nutriments) return null;
    const res = { per100: product.nutriments, kcal100: Number(product.nutriments['energy-kcal_100g']) || 0 };
    await this.redis.setJSON(cacheKey, res, 7 * 24 * 3600); // products rarely change
    return res;
  }

  async micros(foods: FoodInput[], lang = 'fr') {
    const totals: Record<string, number> = {};
    let matched = 0;
    const names: string[] = [];
    for (const f of foods) {
      const off = await this.offNutriments(f);
      if (!off) continue;
      matched++;
      if (f.name) names.push(f.name);
      // Estimate grams eaten from logged calories vs the product's kcal/100g.
      const grams = off.kcal100 > 0 && f.calories ? (f.calories / off.kcal100) * 100 : 100;
      for (const [label, m] of Object.entries(OFF_MAP)) {
        const g = Number(off.per100[m.key]);
        if (!isNaN(g)) totals[label] = (totals[label] || 0) + m.toUnit(g) * (grams / 100);
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
