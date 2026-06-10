import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { MongooseModule } from '@nestjs/mongoose';
import { FirebaseService } from './firebase.service';
import { RedisService } from './redis.service';
import { UsersController } from './users/users.controller';
import { UsersService } from './users/users.service';
import { FilesController } from './files/files.controller';
import { HealthController } from './health.controller';
import { NutritionController } from './nutrition/nutrition.controller';
import { NutritionService } from './nutrition/nutrition.service';
import { InsightsController } from './insights/insights.controller';
import { InsightsService } from './insights/insights.service';
import { AiController } from './ai/ai.controller';
import { AiService } from './ai/ai.service';
import { MlController } from './ml/ml.controller';
import { MlService } from './ml/ml.service';
import { PipelineController } from './pipeline/pipeline.controller';
import { PipelineService } from './pipeline/pipeline.service';
import { MirrorEvent, MirrorEventSchema, MirrorUser, MirrorUserSchema, FeatureStore, FeatureStoreSchema, OutboxItem, OutboxItemSchema } from './pipeline/pipeline.schemas';

// Pipeline analytics (CDC Firestore→Mongo + feature store + outbox + multi-tenant)
// — activé uniquement si Mongo est configuré (sinon DI échoue au boot standalone).
const HAS_MONGO = !!process.env.MONGO_URI;
const PIPELINE_FEATURES = HAS_MONGO
  ? [MongooseModule.forFeature([
      { name: MirrorEvent.name, schema: MirrorEventSchema },
      { name: MirrorUser.name, schema: MirrorUserSchema },
      { name: FeatureStore.name, schema: FeatureStoreSchema },
      { name: OutboxItem.name, schema: OutboxItemSchema },
    ])]
  : [];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    // Mongo is optional — only connect when MONGO_URI is set (docker-compose),
    // so the API boots standalone for Firestore/OFF/Redis-only endpoints.
    ...(HAS_MONGO ? [MongooseModule.forRoot(process.env.MONGO_URI!)] : []),
    ...PIPELINE_FEATURES,
  ],
  controllers: [HealthController, UsersController, FilesController, NutritionController, InsightsController, AiController, MlController, ...(HAS_MONGO ? [PipelineController] : [])],
  providers: [FirebaseService, RedisService, UsersService, NutritionService, InsightsService, AiService, MlService, ...(HAS_MONGO ? [PipelineService] : [])],
})
export class AppModule {}
