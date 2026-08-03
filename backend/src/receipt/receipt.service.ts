import { Injectable } from '@nestjs/common';
import { MlService } from '../ml/ml.service';
import { ScoringService } from '../objective/scoring.service';
import {
  FoodCandidate,
  FoodScore,
  ObjectiveContext,
} from '../objective/objective.types';

/**
 * ReceiptService — analyse STATELESS d'un ticket de caisse via VLM (modèle local
 * auto-hébergé / Cloudflare llama-3.2 par MlService.visionLocal — JAMAIS Gemini).
 *
 * Flux :
 *  1) On envoie l'image au VLM avec un prompt qui force du JSON strict
 *     {merchant,date,total,lines:[{raw,food,qty,price}]}.
 *  2) Parsing ROBUSTE : le modèle renvoie souvent de la prose autour du JSON →
 *     on extrait le 1er objet `{...}` et on le parse ; repli gracieux sinon.
 *  3) Si un `objective` est fourni, chaque ligne alimentaire reçoit un mini-verdict
 *     via ScoringService.scoreFood (kcal estimé 0 si inconnu — pas de Mongo, pas
 *     d'appel nutrition externe ici : le ticket ne porte pas les macros).
 *
 * Aucune persistance : tout vit dans la requête/réponse.
 */

/** Ligne de ticket structurée (telle que renvoyée par l'analyse). */
export interface ReceiptLine {
  /** Texte brut de la ligne sur le ticket. */
  raw: string;
  /** Nom de l'aliment normalisé (null si la ligne n'est pas alimentaire). */
  food: string | null;
  /** Quantité (1 par défaut si inconnue). */
  qty: number;
  /** Prix de la ligne (null si inconnu). */
  price: number | null;
  /** Mini-verdict objectif (présent seulement si `objective` fourni + ligne alimentaire). */
  verdict?: FoodScore;
}

/** Résultat structuré de POST /receipt/analyze. */
export interface ReceiptResult {
  merchant: string | null;
  date: string | null;
  total: number | null;
  lines: ReceiptLine[];
  /** Moteur VLM utilisé (traçabilité). */
  engine?: string;
  /** Vrai si le JSON du modèle a pu être parsé ; sinon repli gracieux. */
  ok: boolean;
  /** Texte brut du modèle, fourni seulement quand le parse a échoué (debug). */
  raw?: string;
}

@Injectable()
export class ReceiptService {
  constructor(
    private readonly ml: MlService,
    private readonly scoring: ScoringService,
  ) {}

