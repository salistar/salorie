import { Injectable, OnModuleInit } from '@nestjs/common';
import { FirebaseService } from '../firebase.service';
import { AiService, enTexte } from '../ai/ai.service';
import { RedisService } from '../redis.service';
import { SecretsService } from '../secrets.service';
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
export class MlService implements OnModuleInit {
  constructor(
    private firebase: FirebaseService,
    private ai: AiService,
    private redis: RedisService,
    private secrets: SecretsService,
  ) {}

  /**
   * Quels paliers de vision sont ARMES ? Ecrit une fois, au demarrage.
   *
   * ⚠ POURQUOI CELA MANQUAIT, ET CE QUE CA COUTAIT.
   * Chaque palier non configure rend `null` en silence : c'est le bon
   * comportement pendant une requete — la cascade continue — mais cela rend son
   * absence INVISIBLE. Consequence observee le 30/08/2026 : sur plusieurs
   * centaines de requetes mesurees, aucune reponse n'est jamais venue de Groq ni
   * d'Ollama, tous deux GRATUITS et places AVANT Mistral qui est payant. On
   * croyait avoir quatre paliers gratuits ; il n'y en avait qu'un.
   *
   * Un palier absent n'est pas une panne : c'est souvent un choix. Mais un choix
   * qu'on ne voit nulle part finit par etre oublie, et on paie pour un repli
   * qu'on croyait gratuit.
   *
   * Aucune valeur de cle n'est ecrite ici — seulement leur presence.
   */
  /**
   * Chaque palier de vision repondra-t-il vraiment ?
   *
   * ⚠ POURQUOI CETTE SONDE EXISTE.
   * Un palier se tait pour DEUX raisons qu'on ne distingue pas de l'exterieur :
   * la cle manque, ou le MODELE demande n'existe plus. Groq a passe des semaines
   * muet pour la seconde — sa cle etait valide, et son defaut pointait un modele
   * « preview » retire depuis. Rien ne le signalait : `tryGroq` rendait `null`,
   * la cascade continuait, et on payait un palier superieur a chaque scan.
   *
   * Le 31/08/2026, Qwen et MiniMax ont ete branches avec des noms de modeles que
   * je n'avais pas pu tester. Le meme piege attendait. Cette sonde le desamorce :
   * elle demande a chaque fournisseur SA liste de modeles et verifie que celui
   * qu'on s'apprete a appeler s'y trouve.
   *
   * Aucune valeur de cle ne sort d'ici — seulement des noms de modeles.
   */
  async sonderPaliersVision() {
    const secret = (n: string) => this.secrets.get(n).catch(() => undefined);
    const modeleDe = (env: string, defaut: string) => process.env[env] || defaut;

    // Pour chaque palier : ou demander la liste, et quel modele on appellera.
    const paliers: Array<{
      nom: string; cle?: string; url?: string; entete?: (k: string) => Record<string, string>;
      modele: string; extraire?: (j: any) => string[]; note?: string;
    }> = [
      { nom: 'cloudflare', cle: 'CF_ACCOUNT_ID',
        modele: modeleDe('CF_VISION_MODEL', '@cf/meta/llama-3.2-11b-vision-instruct'),
        note: 'liste non interrogeable sans le jeton Workers AI' },
      { nom: 'ollama', url: (process.env.OLLAMA_URL || '') + '/api/tags',
        modele: modeleDe('OLLAMA_VISION_MODEL', 'moondream'),
        extraire: (j) => (j?.models || []).map((m: any) => String(m?.name || '')) },
      { nom: 'zhipu', cle: 'ZHIPU_API_KEY', url: 'https://open.bigmodel.cn/api/paas/v4/models',
        modele: modeleDe('ZHIPU_VISION_MODEL', 'glm-4v-flash') },
      { nom: 'moonshot', cle: 'MOONSHOT_API_KEY', url: 'https://api.moonshot.ai/v1/models',
        modele: modeleDe('MOONSHOT_VISION_MODEL', 'moonshot-v1-128k-vision-preview') },
      { nom: 'openai', cle: 'OPENAI_API_KEY', url: 'https://api.openai.com/v1/models',
        modele: modeleDe('OPENAI_VISION_MODEL', 'gpt-4o-mini') },
      { nom: 'qwen', cle: 'DASHSCOPE_API_KEY',
        url: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models',
        modele: modeleDe('DASHSCOPE_VISION_MODEL', 'qwen-vl-max') },
      { nom: 'minimax', cle: 'MINIMAX_API_KEY',
        modele: modeleDe('MINIMAX_VISION_MODEL', 'MiniMax-VL-01'),
        note: 'MiniMax ne publie pas de liste de modeles' },
      { nom: 'mistral', cle: 'MISTRAL_API_KEY', url: 'https://api.mistral.ai/v1/models',
        modele: modeleDe('MISTRAL_VISION_MODEL', 'mistral-small-latest') },
      { nom: 'xai', cle: 'XAI_API_KEY', url: 'https://api.x.ai/v1/models',
        modele: modeleDe('XAI_VISION_MODEL', 'grok-2-vision-1212') },
      { nom: 'anthropic', cle: 'ANTHROPIC_API_KEY', url: 'https://api.anthropic.com/v1/models',
        modele: modeleDe('ANTHROPIC_VISION_MODEL', 'claude-3-5-sonnet-latest') },
    ];

    const resultats = await Promise.all(paliers.map(async (t) => {
      const cle = t.cle ? await secret(t.cle) : undefined;
      if (t.cle && !cle) return { palier: t.nom, cle: 'absente', modele: t.modele, etat: 'muet' };
      if (!t.url) return { palier: t.nom, cle: 'presente', modele: t.modele, etat: 'non verifiable', note: t.note };

      try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 12000);
        const entetes: Record<string, string> = t.nom === 'anthropic'
          ? { 'x-api-key': cle || '', 'anthropic-version': '2023-06-01' }
          : cle ? { Authorization: `Bearer ${cle}` } : {};
        const r = await fetch(t.url, { headers: entetes, signal: ctrl.signal });
        clearTimeout(to);
        if (!r.ok) return { palier: t.nom, cle: 'presente', modele: t.modele, etat: `liste refusee (HTTP ${r.status})` };

        const j: any = await r.json();
        const ids: string[] = t.extraire
          ? t.extraire(j)
          : (j?.data || j?.models || []).map((m: any) => String(m?.id || m?.name || ''));
        // Ollama nomme ses modeles « moondream:latest » : on compare sur le
        // prefixe, sinon un modele present serait declare absent.
        const present = ids.some((id) => id === t.modele || id.split(':')[0] === t.modele.split(':')[0]);
        return {
          palier: t.nom, cle: 'presente', modele: t.modele,
          etat: present ? 'pret' : 'MODELE INTROUVABLE',
          modelesVus: ids.length,
          suggestions: present ? undefined
            : ids.filter((id) => /vision|vl|multimodal|scout|maverick|4o|sonnet|glm-4v/i.test(id)).slice(0, 4),
        };
      } catch (e: any) {
        return { palier: t.nom, cle: 'presente', modele: t.modele, etat: `injoignable (${String(e?.message || '').slice(0, 40)})` };
      }
    }));

    const muets = resultats.filter((r) => r.etat === 'muet' || r.etat === 'MODELE INTROUVABLE');
    if (muets.length) {
      this.log('paliers de vision qui NE REPONDRONT PAS : '
        + muets.map((m) => `${m.palier} (${m.etat})`).join(', '));
    }
    return { paliers: resultats, muets: muets.length };
  }

  async onModuleInit() {
    // Les cles Firestore sont lues via SecretsService ; les autres reglages
    // viennent de l'environnement. On interroge les deux de la meme facon.
    // ⚠ CHAQUE PALIER EST INTERROGE COMME LA CASCADE L'INTERROGE.
    // Certaines cles vivent dans Firestore (SecretsService), d'autres dans
    // l'environnement. Une premiere version testait `process.env.CF_ACCOUNT_ID`,
    // qui vient en realite des secrets : elle aurait declare Cloudflare absent
    // alors qu'il sert la majorite des requetes. Un inventaire faux est pire que
    // pas d'inventaire, puisqu'on agit dessus.
    const secret = (nom: string) => this.secrets.get(nom).catch(() => undefined);
    const [cfCompte, cleGroq, cleMistral, cleZhipu, cleAnthropic] = await Promise.all([
      secret('CF_ACCOUNT_ID'), secret('GROQ_API_KEY'), secret('MISTRAL_API_KEY'),
      secret('ZHIPU_API_KEY'), secret('ANTHROPIC_API_KEY'),
    ]);

    const paliers: Array<[string, boolean, 'gratuit' | 'payant' | 'auto-heberge']> = [
      ['tier0:food4k', process.env.FOOD4K_ENABLED !== 'false' && !!process.env.FOOD4K_URL, 'auto-heberge'],
      ['cloudflare', !!cfCompte, 'gratuit'],
      ['groq', !!cleGroq, 'gratuit'],
      ['ollama', !!process.env.OLLAMA_URL, 'auto-heberge'],
      ['mistral', !!cleMistral, 'payant'],
      ['zhipu', !!cleZhipu, 'payant'],
      ['anthropic', !!cleAnthropic, 'payant'],
    ];

    const armes = paliers.filter(([, ok]) => ok).map(([n]) => n);
    const absents = paliers.filter(([, ok]) => !ok);
    this.log('paliers de vision armes : ' + (armes.join(', ') || 'AUCUN'));

    // On ne signale que les gratuits manquants : c'est la que l'absence coute,
    // puisqu'elle deporte la charge sur un palier payant place derriere.
    const gratuitsAbsents = absents.filter(([, , cout]) => cout !== 'payant').map(([n]) => n);
    if (gratuitsAbsents.length) {
      this.log(
        'paliers GRATUITS non configures : ' + gratuitsAbsents.join(', ')
        + ' — les cas qu ils auraient absorbes partent vers un palier payant.',
      );
    }
  }

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
      // Cles lues d'abord dans l'admin (Firestore secrets/llm_keys), sinon dans l'env.
      // Cela permet d'activer ce tier depuis l'interface, sans secret CI ni redeploiement
      // — voie qui a fait defaut le 13 aout 2026, quand `gh secret set` a enregistre deux
      // chaines VIDES et laisse le tier inerte sans que rien ne le signale.
      const cfAccount = await this.secrets.get('CF_ACCOUNT_ID');
      const cfToken = await this.secrets.get('CF_API_TOKEN');
      // VLM fort (vocabulaire ouvert, bien meilleur sur les plats MENA) ; overridable par env.
      const cfModel = process.env.CF_VISION_MODEL || '@cf/meta/llama-3.2-11b-vision-instruct';
      if (!cfAccount || !cfToken) return null;
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
          // ⚠ Cloudflare rend son champ DEJA ANALYSE quand le modele emet du
          // JSON — et le prompt du scan en demande. `String(objet)` vaut
          // « [object Object] » : 15 caracteres non vides, donc acceptes comme
          // une reconnaissance valide. Meme piege que la cascade texte, corrige
          // le 25/08/2026 (cf. `enTexte`).
          const text = enTexte(j?.result?.description || j?.result?.response || '');
          if (text) return { text, engine: `cloudflare:${cfModel}` };
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
      const groqKey = await this.secrets.get('GROQ_API_KEY');
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
          if (enTexte(text)) return { text: enTexte(text), engine: `groq:${groqModel}` };
          this.log(`groq réponse vide: ${JSON.stringify(j).slice(0, 200)}`);
        } else {
          this.log(`groq ${r.status}: ${(await r.text()).slice(0, 200)}`);
        }
      } catch (e: any) { this.log(`groq KO: ${e?.message}`); }
      return null;
    };

    // Fabrique de tiers OpenAI-compatibles. OpenAI, xAI et Moonshot parlent EXACTEMENT
    // le meme dialecte (/chat/completions, image_url en objet {url}) — trois blocs
    // identiques auraient triple la surface a maintenir pour zero difference.
    // Zhipu et Mistral restent a part : leur format d'image differe (base64 nu pour l'un,
    // chaine data: pour l'autre), et Cloudflare veut un tableau d'octets. Les fondre
    // ensemble aurait produit des echecs silencieux.
    // Cles et modeles verifies le 13 aout 2026 par appel reel depuis la production.
    const openAiCompat = (
      label: string, url: string, keyName: string, defaultModel: string, modelEnv: string,
    ) => async (): Promise<{ text: string; engine: string } | null> => {
      const key = await this.secrets.get(keyName);
      if (!key) return null;
      const model = process.env[modelEnv] || defaultModel;
      try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 30000);
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model, max_tokens: 512,
            messages: [{ role: 'user', content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
            ] }],
          }),
          signal: ctrl.signal,
        });
        clearTimeout(to);
        if (r.ok) {
          const j: any = await r.json();
          const text = j?.choices?.[0]?.message?.content || '';
          if (enTexte(text)) return { text: enTexte(text), engine: `${label}:${model}` };
          this.log(`${label} réponse vide: ${JSON.stringify(j).slice(0, 200)}`);
        } else {
          this.log(`${label} ${r.status}: ${(await r.text()).slice(0, 200)}`);
        }
      } catch (e: any) { this.log(`${label} KO: ${e?.message}`); }
      return null;
    };

    // Moonshot/Kimi — endpoint INTERNATIONAL `.ai`. Le `.cn` renvoie 401 sur cette cle :
    // elle vient de platform.kimi.ai, pas de la plateforme chinoise. Verifie ce jour.
    const tryMoonshot = openAiCompat(
      'moonshot', 'https://api.moonshot.ai/v1/chat/completions',
      'MOONSHOT_API_KEY', 'moonshot-v1-128k-vision-preview', 'MOONSHOT_VISION_MODEL');
    const tryXai = openAiCompat(
      'xai', 'https://api.x.ai/v1/chat/completions',
      'XAI_API_KEY', 'grok-2-vision-1212', 'XAI_VISION_MODEL');
    // ⚠ TROIS FOURNISSEURS DE LA PAGE ADMIN N'ETAIENT PAS DANS CETTE CASCADE.
    // Leurs cles etaient posees et valides depuis des semaines, et la vision ne
    // les appelait jamais. Ajoutes le 31/08/2026 :
    //
    //   Qwen (DashScope)  qwen-vl-max, multimodal, compatible OpenAI
    //   MiniMax           MiniMax-VL-01, multimodal, compatible OpenAI
    //
    // DeepSeek reste ABSENT, et c'est deliberate : son API publique ne sert que
    // des modeles de texte (deepseek-chat, deepseek-reasoner). L'ajouter
    // reproduirait le cas Groq — un palier qui rend `null` a chaque appel sans
    // que rien ne le dise. Sa cle reste utile pour la cascade de TEXTE.
    //
    // ⚠ LE NOM DU MODELE EST LE POINT FRAGILE. Groq a servi de lecon : son
    // defaut pointait un modele « preview » retire depuis, et le palier se
    // taisait. Les deux noms ci-dessous sont donc SURCHARGEABLES par
    // l'environnement, et la page des cles sonde desormais les modeles
    // disponibles chez chaque fournisseur.
    const tryQwen = openAiCompat(
      'qwen', 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions',
      'DASHSCOPE_API_KEY', 'qwen-vl-max', 'DASHSCOPE_VISION_MODEL');
    const tryMinimax = openAiCompat(
      'minimax', 'https://api.minimax.chat/v1/text/chatcompletion_v2',
      'MINIMAX_API_KEY', 'MiniMax-VL-01', 'MINIMAX_VISION_MODEL');

    const tryOpenAi = openAiCompat(
      'openai', 'https://api.openai.com/v1/chat/completions',
      'OPENAI_API_KEY', 'gpt-4o-mini', 'OPENAI_VISION_MODEL');

    // Anthropic — API distincte : l'image passe en `source: {type:'base64'}`, pas en
    // image_url, et l'authentification est `x-api-key` + `anthropic-version`.
    // Place en DERNIER des tiers payants : c'est le plus cher de la liste.
    const tryAnthropic = async (): Promise<{ text: string; engine: string } | null> => {
      const key = await this.secrets.get('ANTHROPIC_API_KEY');
      if (!key) return null;
      const model = process.env.ANTHROPIC_VISION_MODEL || 'claude-3-5-haiku-latest';
      try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 30000);
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model, max_tokens: 512,
            messages: [{ role: 'user', content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
              { type: 'text', text: prompt },
            ] }],
          }),
          signal: ctrl.signal,
        });
        clearTimeout(to);
        if (r.ok) {
          const j: any = await r.json();
          const text = (j?.content || []).map((c: any) => c?.text || '').join('').trim();
          if (text) return { text, engine: `anthropic:${model}` };
          this.log(`anthropic réponse vide: ${JSON.stringify(j).slice(0, 200)}`);
        } else {
          this.log(`anthropic ${r.status}: ${(await r.text()).slice(0, 200)}`);
        }
      } catch (e: any) { this.log(`anthropic KO: ${e?.message}`); }
      return null;
    };

    // Mistral (small/medium, multimodaux) — identifie le 13 aout 2026. Sa cle trainait
    // dans le .env de l'utilisateur sous le commentaire « provider non identifie (a
    // confirmer) » : rejetee par Pixabay, Groq, USDA, ElevenLabs et Spoonacular, elle a
    // ete retrouvee dans la console Mistral (cle `idriss01`, terminaison lPhh) puis
    // validee par un appel reel — HTTP 200, 55 modeles accessibles.
    // Place juste avant Zhipu : meme rang (payant, apres tous les tiers gratuits), mais
    // sensiblement moins cher au million de jetons.
    const tryMistral = async (): Promise<{ text: string; engine: string } | null> => {
      const key = await this.secrets.get('MISTRAL_API_KEY');
      if (!key) return null;
      const model = process.env.MISTRAL_VISION_MODEL || 'mistral-small-latest';
      try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 30000);
        const r = await fetch('https://api.mistral.ai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model,
            max_tokens: 512,
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                // Mistral attend une URL de donnees complete, pas du base64 nu —
                // contrairement a Zhipu (base64 brut) et a Cloudflare (tableau d'octets).
                // Les trois formats different : ne pas copier l'un depuis l'autre.
                { type: 'image_url', image_url: `data:image/jpeg;base64,${imageBase64}` },
              ],
            }],
          }),
          signal: ctrl.signal,
        });
        clearTimeout(to);
        if (r.ok) {
          const j: any = await r.json();
          const text = j?.choices?.[0]?.message?.content || '';
          if (enTexte(text)) return { text: enTexte(text), engine: `mistral:${model}` };
          this.log(`mistral réponse vide: ${JSON.stringify(j).slice(0, 200)}`);
        } else {
          this.log(`mistral ${r.status}: ${(await r.text()).slice(0, 200)}`);
        }
      } catch (e: any) { this.log(`mistral KO: ${e?.message}`); }
      return null;
    };

    // Zhipu GLM-4.5V — place APRES les tiers gratuits (food4k, Cloudflare, Groq, Ollama)
    // et AVANT Gemini. Ajoute le 13 aout 2026 parce que c'etait, ce jour-la, le SEUL VLM
    // cloud joignable : Cloudflare sans identifiants, Groq sans cle, Gemini sans credits
    // (429). Teste sur une photo de plat : HTTP 200, reponse juste.
    //
    // Le nom du modele compte : `glm-4v-flash`, `glm-4v` et `glm-4.1v-thinking-flash`
    // renvoient tous « modele inexistant » sur ce compte. Seul `glm-4.5v` repond.
    //
    // La cle vient de l'admin (Firestore) ou de l'env — elle y est deja, saisie par
    // l'utilisateur, ce qui rend ce tier actif sans aucune manipulation supplementaire.
    const tryZhipu = async (): Promise<{ text: string; engine: string } | null> => {
      const zhipuKey = await this.secrets.get('ZHIPU_API_KEY');
      if (!zhipuKey) return null;
      const zhipuModel = process.env.ZHIPU_VISION_MODEL || 'glm-4.5v';
      try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 45000); // GLM-4.5V raisonne avant de repondre
        const r = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${zhipuKey}` },
          body: JSON.stringify({
            model: zhipuModel,
            max_tokens: 512,
            messages: [
              {
                role: 'user',
                content: [
                  // L'API accepte le base64 BRUT dans `url` (sans prefixe `data:`) — verifie.
                  { type: 'image_url', image_url: { url: imageBase64 } },
                  { type: 'text', text: prompt },
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
          if (enTexte(text)) return { text: enTexte(text), engine: `zhipu:${zhipuModel}` };
          this.log(`zhipu réponse vide: ${JSON.stringify(j).slice(0, 200)}`);
        } else {
          this.log(`zhipu ${r.status}: ${(await r.text()).slice(0, 200)}`);
        }
      } catch (e: any) { this.log(`zhipu KO: ${e?.message}`); }
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
      //
      // ⚠ CE PALIER A ETE DEBRANCHE A TORT LE 29/08/2026, PUIS REMIS.
      // Un banc de mesure maison avait conclu « 0 bonne reponse sur 74 ». Son
      // corpus DEDUISAIT l'etiquette de chaque photo de sa position dans le jeu
      // de donnees au lieu de LIRE le champ `label` fourni a cote. L'hypothese
      // — « trie par classe, 250 par classe » — etait fausse : la photo comptee
      // comme « pizza » etait un plat de nachos, et le classifieur qui repondait
      // « Nachos » avait raison.
      //
      // Mesure refaite avec les vraies etiquettes (food4k/valider_modele.py) :
      //   justesse globale                57,4 %
      //   justesse de ce qui est SERVI    71,9 %  (46 sur 64)
      // Le palier tient largement sa place en tete de cascade.
      //
      // La lecon vaut plus que l'incident : une mesure qui deduit sa verite au
      // lieu de la lire n'evalue pas le systeme, elle evalue son propre calcul.
      if (process.env.FOOD4K_ENABLED === 'false') return null;
      const url = process.env.FOOD4K_URL;
      if (!url) return null;
      // ⚠ SEUIL PORTE DE 0,60 A 0,80 LE 30/08/2026, SUR MESURE.
      //
      // Ce que le seuil achete, mesure par food4k/courbe_seuil.py — « juste
      // parmi ce qui est SERVI », c'est-a-dire ce que l'utilisateur recoit :
      //
      //   seuil    Food-101      cuisine marocaine
      //   0,60      71,9 %          24,6 %
      //   0,80      82,6 %          30,6 %
      //
      // La cuisine marocaine est le public de Salorie, et c'est la que ce modele
      // est le plus faible : a 0,60 il tranchait une fois sur deux et se trompait
      // trois fois sur quatre. Le seuil ne repare pas cela — meme a 0,95 la
      // justesse y plafonne a 40,9 % — mais il reduit le nombre de fiches fausses
      // qui entrent dans un journal comme des donnees mesurees.
      //
      // Le prix est reel et assume : la couverture tombe de 63 % a 45 % sur
      // Food-101, de 52 % a 31 % sur les plats marocains. Tout le reste descend
      // vers Cloudflare — une seconde de plus, et un appel de plus.
      //
      // Le vrai correctif reste un modele reentraine sur des photos marocaines.
      // ⚠ SEUILS RELEVES A 0,90 / 0,95 LE 31/08/2026, SUR MESURE EN PRODUCTION.
      // La cascade interrogee sur 98 photos de cuisine marocaine :
      //   tier0    28 servies    7,1 % justes
      //   openai   59 servies   35,6 %
      // Cinq fois moins bon que le palier suivant : chacune de ces 28 reponses
      // est une fiche nutritionnelle fausse ecrite dans un journal, la ou le
      // cloud aurait vu juste une fois sur trois.
      //
      // Ce qui reste a 0,80 sur une photo marocaine, ce sont les predictions de
      // classes FOOD-101 posees sur un plat local — le seuil local a 0,90 a deja
      // ecarte les autres. Or ces predictions-la sont fausses presque toujours,
      // et rien a l'execution ne les distingue d'une bonne reponse : quatre
      // signaux de la distribution ont ete testes (confiance, marge, entropie,
      // masse du top-5), aucun ne separe (cf. food4k/signal_hors_domaine.py).
      //
      // Faute de pouvoir les reconnaitre, on releve le seuil general. Sur
      // Food-101 la justesse de ce qui est servi passe de 82,6 % a 93,5 %, pour
      // une couverture qui tombe de 45 % a 31 %. Le reste descend vers le cloud :
      // plus lent, payant, et plus juste.
      const minConf = parseFloat(process.env.FOOD4K_MIN_CONF || '0.8');
      // ⚠ UN SEUIL PLUS EXIGEANT POUR LES CLASSES LOCALES.
      // Le modele n'est pas egalement bon sur ses deux moities. Mesure du
      // 30/08/2026 sur 1 549 images, a confiance >= 0,80 :
      //   annonce une classe Food-101     -> 81,4 % juste (n=698)
      //   annonce un plat marocain/MENA   -> 48,5 % juste (n=33)
      // A 0,90, la seconde remonte a 56 % pour 25 reponses au lieu de 33.
      //
      // Reserve honnete : l'echantillon local est petit (n=33 puis 25), et la
      // verite terrain vient de Wikimedia, moins sure que Food-101. Le sens de
      // l'ecart est net, son ampleur exacte l'est moins.
      //
      // Cela ne repare pas le fond : la plupart des photos de plats marocains
      // recoivent une prediction Food-101, indiscernable a l'execution d'une
      // bonne. Ce reglage n'agit que sur les cas ou le modele annonce lui-meme
      // une classe locale.
      const minConfLocale = parseFloat(process.env.FOOD4K_MIN_CONF_LOCALE || '0.95');
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
          // Le sidecar renvoie `famille` depuis le 30/08/2026 ; un sidecar plus
          // ancien ne l'a pas, et on retombe alors sur le seuil general — jamais
          // sur un seuil plus laxiste.
          const exige = j?.famille === 'locale' ? minConfLocale : minConf;
          if (j?.ok && typeof j.confidence === 'number' && j.confidence >= exige && Number(j.kcal) > 0) {
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
    // ── L'ORDRE DE LA CASCADE ────────────────────────────────────────────────
    //
    // ⚠ MISTRAL A ETE DESCENDU LE 30/08/2026, SUR MESURE.
    // Sur 303 photos passees par la cascade complete en production :
    //   tier0:food4k   216 servies   71,8 % justes
    //   cloudflare      42 servies   52,4 %
    //   mistral         43 servies   14,0 %
    // Mistral etait le premier a recevoir ce que Cloudflare ne pouvait pas
    // traiter — soit un septieme du trafic — et il repondait juste une fois sur
    // sept. Il reste dans la cascade (mieux vaut une reponse faible qu'aucune),
    // mais apres les paliers qui font mieux.
    //
    // Ce qui n'est PAS mesure, et qu'il faut savoir : la qualite de Zhipu,
    // Moonshot et xAI, jamais atteints jusqu'ici. Les descendre Mistral leur
    // confie ces cas sans preuve de leur superiorite — c'est un pari raisonne,
    // pas une certitude, et c'est pour cela que l'ordre est devenu REGLABLE.
    //
    // `VISION_ORDER` accepte une liste de noms separes par des virgules, par
    // exemple « food4k,cloudflare,mistral,zhipu ». Tout palier non cite est
    // ajoute a la fin dans l'ordre par defaut : on ne peut donc pas en perdre un
    // par oubli. Revenir en arriere ne demande qu'une variable, pas un
    // redeploiement de code.
    // ── L'ORDRE EST DERIVE DU COUT, PAS ECRIT A LA MAIN ──────────────────────
    //
    // Regle : toujours du plus gratuit au plus payant. L'ecrire comme une liste
    // figee la rendait fausse au premier changement — c'est ainsi que Mistral,
    // payant, s'est retrouve a servir un septieme du trafic devant des paliers
    // gratuits. La classe de cout est donc portee PAR CHAQUE PALIER, et l'ordre
    // en decoule.
    //
    // ⚠ GROQ NE FIGURE PAS DANS CETTE LISTE, ET CE N'EST PAS UN OUBLI.
    // Sa cle est valide (verifie le 31/08/2026 par la sonde de la page des
    // cles), mais Groq n'expose AUCUN modele de vision — 14 modeles, aucun
    // multimodal. Le laisser dans la cascade ajoutait une lecture de secret et
    // un aller-retour pour un `null` garanti. Pour le remettre le jour ou Groq
    // publiera un modele de vision : l'ajouter a VISION_ORDER, la fonction
    // `tryGroq` est intacte.
    //
    // ⚠ OLLAMA NON PLUS : le service a ete retire du docker-compose le
    // 13/08/2026 (zero requete en huit semaines, 10 Go liberes). `tryOllama`
    // reste et se reactive des que OLLAMA_URL est defini.
    const COUT = { gratuit: 0, bonMarche: 1, cher: 2 } as const;
    const catalogue: Array<{ nom: string; fn: () => Promise<{ text: string; engine: string } | null>; cout: number }> = [
      // Auto-heberge : aucun appel sortant, aucune facture.
      { nom: 'food4k', fn: tryFood4k, cout: COUT.gratuit },
      // Cloudflare Workers AI : palier gratuit genereux (~10 000 appels/jour).
      { nom: 'cloudflare', fn: tryCloudflare, cout: COUT.gratuit },
      // ⚠ OLLAMA APRES CLOUDFLARE, MEME S ILS SONT TOUS DEUX GRATUITS.
      // A cout egal, c est la LATENCE qui tranche : Ollama infere sur CPU en
      // plusieurs SECONDES, Cloudflare sur GPU en centaines de millisecondes.
      // Le placer devant ferait attendre chaque scan que Cloudflare aurait servi
      // en un instant. Il est le dernier recours gratuit, pas le premier.
      //
      // Le tri par cout seul l avait mis DEUXIEME, parce qu il precedait
      // Cloudflare dans ce tableau — et le commentaire du docker-compose disait
      // deja l inverse. Deux verites contradictoires dans le meme depot.
      { nom: 'ollama', fn: tryOllama, cout: COUT.gratuit },
      // Payants. Mesure du 31/08/2026 : OpenAI gpt-4o-mini rend 65,5 % de bonnes
      // reponses sur les cas difficiles, Mistral small 14,0 %. Le rang suit donc
      // le cout, mais un palier mesure mauvais ne remonte pas pour autant.
      { nom: 'zhipu', fn: tryZhipu, cout: COUT.bonMarche },
      { nom: 'moonshot', fn: tryMoonshot, cout: COUT.bonMarche },
      { nom: 'openai', fn: tryOpenAi, cout: COUT.bonMarche },
      // Qwen et MiniMax : ajoutes le 31/08/2026, jamais mesures. Places APRES
      // OpenAI, seul palier dont la justesse est etablie (64,7 % sur les cas
      // difficiles), et AVANT Mistral, seul dont elle est etablie comme mauvaise
      // (14,0 %). Entre les deux : l'inconnu, qu'on ne fait pas passer devant du
      // connu-bon ni derriere du connu-mauvais.
      { nom: 'qwen', fn: tryQwen, cout: COUT.bonMarche },
      { nom: 'minimax', fn: tryMinimax, cout: COUT.bonMarche },
      { nom: 'mistral', fn: tryMistral, cout: COUT.bonMarche },
      { nom: 'xai', fn: tryXai, cout: COUT.cher },
      { nom: 'anthropic', fn: tryAnthropic, cout: COUT.cher },
      // Dernier recours : une API d'aliments, ni LLM ni payante a l'appel.
      { nom: 'foodapi', fn: tryFoodApi, cout: COUT.cher },
    ];

    // Tri STABLE par cout : a cout egal, l'ordre du catalogue est conserve, ce
    // qui laisse la mesure decider entre paliers de meme prix.
    const trie = catalogue
      .map((t, i) => ({ ...t, i }))
      .sort((a, b) => a.cout - b.cout || a.i - b.i);

    const parNom2: Record<string, () => Promise<{ text: string; engine: string } | null>> =
      Object.fromEntries(catalogue.map((t) => [t.nom, t.fn]));
    // `primary === 'ollama'` remonte le palier auto-heberge devant Cloudflare.
    const sansGroq = trie.map((t) => t.nom).filter((n) => n !== 'groq');
    // VISION_PRIMARY=ollama remonte le palier auto-heberge devant Cloudflare.
    // Ecrit franchement plutot qu'avec un comparateur conditionnel, qui exprimait
    // mal l'intention et dependait de la stabilite du tri.
    const ordreDefaut = primary === 'ollama'
      ? ['ollama', ...sansGroq.filter((n) => n !== 'ollama')]
      : sansGroq;

    const demandes = [...new Set(String(process.env.VISION_ORDER || '')
      .split(',').map((x) => x.trim().toLowerCase())
      .filter((x) => parNom2[x] || x === 'groq'))];
    const ordre = [...demandes, ...ordreDefaut.filter((n) => !demandes.includes(n))];
    // `tryGroq` reste joignable par VISION_ORDER meme s'il n'est plus au
    // catalogue : c'est ce qui permettra de le rebrancher sans redeploiement.
    const tiers = ordre.map((n) => (n === 'groq' ? tryGroq : parNom2[n]));


    // ── CE QU'UNE REPONSE DOIT VALOIR POUR ETRE ACCEPTEE ─────────────────────
    //
    // La condition etait `res.text.trim()` : N'IMPORTE QUEL texte non vide etait
    // retenu. La cascade escaladait donc sur le SILENCE d'un palier, jamais sur
    // une reponse inutilisable — et comme Cloudflare repond toujours quelque
    // chose, les fournisseurs places derriere n'etaient JAMAIS atteints.
    //
    // Mesure du 29/08/2026 : sur 101 plats, Cloudflare rend du markdown
    // (« **Name:** Fried Doughnuts ») la ou le prompt exige un JSON strict.
    // L'app ne sait pas le lire, et la cascade s'arretait la, satisfaite.
    //
    // On ne durcit QUE lorsque l'appelant a demande du JSON : `/ai/vision` sert
    // aussi a decrire du materiel ou un contenu de frigo, ou une phrase est la
    // bonne reponse. Exiger du JSON partout casserait ces usages-la.
    const exigeJson = /STRICT JSON|Return .{0,40}JSON|JSON with these keys/i.test(prompt || '');

    /** Rend l'objet si le texte porte un JSON exploitable, sinon null. */
    const jsonUtilisable = (texte: string): any => {
      const t = String(texte || '').trim();
      // Les modeles enrobent volontiers leur JSON dans une cloture markdown ;
      // le refuser pour cette seule raison ferait escalader sans raison.
      const sansCloture = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
      const debut = sansCloture.indexOf('{');
      const fin = sansCloture.lastIndexOf('}');
      if (debut < 0 || fin <= debut) return null;
      try {
        const o = JSON.parse(sansCloture.slice(debut, fin + 1));
        // Un objet vide satisfait `JSON.parse` sans rien apprendre a personne :
        // c'est `name` qui fait la difference entre une fiche et une coquille.
        return o && typeof o === 'object' && String(o.name || '').trim() ? o : null;
      } catch { return null; }
    };

    // Le dernier texte hors contrat rencontre. Si AUCUN palier ne rend du JSON
    // valide, mieux vaut le remettre a l'appelant que rien du tout : il saura au
    // moins afficher quelque chose, et l'utilisateur pourra corriger a la main.
    let repli: { text: string; engine: string } | null = null;

    for (const tier of tiers) {
      // Le nom vient desormais de l'ordre, pas de `Function.name` : une fonction
      // rangee dans un objet peut perdre son nom a la minification, et le
      // circuit-breaker se mettrait alors a confondre tous les paliers sous une
      // seule cle.
      const tierName = ordre[tiers.indexOf(tier)] || (tier as any).name || 'tier';
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
      // Telemetrie : sans elle, on ne savait meme pas quel provider repondait. `void` car
      // un echec d'ecriture ne doit jamais retarder ni casser un scan.
      void this.redis.recordAiCall('vision', res ? res.engine : `${tierName}:miss`, tMs);
      if (res && res.text && String(res.text).trim()) {
        // Le palier a parle. Reste a savoir s'il a repondu A LA QUESTION POSEE.
        if (exigeJson && !jsonUtilisable(res.text)) {
          this.log(`tier ${tierName} hors contrat (JSON demande, non rendu) -> on continue`);
          // On le garde sous le coude sans le mettre en cache : mettre en cache
          // une reponse hors contrat la figerait pour sept jours et empecherait
          // la cascade de mieux faire au scan suivant.
          if (!repli) repli = res;
          this.cbRecordFailure(tierName);
          continue;
        }
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

    // Aucun palier n'a tenu le contrat. On rend malgre tout le dernier texte
    // obtenu : une reponse mal formee laisse encore l'utilisateur corriger a la
    // main, une absence de reponse ne lui laisse rien. Le suffixe dit ce qui
    // s'est passe, pour que la telemetrie ne compte pas cela comme un succes.
    if (repli) {
      this.log('aucun palier n a rendu le JSON demande -> repli sur ' + repli.engine);
      return { text: repli.text, engine: repli.engine + ':hors-contrat' };
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
  // Familles GRATUITES : cache local, food4k on-server, Cloudflare Workers AI (quota
  // gratuit), Groq, l'API food optionnelle, et Ollama — conserve bien que le service ait
  // ete supprime le 13 aout 2026, pour que les compteurs historiques restent lisibles.
  private static readonly TIER_FREE = ['cache', 'tier0', 'cloudflare', 'groq', 'food-api', 'ollama'];

  // Familles PAYANTES. Cette liste s'est allongee le 13 aout 2026 : jusque-la Gemini etait
  // le seul tier payant, et `cloudPaidRate` le codait en dur. Avec l'ajout de Mistral,
  // Zhipu, Moonshot, xAI, OpenAI et Anthropic, la metrique aurait affiche ~0 % de payant
  // pendant que l'application payait reellement — un indicateur faux est pire qu'absent.
  private static readonly TIER_PAID = ['mistral', 'zhipu', 'moonshot', 'xai', 'openai', 'anthropic', 'gemini'];

  private static readonly TIER_FAMILIES = [...MlService.TIER_FREE, ...MlService.TIER_PAID];

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

    // Somme explicite des familles payantes — plus de tier code en dur : ajouter un
    // provider a la cascade sans l'inscrire dans TIER_PAID le rendrait invisible ici.
    const paid = MlService.TIER_PAID.reduce((s, f) => s + (byTier[f]?.count || 0), 0);
    const free = MlService.TIER_FREE.reduce((s, f) => s + (byTier[f]?.count || 0), 0);
    // Ce qui n'est ni l'un ni l'autre : une famille apparue dans les compteurs mais absente
    // des deux listes. On la montre au lieu de la noyer dans « gratuit » par soustraction.
    const unknown = Math.max(0, total - paid - free);
    const rate = (n: number) => (total ? +((n / total) * 100).toFixed(2) : 0);

    return {
      total,
      byTier,
      cloudPaidRate: rate(paid),                   // % servi par un tier PAYANT (objectif ≤ 10 %)
      freeRate: rate(free),                        // % servi gratuitement
      unknownRate: rate(unknown),                  // % dans une famille non classee — a investiguer
      cacheHitRate: rate(byTier['cache']?.count || 0),
      paidFamilies: MlService.TIER_PAID,
      freeFamilies: MlService.TIER_FREE,
    };
  }

  /**
   * Serie temporelle des appels IA, par JOUR / genre / moteur — la matiere des graphes.
   *
   * `getCascadeStats` ne donne que des totaux cumules depuis toujours, sans dimension
   * temporelle ni latence : impossible d'en tirer une courbe ou de voir une derive.
   * Ces compteurs-la sont ecrits par RedisService.recordAiCall depuis le 13 aout 2026,
   * avec 40 jours de retention.
   */
  async getAiTimeline(days = 14) {
    const cles = await this.redis.listAiKeys();
    if (!cles.length) {
      return { days, jours: [], moteurs: [], series: [], note: 'aucune mesure — la telemetrie demarre au premier appel IA' };
    }
    const valeurs = await this.redis.mgetNumbers(cles);

    // ai:m:<jour>:<genre>:<moteur>:<n|ms>  — le moteur peut contenir des « _ », pas des « : ».
    const agg = new Map<string, { jour: string; genre: string; moteur: string; n: number; ms: number }>();
    for (const cle of cles) {
      const p = cle.split(':');
      if (p.length < 6) continue;
      const [, , jour, genre, moteur, suffixe] = p;
      const id = `${jour}|${genre}|${moteur}`;
      const e = agg.get(id) || { jour, genre, moteur, n: 0, ms: 0 };
      if (suffixe === 'n') e.n = valeurs[cle] || 0;
      else if (suffixe === 'ms') e.ms = valeurs[cle] || 0;
      agg.set(id, e);
    }

    const limite = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
    const series = [...agg.values()]
      .filter((e) => e.jour >= limite)
      .map((e) => ({
        jour: e.jour, genre: e.genre, moteur: e.moteur, appels: e.n,
        // Moyenne calculee ici et pas stockee : deux compteurs suffisent, et la moyenne
        // d'une somme divisee reste juste quel que soit le nombre d'appels.
        latenceMoyenneMs: e.n ? Math.round(e.ms / e.n) : 0,
      }))
      .sort((a, b) => (a.jour === b.jour ? b.appels - a.appels : a.jour < b.jour ? -1 : 1));

    return {
      days,
      jours: [...new Set(series.map((s) => s.jour))],
      moteurs: [...new Set(series.map((s) => s.moteur))],
      totalAppels: series.reduce((s, x) => s + x.appels, 0),
      series,
    };
  }

  // ---------------------------------------------------------------------------
  // ITINERAIRES (Routes API) — deplaces cote serveur le 14 aout 2026
  //
  // POURQUOI
  //
  // lib/routes.ts appelait routes.googleapis.com directement depuis React Native, avec
  // la cle EXPO_PUBLIC_GOOGLE_MAPS_KEY embarquee dans l'APK. Deux consequences :
  //
  //  1. La cle est extractible de l'APK par n'importe qui, et facturee a Salorie.
  //  2. Elle ne pouvait etre protegee par AUCUNE restriction. Mesure du 13 aout 2026 :
  //     poser une restriction par referent l'a fait tomber en « 403 Requests from referer
  //     <empty> are blocked » — un fetch React Native n'envoie pas de referent ; et la
  //     restriction Android ne s'applique pas non plus, faute de signature transmise.
  //     La cle etait donc condamnee a rester ouverte a tout Internet.
  //
  // Depuis le serveur, l'appel part d'une IP fixe : la cle peut enfin etre restreinte
  // par adresse IP, la seule restriction qui protege reellement ce type d'usage.
  //
  // La cle est lue par SecretsService (admin d'abord, env ensuite) : elle se change
  // depuis /ai-keys sans redeploiement.
  // ---------------------------------------------------------------------------

  /** Routes API refuse au-dela de 25 points intermediaires — meme borne que cote app. */
  private static readonly MAX_ETAPES_ROUTE = 25;

  async computeRoute(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number },
    mode: 'WALK' | 'DRIVE' = 'WALK',
    etapes: { lat: number; lng: number }[] = [],
  ): Promise<{ polyline: string | null; engine: string }> {
    const cle = await this.secrets.get('GOOGLE_MAPS_SERVER_KEY');
    if (!cle) {
      this.log('routes: GOOGLE_MAPS_SERVER_KEY absente (admin /ai-keys ou env)');
      return { polyline: null, engine: 'non-configure' };
    }
    const pt = (p: { lat: number; lng: number }) => ({
      location: { latLng: { latitude: p.lat, longitude: p.lng } },
    });
    // Meme echantillonnage que lib/routes.ts cote app : intervalle regulier en conservant
    // TOUJOURS les deux extremites. Un `slice(0, 25)` couperait la fin du parcours et
    // l'itineraire s'arreterait au milieu. Les deux implementations doivent coincider,
    // sinon un meme parcours donnerait deux traces selon la version de l'app.
    const max = MlService.MAX_ETAPES_ROUTE;
    let pas = etapes;
    if (etapes.length > max) {
      const ecart = (etapes.length - 1) / (max - 1);
      pas = [];
      for (let i = 0; i < max; i++) pas.push(etapes[Math.round(i * ecart)]);
    }
    const t0 = Date.now();
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 20000);
      const r = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': cle,
          // Sans FieldMask, Routes API repond 400 : le champ est OBLIGATOIRE.
          'X-Goog-FieldMask': 'routes.polyline.encodedPolyline',
        },
        body: JSON.stringify({
          origin: pt(origin),
          destination: pt(destination),
          ...(pas.length ? { intermediates: pas.map(pt) } : {}),
          travelMode: mode,
        }),
        signal: ctrl.signal,
      });
      clearTimeout(to);
      const ms = Date.now() - t0;
      if (!r.ok) {
        this.log(`routes ${r.status}: ${(await r.text()).slice(0, 200)}`);
        void this.redis.recordAiCall('text', `routes:erreur-${r.status}`, ms);
        return { polyline: null, engine: `erreur-${r.status}` };
      }
      const j: any = await r.json();
      void this.redis.recordAiCall('text', 'routes:google', ms);
      // Format identique a l'ancien appel direct : les decodeurs des ecrans restent valables.
      return { polyline: j?.routes?.[0]?.polyline?.encodedPolyline ?? null, engine: 'google-routes' };
    } catch (e: any) {
      this.log(`routes KO: ${e?.message}`);
      return { polyline: null, engine: 'erreur' };
    }
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
    // `this.ai.vision()` appelle Gemini SEUL. Les credits du compte sont
    // epuises depuis des semaines (429 « prepayment credits are depleted »),
    // donc cette route rendait 500 a chaque appel — verifie le 26/08/2026.
    //
    // La cascade de onze paliers, gratuits d'abord, est dans CE fichier, dix
    // lignes plus haut. Il n'y avait aucune raison de s'en priver.
    const r = await this.visionLocal(prompt, imageBase64);
    const text = r.text;
    let parsed: any = null;
    try {
      const m = text.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : null;
    } catch { /* noop */ }
    // Le moteur REEL, pas un nom en dur : c'etait « gemini-vision » alors que
    // Gemini ne repondait plus depuis longtemps.
    return { ok: !!parsed, model: r.engine, raw: parsed ? undefined : text, ...parsed };
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
