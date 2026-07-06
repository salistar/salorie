import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../firebase.service';
import { AiService } from '../ai/ai.service';
import { RedisService } from '../redis.service';
import * as fs from 'fs';
import { join } from 'path';
import { randomUUID, createHmac, createHash } from 'crypto';

/**
 * ML / analytics service (backend models).
 *  - weightForecast : régression linéaire (moindres carrés) + EMA sur l'historique
 *    de poids → tendance kg/semaine, détection de plateau, projection vers l'objectif.
 *  - mealReco       : scoring d'aliments vs macros restantes + objectif.
 *  - portionEstimate: estimation de portion (grammes) via Gemini Vision (serveur).
 * Tous les algos sont des fonctions pures testables (voir ml.service.spec / script).
 */
@Injectable()
export class MlService {
  constructor(
    private firebase: FirebaseService,
    private ai: AiService,
    private redis: RedisService,
  ) {}

  // ---------------------------------------------------------------------------
  // #47 CIRCUIT-BREAKER (par tier, en mémoire process). Un tier qui échoue
  //   CB_FAILS fois de suite est "ouvert" pendant CB_OPEN_MS : on le SKIP sans
  //   même tenter l'appel (économise le timeout réseau), puis on le retente
  //   (half-open) au premier appel après openUntil. Succès -> reset fails.
  //   NB: additif — n'altère ni l'ordre des tiers ni les seuils de confiance.
  // ---------------------------------------------------------------------------
  private cbState = new Map<string, { fails: number; openUntil: number }>();
  private get cbMaxFails() { return parseInt(process.env.CB_FAILS || '3', 10) || 3; }
  private get cbOpenMs() { return parseInt(process.env.CB_OPEN_MS || '30000', 10) || 30000; }

  /** true = le tier est actuellement "ouvert" (à skipper). */
  private cbIsOpen(tier: string): boolean {
    const s = this.cbState.get(tier);
    return !!(s && s.openUntil > Date.now());
  }

  /** Succès d'un tier : on remet le compteur d'échecs à zéro (ferme le circuit). */
  private cbRecordSuccess(tier: string): void {
    if (this.cbState.has(tier)) this.cbState.set(tier, { fails: 0, openUntil: 0 });
  }

  /** Échec d'un tier : incrémente ; au-delà du seuil, ouvre le circuit pour cbOpenMs. */
  private cbRecordFailure(tier: string): void {
    const s = this.cbState.get(tier) || { fails: 0, openUntil: 0 };
    s.fails += 1;
    if (s.fails >= this.cbMaxFails) {
      s.openUntil = Date.now() + this.cbOpenMs;
      this.log(`circuit OPEN ${tier} (${s.fails} échecs) pour ${this.cbOpenMs}ms`);
    }
    this.cbState.set(tier, s);
  }

  // ---------------------------------------------------------------------------
  // #67 COALESCING des requêtes vision identiques (même hash d'image+prompt+mime)
  //   en vol simultanément : on ne lance qu'UN seul appel réel et on partage la
  //   même promesse. Map nettoyée au settle (succès OU échec) pour ne jamais
  //   mémoriser une promesse rejetée.
  // ---------------------------------------------------------------------------
  private inflightVision = new Map<string, Promise<{ text: string; engine: string }>>();

  // ---------------------------------------------------------------------------
  // 1) PRÉVISION DE POIDS + DÉTECTION DE PLATEAU
  // ---------------------------------------------------------------------------

  /** Régression linéaire par moindres carrés. points = [{x, y}]. */
  static linearRegression(points: { x: number; y: number }[]) {
    const n = points.length;
    if (n < 2) return { slope: 0, intercept: n ? points[0].y : 0, r2: 0 };
    let sx = 0, sy = 0, sxy = 0, sxx = 0, syy = 0;
    for (const p of points) { sx += p.x; sy += p.y; sxy += p.x * p.y; sxx += p.x * p.x; syy += p.y * p.y; }
    const denom = n * sxx - sx * sx;
    const slope = denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
    const intercept = (sy - slope * sx) / n;
    const rNum = n * sxy - sx * sy;
    const rDen = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
    const r = rDen === 0 ? 0 : rNum / rDen;
    return { slope, intercept, r2: r * r };
  }

  /** Moyenne mobile exponentielle (lissage du bruit jour-à-jour). */
  static ema(values: number[], alpha = 0.3): number[] {
    if (!values.length) return [];
    const out = [values[0]];
    for (let i = 1; i < values.length; i++) out.push(alpha * values[i] + (1 - alpha) * out[i - 1]);
    return out;
  }

