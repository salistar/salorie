import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { ScoringService } from '../objective/scoring.service';
import {
  FoodCandidate,
  FoodScore,
  ObjectiveContext,
} from '../objective/objective.types';
import { FirebaseService } from '../firebase.service';
import { RedisService } from '../redis.service';

/**
 * BarcodeService — "code-barres → verdict + alternatives + produits inconnus".
 *
 * Rôle :
 *  - lookup OpenFoodFacts (produit complet, nutriments/100g) ;
 *  - offToTags() : map produit OFF → tags[] pour ScoringService.scoreFood ;
 *  - analyze() : produit → FoodCandidate → score vs objectif du jour ;
 *  - alternatives() : recherche OFF par catégorie → top produits mieux notés ;
 *  - produits INCONNUS : file d'attente Firestore 'pending_products' +
 *    modération admin (validate → 'custom_products/{barcode}', reject).
 *
 * Robustesse TOTALE : aucune exception ne remonte au controller ; toute I/O
 * réseau / Firestore / disque est best-effort et dégrade proprement.
 */
@Injectable()
export class BarcodeService {
  private readonly log = new Logger('BarcodeService');

  constructor(
    private readonly scoring: ScoringService,
    private readonly firebase: FirebaseService,
    private readonly redis: RedisService,
  ) {}

  // ==========================================================================
  // Helpers réseau OFF (best-effort, jamais d'exception)
  // ==========================================================================

  private static readonly UA = { 'User-Agent': 'Salorie/1.0 (barcode)' };

  /** TTL du cache OFF : 7 jours (produits/nutriments quasi statiques). */
  private static readonly OFF_CACHE_TTL = 604800; // 7 j en secondes

