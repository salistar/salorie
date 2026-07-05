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
  // orgId/userId : couverts par l'index composé { orgId, userId } (voir bas de fichier).
  @Prop({ required: true }) orgId: string;
  @Prop({ required: true }) userId: string;    // uid Firebase
  @Prop() email: string;
  @Prop() userName: string;
  // owner | admin | coach | member | client (selon le type d'org)
  @Prop({ default: 'member' }) role: string;
  @Prop({ default: 'active' }) status: string;              // active | invited | removed
  @Prop() coachUserId: string;               // pour un client rattaché à un coach
}
export const MembershipSchema = SchemaFactory.createForClass(Membership);
// isActiveMember/canManageOrg/join : findOne({ orgId, userId[, status] }).
MembershipSchema.index({ orgId: 1, userId: 1 });
// listMembers : find({ orgId, status }).sort({ createdAt: -1 }).
MembershipSchema.index({ orgId: 1, status: 1 });
// myOrgs : find({ userId, status: 'active' }).
MembershipSchema.index({ userId: 1, status: 1 });
// clientsOfCoach : find({ coachUserId, status: 'active' }).sort({ createdAt: -1 }).
MembershipSchema.index({ coachUserId: 1, status: 1 });

@Schema({ timestamps: true, collection: 'org_invites' })
export class Invite {
  @Prop({ required: true }) orgId: string;
  @Prop({ unique: true, required: true }) code: string;     // code/lien d'invitation (index unique → lookup joinByCode)
  @Prop({ default: 'member' }) role: string;
  @Prop({ default: '' }) email: string;                     // optionnel : invite ciblée
  @Prop() coachUserId: string;
  @Prop() usedBy: string;                                   // uid qui a utilisé l'invite
  @Prop() expiresAt: number;
}
export const InviteSchema = SchemaFactory.createForClass(Invite);
// listInvites : find({ orgId, usedBy: { $exists: false } }).sort({ createdAt: -1 }).
InviteSchema.index({ orgId: 1, createdAt: -1 });
