import { Resolver, Query, Args, Int, Float, ObjectType, Field, Context, GqlExecutionContext } from '@nestjs/graphql';
import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UseGuards } from '@nestjs/common';
import { PipelineService } from './pipeline.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';

// Gateway GraphQL (code-first) sur le miroir Mongo. Endpoint: /graphql.
// Les payloads JSON (data/features) sont renvoyés en String (JSON.stringify) pour
// éviter une dépendance scalaire JSON supplémentaire.
//
// SÉCURITÉ (S3): ces resolvers étaient OUVERTS (anonyme). On applique le même
// FirebaseAuthGuard que les controllers REST. Comme le guard résout la requête via
// switchToHttp(), on l'enveloppe pour extraire la requête du contexte GraphQL
// (GqlExecutionContext.getContext().req) tout en réutilisant sa vérification de token.

@Injectable()
class GqlFirebaseAuthGuard extends FirebaseAuthGuard implements CanActivate {
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const gqlReq = GqlExecutionContext.create(ctx).getContext()?.req;
    // Réutilise la logique de vérification Firebase du guard de base en lui
    // présentant un contexte dont switchToHttp().getRequest() renvoie la requête GraphQL.
    const httpLike = {
      ...ctx,
      switchToHttp: () => ({ getRequest: () => gqlReq, getResponse: () => undefined, getNext: () => undefined }),
    } as unknown as ExecutionContext;
    return super.canActivate(httpLike);
  }
}

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
@UseGuards(GqlFirebaseAuthGuard)
export class PipelineResolver {
  constructor(private pipeline: PipelineService) {}

  // S-fix (IDOR) : le statut global et le flux d'événements CROISENT tous les utilisateurs
  // → réservés au back-office (X-Admin-Key dans l'en-tête GraphQL). userFeatures reste
  // self-only (garde plus bas). Un simple token Firebase ne donne plus la vue globale.
  private assertAdmin(ctx: any) {
    const key = process.env.ADMIN_API_KEY;
    const k = ctx?.req?.headers?.['x-admin-key'];
    if (!key || k !== key) throw new ForbiddenException('Réservé à l\'administration');
  }

  @Query(() => PipelineStatus, { description: 'Statut du pipeline analytics (miroir Mongo)' })
  pipelineStatus(@Context() ctx: any) { this.assertAdmin(ctx); return this.pipeline.status(); }

  @Query(() => [PipelineEvent], { description: "Flux d'événements récents (Event Bus mirroré)" })
  async pipelineEvents(@Args('limit', { type: () => Int, nullable: true }) limit: number | undefined, @Context() ctx: any) {
    this.assertAdmin(ctx);
    const evs = await this.pipeline.recentEvents(Math.min(limit || 50, 200));
    return evs.map((e: any) => ({ type: e.type, userId: e.userId, eventTs: e.eventTs, dataJson: JSON.stringify(e.data || {}) }));
  }

  @Query(() => UserFeatures, { nullable: true, description: 'Features ML calculées pour le user authentifié' })
  async userFeatures(@Args('userId') userId: string, @Context() ctx: any) {
    // Restreint au user courant : on ne peut lire que ses propres features (anti-IDOR).
    const uid = ctx?.req?.user?.uid;
    if (!uid || userId !== uid) throw new ForbiddenException('Forbidden');
    const f: any = await this.pipeline.getFeatures(userId);
    if (!f) return null;
    return { userId: f.userId, featuresJson: JSON.stringify(f.features || {}) };
  }
}
