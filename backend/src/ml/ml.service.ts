import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../firebase.service';
import { AiService } from '../ai/ai.service';

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
  ) {}

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
    // fallback: si pas d'historique mais profil a un poids, on tente le profil
    if (entries.length < 2) {
      const u = (await db.collection('users').doc(email).get()).data() as any;
      if (u?.weight && u?.createdAt) {
        entries.push({ weight: Number(u.weight), ts: Date.now() });
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
}
