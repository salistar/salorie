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

  onModuleDestroy() { this.client?.disconnect(); }
}
