import { Injectable, Logger } from '@nestjs/common';
import { MlService } from '../ml/ml.service';
import { ScoringService } from '../objective/scoring.service';
import {
  FoodCandidate,
  FoodScore,
  ObjectiveContext,
} from '../objective/objective.types';

/** Une recette proposée par le VLM, enrichie du verdict de scoring. */
export interface FridgeRecipe {
  title: string;
  uses: string[];
  missing: string[];
  kcal: number;
  protein: number;
  fit: number;
  verdict: FoodScore['verdict'];
  reasons?: string[];
}

export interface FridgeAnalysis {
  detected: string[];
  recipes: FridgeRecipe[];
  shoppingList: string[];
  engine?: string;
}

/**
 * FridgeService — analyse STATELESS d'une photo de frigo.
 *
 * Pipeline 100% VLM local (MlService.visionLocal → Cloudflare llama-3.2, JAMAIS
 * Gemini) en deux passes :
 *  1) détecter les ingrédients visibles ;
 *  2) proposer 3 recettes (uses / missing / kcal / protein).
 *
 * Chaque recette est notée par ScoringService.scoreFood vs l'objectif du jour
 * (fit + verdict ajoutés), les recettes triées par fit décroissant, et la liste
 * de courses = union des ingrédients manquants.
 *
 * Aucune persistance : pas de Mongo, pas de Firestore.
 */
@Injectable()
export class FridgeService {
  private readonly logger = new Logger('FridgeService');

  constructor(
    private readonly ml: MlService,
    private readonly scoring: ScoringService,
  ) {}

  // ---------------------------------------------------------------------------
  // PARSING VLM ROBUSTE : le modèle renvoie de la prose → on extrait le 1er JSON.
  // ---------------------------------------------------------------------------

  /** Extrait le 1er objet OU tableau JSON d'un texte de prose. null si rien. */
  private static extractJson(text: unknown): any {
    const s = String(text ?? '');
    if (!s.trim()) return null;
    // 1) tentative directe (le modèle a peut-être renvoyé du JSON pur).
    try {
      return JSON.parse(s);
    } catch {
      /* prose autour du JSON → on cherche le 1er bloc {…} ou […] */
    }
    // 2) 1er tableau ou 1er objet rencontré (le plus tôt dans le texte gagne).
    const candidates: string[] = [];
    const arr = s.match(/\[[\s\S]*\]/);
    const obj = s.match(/\{[\s\S]*\}/);
    if (arr) candidates.push(arr[0]);
    if (obj) candidates.push(obj[0]);
    // privilégie celui qui apparaît le plus tôt dans le texte
    candidates.sort((a, b) => s.indexOf(a) - s.indexOf(b));
    for (const c of candidates) {
      try {
        return JSON.parse(c);
      } catch {
        /* essaie le candidat suivant */
      }
    }
    return null;
  }

  /** Chaîne propre non vide, tronquée. */
  private static str(v: unknown, max = 80): string {
    return String(v ?? '').trim().slice(0, max);
  }

