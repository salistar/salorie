import { Controller, Get, Optional, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { RedisService } from './redis.service';

// ITEM #30 — /health (liveness) + /health/ready (readiness).
//
// /health        → sonde de vivacité légère : l'app répond, on renvoie status/uptime/ts.
//                  Toujours 200 tant que le process tourne (ne dépend d'aucune dépendance
//                  externe) pour ne pas faire redémarrer le conteneur si Mongo/Redis clignote.
// /health/ready  → sonde d'aptitude approfondie : vérifie RÉELLEMENT Mongo + Redis afin
//                  qu'un monitoring externe (UptimeRobot / Docker healthcheck / K8s readiness)
//                  sache si une dépendance est tombée. 503 si une dépendance est down.
//
// Injections @Optional pour NE PAS casser le pattern d'enregistrement conditionnel
// (HAS_MONGO) : sur un déploiement sans Mongo/Redis, le contrôleur reste instanciable.
@Controller('health')
export class HealthController {
  constructor(
    @Optional() private readonly redis?: RedisService,
    @Optional() @InjectConnection() private readonly mongo?: Connection,
  ) {}

  // Liveness — jamais 503 : le simple fait de répondre prouve que l'event-loop tourne.
  @Get()
  health() {
    return {
      status: 'ok',
      service: 'salorie-backend',
      uptime: process.uptime(),
      ts: Date.now(),
    };
  }

  // Readiness — ping effectif des dépendances injectées ; 503 si l'une est down.
  @Get('ready')
  async ready() {
    const checks: Record<string, any> = {
      ready: true,
      service: 'salorie-backend',
      ts: Date.now(),
    };

    if (this.mongo) {
      try {
        // `db` peut être undefined tant que la connexion n'est pas établie → garde.
        const db = this.mongo.db;
        if (db) {
          await db.admin().ping();
          checks.mongo = 'up';
        } else {
          checks.mongo = 'down';
        }
      } catch {
        checks.mongo = 'down';
      }
    }

    if (this.redis) {
      checks.redis = (await this.redis.ping()) ? 'up' : 'down';
    }

    const down = Object.entries(checks).filter(
      ([k, v]) => (k === 'mongo' || k === 'redis') && v === 'down',
    );
    if (down.length) {
      checks.ready = false;
      // 503 → le healthcheck Docker / UptimeRobot le détecte et peut alerter.
      throw new ServiceUnavailableException(checks);
    }
    return checks;
  }
}
