import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

// Journal / actualités de l'app : publié depuis le back-office web, lu par
// l'écran "Journal" de l'app (actus, annonces de courses, défis, mises à jour).
@Schema({ timestamps: true })
export class NewsItem {
  @Prop({ default: 'default' }) tenantId: string;
  @Prop({ required: true }) title: string;
  @Prop({ default: '' }) body: string;
  // news | race | challenge | update — détermine l'icône/couleur côté app.
  @Prop({ default: 'news' }) kind: string;
  @Prop({ default: '' }) imageUrl: string;
  @Prop({ default: true }) active: boolean;
}
export const NewsItemSchema = SchemaFactory.createForClass(NewsItem);
// listActive : find({ tenantId, active }).sort({ createdAt: -1 }).limit(N) ; listAll : find({ tenantId }).sort({ createdAt: -1 }).
NewsItemSchema.index({ tenantId: 1, active: 1, createdAt: -1 });
