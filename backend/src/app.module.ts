import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { FirebaseService } from './firebase.service';
import { RedisService } from './redis.service';
import { UsersController } from './users/users.controller';
import { UsersService } from './users/users.service';
import { FilesController } from './files/files.controller';
import { HealthController } from './health.controller';
import { NutritionController } from './nutrition/nutrition.controller';
import { NutritionService } from './nutrition/nutrition.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Mongo is optional — only connect when MONGO_URI is set (docker-compose),
    // so the API boots standalone for Firestore/OFF/Redis-only endpoints.
    ...(process.env.MONGO_URI ? [MongooseModule.forRoot(process.env.MONGO_URI)] : []),
  ],
  controllers: [HealthController, UsersController, FilesController, NutritionController],
  providers: [FirebaseService, RedisService, UsersService, NutritionService],
})
export class AppModule {}
