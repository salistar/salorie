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
