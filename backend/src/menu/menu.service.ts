import { Injectable, Logger } from '@nestjs/common';
import { MlService } from '../ml/ml.service';
import { ScoringService } from '../objective/scoring.service';
import {
  FoodCandidate,
  FoodScore,
  ObjectiveContext,
} from '../objective/objective.types';

/**
 * MenuService — analyse STATELESS d'une photo de carte/menu de restaurant.
 *
 * Pipeline :
 *  1) VLM local (MlService.visionLocal → Cloudflare llama-3.2, JAMAIS Gemini)
 *     extrait les plats + macros estimées par portion ;
 *  2) parsing JSON ROBUSTE (le modèle renvoie de la prose → on isole le 1er
 *     tableau/objet JSON ; fallback gracieux si tout échoue) ;
 *  3) chaque plat est scoré vs l'objectif du jour (ScoringService.scoreFood) ;
 *  4) items = tous les plats (avec score), recommended = top 5 non bloqués
 *     triés par fit décroissant (avec verdict + reasons).
 *
 * Aucune dépendance Mongo : tout vient du body de la requête.
 */
@Injectable()
export class MenuService {
  private readonly logger = new Logger('MenuService');

  constructor(
    private readonly ml: MlService,
    private readonly scoring: ScoringService,
  ) {}

  /** Prompt VLM : on force une sortie JSON STRICTE (tableau de plats). */
  private static readonly PROMPT =
    'Extract every dish from this restaurant menu. For each: name + estimated ' +
    'kcal/protein/carbs/fat per serving. Reply STRICT JSON array ' +
    '[{name,kcal,protein,carbs,fat}].';

  /** Nombre fini >= 0, sinon défaut (jamais NaN). */
  private static num(v: unknown, def = 0): number {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, n) : def;
  }

  /**
   * Parsing ROBUSTE de la sortie VLM.
   * Le modèle renvoie souvent de la prose entourant le JSON → on tente :
   *  a) JSON.parse direct ;
   *  b) extraction du 1er tableau [...] ;
   *  c) extraction du 1er objet {...} (plat unique) ;
   * et on ne garde que les entrées qui ressemblent à un plat (name présent).
   * Ne jette JAMAIS : renvoie [] en dernier recours.
   */
  static parseDishes(text: string): FoodCandidate[] {
    const raw = String(text ?? '').trim();
    if (!raw) return [];

    const tryParse = (s: string): any => {
      try {
        return JSON.parse(s);
      } catch {
        return undefined;
      }
    };

    let data: any =
      tryParse(raw) ??
      // 1er tableau JSON dans la prose
      (() => {
        const m = raw.match(/\[[\s\S]*\]/);
        return m ? tryParse(m[0]) : undefined;
      })() ??
      // 1er objet JSON (plat unique)
      (() => {
        const m = raw.match(/\{[\s\S]*\}/);
        return m ? tryParse(m[0]) : undefined;
      })();

    if (!data) return [];

    // Normalise en tableau : tableau direct, ou objet contenant un tableau
    // (ex: { dishes: [...] } / { items: [...] } / { menu: [...] }), ou plat seul.
    let arr: any[] = [];
    if (Array.isArray(data)) {
      arr = data;
    } else if (data && typeof data === 'object') {
      const nested =
        (Array.isArray(data.dishes) && data.dishes) ||
        (Array.isArray(data.items) && data.items) ||
        (Array.isArray(data.menu) && data.menu) ||
        (Array.isArray(data.data) && data.data) ||
        null;
      arr = nested ? nested : [data];
    }

    const dishes: FoodCandidate[] = [];
    for (const d of arr) {
      if (!d || typeof d !== 'object') continue;
      const name = String(d.name ?? d.dish ?? d.title ?? '').trim();
      if (!name) continue; // pas un plat exploitable
      dishes.push({
        name,
        kcal: MenuService.num(d.kcal ?? d.calories ?? d.cal),
        protein: MenuService.num(d.protein ?? d.proteins ?? d.p),
        carbs: MenuService.num(d.carbs ?? d.carbohydrates ?? d.c),
        fat: MenuService.num(d.fat ?? d.fats ?? d.f),
      });
    }
    return dishes;
  }

  /**
   * Analyse une photo de menu.
   * @param imageBase64 image encodée base64 (sans préfixe data:).
   * @param mime        type MIME (défaut image/jpeg).
   * @param objective   contexte d'objectif du jour (optionnel → défauts sûrs).
   */
  async analyze(
    imageBase64: string,
    mime = 'image/jpeg',
    objective?: Partial<ObjectiveContext> | null,
  ): Promise<{
    items: (FoodCandidate & { score: FoodScore })[];
    recommended: (FoodCandidate & {
      fit: number;
      verdict: FoodScore['verdict'];
      reasons: string[];
    })[];
    engine?: string;
  }> {
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return { items: [], recommended: [] };
    }

    // 1) VLM local (Cloudflare llama-3.2). Si indispo → fallback gracieux.
    let text = '';
    let engine: string | undefined;
    try {
      const r = await this.ml.visionLocal(MenuService.PROMPT, imageBase64, mime);
      text = r?.text ?? '';
      engine = r?.engine;
    } catch (e: any) {
      this.logger.warn(`visionLocal KO: ${e?.message}`);
      return { items: [], recommended: [], engine: 'unavailable' };
    }

    // 2) Parsing robuste.
    const dishes = MenuService.parseDishes(text);

    // 3) Scoring vs objectif. ctx complet : safeCtx remplit les défauts manquants.
    const ctx = (objective ?? {}) as ObjectiveContext;
    const items = dishes.map((d) => ({
      ...d,
      score: this.scoring.scoreFood(d, ctx),
    }));

    // 4) recommended = top 5 non bloqués, triés par fit décroissant.
    const recommended = items
      .filter((it) => !it.score.blocked)
      .sort((a, b) => b.score.fit - a.score.fit)
      .slice(0, 5)
      .map((it) => ({
        name: it.name,
        kcal: it.kcal,
        protein: it.protein,
        carbs: it.carbs,
        fat: it.fat,
        fit: it.score.fit,
        verdict: it.score.verdict,
        reasons: it.score.reasons,
      }));

    return { items, recommended, engine };
  }
}
