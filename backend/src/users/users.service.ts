import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../firebase.service';
import { RedisService } from '../redis.service';

@Injectable()
export class UsersService {
  constructor(private fb: FirebaseService, private redis: RedisService) {}

  // List users from Firestore, cached in Redis for 60s to spare reads.
  async list(max = 200) {
    const cacheKey = `users:list:${max}`;
    const cached = await this.redis.getJSON<any[]>(cacheKey);
    if (cached) return { source: 'cache', count: cached.length, users: cached };

    const snap = await this.fb.db().collection('users').limit(max).get();
    const users = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    await this.redis.setJSON(cacheKey, users, 60);
    return { source: 'firestore', count: users.length, users };
  }

  async get(id: string) {
    const snap = await this.fb.db().collection('users').doc(id).get();
    return snap.exists ? { id: snap.id, ...(snap.data() as any) } : null;
  }
}
