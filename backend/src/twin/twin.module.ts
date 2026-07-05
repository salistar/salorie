import { Module } from '@nestjs/common';
import { TwinGateway } from './twin.gateway';
import { FirebaseService } from '../firebase.service';

// Module "Live Twin" : talkie-walkie + état live entre 2 coureurs (WebSocket).
// FirebaseService est fourni ici pour que le gateway puisse garantir l'init de
// l'app Firebase par défaut avant de vérifier les tokens (init paresseuse).
@Module({
  providers: [TwinGateway, FirebaseService],
})
export class TwinModule {}
