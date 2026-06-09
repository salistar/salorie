// S4: Food search uses OpenFoodFacts ONLY (free, no API key, no client secret).
// The former FatSecret OAuth helpers were removed — a client secret must never
// ship in the app bundle, and FatSecret rejects mobile IPs anyway. A server-side
// proxy can be added later in the backend if FatSecret data is ever needed.

/**
 * Searches foods via OpenFoodFacts (free, no API key, NO IP allowlist).
 *
 * Why not FatSecret? The FatSecret REST API rejects any non-whitelisted IP
 * (error 21 "Invalid IP address"). Mobile devices each have a different,
 * dynamic IP, so the call can never succeed from the app — and shipping the
 * FatSecret secret in the client is also a leak. OpenFoodFacts works directly
 * from any device. Results are mapped to the SAME shape the UI expects:
 *   { food_id, food_name, food_description:
 *       "Per 100g - Calories: Xkcal | Fat: Yg | Carbs: Zg | Protein: Wg" }
 *
 * The FatSecret token helpers above are kept for a future server-side proxy.
 */
// Contact in the User-Agent is REQUIRED by the OpenFoodFacts API (format
// "AppName/Version (Contact)"); requests without it get throttled/blocked.
const OFF_UA = 'Salorie/1.0 (salistarcompany@gmail.com)';

const round100 = (v: any) => (v == null || isNaN(Number(v)) ? 0 : Math.round(Number(v) * 100) / 100);

// One OpenFoodFacts attempt. Returns null on ANY failure (network, HTTP error,
// HTML "temporarily unavailable" page, bad JSON) so the caller can retry.
async function offSearchOnce(query: string): Promise<any[] | null> {
  // cgi/search.pl is the legacy full-text endpoint, but it's the only OFF search
  // that returns per-100g nutriments inline (Search-a-licious does not), so we
  // use it with a proper contact User-Agent and gentle retries.
  const url =
    `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}` +
    `&search_simple=1&action=process&json=1&page_size=20` +
    `&fields=code,product_name,brands,nutriments`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': OFF_UA, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const body = await res.text();
    // OFF often serves an HTML "Page temporarily unavailable" under load.
    if (!body || body.trimStart().startsWith('<')) return null;
    let data: any;
    try { data = JSON.parse(body); } catch { return null; }
    const products: any[] = Array.isArray(data.products) ? data.products : [];
    return products
      .map((p: any) => {
        const n = p.nutriments || {};
        const kcal = round100(n['energy-kcal_100g']);
        const name = [p.product_name, (p.brands || '').split(',')[0]].filter(Boolean).join(' ').trim();
        return {
          food_id: p.code || name,
          food_name: name,
          food_description: `Per 100g - Calories: ${Math.round(kcal)}kcal | Fat: ${round100(n.fat_100g)}g | Carbs: ${round100(n.carbohydrates_100g)}g | Protein: ${round100(n.proteins_100g)}g`,
          _kcal: kcal,
        };
      })
      .filter((x: any) => x.food_name && x._kcal > 0 && x._kcal <= 900)
      .slice(0, 15);
  } catch {
    return null; // timeout / network → retryable
  } finally {
    clearTimeout(timer);
  }
}

// Search-a-licious (search.openfoodfacts.org) is OFF's RECOMMENDED full-text
// search and is far more reliable than the legacy cgi (it returns clean JSON),
// but it does NOT include per-100g nutriments. So we use it to find products,
// then fetch macros for the top hits from the v2 product API.
async function salSearch(query: string): Promise<{ code: string; name: string }[]> {
  const url = `https://search.openfoodfacts.org/search?q=${encodeURIComponent(query)}&page_size=12`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': OFF_UA, Accept: 'application/json' }, signal: controller.signal });
    if (!res.ok) return [];
    const body = await res.text();
    if (!body || body.trimStart().startsWith('<')) return [];
    const data = JSON.parse(body);
    const brand = (b: any) => (Array.isArray(b) ? b[0] : typeof b === 'string' ? b.split(',')[0] : '');
    return (Array.isArray(data.hits) ? data.hits : [])
      .filter((h: any) => h && h.code)
      .map((h: any) => ({ code: String(h.code), name: [h.product_name, brand(h.brands)].filter(Boolean).join(' ').trim() }));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// Fetches one product's nutriments from the reliable v2 product API and maps it
// to the UI shape. Returns null if the product has no usable energy value.
async function fetchProductItem(code: string, fallbackName: string): Promise<any | null> {
  const url = `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=code,product_name,brands,nutriments`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': OFF_UA, Accept: 'application/json' }, signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 1 || !data.product) return null;
    const p = data.product;
    const n = p.nutriments || {};
    const kcal = round100(n['energy-kcal_100g']);
    // Reject implausible energy: nothing exceeds ~900 kcal/100g (pure fat). OFF
    // sometimes stores per-serving values mislabeled as per-100g (e.g. 1900).
    if (!(kcal > 0) || kcal > 900) return null;
    const name = [p.product_name || fallbackName, (p.brands || '').split(',')[0]].filter(Boolean).join(' ').trim();
    return {
      food_id: code,
      food_name: name || fallbackName,
      food_description: `Per 100g - Calories: ${Math.round(kcal)}kcal | Fat: ${round100(n.fat_100g)}g | Carbs: ${round100(n.carbohydrates_100g)}g | Protein: ${round100(n.proteins_100g)}g`,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Food search via OpenFoodFacts — free, no API key, no IP allowlist (works from
 * any device, unlike FatSecret which rejects non-whitelisted mobile IPs).
 *
 * Strategy: Search-a-licious (reliable) for discovery → v2 product API for
 * macros. Legacy cgi/search.pl is the last-resort fallback. Results map to the
 * UI shape: { food_id, food_name, food_description:
 *   "Per 100g - Calories: Xkcal | Fat: Yg | Carbs: Zg | Protein: Wg" }.
 */
export async function searchFood(query: string): Promise<any[]> {
  if (query.trim().length < 3) return [];

  // 1) Reliable full-text discovery.
  const hits = await salSearch(query);
  if (hits.length > 0) {
    // 2) Enrich top hits with macros (parallel product reads).
    const enriched = await Promise.all(hits.slice(0, 10).map((h) => fetchProductItem(h.code, h.name)));
    const items = enriched.filter(Boolean) as any[];
    if (items.length > 0) {
      console.log('[search] Search-a-licious + product API', { query, count: items.length });
      return items;
    }
  }

  // 3) Fallback: legacy cgi/search.pl (macros inline), 1 gentle retry.
  for (let attempt = 0; attempt < 2; attempt++) {
    const items = await offSearchOnce(query);
    if (items && items.length > 0) {
      console.log('[search] cgi fallback', { query, count: items.length });
      return items;
    }
    if (items && items.length === 0) break;
    if (attempt === 0) await new Promise((r) => setTimeout(r, 700));
  }
  console.warn('[search] no results (OFF unavailable)', { query });
  return [];
}