  /**
   * Modèle de prévision. entries = [{weight, ts(ms)}] (non triés OK).
   * targetWeight optionnel → projection de la date d'atteinte.
   */
  static forecastFromEntries(
    entries: { weight: number; ts: number }[],
    targetWeight?: number,
  ) {
    const pts = entries
      .filter((e) => Number.isFinite(e.weight) && Number.isFinite(e.ts))
      .sort((a, b) => a.ts - b.ts);
    if (pts.length < 2) {
      return {
        ok: false,
        reason: 'not_enough_data',
        count: pts.length,
        minPointsNeeded: 2,
      };
    }
    const t0 = pts[0].ts;
    const DAY = 86_400_000;
    const reg = MlService.linearRegression(pts.map((p) => ({ x: (p.ts - t0) / DAY, y: p.weight })));
    const slopePerWeek = reg.slope * 7;

    // Tendance récente (14 derniers jours) pour plateau / accélération
    const lastTs = pts[pts.length - 1].ts;
    const recent = pts.filter((p) => p.ts >= lastTs - 14 * DAY);
    const recentReg =
      recent.length >= 2
        ? MlService.linearRegression(recent.map((p) => ({ x: (p.ts - t0) / DAY, y: p.weight })))
        : reg;
    const recentPerWeek = recentReg.slope * 7;

    const current = MlService.ema(pts.map((p) => p.weight)).slice(-1)[0];
    const plateau = Math.abs(recentPerWeek) < 0.1 && pts.length >= 4; // <100 g/sem
    const direction = slopePerWeek < -0.05 ? 'losing' : slopePerWeek > 0.05 ? 'gaining' : 'stable';

    let projection: any = null;
    if (Number.isFinite(targetWeight as number) && Math.abs(recentReg.slope) > 1e-4) {
      const delta = (targetWeight as number) - current;
      const daysToGoal = delta / recentReg.slope; // jours
      if (daysToGoal > 0 && daysToGoal < 3650) {
        projection = {
          targetWeight,
          daysToGoal: Math.round(daysToGoal),
          etaTs: lastTs + daysToGoal * DAY,
          weeklyRate: +recentPerWeek.toFixed(3),
        };
      }
    }

    return {
      ok: true,
      model: 'linear_regression+ema',
      count: pts.length,
      currentWeight: +current.toFixed(2),
      trendKgPerWeek: +slopePerWeek.toFixed(3),
      recentKgPerWeek: +recentPerWeek.toFixed(3),
      direction,
      plateau,
      confidence: +reg.r2.toFixed(3),
      projection,
    };
  }

  async weightForecast(email: string, targetWeight?: number) {
    const db = this.firebase.db();
    const snap = await db.collection('users').doc(email).collection('weight_history').get();
    const entries = snap.docs.map((d) => {
      const x: any = d.data();
      const ts = typeof x.timestamp === 'number' ? x.timestamp
        : x.timestamp?.toMillis ? x.timestamp.toMillis()
        : x.timestamp?._seconds ? x.timestamp._seconds * 1000
        : Date.parse(x.date || '') || 0;
      return { weight: Number(x.weight), ts };
    });
    // fallback: si pas d'historique mais profil a un poids, on tente le profil.
    // On pousse DEUX points (createdAt et maintenant) pour que la régression sorte
    // une prévision. Confiance faible car le poids profil est supposé stable.
    if (entries.length < 2) {
      const u = (await db.collection('users').doc(email).get()).data() as any;
      if (u?.weight && u?.createdAt) {
        const w = Number(u.weight);
        const createdMs =
          typeof u.createdAt === 'number' ? u.createdAt
          : u.createdAt?.toMillis ? u.createdAt.toMillis()
          : u.createdAt?._seconds ? u.createdAt._seconds * 1000
          : Date.parse(u.createdAt || '') || Date.now();
        const now = Date.now();
        entries.push({ weight: w, ts: createdMs });
        entries.push({ weight: w, ts: now > createdMs ? now : createdMs + 1 });
      }
    }
    const target = targetWeight ?? (await db.collection('users').doc(email).get()).data()?.['targetWeight'];
    return MlService.forecastFromEntries(entries, target != null ? Number(target) : undefined);
  }

  // ---------------------------------------------------------------------------
  // 2) RECOMMANDATION DE REPAS (scoring macro vs objectif)
  // ---------------------------------------------------------------------------

