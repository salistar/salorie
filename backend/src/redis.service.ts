import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private client: Redis | null = null;

  private get() {
    if (!this.client) {
      this.client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
        lazyConnect: true, maxRetriesPerRequest: 1,
      });
      this.client.on('error', () => { /* ignore — degrade gracefully without cache */ });
    }
    return this.client;
  }

  async getJSON<T>(key: string): Promise<T | null> {
    try { const v = await this.get().get(key); return v ? (JSON.parse(v) as T) : null; } catch { return null; }
  }
  async setJSON(key: string, value: unknown, ttlSec = 3600): Promise<void> {
    try { await this.get().set(key, JSON.stringify(value), 'EX', ttlSec); } catch { /* no cache */ }
  }

  /** Incrémente un compteur (best-effort). Renvoie la nouvelle valeur ou null si Redis KO. */
  async incr(key: string, ttlSec?: number): Promise<number | null> {
    try {
      const n = await this.get().incr(key);
      if (ttlSec && n === 1) await this.get().expire(key, ttlSec);
      return n;
    } catch { return null; }
  }

  /** Lit plusieurs compteurs en une passe → map {key: number} (0 si absent/KO). */
  async mgetNumbers(keys: string[]): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    if (!keys.length) return out;
    try {
      const vals = await this.get().mget(keys);
      keys.forEach((k, i) => { const v = vals[i]; out[k] = v != null ? Number(v) || 0 : 0; });
    } catch { keys.forEach((k) => { out[k] = 0; }); }
    return out;
  }

  /** Ping Redis pour le readiness probe (/health). true = répond PONG. */
  async ping(): Promise<boolean> {
    try { return (await this.get().ping()) === 'PONG'; } catch { return false; }
  }

  /**
   * Incrément d'un compteur persistant (ex. plafond mensuel de coût Gemini).
   * Renvoie la nouvelle valeur, ou null si Redis est indisponible (l'appelant décide
   * du comportement de dégradation). TTL posé au premier incrément.
   */
  async incrCounter(key: string, by = 1, ttlSec = 40 * 86400): Promise<number | null> {
    try {
      const n = await this.get().incrby(key, by);
      if (n === by) await this.get().expire(key, ttlSec);
      return n;
    } catch { return null; }
  }

  /** Rate limiting fenêtre fixe : true = autorisé. Dégrade OUVERT si Redis indisponible. */
  async rateLimit(key: string, limit: number, windowSec: number): Promise<boolean> {
    try {
      const k = `rl:${key}`;
      const n = await this.get().incr(k);
      if (n === 1) await this.get().expire(k, windowSec);
      return n <= limit;
    } catch { return true; }
  }

  // ---------------------------------------------------------------------------
  // TELEMETRIE DES APPELS IA (13 aout 2026)
  //
  // Avant cette date, RIEN n'etait mesure : zero trace de tier dans les journaux, aucune
  // collection de metriques. Impossible de repondre a « quel provider a repondu, combien
  // de fois, en combien de temps » — donc impossible de tracer le moindre graphe.
  //
  // Deliberement en Redis et pas en Mongo : MlService est redeclare dans quatre modules
  // (app, menu, fridge, receipt) et lui ajouter une dependance Mongoose ferait tomber les
  // trois autres au demarrage — c'est exactement la panne du 13 aout. RedisService, lui,
  // est deja injecte partout.
  //
  // Deux compteurs par jour et par moteur suffisent a tout tracer : le nombre d'appels et
  // la somme des latences (la moyenne s'en deduit). TTL de 40 jours = 40 jours d'historique.
  // ---------------------------------------------------------------------------

  /** Jour au format YYYY-MM-DD, en UTC pour rester comparable d'un serveur a l'autre. */
  static jour(d = new Date()): string { return d.toISOString().slice(0, 10); }

  static cleAi(jour: string, genre: string, moteur: string, suffixe: string): string {
    // Le moteur peut contenir « : » (ex. `zhipu:glm-4.5v`) — on l'assainit pour garder
    // des cles Redis lisibles et decoupables sans ambiguite.
    return `ai:m:${jour}:${genre}:${String(moteur).replace(/[:\s]+/g, '_')}:${suffixe}`;
  }

  /**
   * Enregistre un appel IA. `genre` = 'vision' | 'text'. `moteur` = ce que le tier a
   * renvoye (ex. `cloudflare:@cf/meta/llama-3.2-11b-vision-instruct`), ou 'miss' quand
   * aucun tier n'a repondu. N'echoue JAMAIS : la telemetrie ne doit pas casser un scan.
   */
  async recordAiCall(genre: 'vision' | 'text', moteur: string, ms: number): Promise<void> {
    try {
      const j = RedisService.jour();
      await this.incrCounter(RedisService.cleAi(j, genre, moteur, 'n'), 1);
      await this.incrCounter(RedisService.cleAi(j, genre, moteur, 'ms'), Math.max(0, Math.round(ms)));
    } catch { /* la telemetrie ne remonte jamais d'erreur a l'appelant */ }
  }

  /** Liste les cles de metriques presentes (SCAN, pas KEYS : ne bloque pas Redis). */
  async listAiKeys(): Promise<string[]> {
    try {
      const out: string[] = [];
      let cursor = '0';
      do {
        const [next, lot] = await this.get().scan(cursor, 'MATCH', 'ai:m:*', 'COUNT', 500);
        cursor = next;
        out.push(...lot);
      } while (cursor !== '0' && out.length < 5000);
      return out;
    } catch { return []; }
  }

  onModuleDestroy() { this.client?.disconnect(); }
}
