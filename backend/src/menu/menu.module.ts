import { Module } from '@nestjs/common';
import { MenuController } from './menu.controller';
import { MenuService } from './menu.service';
import { ObjectiveModule } from '../objective/objective.module';
import { MlService } from '../ml/ml.service';
import { AiService } from '../ai/ai.service';
import { FirebaseService } from '../firebase.service';
import { RedisService } from '../redis.service';

/**
 * MenuModule — analyse STATELESS d'une photo de menu de restaurant.
 *
 * DI :
 *  - importe ObjectiveModule → injecte ScoringService (scoring pur des plats) ;
 *  - fournit MlService (visionLocal → Cloudflare llama-3.2) avec sa chaîne de
 *    dépendances (FirebaseService, AiService, RedisService), car il n'existe pas
 *    de MlModule exportable : MlService est déclaré directement dans AppModule.
 *
 * Aucune dépendance Mongo : le module boote sans base.
 */
@Module({
  imports: [ObjectiveModule],
  controllers: [MenuController],
  providers: [MenuService, MlService, AiService, FirebaseService, RedisService],
})
export class MenuModule {}
