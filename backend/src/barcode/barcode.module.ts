import { Module } from '@nestjs/common';
import { BarcodeController } from './barcode.controller';
import { BarcodeService } from './barcode.service';
import { ObjectiveModule } from '../objective/objective.module';
import { FirebaseService } from '../firebase.service';
import { RedisService } from '../redis.service';

/**
 * BarcodeModule — "code-barres → verdict + alternatives + produits inconnus".
 *
 * DI (2 crashs déjà évités ailleurs → on est explicite) :
 *  - importe ObjectiveModule → injecte ScoringService (scoring pur) ;
 *  - déclare FirebaseService dans providers[] : il n'existe pas de module
 *    exportable pour Firebase (il est fourni directement dans AppModule), donc
 *    on le re-déclare ici pour pouvoir l'injecter dans BarcodeService.
 *
 * Aucune dépendance Mongo : le backend boote sans base (Firestore best-effort).
 */
@Module({
  imports: [ObjectiveModule],
  controllers: [BarcodeController],
  providers: [BarcodeService, FirebaseService, RedisService],
})
export class BarcodeModule {}
