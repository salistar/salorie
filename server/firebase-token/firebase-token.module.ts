import { Module } from '@nestjs/common';
import { FirebaseTokenController } from './firebase-token.controller';
import { FirebaseTokenService } from './firebase-token.service';

/**
 * Drop-in module: import FirebaseTokenModule into your AppModule.
 *
 *   @Module({ imports: [FirebaseTokenModule] })
 *   export class AppModule {}
 *
 * Exposes POST /firebase-token. Make sure CORS allows your app origin
 * (mobile fetch has no origin, so this is mostly relevant for a web build).
 */
@Module({
  controllers: [FirebaseTokenController],
  providers: [FirebaseTokenService],
})
export class FirebaseTokenModule {}
