import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { VirtualRace } from './races.schemas';
import { RaceParticipant } from './races.schemas';
import { Medal } from './races.schemas';
import { FirebaseService } from '../firebase.service';

const TENANT = 'default';

@Injectable()
export class RacesService {
  private readonly logger = new Logger('RacesMilestones');
  constructor(
    @InjectModel(VirtualRace.name) private races: Model<VirtualRace>,
    @InjectModel(RaceParticipant.name) private parts: Model<RaceParticipant>,
    @InjectModel(Medal.name) private medals: Model<Medal>,
    private fb: FirebaseService,
  ) {}

  // ── Notifications de jalons (style The Conqueror) ────────────────────────────
  // Toutes les 15 min : pour chaque coureur en cours, si un palier 25/50/75/100%
  // vient d'être franchi (et pas déjà notifié), on envoie un push d'encouragement.
  @Cron(process.env.MILESTONE_CRON || '*/15 * * * *')
  async milestoneNotifications() {
    try {
      const races = await this.races.find({ tenantId: TENANT }).select('name totalKm').lean();
      const byId = new Map(races.map((r: any) => [String(r._id), r]));
      const parts = await this.parts.find({ finishedAt: null, cumulativeKm: { $gt: 0 } }).limit(500).lean();
      const STEPS = [25, 50, 75, 100];
      const ops: any[] = [];
      let sent = 0;
      for (const p of parts as any[]) {
        const race = byId.get(String(p.raceId));
        if (!race || !race.totalKm) continue;
        const pct = Math.min(100, (p.cumulativeKm / race.totalKm) * 100);
        const reached = STEPS.filter((s) => pct >= s && s > (p.notifiedMilestone || 0)).pop();
        if (!reached) continue;
        const token = await this.pushToken(p.userId);
        if (token) {
          const body = reached >= 100
            ? `🏅 Bravo ! Tu as terminé « ${race.name} ». Ta médaille t'attend.`
            : `🎉 ${reached}% de « ${race.name} » ! Continue, ta médaille approche.`;
          await this.sendPush(token, 'Salorie', body);
          sent++;
        }
        ops.push({ updateOne: { filter: { _id: p._id }, update: { $set: { notifiedMilestone: reached } } } });
      }
      if (ops.length) await this.parts.bulkWrite(ops);
      if (sent) this.logger.log(`jalons: ${sent} push envoyés (${ops.length} maj)`);
    } catch (e: any) {
      this.logger.warn(`milestone cron: ${e?.message}`);
    }
  }

