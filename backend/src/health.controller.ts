import { Controller, Get, Optional, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { RedisService } from './redis.service';

// Readiness probe approfondi : vérifie réellement Mongo + Redis pour qu'un
// monitoring externe (UptimeRobot / Docker healthcheck) sache si une dépendance
// est tombée — au lieu d'un /health toujours vert. Injections @Optional pour ne
// PAS casser le pattern d'enregistrement conditionnel (HAS_MONGO).
@Controller('health')
export class HealthController {
  constructor(
    @Optional() private readonly redis?: RedisService,
    @Optional() @InjectConnection() private readonly mongo?: Connection,
  ) {}

  @Get()
  async health() {
    const checks: Record<string, any> = { ok: true, service: 'salorie-backend', ts: Date.now() };

    if (this.mongo) {
      try { await this.mongo.db.admin().ping(); checks.mongo = 'up'; }
      catch { checks.mongo = 'down'; }
    }
    if (this.redis) {
      checks.redis = (await this.redis.ping()) ? 'up' : 'down';
    }

    const down = Object.entries(checks).filter(([k, v]) => (k === 'mongo' || k === 'redis') && v === 'down');
    if (down.length) {
      checks.ok = false;
      // 503 → le healthcheck Docker / UptimeRobot le détecte et peut alerter.
      throw new ServiceUnavailableException(checks);
    }
    return checks;
  }
}
