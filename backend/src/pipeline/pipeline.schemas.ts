import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

// Couche analytics/intégration (Lot 4 avancé). Miroir Mongo des données Firestore
// (CQRS : Firestore = write/temps-réel app ; Mongo = read/analytics admin).
// `tenantId` partout = multi-tenant / white-label ready.

@Schema({ timestamps: true, collection: 'mirror_events' })
export class MirrorEvent {
  @Prop({ index: true }) tenantId: string;
  @Prop({ index: true }) userId: string;
  @Prop({ index: true }) type: string;
  @Prop({ type: Object }) data: any;
  @Prop({ unique: true, sparse: true }) firestoreId: string; // dedup CDC
  @Prop({ index: true }) eventTs: number;
}
export const MirrorEventSchema = SchemaFactory.createForClass(MirrorEvent);

@Schema({ timestamps: true, collection: 'mirror_users' })
export class MirrorUser {
  @Prop({ index: true }) tenantId: string;
  @Prop({ unique: true }) userId: string;
  @Prop() email: string;
  @Prop() goal: string;
  @Prop() weight: number;
  @Prop({ type: Object }) profile: any;
}
export const MirrorUserSchema = SchemaFactory.createForClass(MirrorUser);

@Schema({ timestamps: true, collection: 'feature_store' })
export class FeatureStore {
  @Prop({ index: true }) tenantId: string;
  @Prop({ unique: true }) userId: string;
  @Prop({ type: Object }) features: any; // { events, mealsLogged, activities, weighIns, events7d, lastActiveTs, streakDays }
  @Prop({ index: true }) computedAt: number;
}
export const FeatureStoreSchema = SchemaFactory.createForClass(FeatureStore);

@Schema({ timestamps: true, collection: 'outbox' })
export class OutboxItem {
  @Prop({ index: true }) tenantId: string;
  @Prop({ index: true }) topic: string;
  @Prop() userId: string;
  @Prop({ type: Object }) payload: any;
  @Prop({ default: 'pending', index: true }) status: string; // pending | delivered | skipped | failed
  @Prop({ default: 0 }) attempts: number;
  @Prop() deliveredAt: number;
  @Prop({ unique: true, sparse: true }) dedupKey: string;
}
export const OutboxItemSchema = SchemaFactory.createForClass(OutboxItem);
