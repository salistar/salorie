// Social — amis & classement, 100% sur Firestore (pas de backend dédié).
// Chaque user publie un petit `publicStats` { name, imageUrl, streak, daysTracked }
// sur son doc users/{docId}; les amis sont une liste d'emails sur ce même doc.
// Le classement lit les publicStats de soi + de ses amis et les trie par streak.
//
// NOTE sécurité : tant que les règles Firestore sont ouvertes (cf. audit C2),
// ces données sont lisibles publiquement. À durcir via le bridge Clerk→Firebase.
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, emailToDocId } from './firebase';

export interface PublicStats {
  name?: string;
  imageUrl?: string;
  streak: number;
  daysTracked: number;
}

export interface LeaderRow {
  email: string;
  name: string;
  imageUrl?: string;
  streak: number;
  daysTracked: number;
  isMe: boolean;
}

const norm = (e: string) => e.trim().toLowerCase();

/** Publishes the current user's public stats so friends can see them on the board. */
export async function publishStats(email: string, stats: PublicStats): Promise<void> {
  try {
    const ref = doc(db, 'users', emailToDocId(email));
    await setDoc(ref, {
      publicStats: {
        name: stats.name || '',
        imageUrl: stats.imageUrl || '',
        streak: stats.streak || 0,
        daysTracked: stats.daysTracked || 0,
        email: norm(email),
        updatedAt: Date.now(),
      },
    }, { merge: true });
  } catch (e) {
    console.warn('[social] publishStats failed', e);
  }
}

/** Adds a friend by email (must already be a Salorie user). Reciprocal. */
export async function addFriend(email: string, friendEmailRaw: string): Promise<{ ok: boolean; name?: string; reason?: 'self' | 'notfound' | 'error' }> {
  const friendEmail = norm(friendEmailRaw);
  if (!friendEmail || friendEmail === norm(email)) return { ok: false, reason: 'self' };
  try {
    const fref = doc(db, 'users', emailToDocId(friendEmail));
    const fsnap = await getDoc(fref);
    if (!fsnap.exists()) return { ok: false, reason: 'notfound' };
    const fdata: any = fsnap.data() || {};

    // add friend to my list
    const myref = doc(db, 'users', emailToDocId(email));
    const mysnap = await getDoc(myref);
    const myFriends: string[] = (mysnap.data()?.friends as string[]) || [];
    if (!myFriends.includes(friendEmail)) myFriends.push(friendEmail);
    await setDoc(myref, { friends: myFriends }, { merge: true });

    // reciprocal: add me to their list
    const theirFriends: string[] = (fdata.friends as string[]) || [];
    const me = norm(email);
    if (!theirFriends.includes(me)) {
      theirFriends.push(me);
      await setDoc(fref, { friends: theirFriends }, { merge: true });
    }

    const name = fdata.publicStats?.name || [fdata.firstName, fdata.lastName].filter(Boolean).join(' ') || friendEmail.split('@')[0];
    return { ok: true, name };
  } catch (e) {
    console.warn('[social] addFriend failed', e);
    return { ok: false, reason: 'error' };
  }
}

/** Builds the streak leaderboard for me + my friends. */
export async function getLeaderboard(email: string): Promise<LeaderRow[]> {
  const me = norm(email);
  try {
    const mysnap = await getDoc(doc(db, 'users', emailToDocId(me)));
    const my: any = mysnap.data() || {};
    const friends: string[] = (my.friends as string[]) || [];
    const emails = [me, ...friends.filter((f) => norm(f) !== me)];

    const rows: LeaderRow[] = await Promise.all(
      emails.map(async (e) => {
        const snap = await getDoc(doc(db, 'users', emailToDocId(e)));
        const d: any = snap.data() || {};
        const ps = d.publicStats || {};
        return {
          email: e,
          name: ps.name || [d.firstName, d.lastName].filter(Boolean).join(' ') || e.split('@')[0],
          imageUrl: ps.imageUrl || d.imageUrl || undefined,
          streak: ps.streak || 0,
          daysTracked: ps.daysTracked || 0,
          isMe: norm(e) === me,
        } as LeaderRow;
      })
    );
    rows.sort((a, b) => b.streak - a.streak || b.daysTracked - a.daysTracked);
    return rows;
  } catch (e) {
    console.warn('[social] getLeaderboard failed', e);
    return [];
  }
}