  /** Nombre fini, sinon `def`. Accepte "12,50 €", "1.234,56", etc. */
  private static num(v: unknown, def: number | null = null): number | null {
    if (typeof v === 'number') return Number.isFinite(v) ? v : def;
    if (typeof v !== 'string') return def;
    let s = v.replace(/[^\d.,-]/g, '').trim();
    if (!s) return def;
    // Si virgule ET point : le dernier séparateur est le décimal.
    if (s.includes(',') && s.includes('.')) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (s.includes(',')) {
      // virgule seule → décimale (format FR).
      s = s.replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : def;
  }

  /** Chaîne non vide, sinon null. */
  private static str(v: unknown): string | null {
    const s = String(v ?? '').trim();
    return s || null;
  }

  /**
   * Extraction ROBUSTE du 1er JSON ({...} ou [...]) dans une réponse de modèle.
   * Le VLM entoure souvent le JSON de prose / fences markdown → on balaie les
   * accolades en respectant les chaînes pour trouver un bloc équilibré.
   */
  static extractJson(text: string): any | null {
    if (!text) return null;
    // 1) tentative directe (réponse déjà propre / format:'json').
    try {
      return JSON.parse(text);
    } catch {
      /* on continue */
    }
    // 2) retire les fences markdown éventuels.
    const cleaned = text.replace(/```(?:json)?/gi, '');
    // 3) balaie pour le 1er bloc équilibré { } ou [ ].
    for (const [open, close] of [
      ['{', '}'] as const,
      ['[', ']'] as const,
    ]) {
      const start = cleaned.indexOf(open);
      if (start < 0) continue;
      let depth = 0;
      let inStr = false;
      let esc = false;
      for (let i = start; i < cleaned.length; i++) {
        const ch = cleaned[i];
        if (inStr) {
          if (esc) esc = false;
          else if (ch === '\\') esc = true;
          else if (ch === '"') inStr = false;
          continue;
        }
        if (ch === '"') inStr = true;
        else if (ch === open) depth++;
        else if (ch === close) {
          depth--;
          if (depth === 0) {
            const candidate = cleaned.slice(start, i + 1);
            try {
              return JSON.parse(candidate);
            } catch {
              break; // bloc malformé → on tente l'autre type de bracket.
            }
          }
        }
      }
    }
    return null;
  }

  /** Normalise une ligne brute issue du modèle vers ReceiptLine. */
  private normLine(item: any): ReceiptLine {
    const raw = ReceiptService.str(item?.raw) ?? ReceiptService.str(item) ?? '';
    const food = ReceiptService.str(item?.food ?? item?.name ?? item?.item);
    const qtyN = ReceiptService.num(item?.qty ?? item?.quantity, 1);
    const qty = qtyN && qtyN > 0 ? qtyN : 1;
    const price = ReceiptService.num(item?.price ?? item?.amount ?? item?.total, null);
    return { raw, food, qty, price };
  }

  /**
   * Analyse un ticket. `objective` optionnel → mini-verdict par ligne alimentaire.
   */
  async analyze(
    imageBase64: string,
    mime = 'image/jpeg',
    objective?: Partial<ObjectiveContext> | null,
  ): Promise<ReceiptResult> {
    const prompt =
      'Read this receipt. Reply STRICT JSON ' +
      '{merchant,date,total,lines:[{raw,food,qty,price}]}. ' +
      'merchant = store name. date = purchase date (ISO if possible). ' +
      'total = grand total as a number. For each printed line, raw = the exact ' +
      'line text, food = the food/grocery item name (null if the line is not a ' +
      'food/grocery item, e.g. bag, deposit, discount), qty = quantity (1 if ' +
      'unknown), price = the line price as a number. No prose, JSON only.';

    let text = '';
    let engine = '';
    try {
      const res = await this.ml.visionLocal(prompt, imageBase64, mime);
      text = res?.text ?? '';
      engine = res?.engine ?? '';
    } catch (e: any) {
      // VLM indisponible → repli gracieux (jamais d'exception qui remonte).
      return {
        merchant: null,
        date: null,
        total: null,
        lines: [],
        ok: false,
        engine: `unavailable:${e?.message ?? 'vision'}`,
      };
    }

    const parsed = ReceiptService.extractJson(text);
    if (!parsed || typeof parsed !== 'object') {
      // Parse échoué : repli gracieux avec le texte brut pour debug.
      return {
        merchant: null,
        date: null,
        total: null,
        lines: [],
        ok: false,
        engine,
        raw: String(text).slice(0, 2000),
      };
    }

    // Le modèle peut renvoyer l'objet directement, ou un tableau de lignes.
    const obj: any = Array.isArray(parsed) ? { lines: parsed } : parsed;
    const rawLines: any[] = Array.isArray(obj.lines)
      ? obj.lines
      : Array.isArray(obj.items)
        ? obj.items
        : [];

    const lines: ReceiptLine[] = rawLines.map((it) => this.normLine(it));

    // Mini-verdict objectif par ligne alimentaire (kcal=0 si inconnu).
    if (objective) {
      const ctx = objective as ObjectiveContext;
      for (const line of lines) {
        if (!line.food) continue; // lignes non alimentaires ignorées.
        const candidate: FoodCandidate = {
          name: line.food,
          kcal: 0, // kcal estimé 0 si inconnu (le ticket ne porte pas les macros).
          protein: 0,
          carbs: 0,
          fat: 0,
        };
        line.verdict = this.scoring.scoreFood(candidate, ctx);
      }
    }

    return {
      merchant: ReceiptService.str(obj.merchant ?? obj.store ?? obj.shop),
      date: ReceiptService.str(obj.date ?? obj.purchaseDate),
      total: ReceiptService.num(obj.total ?? obj.grandTotal ?? obj.amount, null),
      lines,
      engine,
      ok: true,
    };
  }
}
