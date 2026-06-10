import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FirebaseService } from '../firebase.service';
import { MirrorEvent, MirrorUser, FeatureStore, OutboxItem } from './pipeline.schemas';

@Injectable()
export class PipelineService {
  private readonly logger = new Logger('Pipeline');
  private readonly TENANT = process.env.TENANT_ID || 'salorie';
  private readonly WEBHOOK_URL = process.env.OUTBOX_WEBHOOK_URL || '';

  constructor(
    private fb: FirebaseService,
    @InjectModel(MirrorEvent.name) private events: Model<any>,
    @InjectModel(MirrorUser.name) private users: Model<any>,
    @InjectModel(FeatureStore.name) private features: Model<any>,
    @InjectModel(OutboxItem.name) private outbox: Model<any>,
  ) {}

  // CDC : Firestore → Mongo toutes les 5 min (+ feature store + outbox).
  @Cron('*/5 * * * *')
  async cron() { try { await this.runCdc(); } catch (e: any) { this.logger.warn('CDC: ' + e.message); } }

  async runCdc() {
    const db = this.fb.db();
    // 1) Miroir users
    const usersSnap = await db.collection('users').limit(1000).get();
    let mUsers = 0;
    for (const u of usersSnap.docs) {
      const d = u.data() as any;
      await this.users.updateOne(
        { userId: u.id },
        { $set: { tenantId: this.TENANT, userId: u.id, email: d.email, goal: d.goal, weight: d.weight, profile: d } },
        { upsert: true },
      );
      mUsers++;
    }
    // 2) Miroir events (Event Bus) — sous-collections users/{id}/events lues via
    // collectionGroup (sans orderBy → pas d'index requis) ; dédup par chemin Firestore.
    const evSnap = await db.collectionGroup('events').limit(2000).get().catch(() => null);
    let mEvents = 0;
    if (evSnap) {
      for (const e of evSnap.docs) {
        const d = e.data() as any;
        const ts = d.timestamp?._seconds ? d.timestamp._seconds * 1000 : (d.timestamp?.toMillis?.() ?? Date.now());
        const r = await this.events.updateOne(
          { firestoreId: e.ref.path },
          { $set: { tenantId: this.TENANT, userId: d.userId, type: d.type, data: d.data || {}, firestoreId: e.ref.path, eventTs: ts } },
          { upsert: true },
        );
        if ((r as any).upsertedCount) mEvents++;
      }
    }
    // 3) ML feature store + 4) outbox
    await this.recomputeFeatures();
    await this.deliverOutbox();
    const res = { tenant: this.TENANT, users: mUsers, newEvents: mEvents };
    this.logger.log('CDC done: ' + JSON.stringify(res));
    return res;
  }

  // ML feature store : agrège les events par user → features (lues par app/admin/ML)
  async recomputeFeatures() {
    const now = Date.now();
    const weekAgo = now - 7 * 86400000;
    const agg = await this.events.aggregate([
      { $match: { tenantId: this.TENANT } },
      { $group: {
        _id: '$userId',
        events: { $sum: 1 },
        mealsLogged: { $sum: { $cond: [{ $eq: ['$type', 'meal_logged'] }, 1, 0] } },
        activities: { $sum: { $cond: [{ $eq: ['$type', 'activity_logged'] }, 1, 0] } },
        weighIns: { $sum: { $cond: [{ $eq: ['$type', 'weight_logged'] }, 1, 0] } },
        runs: { $sum: { $cond: [{ $eq: ['$type', 'run_completed'] }, 1, 0] } },
        races: { $sum: { $cond: [{ $eq: ['$type', 'race_completed'] }, 1, 0] } },
        fasts: { $sum: { $cond: [{ $eq: ['$type', 'fast_completed'] }, 1, 0] } },
        racesJoined: { $sum: { $cond: [{ $eq: ['$type', 'race_joined'] }, 1, 0] } },
        challengesJoined: { $sum: { $cond: [{ $eq: ['$type', 'challenge_joined'] }, 1, 0] } },
        events7d: { $sum: { $cond: [{ $gte: ['$eventTs', weekAgo] }, 1, 0] } },
        lastActiveTs: { $max: '$eventTs' },
      } },
    ]);
    for (const a of agg) {
      if (!a._id) continue;
      const features = {
        events: a.events, mealsLogged: a.mealsLogged, activities: a.activities,
        weighIns: a.weighIns, runs: a.runs, races: a.races, fasts: a.fasts,
        racesJoined: a.racesJoined, challengesJoined: a.challengesJoined,
        events7d: a.events7d, lastActiveTs: a.lastActiveTs,
      };
      await this.features.updateOne(
        { userId: a._id },
        { $set: { tenantId: this.TENANT, userId: a._id, features, computedAt: now } },
        { upsert: true },
      );
      // Outbox : jalon "actif cette semaine" (≥5 events sur 7j) → webhook idempotent/jour
      if (a.events7d >= 5) {
        await this.enqueueOutbox('user.active_week', a._id, { events7d: a.events7d }, `active_week:${a._id}:${new Date(now).toISOString().slice(0, 10)}`);
      }
    }
  }

  // Transactional outbox : enqueue idempotent (dedupKey)
  async enqueueOutbox(topic: string, userId: string, payload: any, dedupKey: string) {
    try {
      await this.outbox.updateOne(
        { dedupKey },
        { $setOnInsert: { tenantId: this.TENANT, topic, userId, payload, status: 'pending', attempts: 0, dedupKey } },
        { upsert: true },
      );
    } catch { /* doublon → ignoré */ }
  }

  // Livraison webhooks : POST vers OUTBOX_WEBHOOK_URL si configuré, sinon "skipped".
  async deliverOutbox(max = 50) {
    const pending = await this.outbox.find({ status: 'pending' }).limit(max);
    for (const item of pending) {
      if (!this.WEBHOOK_URL) {
        item.status = 'skipped'; item.deliveredAt = Date.now(); await item.save();
        continue;
      }
      try {
        const res = await fetch(this.WEBHOOK_URL, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic: item.topic, userId: item.userId, payload: item.payload, tenantId: item.tenantId }),
        });
        item.status = (res as any).ok ? 'delivered' : 'failed';
        item.attempts += 1; item.deliveredAt = Date.now(); await item.save();
      } catch {
        item.attempts += 1; item.status = item.attempts >= 5 ? 'failed' : 'pending'; await item.save();
      }
    }
  }

  // ── Lectures admin (REST) ──
  async status() {
    const [users, events, feats, outboxPending] = await Promise.all([
      this.users.countDocuments({ tenantId: this.TENANT }),
      this.events.countDocuments({ tenantId: this.TENANT }),
      this.features.countDocuments({ tenantId: this.TENANT }),
      this.outbox.countDocuments({ tenantId: this.TENANT, status: 'pending' }),
    ]);
    return { tenant: this.TENANT, mirroredUsers: users, mirroredEvents: events, featureRows: feats, outboxPending };
  }
  getFeatures(userId: string) { return this.features.findOne({ userId }).lean(); }
  recentEvents(limit = 50) { return this.events.find({ tenantId: this.TENANT }).sort({ eventTs: -1 }).limit(limit).lean(); }
  outboxItems(limit = 50) { return this.outbox.find({ tenantId: this.TENANT }).sort({ createdAt: -1 }).limit(limit).lean(); }
}
