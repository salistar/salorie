import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomBytes } from 'crypto';
import { Organization } from './orgs.schemas';
import { Membership } from './orgs.schemas';
import { Invite } from './orgs.schemas';

const TYPES = ['coach', 'club', 'insurer', 'whitelabel'];

@Injectable()
export class OrgsService {
  constructor(
    @InjectModel(Organization.name) private orgs: Model<Organization>,
    @InjectModel(Membership.name) private members: Model<Membership>,
    @InjectModel(Invite.name) private invites: Model<Invite>,
  ) {}

  // ── Admin : CRUD organisations ──
  async createOrg(dto: any) {
    if (!TYPES.includes(dto.type)) throw new BadRequestException(`type doit être: ${TYPES.join(' | ')}`);
    const slug = (dto.slug || dto.name || '').toString().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || undefined;
    const org = await this.orgs.create({ ...dto, slug });
    // le propriétaire devient owner si fourni
    if (dto.ownerUserId) {
      await this.members.create({ orgId: String(org._id), userId: dto.ownerUserId, email: dto.ownerEmail || '', userName: dto.ownerName || '', role: 'owner', status: 'active' });
    }
    return org;
  }
  listOrgs() { return this.orgs.find().sort({ createdAt: -1 }).lean(); }
  async getOrg(id: string) { const o = await this.orgs.findById(id); if (!o) throw new NotFoundException('Org introuvable'); return o; }
  updateOrg(id: string, dto: any) { return this.orgs.findByIdAndUpdate(id, dto, { new: true }); }
  async deleteOrg(id: string) { await this.orgs.findByIdAndDelete(id); await this.members.deleteMany({ orgId: id }); await this.invites.deleteMany({ orgId: id }); return { ok: true }; }

  // ── Invitations ──
  async createInvite(orgId: string, role = 'member', email = '', coachUserId?: string) {
    await this.getOrg(orgId);
    const code = randomBytes(4).toString('hex').toUpperCase(); // 8 hex
    return this.invites.create({ orgId, code, role, email, coachUserId, expiresAt: Date.now() + 30 * 86400000 });
  }
  listInvites(orgId: string) { return this.invites.find({ orgId, usedBy: { $exists: false } }).sort({ createdAt: -1 }).lean(); }

  async joinByCode(userId: string, email: string, userName: string, code: string) {
    const inv = await this.invites.findOne({ code: (code || '').toUpperCase() });
    if (!inv) throw new NotFoundException('Code d\'invitation invalide');
    if (inv.expiresAt && Date.now() > inv.expiresAt) throw new BadRequestException('Invitation expirée');
    if (inv.email && inv.email.toLowerCase() !== (email || '').toLowerCase()) throw new BadRequestException('Cette invitation est réservée à un autre email');
    const existing = await this.members.findOne({ orgId: inv.orgId, userId });
    if (existing) return existing;
    const m = await this.members.create({ orgId: inv.orgId, userId, email, userName, role: inv.role, status: 'active', coachUserId: inv.coachUserId });
    if (!inv.usedBy) { inv.usedBy = userId; await inv.save(); }
    return m;
  }

  // ── Membres / clients ──
  listMembers(orgId: string) { return this.members.find({ orgId, status: { $ne: 'removed' } }).sort({ createdAt: -1 }).lean(); }
  // fix IDOR : verifier l'appartenance / les droits avant d'exposer les membres d'une org
  async isActiveMember(orgId: string, userId: string) { return !!(await this.members.findOne({ orgId, userId, status: 'active' })); }
  async canManageOrg(orgId: string, userId: string) { const m: any = await this.members.findOne({ orgId, userId, status: 'active' }); return !!m && (m.role === 'owner' || m.role === 'coach'); }
  async removeMember(orgId: string, userId: string) { await this.members.updateOne({ orgId, userId }, { $set: { status: 'removed' } }); return { ok: true }; }

  // Organisations d'un utilisateur (avec le détail de l'org).
  async myOrgs(userId: string) {
    const mems = await this.members.find({ userId, status: 'active' }).lean();
    const ids = mems.map((m) => m.orgId);
    const orgs = await this.orgs.find({ _id: { $in: ids }, active: true }).lean();
    const byId: Record<string, any> = {};
    orgs.forEach((o) => (byId[String(o._id)] = o));
    return mems.map((m) => ({ membership: m, org: byId[m.orgId] })).filter((x) => x.org);
  }
  // Clients rattachés à un coach (pour l'espace coach).
  clientsOfCoach(coachUserId: string) {
    return this.members.find({ coachUserId, status: 'active' }).sort({ createdAt: -1 }).lean();
  }
}
