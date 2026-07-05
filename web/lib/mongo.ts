// Connexion MongoDB (mongoose) — réutilisée à travers les hot-reloads / lambdas.
import mongoose from 'mongoose';

let cached: Promise<typeof mongoose> | null = (global as any)._salorieMongo || null;

export function db(): Promise<typeof mongoose> {
  if (!cached) {
    const uri = process.env.MONGO_URI || 'mongodb://mongo:27017/salorie';
    cached = mongoose.connect(uri);
    (global as any)._salorieMongo = cached;
  }
  return cached;
}
