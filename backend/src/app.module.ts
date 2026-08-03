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
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { PipelineController } from './pipeline/pipeline.controller';
import { PipelineService } from './pipeline/pipeline.service';
import { PipelineResolver } from './pipeline/pipeline.resolver';
import { MirrorEvent, MirrorEventSchema, MirrorUser, MirrorUserSchema, FeatureStore, FeatureStoreSchema, OutboxItem, OutboxItemSchema } from './pipeline/pipeline.schemas';
import { RacesController } from './races/races.controller';
import { RacesService } from './races/races.service';
import { VirtualRace, VirtualRaceSchema, RaceParticipant, RaceParticipantSchema, Medal, MedalSchema } from './races/races.schemas';
import { OrgsController } from './orgs/orgs.controller';
import { OrgsService } from './orgs/orgs.service';
import { Organization, OrganizationSchema, Membership, MembershipSchema, Invite, InviteSchema } from './orgs/orgs.schemas';
import { FastingGateway } from './fasting/fasting.gateway';
import { TwinModule } from './twin/twin.module';
import { NewsController } from './news/news.controller';
import { NewsService } from './news/news.service';
import { NewsItem, NewsItemSchema } from './news/news.schemas';
import { ReceiptModule } from './receipt/receipt.module';
import { FridgeModule } from './fridge/fridge.module';
import { ObjectiveModule } from './objective/objective.module';
import { MenuModule } from './menu/menu.module';
import { BarcodeModule } from './barcode/barcode.module';

// Pipeline analytics (CDC Firestore→Mongo + feature store + outbox + multi-tenant)
// — activé uniquement si Mongo est configuré (sinon DI échoue au boot standalone).
const HAS_MONGO = !!process.env.MONGO_URI;
const PIPELINE_FEATURES = HAS_MONGO
  ? [
      MongooseModule.forFeature([
        { name: MirrorEvent.name, schema: MirrorEventSchema },
        { name: MirrorUser.name, schema: MirrorUserSchema },
        { name: FeatureStore.name, schema: FeatureStoreSchema },
        { name: OutboxItem.name, schema: OutboxItemSchema },
        { name: VirtualRace.name, schema: VirtualRaceSchema },
        { name: RaceParticipant.name, schema: RaceParticipantSchema },
        { name: Medal.name, schema: MedalSchema },
        { name: Organization.name, schema: OrganizationSchema },
        { name: Membership.name, schema: MembershipSchema },
        { name: Invite.name, schema: InviteSchema },
        { name: NewsItem.name, schema: NewsItemSchema },
      ]),
      // Gateway GraphQL (code-first, /graphql) sur le pipeline.
      GraphQLModule.forRoot<ApolloDriverConfig>({
        driver: ApolloDriver,
        autoSchemaFile: true,
        path: '/graphql',
      }),
    ]
  : [];

import { ReferralController } from './referral/referral.controller';
import { ReferralService } from './referral/referral.service';

import { AccountController } from './account/account.controller';
import { AccountService } from './account/account.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TwinModule,
    ObjectiveModule,
    MenuModule,
    ReceiptModule,
    FridgeModule,
    BarcodeModule,
    // Mongo is optional — only connect when MONGO_URI is set (docker-compose),
    // so the API boots standalone for Firestore/OFF/Redis-only endpoints.
    // Pool de connexions dimensionné pour la charge (100k users) : réutilise les
    // sockets Mongo au lieu d'en ouvrir/fermer par requête. serverSelectionTimeoutMS
    // borne l'attente si le primary est injoignable (évite les requêtes pendues).
    ...(HAS_MONGO
      ? [
          MongooseModule.forRoot(process.env.MONGO_URI!, {
            maxPoolSize: 50,
            minPoolSize: 5,
            serverSelectionTimeoutMS: 5000,
          }),
        ]
      : []),
    ...PIPELINE_FEATURES,
  ],
  controllers: [HealthController, UsersController, ReferralController, AccountController, FilesController, NutritionController, InsightsController, AiController, MlController, ...(HAS_MONGO ? [PipelineController, RacesController, OrgsController, NewsController] : [])],
  providers: [FirebaseService, RedisService, UsersService, ReferralService, AccountService, NutritionService, InsightsService, AiService, MlService, FastingGateway, ...(HAS_MONGO ? [PipelineService, PipelineResolver, RacesService, OrgsService, NewsService] : [])],
})
export class AppModule {}