  /** Mini base curée (par portion standard). kcal/protéine/glucides/lipides + tags. */
  static MEAL_DB: { name: string; kcal: number; p: number; c: number; f: number; tags: string[] }[] = [
    { name: 'Blanc de poulet grillé (150g)', kcal: 248, p: 46, c: 0, f: 5, tags: ['lose', 'gain', 'highP'] },
    { name: 'Saumon (150g)', kcal: 280, p: 39, c: 0, f: 13, tags: ['lose', 'gain', 'highP', 'omega3'] },
    { name: 'Œufs brouillés (3)', kcal: 215, p: 18, c: 2, f: 15, tags: ['gain', 'highP', 'breakfast'] },
    { name: 'Skyr / fromage blanc 0% (200g)', kcal: 120, p: 22, c: 8, f: 0, tags: ['lose', 'highP', 'snack'] },
    { name: 'Lentilles cuites (200g)', kcal: 232, p: 18, c: 40, f: 1, tags: ['maintain', 'gain', 'fiber', 'veggie'] },
    { name: 'Riz complet (200g cuit)', kcal: 222, p: 5, c: 46, f: 2, tags: ['gain', 'carb'] },
    { name: 'Quinoa (200g cuit)', kcal: 240, p: 9, c: 42, f: 4, tags: ['maintain', 'gain', 'veggie'] },
    { name: 'Patate douce (200g)', kcal: 172, p: 3, c: 40, f: 0, tags: ['maintain', 'carb'] },
    { name: 'Avoine (60g sec)', kcal: 228, p: 8, c: 40, f: 4, tags: ['gain', 'breakfast', 'carb'] },
    { name: 'Salade de thon (150g thon + légumes)', kcal: 200, p: 35, c: 6, f: 4, tags: ['lose', 'highP'] },
    { name: 'Tofu grillé (150g)', kcal: 180, p: 18, c: 4, f: 11, tags: ['maintain', 'veggie', 'highP'] },
    { name: 'Steak haché 5% (150g)', kcal: 250, p: 38, c: 0, f: 11, tags: ['gain', 'highP'] },
    { name: 'Amandes (30g)', kcal: 174, p: 6, c: 6, f: 15, tags: ['maintain', 'gain', 'snack', 'fat'] },
    { name: 'Banane + beurre de cacahuète', kcal: 250, p: 8, c: 30, f: 12, tags: ['gain', 'snack'] },
    { name: 'Yaourt grec + fruits rouges', kcal: 160, p: 15, c: 18, f: 4, tags: ['lose', 'snack', 'highP'] },
    { name: 'Soupe de légumes (300ml)', kcal: 90, p: 3, c: 16, f: 2, tags: ['lose', 'fiber', 'veggie'] },
    { name: 'Wrap poulet crudités', kcal: 350, p: 30, c: 35, f: 9, tags: ['maintain', 'highP'] },
    { name: 'Pâtes complètes + sauce tomate (200g)', kcal: 320, p: 12, c: 60, f: 4, tags: ['gain', 'carb'] },
    { name: 'Crevettes sautées (150g)', kcal: 150, p: 30, c: 2, f: 2, tags: ['lose', 'highP'] },
    { name: 'Fromage cottage (200g)', kcal: 160, p: 24, c: 6, f: 4, tags: ['lose', 'highP', 'snack'] },
  ];

  /**
   * Recommande des repas selon les macros restantes du jour + l'objectif.
   * remaining = {kcal, p, c, f}. goal = 'lose'|'maintain'|'gain'.
   */
  static recommendMeals(
    remaining: { kcal: number; p: number; c: number; f: number },
    goal: 'lose' | 'maintain' | 'gain' = 'maintain',
    limit = 5,
  ) {
    const rem = {
      kcal: Math.max(0, remaining.kcal || 0),
      p: Math.max(0, remaining.p || 0),
      c: Math.max(0, remaining.c || 0),
      f: Math.max(0, remaining.f || 0),
    };
    const proteinPriority = goal === 'lose' ? 1.6 : goal === 'gain' ? 1.2 : 1.0;
    const scored = MlService.MEAL_DB.map((m) => {
      // pénalité si dépasse les kcal restantes (sauf si peu de kcal restantes → on tolère léger)
      const kcalOver = rem.kcal > 50 ? Math.max(0, m.kcal - rem.kcal) / Math.max(rem.kcal, 1) : 0;
      // adéquation macro : proximité aux besoins restants (normalisée)
      const fit =
        proteinPriority * Math.min(m.p, rem.p + 15) +
        0.4 * Math.min(m.c, rem.c + 20) +
        0.3 * Math.min(m.f, rem.f + 10);
      const goalBonus = m.tags.includes(goal) ? 12 : 0;
      const proteinDensity = (m.p / Math.max(m.kcal, 1)) * 100; // g prot / 100 kcal
      const score = fit + goalBonus + proteinDensity * proteinPriority - kcalOver * 40;
      return { ...m, score: +score.toFixed(2), proteinDensity: +proteinDensity.toFixed(1) };
    })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return {
      ok: true,
      model: 'macro_fit_scoring',
      goal,
      remaining: rem,
      recommendations: scored,
    };
  }

