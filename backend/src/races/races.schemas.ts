import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

// Système Courses virtuelles + Médailles (admin → Mongo). 100% additif.
// tenantId partout = multi-tenant / white-label ready (cohérent avec le pipeline).

// Un point du parcours : départ, arrêt(s) intermédiaire(s), arrivée.
@Schema({ _id: false })
export class Waypoint {
  @Prop({ required: true }) kind: string;            // 'start' | 'stop' | 'end'
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) lat: number;
  @Prop({ required: true }) lng: number;
  @Prop({ default: 0 }) atKm: number;                // distance cumulée depuis le départ
  @Prop({ default: 'streetview' }) mediaType: string; // 'photo' | 'video' | 'both' | 'streetview'
  @Prop({ type: [String], default: [] }) mediaUrls: string[]; // MinIO /files urls OU street view
  @Prop({ default: '' }) description: string;
}
export const WaypointSchema = SchemaFactory.createForClass(Waypoint);

@Schema({ timestamps: true, collection: 'virtual_races' })
export class VirtualRace {
  @Prop({ index: true, default: 'default' }) tenantId: string;
  @Prop({ required: true }) name: string;
  @Prop({ default: '' }) description: string;
  @Prop({ default: '' }) emoji: string;
  @Prop({ required: true }) totalKm: number;          // 80–2000 (validé au service)
  @Prop({ default: 30 }) timeLimitDays: number;       // temps imparti pour finir
  @Prop() startDate: Date;                            // plage A
  @Prop() endDate: Date;                              // plage B
  @Prop({ default: 'rabat' }) medalFrame: string;     // thème du cadre médaille
  @Prop({ type: [WaypointSchema], default: [] }) waypoints: Waypoint[];
  @Prop({ default: true, index: true }) active: boolean;
}
export const VirtualRaceSchema = SchemaFactory.createForClass(VirtualRace);

@Schema({ timestamps: true, collection: 'race_participants' })
export class RaceParticipant {
  @Prop({ index: true, default: 'default' }) tenantId: string;
  @Prop({ index: true, required: true }) raceId: string;
  @Prop({ index: true, required: true }) userId: string;   // uid Firebase
  @Prop() email: string;
  @Prop() userName: string;
  @Prop({ default: 0 }) cumulativeKm: number;
  @Prop() startedAt: number;
  @Prop({ index: true }) finishedAt: number;               // null = non terminé
  @Prop({ default: 0 }) rank: number;                      // classement (0 = pas encore)
}
export const RaceParticipantSchema = SchemaFactory.createForClass(RaceParticipant);

@Schema({ timestamps: true, collection: 'medals' })
export class Medal {
  @Prop({ index: true, default: 'default' }) tenantId: string;
  @Prop({ index: true, required: true }) raceId: string;
  @Prop() raceName: string;
  @Prop({ index: true, required: true }) userId: string;
  @Prop() userName: string;
  @Prop({ default: 0 }) rank: number;                      // classement final
  @Prop({ default: 'rabat' }) frame: string;               // thème du cadre (SVG)
  @Prop({ default: 0 }) distanceKm: number;
  @Prop({ default: '' }) timeLabel: string;                // ex "4h 28min"
  @Prop() startDate: Date;
  @Prop() endDate: Date;
  @Prop({ default: '' }) photoUrl: string;                 // photo glissée dans la médaille
}
export const MedalSchema = SchemaFactory.createForClass(Medal);
