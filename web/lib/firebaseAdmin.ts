import admin from 'firebase-admin';

// Initialise the Firebase Admin SDK once, from the service-account JSON in
// FIREBASE_SERVICE_ACCOUNT (same key the mobile token service uses).
function init() {
  if (admin.apps.length) return admin.app();
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT env is missing');
  const cred = JSON.parse(raw);
  return admin.initializeApp({ credential: admin.credential.cert(cred) });
}

export function db() {
  init();
  return admin.firestore();
}

export interface AdminUser {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  goal?: string;
  weight?: number;
  createdAt?: any;
  [k: string]: any;
}

export async function listUsers(max = 200): Promise<AdminUser[]> {
  const snap = await db().collection('users').limit(max).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}

export async function countSub(userId: string, sub: string): Promise<number> {
  try {
    const s = await db().collection('users').doc(userId).collection(sub).count().get();
    return s.data().count;
  } catch { return 0; }
}