  async mealReco(body: any) {
    const remaining = {
      kcal: Number(body?.remaining?.kcal ?? body?.remainingCalories ?? 0),
      p: Number(body?.remaining?.p ?? body?.remainingProtein ?? 0),
      c: Number(body?.remaining?.c ?? body?.remainingCarbs ?? 0),
      f: Number(body?.remaining?.f ?? body?.remainingFat ?? 0),
    };
    const goal = (body?.goal || 'maintain') as 'lose' | 'maintain' | 'gain';
    return MlService.recommendMeals(remaining, goal, Number(body?.limit) || 5);
  }

  // ---------------------------------------------------------------------------
  // 2bis) VISION via MODÈLE LOCAL AUTO-HÉBERGÉ (Ollama llava/moondream)
  //       + repli API food gratuite. DISTINCT du provider Gemini.
  //       L'app envoie déjà le prompt structuré (JSON attendu) → on renvoie le
  //       texte brut du modèle, l'app le parse.
  // ---------------------------------------------------------------------------
  async visionLocal(prompt: string, imageBase64: string, mimeType = 'image/jpeg'): Promise<{ text: string; engine: string }> {
    // ------------------------------------------------------------------
    // #67 COALESCING : deux requêtes IDENTIQUES en vol → un seul appel réel,
    // promesse partagée. Clé = hash (mime, prompt, image) — même définition
    // que la clé de cache. Nettoyée au settle pour ne pas garder de rejet.
    // ------------------------------------------------------------------
    let coalesceKey: string | null = null;
    try {
      coalesceKey = createHash('sha256').update(`${mimeType}:${prompt}:${imageBase64}`).digest('hex');
    } catch { coalesceKey = null; }

    if (coalesceKey) {
      const existing = this.inflightVision.get(coalesceKey);
      if (existing) return existing;
      const p = this.visionLocalUncoalesced(prompt, imageBase64, mimeType);
      this.inflightVision.set(coalesceKey, p);
      // Nettoyage au settle (succès OU échec) : jamais de promesse rejetée mémorisée.
      p.finally(() => { if (this.inflightVision.get(coalesceKey!) === p) this.inflightVision.delete(coalesceKey!); }).catch(() => {});
      return p;
    }
    return this.visionLocalUncoalesced(prompt, imageBase64, mimeType);
  }

