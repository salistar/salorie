import { Module } from '@nestjs/common';
import { ReceiptController } from './receipt.controller';
import { ReceiptService } from './receipt.service';
import { ObjectiveModule } from '../objective/objective.module';
import { MlService } from '../ml/ml.service';
import { FirebaseService } from '../firebase.service';
import { AiService } from '../ai/ai.service';
import { RedisService } from '../redis.service';

/**
 * ReceiptModule — analyse STATELESS de ticket de caisse.
 *
 * DI :
 *  - ObjectiveModule fournit ScoringService (scoring d'aliments vs objectif).
 *  - MlService (VLM via visionLocal) n'a pas de module dédié et est déclaré
 *    directement dans AppModule ; on le re-déclare ici avec ses dépendances
 *    (FirebaseService, AiService) pour pouvoir l'injecter dans ReceiptService.
 *
 * Aucun schéma Mongoose : le backend boote sans base.
 */
@Module({
  imports: [ObjectiveModule],
  controllers: [ReceiptController],
  providers: [ReceiptService, MlService, FirebaseService, AiService, RedisService],
})
export class ReceiptModule {}