  private async pushToken(userId: string): Promise<string | null> {
    try {
      const snap = await this.fb.db().collection('users').doc(userId).get();
      const tok = (snap.data() as any)?.pushToken;
      return typeof tok === 'string' && tok.startsWith('ExponentPushToken') ? tok : null;
    } catch { return null; }
  }
  private async sendPush(to: string, title: string, body: string) {
    try {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, title, body, sound: 'default', priority: 'high' }),
      });
    } catch { /* push best-effort */ }
  }

  // Valide les contraintes métier : total 80–2000 km, arrêts espacés de 20–100 km,
  // 1 départ + 1 arrivée. Lève BadRequest si invalide (l'admin voit l'erreur).
  // Validation assouplie : les défis courts (corniche 10 km, marathon 42 km…)
  // sont désormais gérés ici aussi (unification défis = courses virtuelles).
  private validate(dto: any) {
    const total = Number(dto.totalKm);
    if (!(total >= 1 && total <= 5000)) {
      throw new BadRequestException('La distance totale doit être entre 1 et 5000 km.');
    }
    const wps = Array.isArray(dto.waypoints) ? dto.waypoints : [];
    if (wps.length < 2) throw new BadRequestException('Il faut au moins un départ et une arrivée.');
    const sorted = [...wps].sort((a, b) => (a.atKm || 0) - (b.atKm || 0));
    for (let i = 1; i < sorted.length; i++) {
      const gap = (sorted[i].atKm || 0) - (sorted[i - 1].atKm || 0);
      if (gap < 0.5 || gap > 200) {
        throw new BadRequestException(`Chaque point doit être espacé de 0.5 à 200 km (écart trouvé: ${gap.toFixed(1)} km).`);
      }
    }
  }

  // ── Admin : CRUD courses ──
  async createRace(dto: any) {
    this.validate(dto);
    return this.races.create({ ...dto, tenantId: TENANT });
  }
  async updateRace(id: string, dto: any) {
    if (dto.totalKm != null || dto.waypoints) this.validate({ ...(await this.getRace(id)).toObject(), ...dto });
    const r = await this.races.findByIdAndUpdate(id, dto, { new: true });
    if (!r) throw new NotFoundException('Course introuvable');
    return r;
  }
  async deleteRace(id: string) { await this.races.findByIdAndDelete(id); return { ok: true }; }
  listRaces() { return this.races.find({ tenantId: TENANT }).sort({ createdAt: -1 }).lean(); }
  listActive() { return this.races.find({ tenantId: TENANT, active: true }).sort({ createdAt: -1 }).lean(); }
  async getRace(id: string) {
    const r = await this.races.findById(id);
    if (!r) throw new NotFoundException('Course introuvable');
    return r;
  }

  // ── App : participation ──
  async join(raceId: string, userId: string, email: string, userName: string) {
    const race = await this.getRace(raceId); // 404 si inexistante
    // On ne rejoint pas une course désactivée ou expirée.
    if (!race.active) throw new BadRequestException('Course inactive.');
    if (race.endDate && new Date(race.endDate as any).getTime() < Date.now()) throw new BadRequestException('Course terminée.');
    const existing = await this.parts.findOne({ raceId, userId });
    if (existing) return existing;
    return this.parts.create({ tenantId: TENANT, raceId, userId, email, userName, cumulativeKm: 0, startedAt: Date.now() });
  }
  async progress(raceId: string, userId: string, km: number) {
    const race = await this.getRace(raceId);
    const clamped = Math.max(0, Math.min(Number(km) || 0, race.totalKm));
    const p = await this.parts.findOneAndUpdate(
      { raceId, userId },
      { $set: { cumulativeKm: clamped } },
      { new: true },
    );
    if (!p) throw new NotFoundException('Participant introuvable (rejoins la course d\'abord).');
    // Auto-finish quand la distance totale est atteinte.
    if (clamped >= race.totalKm && !p.finishedAt) return this.finish(raceId, userId);
    return p;
  }
  async finish(raceId: string, userId: string) {
    const p = await this.parts.findOne({ raceId, userId });
    if (!p) throw new NotFoundException('Participant introuvable');
    if (!p.finishedAt) {
      p.finishedAt = Date.now();
      // rang = nombre de finishers avant lui + 1
      const before = await this.parts.countDocuments({ raceId, finishedAt: { $ne: null, $lt: p.finishedAt } });
      p.rank = before + 1;
      await p.save();
      // Médaille immédiate (finir une course → médaille visible direct dans l'app).
      const race = await this.getRace(raceId);
      const timeLabel = this.fmtDuration((p.finishedAt || 0) - (p.startedAt || p.finishedAt || 0));
      await this.medals.findOneAndUpdate(
        { raceId, userId },
        { $set: { tenantId: TENANT, raceName: race.name, userName: p.userName, rank: p.rank, frame: race.medalFrame, spec: race.medalSpec, distanceKm: race.totalKm, timeLabel, startDate: race.startDate, endDate: race.endDate } },
        { upsert: true },
      );
    }
    return p;
  }
  leaderboard(raceId: string) {
    // fix PII : ne pas exposer les emails des participants dans le classement
    return this.parts.find({ raceId }).select('userId userName imageUrl cumulativeKm rank finishedAt startedAt').sort({ finishedAt: 1, cumulativeKm: -1 }).limit(500).lean();
  }

  // ── Médailles ──
  // Génère/rafraîchit les médailles de tous les finishers d'une course, avec le
  // classement (rang) et le cadre choisi. Idempotent (upsert par user+course).
  async generateMedals(raceId: string) {
    const race = await this.getRace(raceId);
    const finishers = await this.parts.find({ raceId, finishedAt: { $ne: null } }).sort({ finishedAt: 1 }).lean();
    // bulkWrite : 2 requêtes au total quel que soit le nombre de finishers (vs N+1).
    const medalOps: any[] = [];
    const partOps: any[] = [];
    finishers.forEach((f: any, i: number) => {
      const rank = i + 1;
      const timeLabel = this.fmtDuration((f.finishedAt || 0) - (f.startedAt || f.finishedAt || 0));
      medalOps.push({
        updateOne: {
          filter: { raceId, userId: f.userId },
          update: { $set: { tenantId: TENANT, raceName: race.name, userName: f.userName, rank, frame: race.medalFrame, spec: race.medalSpec, distanceKm: race.totalKm, timeLabel, startDate: race.startDate, endDate: race.endDate } },
          upsert: true,
        },
      });
      partOps.push({ updateOne: { filter: { _id: f._id }, update: { $set: { rank } } } });
    });
    if (medalOps.length) await this.medals.bulkWrite(medalOps);
    if (partOps.length) await this.parts.bulkWrite(partOps);
    return { count: medalOps.length };
  }
  getUserMedals(userId: string) {
    return this.medals.find({ userId }).sort({ createdAt: -1 }).lean();
  }
  // Admin : historique de TOUTES les médailles générées (par email/user).
  listAllMedals(max = 400) {
    return this.medals.find({ tenantId: TENANT }).sort({ createdAt: -1 }).limit(max).lean();
  }
  setMedalPhoto(medalId: string, photoUrl: string) {
    return this.medals.findByIdAndUpdate(medalId, { $set: { photoUrl } }, { new: true });
  }

  private fmtDuration(ms: number): string {
    if (!ms || ms < 0) return '';
    const totalMin = Math.round(ms / 60000);
    const h = Math.floor(totalMin / 60), m = totalMin % 60;
    return h > 0 ? `${h}h ${m}min` : `${m}min`;
  }
}