  private async visionLocalUncoalesced(prompt: string, imageBase64: string, mimeType = 'image/jpeg'): Promise<{ text: string; engine: string }> {
    // ------------------------------------------------------------------
    // CACHE REDIS : même (mime, prompt, image) → même réponse. La vision
    // devient GRATUITE + illimitée sur les scans répétés (TTL 7 jours).
    // ------------------------------------------------------------------
    let cacheKey: string | null = null;
    try {
      cacheKey = 'vlm:' + createHash('sha256').update(`${mimeType}:${prompt}:${imageBase64}`).digest('hex');
      const cached = await this.redis.getJSON<string>(cacheKey);
      if (cached && String(cached).trim()) {
        await this.bumpTierCounter('cache');
        return { text: String(cached), engine: 'cache' };
      }
    } catch (e: any) { this.log(`cache read KO: ${e?.message}`); }

    // ------------------------------------------------------------------
    // Tiers de vision (chacun skip proprement si non configuré, jamais
    // d'exception qui casse). Chaque helper renvoie {text,engine} ou null.
    // ------------------------------------------------------------------

    // Cloudflare Workers AI (edge GPU) — rapide + précis + gratuit, NON-Gemini.
    const tryCloudflare = async (): Promise<{ text: string; engine: string } | null> => {
      const cfAccount = process.env.CF_ACCOUNT_ID;
      const cfToken = process.env.CF_API_TOKEN;
      // VLM fort (vocabulaire ouvert, bien meilleur sur les plats MENA) ; overridable par env.
      const cfModel = process.env.CF_VISION_MODEL || '@cf/meta/llama-3.2-11b-vision-instruct';
      if (!cfAccount || !cfToken) return null;
      // #9 — skip Cloudflare si l'image dépasse ~4 Mo décodés (llava renvoie 413) :
      //   on évite le round-trip perdu + le délai, et on passe direct au tier suivant
      //   (Ollama/Groq/Gemini). base64 ≈ 4/3 des octets → length*0.75 ≈ octets réels.
      if (imageBase64.length * 0.75 > 4_000_000) { this.log('cloudflare skip: image > 4 Mo (évite 413)'); return null; }
      try {
        // Cloudflare llava attend l'image en TABLEAU D'OCTETS (uint8), pas en base64.
        const bytes = Array.from(Buffer.from(imageBase64, 'base64'));
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 30000);
        const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cfAccount}/ai/run/${cfModel}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfToken}` },
          body: JSON.stringify({ prompt, image: bytes, max_tokens: 512 }),
          signal: ctrl.signal,
        });
        clearTimeout(to);
        if (r.ok) {
          const j: any = await r.json();
          const text = j?.result?.description || j?.result?.response || '';
          if (text && String(text).trim()) return { text: String(text), engine: `cloudflare:${cfModel}` };
          this.log(`cloudflare réponse vide: ${JSON.stringify(j).slice(0, 200)}`);
        } else {
          this.log(`cloudflare ${r.status}: ${(await r.text()).slice(0, 200)}`);
        }
      } catch (e: any) { this.log(`cloudflare KO: ${e?.message}`); }
      return null;
    };

    // Ollama auto-hébergé (srv3) — gratuit/illimité (même pattern que WHISPER_URL).
    const tryOllama = async (): Promise<{ text: string; engine: string } | null> => {
      const ollamaUrl = process.env.OLLAMA_URL; // ex: http://ollama:11434
      const model = process.env.OLLAMA_VISION_MODEL || 'llava';
      if (!ollamaUrl) return null;
      try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 60000); // CPU inference = lent
        const r = await fetch(`${ollamaUrl}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // format:'json' force une sortie JSON VALIDE (moondream/llava entourent
          // sinon le JSON de prose → JSON.parse échouait côté app).
          body: JSON.stringify({ model, prompt, images: [imageBase64], stream: false, format: 'json' }),
          signal: ctrl.signal,
        });
        clearTimeout(to);
        if (r.ok) {
          const j: any = await r.json();
          if (typeof j?.response === 'string' && j.response.trim()) {
            return { text: j.response, engine: `ollama:${model}` };
          }
        } else {
          this.log(`ollama ${r.status}`);
        }
      } catch (e: any) { this.log(`ollama KO: ${e?.message}`); }
      return null;
    };

    // Groq vision (OpenAI-compatible) — repli GRATUIT rapide, APRÈS Ollama+Cloudflare, AVANT Gemini.
    const tryGroq = async (): Promise<{ text: string; engine: string } | null> => {
      const groqKey = process.env.GROQ_API_KEY;
      if (!groqKey) return null; // skip proprement si non configuré
      const groqModel = process.env.GROQ_VISION_MODEL || 'llama-3.2-90b-vision-preview';
      try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 30000);
        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
          body: JSON.stringify({
            model: groqModel,
            max_tokens: 512,
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: prompt },
                  { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
                ],
              },
            ],
          }),
          signal: ctrl.signal,
        });
        clearTimeout(to);
        if (r.ok) {
          const j: any = await r.json();
          const text = j?.choices?.[0]?.message?.content || '';
          if (text && String(text).trim()) return { text: String(text), engine: `groq:${groqModel}` };
          this.log(`groq réponse vide: ${JSON.stringify(j).slice(0, 200)}`);
        } else {
          this.log(`groq ${r.status}: ${(await r.text()).slice(0, 200)}`);
        }
      } catch (e: any) { this.log(`groq KO: ${e?.message}`); }
      return null;
    };

    // API de reconnaissance d'aliments gratuite (option 3) — configurable.
    // FOOD_VISION_API_URL doit renvoyer { text } ou { name }. Sinon on saute.
    const tryFoodApi = async (): Promise<{ text: string; engine: string } | null> => {
      const foodApi = process.env.FOOD_VISION_API_URL;
      if (!foodApi) return null;
      try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 30000);
        const r = await fetch(foodApi, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(process.env.FOOD_VISION_API_KEY ? { Authorization: `Bearer ${process.env.FOOD_VISION_API_KEY}` } : {}) },
          body: JSON.stringify({ imageBase64, mimeType }),
          signal: ctrl.signal,
        });
        clearTimeout(to);
        if (r.ok) {
          const j: any = await r.json();
          const text = j?.text || (j?.name ? JSON.stringify(j) : '');
          if (text) return { text, engine: 'food-api' };
        }
      } catch (e: any) { this.log(`food-api KO: ${e?.message}`); }
      return null;
    };

    // TIER-0 food4k — classifieur ONNX auto-hébergé (Food-101, 91% top-1), CPU rapide.
    // Placé AVANT les VLM : si confiance >= FOOD4K_MIN_CONF, réponse directe (nom +
    // nutrition per-100g) → on court-circuite toute la cascade payante. Sinon → null,
    // et on retombe naturellement sur Cloudflare/Groq/Ollama/Gemini (plats hors Food-101,
    // notamment MENA, qui obtiennent une confiance basse et ne déclenchent donc PAS le tier-0).
    const tryFood4k = async (): Promise<{ text: string; engine: string } | null> => {
      // #150 kill-switch : FOOD4K_ENABLED=false court-circuite tout le tier-0
      // (retour null → la cascade continue normalement). Défaut 'true'.
      if (process.env.FOOD4K_ENABLED === 'false') return null;
      const url = process.env.FOOD4K_URL;
      if (!url) return null;
      const minConf = parseFloat(process.env.FOOD4K_MIN_CONF || '0.6');
      // Langue déduite du prompt (l'app y injecte « répondre EN FRANÇAIS / بالعربية / in ENGLISH »)
      // → le sidecar renvoie le nom Food-101 localisé (table i18n des 101 classes).
      const lang = /fran[cç]ais/i.test(prompt) ? 'fr' : /العربية|بالعربية/.test(prompt) ? 'ar' : 'en';
      try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 8000);
        const r = await fetch(`${url}/classify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64, lang }),
          signal: ctrl.signal,
        });
        clearTimeout(to);
        if (r.ok) {
          const j: any = await r.json();
          if (j?.ok && typeof j.confidence === 'number' && j.confidence >= minConf && Number(j.kcal) > 0) {
            // Format attendu par l'app (parseVision) : name + calories + macros + serving.
            const text = JSON.stringify({
              name: j.name, calories: j.kcal, protein: j.protein, carbs: j.carbs, fat: j.fat,
              serving: j.serving || '100 g', description: '', source: 'tier0',
            });
            return { text, engine: `tier0:food4k@${j.confidence.toFixed(2)}` };
          }
        }
      } catch (e: any) { this.log(`food4k KO: ${e?.message}`); }
      return null;
    };

    // ------------------------------------------------------------------
    // ORDRE CONFIGURABLE (env VISION_PRIMARY, défaut 'cloudflare').
    //  - 'cloudflare' : CF llama-3.2 (rapide+bon) d'abord ; repli GRATUIT = Groq (rapide)
    //                   puis Ollama (auto-hébergé, illimité mais lent CPU) puis food-api.
    //  - 'ollama'     : Ollama (gratuit/illimité) d'ABORD (si un bon modèle est tiré + latence OK).
    // Dans les DEUX cas Groq (gratuit+rapide) passe AVANT Ollama (lent) pour la latence.
    // Gemini reste géré ailleurs comme tout dernier recours.
    // ------------------------------------------------------------------
    const primary = (process.env.VISION_PRIMARY || 'cloudflare').toLowerCase();
    // tryFood4k EN TÊTE : fast-path gratuit sur les plats Food-101 confiants.
    const tiers =
      primary === 'ollama'
        ? [tryFood4k, tryOllama, tryGroq, tryCloudflare, tryFoodApi]
        : [tryFood4k, tryCloudflare, tryGroq, tryOllama, tryFoodApi];

    for (const tier of tiers) {
      const tierName = (tier as any).name || 'tier';
      // #47 circuit-breaker : si ce tier est "ouvert" (trop d'échecs récents),
      // on le SKIP sans tenter l'appel (évite le timeout) — la cascade continue.
      if (this.cbIsOpen(tierName)) {
        this.log(`tier ${tierName} SKIP (circuit ouvert)`);
        continue;
      }
      // #61 timing : durée (ms) de chaque tier tenté, via le logger existant.
      const tStart = Date.now();
      let res: { text: string; engine: string } | null = null;
      let threw = false;
      try {
        res = await tier();
      } catch (e: any) {
        // Les helpers avalent déjà leurs erreurs (renvoient null), mais on protège
        // le circuit-breaker contre toute exception imprévue.
        threw = true;
        this.log(`tier ${tierName} exception: ${e?.message}`);
      }
      const tMs = Date.now() - tStart;
      this.log(`tier ${tierName} ${tMs}ms -> ${res ? res.engine : 'miss'}`);
      if (res && res.text && String(res.text).trim()) {
        // #47 succès -> ferme le circuit de ce tier.
        this.cbRecordSuccess(tierName);
        // Télémétrie cascade : compte le tier réellement utilisé (best-effort).
        await this.bumpTierCounter(res.engine);
        // Stocke en cache (TTL 7 jours) — les scans répétés deviennent gratuits.
        if (cacheKey) {
          try { await this.redis.setJSON(cacheKey, res.text, 7 * 24 * 3600); }
          catch (e: any) { this.log(`cache write KO: ${e?.message}`); }
        }
        return res;
      }
      // #47 miss/erreur (null, vide, ou exception) -> compte un échec pour ce tier.
      if (threw || !res) this.cbRecordFailure(tierName);
    }

    // Aucun modèle backend dispo (Ollama non déployé + pas d'API food) → erreur claire.
    throw new Error('backend_vision_unavailable');
  }

  // ---------------------------------------------------------------------------
  // 2ter) TÉLÉMÉTRIE CASCADE : compteurs Redis par famille de tier vision.
  //   engine ∈ {'cache','cloudflare:...','ollama:...','groq:...','food-api','gemini'}
  //   famille = préfixe avant ':'  →  cache / cloudflare / ollama / groq / food-api / gemini
  //   Sert à mesurer le "≤10 % cloud payant" (Gemini) et la part gratuite.
  // ---------------------------------------------------------------------------

  /** Familles de tiers connues (ordre stable pour l'affichage). */
  private static readonly TIER_FAMILIES = ['cache', 'tier0', 'cloudflare', 'ollama', 'groq', 'food-api', 'gemini'];

  /** Extrait la famille (préfixe avant ':') d'un identifiant d'engine. */
  private static tierFamily(engine: string): string {
    const raw = String(engine || '').trim().toLowerCase();
    const fam = raw.split(':')[0];
    return fam || 'unknown';
  }

  /**
   * Incrémente 'ml:tier:total' + 'ml:tier:<famille>' (best-effort, ne casse jamais).
   * Appelé après CHAQUE résultat de visionLocal, y compris les hits de cache.
   */
  private async bumpTierCounter(engine: string): Promise<void> {
    try {
      const fam = MlService.tierFamily(engine);
      await this.redis.incr('ml:tier:total');
      await this.redis.incr(`ml:tier:${fam}`);
    } catch (e: any) { this.log(`tier counter KO: ${e?.message}`); }
  }

  /**
   * Lit les compteurs de cascade et calcule les taux d'usage par tier.
   *  - cloudPaidRate = part de Gemini (SEUL tier cloud PAYANT) sur le total.
   *  - cacheHitRate  = part servie par le cache (gratuit + instantané).
   *  - freeRate      = tout sauf Gemini (cache/ollama/cloudflare/groq/food-api sont gratuits).
   * Best-effort : renvoie des zéros si Redis indisponible.
   */
  async getCascadeStats() {
    const families = MlService.TIER_FAMILIES;
    const keys = ['ml:tier:total', ...families.map((f) => `ml:tier:${f}`)];
    const counts = await this.redis.mgetNumbers(keys);

    const total = counts['ml:tier:total'] || 0;
    const byTier: Record<string, { count: number; pct: number }> = {};
    for (const f of families) {
      const count = counts[`ml:tier:${f}`] || 0;
      byTier[f] = { count, pct: total ? +((count / total) * 100).toFixed(2) : 0 };
    }

    const paid = byTier['gemini'].count; // seul tier cloud payant
    const free = total - paid;           // tout le reste est gratuit
    const rate = (n: number) => (total ? +((n / total) * 100).toFixed(2) : 0);

    return {
      total,
      byTier,
      cloudPaidRate: rate(paid),                 // % Gemini (objectif ≤ 10 %)
      freeRate: rate(free),                       // % servi gratuitement
      cacheHitRate: rate(byTier['cache'].count),  // % servi par le cache
    };
  }

  private log(m: string) { try { (this as any).logger?.warn?.(m); } catch {} console.warn('[ml.visionLocal]', m); }

  // ---------------------------------------------------------------------------
  // 3) ESTIMATION DE PORTION (Gemini Vision, serveur)
  // ---------------------------------------------------------------------------
  async portionEstimate(imageBase64: string, foodName?: string) {
    const prompt =
      `Tu es un expert en nutrition. Sur cette photo, estime la PORTION de ` +
      `${foodName ? `"${foodName}"` : "l'aliment principal"} en grammes, ` +
      `en te basant sur les repères visuels (assiette ~26cm, fourchette, main). ` +
      `Réponds STRICTEMENT en JSON: ` +
      `{"food":"...","estimatedGrams":<number>,"confidence":<0..1>,"calories":<number>,"reasoning":"..."}`;
    const text = await this.ai.vision(prompt, imageBase64);
    let parsed: any = null;
    try {
      const m = text.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : null;
    } catch { /* noop */ }
    return { ok: !!parsed, model: 'gemini-vision', raw: parsed ? undefined : text, ...parsed };
  }

  // ---------------------------------------------------------------------------
  // 4) ACTIVE LEARNING : collecte des corrections de scan (image + vrai label)
  //    -> dataset réel persistant dans /data/uploads/ml-feedback pour ré-entraîner.
  // ---------------------------------------------------------------------------
  private feedbackDir() {
    return join(process.env.UPLOAD_DIR || join(process.cwd(), 'uploads'), 'ml-feedback');
  }

  async recordScanFeedback(body: any, userId?: string) {
    const dir = this.feedbackDir();
    const imgDir = join(dir, 'images');
    fs.mkdirSync(imgDir, { recursive: true });
    const id = randomUUID();

    // Pseudonymisation RGPD : on ne stocke JAMAIS l'email/uid en clair dans le dataset.
    // HMAC-SHA256 stable (même user -> même pseudo : permet dédup et droit à l'effacement)
    // avec un secret serveur DÉDIÉ. Sans AL_HASH_SECRET configuré -> on ne stocke PAS l'uid
    // (user=null) : jamais de repli sur une constante littérale ni sur ADMIN_API_KEY.
    const secret = process.env.AL_HASH_SECRET;
    const user = userId && secret ? createHmac('sha256', secret).update(String(userId)).digest('hex').slice(0, 24) : null;

    let image: string | null = null;
    let imageHash: string | null = null;
    const b64 = body?.imageBase64;
    if (typeof b64 === 'string' && b64.length > 100 && b64.length < 8_000_000) {
      try {
        const buf = Buffer.from(b64, 'base64');
        // Vérif signature (magic bytes) : on n'écrit QUE de vraies images JPEG/PNG.
        const isJpeg = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
        const isPng = buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
        if (isJpeg || isPng) {
          image = id + (isPng ? '.png' : '.jpg');
          imageHash = createHash('sha1').update(buf).digest('hex'); // dédup à l'export
          fs.writeFileSync(join(imgDir, image), buf);
        }
      } catch { image = null; imageHash = null; }
    }

    const predicted = body?.predicted != null && String(body.predicted) ? String(body.predicted).slice(0, 80) : null;
    const finalName = String(body?.finalName ?? '').slice(0, 120);
    // VRAIE correction = l'app indique que l'utilisateur a édité le nom (userEdited).
    // Repli heuristique (label modèle EN vs nom retenu) seulement si l'app ne l'a pas fourni.
    const userEdited = typeof body?.userEdited === 'boolean' ? body.userEdited : null;
    const corrected = userEdited !== null
      ? userEdited
      : !!(predicted && finalName && predicted.toLowerCase() !== finalName.toLowerCase());

    const rec = {
      id, ts: Date.now(), user,
      predicted, predictedScore: typeof body?.predictedScore === 'number' ? body.predictedScore : null,
      finalName, tier: body?.tier ? String(body.tier).slice(0, 16) : null,
      userEdited,                 // signal explicite de l'app (null si inconnu)
      corrected,                  // = userEdited si connu, sinon heuristique
      gold: userEdited === true,  // exemple "or" : vraie correction utilisateur
      modelVersion: body?.modelVersion ? String(body.modelVersion).slice(0, 32) : null,
      language: body?.language ? String(body.language).slice(0, 8) : null,
      imageHash, image,
    };
    try { fs.appendFileSync(join(dir, 'feedback.jsonl'), JSON.stringify(rec) + String.fromCharCode(10)); } catch {}
    return { ok: true, id, corrected, gold: rec.gold };
  }

  feedbackStats() {
    const f = join(this.feedbackDir(), 'feedback.jsonl');
    if (!fs.existsSync(f)) return { total: 0, corrected: 0, gold: 0, withImage: 0 };
    const lines = fs.readFileSync(f, 'utf-8').split(String.fromCharCode(10)).filter(Boolean);
    let corrected = 0, gold = 0, withImage = 0;
    for (const l of lines) { try { const r = JSON.parse(l); if (r.corrected) corrected++; if (r.gold) gold++; if (r.image) withImage++; } catch {} }
    return { total: lines.length, corrected, gold, withImage };
  }
}
