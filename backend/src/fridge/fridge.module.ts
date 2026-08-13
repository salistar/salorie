import { Module } from '@nestjs/common';
import { FridgeController } from './fridge.controller';
import { FridgeService } from './fridge.service';
import { ObjectiveModule } from '../objective/objective.module';
import { MlService } from '../ml/ml.service';
import { AiService } from '../ai/ai.service';
import { FirebaseService } from '../firebase.service';
import { RedisService } from '../redis.service';
import { SecretsService } from '../secrets.service';

/**
 * Module "fridge" — analyse STATELESS d'une photo de frigo.
 *
 * DI :
 *  - importe ObjectiveModule → injecte ScoringService (scoring vs objectif) ;
 *  - fournit MlService (VLM local Cloudflare, NON-Gemini) et ses dépendances
 *    (FirebaseService, AiService→RedisService), suivant le pattern des autres
 *    feature-modules (cf. TwinModule) puisqu'il n'existe pas de MlModule exporté.
 *
 * Aucune dépendance Mongo : le backend boote sans base.
 */
@Module({
  imports: [ObjectiveModule],
  controllers: [FridgeController],
  // Cf. menu.module.ts : MlService est redeclare ici, donc toute nouvelle dependance de
  // son constructeur doit etre ajoutee dans les quatre modules (app, menu, fridge, receipt).
  providers: [FridgeService, MlService, AiService, FirebaseService, RedisService, SecretsService],
})
export class FridgeModule {}
