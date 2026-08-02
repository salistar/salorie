import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose, { Schema } from 'mongoose';

// Test d'INTÉGRATION (vrai MongoDB en mémoire) du pattern bulkWrite-upsert non ordonné
// utilisé par le miroir CDC (fix N+1 pipeline). Vérifie : insertion, idempotence (re-run
// = 0 nouveau, pas de doublon), et mise à jour ciblée.
describe('Pipeline CDC bulkWrite (mongodb-memory-server)', () => {
  let mongod: MongoMemoryServer;
  let Model: mongoose.Model<any>;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    Model = mongoose.model(
      'MirrorUserTest',
      new Schema({ userId: { type: String, index: true }, email: String, goal: String }, { strict: false }),
    );
  }, 120000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
  });

  beforeEach(async () => {
    await Model.deleteMany({});
  });

  const opsFor = (docs: any[]) =>
    docs.map((d) => ({ updateOne: { filter: { userId: d.userId }, update: { $set: d }, upsert: true } }));

  it('insère via bulkWrite non ordonné (upsertedCount correct)', async () => {
    const r = await Model.bulkWrite(
      opsFor([{ userId: 'u1', email: 'a@x.com', goal: 'lose' }, { userId: 'u2', email: 'b@x.com', goal: 'gain' }]),
      { ordered: false },
    );
    expect(r.upsertedCount).toBe(2);
    expect(await Model.countDocuments()).toBe(2);
  });

  it('idempotent : re-run identique → 0 nouveau, aucun doublon', async () => {
    const ops = opsFor([{ userId: 'u1', email: 'a@x.com', goal: 'lose' }]);
    await Model.bulkWrite(ops, { ordered: false });
    const r2 = await Model.bulkWrite(ops, { ordered: false });
    expect(r2.upsertedCount).toBe(0);
    expect(await Model.countDocuments()).toBe(1);
  });

  it('met à jour un champ existant sans créer de doublon', async () => {
    await Model.bulkWrite(opsFor([{ userId: 'u1', email: 'a@x.com', goal: 'lose' }]), { ordered: false });
    await Model.bulkWrite([{ updateOne: { filter: { userId: 'u1' }, update: { $set: { goal: 'maintain' } }, upsert: true } }], { ordered: false });
    expect((await Model.findOne({ userId: 'u1' }))?.goal).toBe('maintain');
    expect(await Model.countDocuments()).toBe(1);
  });

  it('gère un gros lot (500 upserts) en un appel', async () => {
    const big = Array.from({ length: 500 }, (_, i) => ({ userId: `u${i}`, email: `u${i}@x.com`, goal: 'maintain' }));
    const r = await Model.bulkWrite(opsFor(big), { ordered: false });
    expect(r.upsertedCount).toBe(500);
    expect(await Model.countDocuments()).toBe(500);
  });
});
