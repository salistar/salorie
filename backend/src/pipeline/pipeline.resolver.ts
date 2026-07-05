import { Resolver, Query, Args, Int, Float, ObjectType, Field } from '@nestjs/graphql';
import { PipelineService } from './pipeline.service';

// Gateway GraphQL (code-first) sur le miroir Mongo. Endpoint: /graphql.
// Les payloads JSON (data/features) sont renvoyés en String (JSON.stringify) pour
// éviter une dépendance scalaire JSON supplémentaire.

@ObjectType()
class PipelineStatus {
  @Field() tenant: string;
  @Field(() => Int) mirroredUsers: number;
  @Field(() => Int) mirroredEvents: number;
  @Field(() => Int) featureRows: number;
  @Field(() => Int) outboxPending: number;
}

@ObjectType()
class PipelineEvent {
  @Field() type: string;
  @Field({ nullable: true }) userId: string;
  @Field(() => Float, { nullable: true }) eventTs: number;
  @Field({ nullable: true }) dataJson: string;
}

@ObjectType()
class UserFeatures {
  @Field() userId: string;
  @Field({ nullable: true }) featuresJson: string;
}

@Resolver()
export class PipelineResolver {
  constructor(private pipeline: PipelineService) {}

  @Query(() => PipelineStatus, { description: 'Statut du pipeline analytics (miroir Mongo)' })
  pipelineStatus() { return this.pipeline.status(); }

  @Query(() => [PipelineEvent], { description: "Flux d'événements récents (Event Bus mirroré)" })
  async pipelineEvents(@Args('limit', { type: () => Int, nullable: true }) limit?: number) {
    const evs = await this.pipeline.recentEvents(Math.min(limit || 50, 200));
    return evs.map((e: any) => ({ type: e.type, userId: e.userId, eventTs: e.eventTs, dataJson: JSON.stringify(e.data || {}) }));
  }

  @Query(() => UserFeatures, { nullable: true, description: 'Features ML calculées pour un user' })
  async userFeatures(@Args('userId') userId: string) {
    const f: any = await this.pipeline.getFeatures(userId);
    if (!f) return null;
    return { userId: f.userId, featuresJson: JSON.stringify(f.features || {}) };
  }
}
