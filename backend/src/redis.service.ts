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
