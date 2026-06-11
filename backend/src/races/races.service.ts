import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { VirtualRace } from './races.schemas';
import { RaceParticipant } from './races.schemas';
import { Medal } from './races.schemas';

const TENANT = 'default';

@Injectable()
export class RacesService {
  constructor(
    @InjectModel(VirtualRace.name) private races: Model<VirtualRace>,
    @InjectModel(RaceParticipant.name) private parts: Model<RaceParticipant>,
    @InjectModel(Medal.name) private medals: Model<Medal>,
  ) {}

  // Valide les contraintes métier : total 80–2000 km, arrêts espacés de 20–100 km,
  // 1 départ + 1 arrivée. Lève BadRequest si invalide (l'admin voit l'erreur).
  private validate(dto: any) {
    const total = Number(dto.totalKm);
    if (!(total >= 80 && total <= 2000)) {
      throw new BadRequestException('La distance totale doit être entre 80 et 2000 km.');
    }
    const wps = Array.isArray(dto.waypoints) ? dto.waypoints : [];
    if (wps.length < 2) throw new BadRequestException('Il faut au moins un départ et une arrivée.');
    const sorted = [...wps].sort((a, b) => (a.atKm || 0) - (b.atKm || 0));
    for (let i = 1; i < sorted.length; i++) {
      const gap = (sorted[i].atKm || 0) - (sorted[i - 1].atKm || 0);
      if (gap < 20 || gap > 100) {
        throw new BadRequestException(`Chaque point doit être espacé de 20 à 100 km (écart trouvé: ${gap.toFixed(0)} km).`);
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
    await this.getRace(raceId); // 404 si inexistante
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
    return this.parts.find({ raceId }).sort({ finishedAt: 1, cumulativeKm: -1 }).limit(500).lean();
  }

  // ── Médailles ──
  // Génère/rafraîchit les médailles de tous les finishers d'une course, avec le
  // classement (rang) et le cadre choisi. Idempotent (upsert par user+course).
  async generateMedals(raceId: string) {
    const race = await this.getRace(raceId);
    const finishers = await this.parts.find({ raceId, finishedAt: { $ne: null } }).sort({ finishedAt: 1 }).lean();
    const out = [];
    for (let i = 0; i < finishers.length; i++) {
      const f = finishers[i];
      const rank = i + 1;
      const durMs = (f.finishedAt || 0) - (f.startedAt || f.finishedAt || 0);
      const timeLabel = this.fmtDuration(durMs);
      const medal = await this.medals.findOneAndUpdate(
        { raceId, userId: f.userId },
        {
          $set: {
            tenantId: TENANT, raceName: race.name, userName: f.userName, rank,
            frame: race.medalFrame, spec: race.medalSpec, distanceKm: race.totalKm, timeLabel,
            startDate: race.startDate, endDate: race.endDate,
          },
        },
        { new: true, upsert: true },
      );
      // synchronise le rang sur le participant
      await this.parts.updateOne({ _id: f._id }, { $set: { rank } });
      out.push(medal);
    }
    return { count: out.length, medals: out };
  }
  getUserMedals(userId: string) {
    return this.medals.find({ userId }).sort({ createdAt: -1 }).lean();
  }
  // Admin : historique de TOUTES les médailles générées (par email/user).
  listAllMedals(max = 400) {
    return this.medals.find().sort({ createdAt: -1 }).limit(max).lean();
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
