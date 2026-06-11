import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

// Fondation B2B multi-tenant PARTAGÉE par les 4 personas (coach / club / assureur
// / white-label). Un persona = un `type` d'organisation + des features superposées.
// 100% additif.

@Schema({ _id: false })
export class Branding {
  @Prop({ default: '' }) logoUrl: string;
  @Prop({ default: '#2E8B57' }) primaryColor: string;
  @Prop({ default: '' }) domain: string; // white-label
}
export const BrandingSchema = SchemaFactory.createForClass(Branding);

@Schema({ timestamps: true, collection: 'organizations' })
export class Organization {
  @Prop({ required: true }) name: string;
  @Prop({ required: true, index: true }) type: string;      // 'coach' | 'club' | 'insurer' | 'whitelabel'
  @Prop({ unique: true, sparse: true }) slug: string;
  @Prop({ type: BrandingSchema, default: {} }) branding: Branding;
  @Prop({ index: true }) ownerUserId: string;               // uid Firebase du propriétaire
  @Prop({ default: 'trial' }) plan: string;                 // trial | active | suspended
  @Prop({ default: 0 }) seats: number;                      // licences (0 = illimité)
  @Prop({ default: true, index: true }) active: boolean;
}
export const OrganizationSchema = SchemaFactory.createForClass(Organization);

@Schema({ timestamps: true, collection: 'org_memberships' })
export class Membership {
  @Prop({ index: true, required: true }) orgId: string;
  @Prop({ index: true, required: true }) userId: string;    // uid Firebase
  @Prop() email: string;
  @Prop() userName: string;
  // owner | admin | coach | member | client (selon le type d'org)
  @Prop({ default: 'member', index: true }) role: string;
  @Prop({ default: 'active' }) status: string;              // active | invited | removed
  @Prop({ index: true }) coachUserId: string;               // pour un client rattaché à un coach
}
export const MembershipSchema = SchemaFactory.createForClass(Membership);

@Schema({ timestamps: true, collection: 'org_invites' })
export class Invite {
  @Prop({ index: true, required: true }) orgId: string;
  @Prop({ unique: true, required: true }) code: string;     // code/lien d'invitation
  @Prop({ default: 'member' }) role: string;
  @Prop({ default: '' }) email: string;                     // optionnel : invite ciblée
  @Prop() coachUserId: string;
  @Prop() usedBy: string;                                   // uid qui a utilisé l'invite
  @Prop() expiresAt: number;
}
export const InviteSchema = SchemaFactory.createForClass(Invite);