  /**
   * Récupère un produit OFF complet par code-barres. null si introuvable/KO.
   *
   * Cache Redis best-effort (clé 'off:<barcode>') : hit → retour immédiat sans
   * appel HTTP ; sinon lookup OFF puis mise en cache (7 j) du produit trouvé.
   * Redis indisponible/erreur → RedisService dégrade silencieusement (get→null,
   * set no-op), on retombe sur le comportement réseau actuel.
   */
  private async fetchProduct(barcode: string): Promise<any | null> {
    const bc = String(barcode || '').replace(/[^0-9]/g, '');
    if (!bc) return null;

    // 1) Tentative cache (silencieuse : getJSON renvoie null si Redis KO).
    const cacheKey = `off:${bc}`;
    const cached = await this.redis.getJSON<any>(cacheKey);
    if (cached) return cached;

    // 2) Lookup HTTP OFF (comportement actuel, jamais d'exception remontée).
    try {
      const r = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${bc}.json`,
        { headers: BarcodeService.UA } as any,
      );
      const j: any = await r.json();
      const product = j?.status === 1 && j.product ? j.product : null;
      // 3) Mise en cache best-effort du produit trouvé (setJSON no-op si Redis KO).
      if (product) {
        await this.redis.setJSON(cacheKey, product, BarcodeService.OFF_CACHE_TTL);
      }
      return product;
    } catch {
      return null;
    }
  }

  // ==========================================================================
  // 1) offToTags — mapping produit OFF → tags[] pour scoreFood (EXPORTÉ)
  // ==========================================================================

  /**
   * Map un produit OpenFoodFacts → liste de tags normalisés consommés par
   * ScoringService.scoreFood (high_sugar, high_sodium, saturated_fat,
   * ultra_processed, gluten, lactose, peanut, nuts, pork, vegan, vegetarian…).
   *
   * Pure & tolérante : accepte un produit partiel / null → [].
   */
  offToTags(product: any): string[] {
    const tags = new Set<string>();
    try {
      const p = product || {};
      const n = p.nutriments || {};
      const numOf = (v: unknown): number => {
        const x = Number(v);
        return Number.isFinite(x) ? x : NaN;
      };

      // --- Seuils nutriments / 100g (modèle "feux tricolores" FSA/OFF) ---
      const sugars = numOf(n['sugars_100g']);
      if (Number.isFinite(sugars) && sugars > 22.5) tags.add('high_sugar');

      const salt = numOf(n['salt_100g']);
      const sodium = numOf(n['sodium_100g']);
      if (
        (Number.isFinite(salt) && salt > 1.5) ||
        (Number.isFinite(sodium) && sodium > 0.6)
      ) {
        tags.add('high_sodium');
      }

      const satFat = numOf(n['saturated-fat_100g']);
      if (Number.isFinite(satFat) && satFat > 5) tags.add('saturated_fat');

      // --- NOVA : ultra-transformé ---
      const nova = numOf(p['nova_group'] ?? n['nova-group']);
      if (nova === 4) tags.add('ultra_processed');

      // --- Allergènes (allergens_tags: ['en:gluten', 'fr:lait', ...]) ---
      const allergens: string[] = [
        ...(Array.isArray(p.allergens_tags) ? p.allergens_tags : []),
        ...(Array.isArray(p.traces_tags) ? p.traces_tags : []),
      ].map((s) => String(s || '').toLowerCase());
      const allergenBlob = allergens.join(' ');
      const hasAllergen = (...keys: string[]) =>
        keys.some((k) => allergenBlob.includes(k));

      if (hasAllergen('gluten', 'ble', 'blé', 'wheat', 'barley', 'orge', 'seigle', 'rye')) tags.add('gluten');
      if (hasAllergen('milk', 'lait', 'lactose', 'dairy')) tags.add('lactose');
      if (hasAllergen('peanut', 'arachide', 'cacahuete', 'cacahuète')) tags.add('peanut');
      if (hasAllergen('nut', 'noix', 'amande', 'almond', 'hazelnut', 'noisette', 'cashew', 'pistach', 'walnut', 'pecan')) tags.add('nuts');

      // --- Analyse ingrédients / labels : porc + vegan/vegetarian ---
      const ingBlob = [
        ...(Array.isArray(p.ingredients_analysis_tags) ? p.ingredients_analysis_tags : []),
        ...(Array.isArray(p.labels_tags) ? p.labels_tags : []),
        String(p.ingredients_text || ''),
        String(p.ingredients_text_fr || ''),
      ]
        .map((s) => String(s || '').toLowerCase())
        .join(' ');

      if (/\b(pork|porc|jambon|ham|bacon|lardon|saindoux|gelatine|gélatine)/.test(ingBlob)) {
        tags.add('pork');
      }
      // labels_tags: 'en:vegan' / 'en:vegetarian' ; ingredients_analysis_tags: 'en:vegan'
      if (/(^|\s|:)vegan/.test(ingBlob) && !/non-vegan/.test(ingBlob)) tags.add('vegan');
      if (/(^|\s|:)vegetarian/.test(ingBlob) && !/non-vegetarian/.test(ingBlob)) tags.add('vegetarian');

      // --- Nutri-Score (a..e) exposé comme tag informatif ---
      const grade = String(p['nutriscore_grade'] || p['nutrition_grade_fr'] || '')
        .trim()
        .toLowerCase();
      if (/^[a-e]$/.test(grade)) tags.add(`nutriscore_${grade}`);
    } catch (e) {
      this.log.debug('offToTags failed: ' + (e as Error).message);
    }
    return Array.from(tags);
  }

  // ==========================================================================
  // Helpers produit → nutrition normalisée + candidate
  // ==========================================================================

  private static num(v: unknown, def = 0): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
  }

  /** Extrait la nutrition/100g d'un produit OFF (ou d'un product fourni brut). */
  private nutrition100(product: any): {
    kcal: number;
    protein: number;
    carbs: number;
    fat: number;
    sugars: number;
    salt: number;
    sodium: number;
    saturatedFat: number;
    fiber: number;
  } {
    const p = product || {};
    const n = p.nutriments || {};
    const pick = (...keys: string[]): number => {
      for (const k of keys) {
        const v = Number(n[k]);
        if (Number.isFinite(v)) return v;
      }
      return 0;
    };
    return {
      kcal: pick('energy-kcal_100g', 'energy-kcal', 'energy_100g'),
      protein: pick('proteins_100g', 'proteins'),
      carbs: pick('carbohydrates_100g', 'carbohydrates'),
      fat: pick('fat_100g', 'fat'),
      sugars: pick('sugars_100g', 'sugars'),
      salt: pick('salt_100g', 'salt'),
      sodium: pick('sodium_100g', 'sodium'),
      saturatedFat: pick('saturated-fat_100g', 'saturated-fat'),
      fiber: pick('fiber_100g', 'fiber'),
    };
  }

  /** Nom lisible du produit (best-effort multi-langue). */
  private productName(product: any): string {
    const p = product || {};
    return (
      String(
        p.product_name_fr ||
          p.product_name ||
          p.generic_name_fr ||
          p.generic_name ||
          p.abbreviated_product_name ||
          '',
      ).trim() || 'Produit'
    );
  }

  /** Marque principale du produit. */
  private brand(product: any): string {
    const p = product || {};
    if (p.brands) return String(p.brands).split(',')[0].trim();
    if (Array.isArray(p.brands_tags) && p.brands_tags[0]) {
      return String(p.brands_tags[0]).replace(/^[a-z]{2}:/, '').replace(/-/g, ' ').trim();
    }
    return '';
  }

  /**
   * edible=false si le produit est NON-alimentaire (categories 'en:non-food' /
   * 'pet-food' / hygiène / cosmétique) OU s'il n'a aucun nutriment exploitable.
   */
  private isEdible(product: any): boolean {
    const p = product || {};
    const cats = [
      ...(Array.isArray(p.categories_tags) ? p.categories_tags : []),
      String(p.categories || ''),
      ...(Array.isArray(p.quality_tags) ? p.quality_tags : []),
    ]
      .map((s) => String(s || '').toLowerCase())
      .join(' ');
    if (/non-food|pet-food|petfood|cosmetic|hygiene|hygiène|beauty|cleaning|detergent|toys?\b/.test(cats)) {
      return false;
    }
    const nut = this.nutrition100(p);
    const hasNutriments =
      nut.kcal > 0 || nut.protein > 0 || nut.carbs > 0 || nut.fat > 0;
    return hasNutriments;
  }

  /** Construit le FoodCandidate scorable à partir d'un produit OFF. */
  private toCandidate(product: any): FoodCandidate {
    const nut = this.nutrition100(product);
    return {
      name: this.productName(product),
      kcal: nut.kcal,
      protein: nut.protein,
      carbs: nut.carbs,
      fat: nut.fat,
      tags: this.offToTags(product),
    };
  }

  /** Bloc "product" renvoyé au client : nutrition complète /100g + méta. */
  private productView(product: any) {
    const p = product || {};
    const nut = this.nutrition100(p);
    return {
      barcode: String(p.code || p._id || '') || undefined,
      name: this.productName(p),
      brand: this.brand(p),
      image: p.image_front_url || p.image_url || null,
      nutriscore: String(p.nutriscore_grade || p.nutrition_grade_fr || '').toLowerCase() || null,
      nova: BarcodeService.num(p.nova_group, 0) || null,
      categories: Array.isArray(p.categories_tags) ? p.categories_tags : [],
      per100g: {
        kcal: nut.kcal,
        protein: nut.protein,
        carbs: nut.carbs,
        fat: nut.fat,
        sugars: nut.sugars,
        saturatedFat: nut.saturatedFat,
        salt: nut.salt,
        sodium: nut.sodium,
        fiber: nut.fiber,
      },
    };
  }

  // ==========================================================================
  // 2) analyze — barcode|product + objective → verdict
  // ==========================================================================

  async analyze(input: {
    barcode?: string;
    product?: any;
    objective?: Partial<ObjectiveContext> | null;
  }): Promise<{
    found: boolean;
    edible: boolean;
    product: any | null;
    tags: string[];
    score: FoodScore | null;
  }> {
    try {
      // Récupère le produit : OFF si barcode, sinon product fourni brut.
      let product: any = input?.product ?? null;
      if (input?.barcode) {
        const fetched = await this.fetchProduct(input.barcode);
        if (fetched) product = fetched;
      }

      if (!product) {
        return { found: false, edible: false, product: null, tags: [], score: null };
      }

      const tags = this.offToTags(product);
      const edible = this.isEdible(product);
      const view = this.productView(product);

      if (!edible) {
        return {
          found: true,
          edible: false,
          product: view,
          tags,
          score: {
            fit: 0,
            verdict: 'avoid',
            reasons: ['Produit non alimentaire — pas d’analyse nutritionnelle'],
            blocked: true,
          },
        };
      }

      const candidate = this.toCandidate(product);
      const score = this.scoring.scoreFood(
        candidate,
        (input?.objective || {}) as ObjectiveContext,
      );

      return { found: true, edible: true, product: view, tags, score };
    } catch (e) {
      this.log.warn('analyze failed: ' + (e as Error).message);
      return { found: false, edible: false, product: null, tags: [], score: null };
    }
  }

  // ==========================================================================
  // 3) alternatives — meilleures options d'une catégorie
  // ==========================================================================

  /** Résout la catégorie de recherche : explicite, sinon depuis le barcode. */
  private async resolveCategory(input: {
    barcode?: string;
    category?: string;
    _product?: any;
  }): Promise<{ category: string; currentFit: number | null; currentProduct: any | null }> {
    if (input?.category) {
      return { category: String(input.category), currentFit: null, currentProduct: null };
    }
    let product = input?._product ?? null;
    if (!product && input?.barcode) product = await this.fetchProduct(input.barcode);
    if (product) {
      const cats: string[] = Array.isArray(product.categories_tags)
        ? product.categories_tags
        : [];
      // Prend la catégorie la plus spécifique (dernière du tableau) sans préfixe langue.
      const last = cats.length ? cats[cats.length - 1] : '';
      const cat = String(last || product.categories || '')
        .replace(/^[a-z]{2}:/, '')
        .replace(/-/g, ' ')
        .split(',')[0]
        .trim();
      return { category: cat, currentFit: null, currentProduct: product };
    }
    return { category: '', currentFit: null, currentProduct: null };
  }

  async alternatives(input: {
    barcode?: string;
    category?: string;
    objective?: Partial<ObjectiveContext> | null;
  }): Promise<{
    category: string;
    currentFit: number | null;
    alternatives: Array<{
      barcode?: string;
      name: string;
      brand: string;
      nutriscore: string | null;
      fit: number;
      verdict: FoodScore['verdict'];
    }>;
  }> {
    try {
      const { category, currentProduct } = await this.resolveCategory(input);
      const objective = (input?.objective || {}) as ObjectiveContext;

      // Fit du produit courant (pour ne proposer que STRICTEMENT mieux).
      let currentFit: number | null = null;
      if (currentProduct && this.isEdible(currentProduct)) {
        currentFit = this.scoring.scoreFood(
          this.toCandidate(currentProduct),
          objective,
        ).fit;
      }

      if (!category) {
        return { category: '', currentFit, alternatives: [] };
      }

      // Recherche OFF triée par nutriscore (meilleur d'abord).
      let products: any[] = [];
      try {
        const url =
          `https://world.openfoodfacts.org/cgi/search.pl?action=process&json=1&page_size=40` +
          `&sort_by=nutriscore_score` +
          `&tagtype_0=categories&tag_contains_0=contains&tag_0=${encodeURIComponent(category)}` +
          `&fields=code,product_name,product_name_fr,brands,brands_tags,nutriscore_grade,nutrition_grade_fr,nova_group,nutriments,categories_tags,allergens_tags,traces_tags,labels_tags,ingredients_analysis_tags,ingredients_text,ingredients_text_fr`;
        const r = await fetch(url, { headers: BarcodeService.UA } as any);
        const j: any = await r.json();
        products = Array.isArray(j?.products) ? j.products : [];
      } catch {
        products = [];
      }

      const currentCode = String(currentProduct?.code || input?.barcode || '').replace(/[^0-9]/g, '');
      // Sans produit courant : plancher à 44 pour ne proposer que des options
      // décentes (jamais un produit médiocre faute de référence).
      const threshold = currentFit ?? 44;

      const scored = products
        .filter((p) => this.isEdible(p))
        .map((p) => {
          const s = this.scoring.scoreFood(this.toCandidate(p), objective);
          return { p, s };
        })
        // Non bloqués + strictement mieux que le courant (ou tout si pas de courant).
        .filter(({ p, s }) => {
          if (s.blocked) return false;
          if (s.verdict === 'avoid') return false; // ne JAMAIS recommander un "avoid"
          const code = String(p.code || '').replace(/[^0-9]/g, '');
          if (currentCode && code && code === currentCode) return false; // exclut le produit scanné
          return s.fit > threshold;
        })
        .sort((a, b) => b.s.fit - a.s.fit);

      // Dédup par (nom+marque) pour éviter les doublons OFF, top 5.
      const seen = new Set<string>();
      const alternatives: Array<any> = [];
      for (const { p, s } of scored) {
        const name = this.productName(p);
        const brand = this.brand(p);
        const key = (name + '|' + brand).toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        alternatives.push({
          barcode: String(p.code || '') || undefined,
          name,
          brand,
          nutriscore: String(p.nutriscore_grade || p.nutrition_grade_fr || '').toLowerCase() || null,
          fit: s.fit,
          verdict: s.verdict,
        });
        if (alternatives.length >= 5) break;
      }

      return { category, currentFit, alternatives };
    } catch (e) {
      this.log.warn('alternatives failed: ' + (e as Error).message);
      return { category: String(input?.category || ''), currentFit: null, alternatives: [] };
    }
  }

  // ==========================================================================
  // 4) Produits INCONNUS — file d'attente + modération admin
  // ==========================================================================

  /** Répertoire de stockage des étiquettes soumises (best-effort, comme ml-feedback). */
  private pendingDir() {
    return join(
      process.env.UPLOAD_DIR || join(process.cwd(), 'uploads'),
      'pending-products',
    );
  }

  /** Écrit l'image d'étiquette sur disque, renvoie le nom de fichier (ou null). */
  private storeLabelImage(barcode: string, imageBase64?: string): string | null {
    if (!imageBase64) return null;
    try {
      const dir = join(this.pendingDir(), 'images');
      fs.mkdirSync(dir, { recursive: true });
      const raw = String(imageBase64).replace(/^data:image\/\w+;base64,/, '');
      const buf = Buffer.from(raw, 'base64');
      if (!buf.length || buf.length > 8 * 1024 * 1024) return null; // garde-fou 8 Mo
      const isPng = buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50;
      const isJpeg = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8;
      if (!isPng && !isJpeg) return null;
      const safeBc = String(barcode || 'unknown').replace(/[^0-9]/g, '') || 'unknown';
      const file = `${safeBc}_${randomUUID()}${isPng ? '.png' : '.jpg'}`;
      fs.writeFileSync(join(dir, file), buf);
      return file;
    } catch {
      return null;
    }
  }

  /**
   * POST /barcode/pending — soumet un produit inconnu pour modération.
   * Best-effort : renvoie toujours { ok } sans jamais jeter.
   */
  async submitPending(body: {
    barcode?: string;
    imageBase64?: string;
    name?: string;
    /** uid déjà pseudonymisé (HMAC-SHA256) par le controller — jamais l'uid brut. */
    uidHash?: string | null;
  }): Promise<{ ok: boolean; id?: string; imageRef?: string | null }> {
    const barcode = String(body?.barcode || '').replace(/[^0-9]/g, '');
    if (!barcode) return { ok: false };

    // 1) Image d'étiquette → disque (feedbackDir), on garde la référence.
    const imageRef = this.storeLabelImage(barcode, body?.imageBase64);

    // 2) Firestore 'pending_products' (best-effort).
    try {
      const db = this.firebase.db();
      const doc = {
        barcode,
        name: body?.name ? String(body.name).slice(0, 200) : null,
        imageRef, // chemin relatif dans pending-products/images (feedbackDir)
        uidHash: body?.uidHash ? String(body.uidHash).slice(0, 64) : null,
        status: 'pending',
        ts: Date.now(),
      };
      const ref = await db.collection('pending_products').add(doc);
      return { ok: true, id: ref.id, imageRef };
    } catch (e) {
      this.log.warn('submitPending firestore failed: ' + (e as Error).message);
      // On a peut-être écrit l'image : on considère la soumission acceptée best-effort.
      return { ok: !!imageRef, imageRef };
    }
  }

  /** Admin : liste des produits en attente. */
  async listPending(): Promise<Array<any>> {
    try {
      const db = this.firebase.db();
      const snap = await db
        .collection('pending_products')
        .where('status', '==', 'pending')
        .get();
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    } catch (e) {
      this.log.warn('listPending failed: ' + (e as Error).message);
      return [];
    }
  }

  /**
   * Admin : valide un pending → copie vers 'custom_products/{barcode}' et
   * marque le pending 'validated'.
   */
  async validatePending(id: string): Promise<{ ok: boolean; barcode?: string }> {
    try {
      const db = this.firebase.db();
      const ref = db.collection('pending_products').doc(id);
      const snap = await ref.get();
      if (!snap.exists) return { ok: false };
      const data = snap.data() as any;
      const barcode = String(data?.barcode || '').replace(/[^0-9]/g, '');
      if (!barcode) return { ok: false };

      await db
        .collection('custom_products')
        .doc(barcode)
        .set(
          {
            barcode,
            name: data?.name ?? null,
            imageRef: data?.imageRef ?? null,
            uidHash: data?.uidHash ?? null,
            source: 'pending',
            validatedAt: Date.now(),
          },
          { merge: true },
        );

      await ref.set(
        { status: 'validated', validatedAt: Date.now() },
        { merge: true },
      );
      return { ok: true, barcode };
    } catch (e) {
      this.log.warn('validatePending failed: ' + (e as Error).message);
      return { ok: false };
    }
  }

  /** Admin : rejette un pending. */
  async rejectPending(id: string): Promise<{ ok: boolean }> {
    try {
      const db = this.firebase.db();
      await db
        .collection('pending_products')
        .doc(id)
        .set({ status: 'rejected', rejectedAt: Date.now() }, { merge: true });
      return { ok: true };
    } catch (e) {
      this.log.warn('rejectPending failed: ' + (e as Error).message);
      return { ok: false };
    }
  }
}