  /** Nombre fini >= 0, sinon 0. */
  private static num(v: unknown): number {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  /** Liste de chaînes propres, dédupliquée (insensible à la casse). */
  private static strList(v: unknown): string[] {
    if (!Array.isArray(v)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const x of v) {
      const s = FridgeService.str(x);
      const k = s.toLowerCase();
      if (s && !seen.has(k)) {
        seen.add(k);
        out.push(s);
      }
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // ANALYSE
  // ---------------------------------------------------------------------------

  async analyze(
    imageBase64: string,
    mime = 'image/jpeg',
    objective?: Partial<ObjectiveContext> | null,
  ): Promise<FridgeAnalysis> {
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return { detected: [], recipes: [], shoppingList: [] };
    }

    // --- Passe 1 : ingrédients visibles -------------------------------------
    let engine = '';
    let detected: string[] = [];
    try {
      const prompt1 =
        'List the food ingredients visible in this fridge photo. ' +
        'STRICT JSON array of strings, e.g. ["eggs","milk","tomato"]. ' +
        'No prose, no markdown, only the JSON array.';
      const r1 = await this.ml.visionLocal(prompt1, imageBase64, mime);
      engine = r1.engine;
      const parsed = FridgeService.extractJson(r1.text);
      // Tolère soit ["a","b"] soit {"ingredients":[...]} / {"detected":[...]}.
      detected = FridgeService.strList(
        Array.isArray(parsed)
          ? parsed
          : parsed?.ingredients ?? parsed?.detected ?? parsed?.items,
      );
    } catch (e: any) {
      this.logger.warn(`vision passe1 KO: ${e?.message}`);
      return { detected: [], recipes: [], shoppingList: [], engine };
    }

    if (!detected.length) {
      return { detected: [], recipes: [], shoppingList: [], engine };
    }

    // --- Passe 2 : recettes (texte → texte, pas d'image) --------------------
    let rawRecipes: any[] = [];
    try {
      const prompt2 =
        `Given ingredients ${JSON.stringify(detected)}, propose 3 simple recipes. ` +
        'STRICT JSON array: [{"title":string,"uses":string[],"missing":string[],' +
        '"kcal":number,"protein":number}]. ' +
        '"uses" = ingredients from the list. "missing" = ingredients to buy. ' +
        'kcal and protein are per serving. No prose, only the JSON array.';
      // Réutilise le VLM (texte conditionné par l'image du frigo) — reste NON-Gemini.
      const r2 = await this.ml.visionLocal(prompt2, imageBase64, mime);
      const parsed = FridgeService.extractJson(r2.text);
      rawRecipes = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.recipes)
          ? parsed.recipes
          : [];
    } catch (e: any) {
      this.logger.warn(`vision passe2 KO: ${e?.message}`);
      rawRecipes = [];
    }

    // --- Normalisation + scoring vs objectif --------------------------------
    const ctx = FridgeService.safeCtx(objective);
    const recipes: FridgeRecipe[] = rawRecipes
      .map((r) => {
        const title = FridgeService.str(r?.title, 120) || 'Recette';
        const kcal = FridgeService.num(r?.kcal);
        const protein = FridgeService.num(r?.protein);
        const candidate: FoodCandidate = {
          name: title,
          kcal,
          protein,
          carbs: 0,
          fat: 0,
        };
        const score = this.scoring.scoreFood(candidate, ctx);
        return {
          title,
          uses: FridgeService.strList(r?.uses),
          missing: FridgeService.strList(r?.missing),
          kcal,
          protein,
          fit: score.fit,
          verdict: score.verdict,
          reasons: score.reasons,
        };
      })
      // Tri par adéquation décroissante.
      .sort((a, b) => b.fit - a.fit);

    // --- Liste de courses = union des 'missing' -----------------------------
    const shoppingList = FridgeService.strList(
      recipes.flatMap((r) => r.missing),
    );

    return { detected, recipes, shoppingList, engine };
  }

  /** Contexte d'objectif robuste : remplit les défauts sûrs attendus par ScoringService. */
  private static safeCtx(
    o?: Partial<ObjectiveContext> | null,
  ): ObjectiveContext {
    const c = o ?? {};
    const goal = (['lose', 'maintain', 'gain'] as const).includes(c.goal as any)
      ? (c.goal as 'lose' | 'maintain' | 'gain')
      : 'maintain';
    const mt = c.macroTargets ?? ({} as any);
    const rm = c.remainingMacros ?? ({} as any);
    return {
      uid: c.uid,
      goal,
      tdee: FridgeService.num(c.tdee),
      dailyKcalTarget: FridgeService.num(c.dailyKcalTarget),
      remainingKcal: FridgeService.num(c.remainingKcal),
      macroTargets: {
        protein: FridgeService.num(mt.protein),
        carbs: FridgeService.num(mt.carbs),
        fat: FridgeService.num(mt.fat),
      },
      remainingMacros: {
        protein: FridgeService.num(rm.protein),
        carbs: FridgeService.num(rm.carbs),
        fat: FridgeService.num(rm.fat),
      },
      diet: Array.isArray(c.diet) ? c.diet.map((d) => String(d)) : [],
      allergies: Array.isArray(c.allergies)
        ? c.allergies.map((a) => String(a))
        : [],
      dislikes: Array.isArray(c.dislikes)
        ? c.dislikes.map((d) => String(d))
        : [],
      conditions: Array.isArray(c.conditions)
        ? c.conditions.map((d) => String(d))
        : [],
    };
  }
}
