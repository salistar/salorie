// Social — amis & classement, 100% sur Firestore (pas de backend dédié).
// Les stats PUBLIQUES { name, imageUrl, streak, daysTracked } vivent dans la collection
// dédiée `public_profiles/{docId}` (cf. lib/publicProfile.ts), lisible par tout utilisateur
// connecté et écrite uniquement par son propriétaire. La liste d'amis (emails) reste sur le
// doc PRIVÉ users/{docId}. Le classement lit les profils publics de soi + de ses amis.
//
// SÉCURITÉ : plus aucune PII (email) ni donnée santé n'est exposée aux amis — le doc user
// est verrouillé en lecture à son propriétaire ; seuls les champs publics sortent via
// public_profiles.
import { doc, getDoc, setDoc, arrayUnion } from 'firebase/firestore';
import { db, emailToDocId } from './firebase';
import { readPublicProfile, writePublicProfile } from './publicProfile';

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
  const docId = emailToDocId(email);
  if (!docId) return;
  // Champs PUBLICS uniquement, dans public_profiles — JAMAIS l'email ni de donnée santé.
  await writePublicProfile(docId, {
    name: stats.name || '',
    imageUrl: stats.imageUrl || '',
    streak: stats.streak || 0,
    daysTracked: stats.daysTracked || 0,
  });
}

/** Adds a friend by email (must already be a Salorie user). Reciprocal. */
export async function addFriend(email: string, friendEmailRaw: string): Promise<{ ok: boolean; name?: string; reason?: 'self' | 'notfound' | 'error' }> {
  const friendEmail = norm(friendEmailRaw);
  if (!friendEmail || friendEmail === norm(email)) return { ok: false, reason: 'self' };
  try {
    const friendDocId = emailToDocId(friendEmail);
    // SÉCURITÉ : le doc user privé d'autrui n'est plus lisible. L'existence se vérifie via
    // le profil PUBLIC (créé au 1er publishStats). Un compte jamais ouvert n'est pas ajoutable.
    const fp = await readPublicProfile(friendDocId);
    if (!fp) return { ok: false, reason: 'notfound' };

    // add friend to my list (mon propre doc — autorisé au propriétaire)
    const myref = doc(db, 'users', emailToDocId(email));
    const mysnap = await getDoc(myref);
    const myFriends: string[] = (mysnap.data()?.friends as string[]) || [];
    if (!myFriends.includes(friendEmail)) myFriends.push(friendEmail);
    await setDoc(myref, { friends: myFriends }, { merge: true });

    // reciprocal: add me to their list — écriture ATOMIQUE field-scopée `friends` : la règle
    // Firestore autorise un tiers à s'ajouter (et lui seul) au tableau `friends` d'autrui,
    // sans lire ni modifier aucun autre champ du doc privé.
    await setDoc(doc(db, 'users', friendDocId), { friends: arrayUnion(norm(email)) }, { merge: true });

    const name = fp?.name || friendEmail.split('@')[0];
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
        // Lecture des stats publiques (de soi + des amis) via public_profiles.
        const pp = await readPublicProfile(emailToDocId(e));
        return {
          email: e,
          name: pp?.name || e.split('@')[0],
          imageUrl: pp?.imageUrl || undefined,
          streak: pp?.streak || 0,
          daysTracked: pp?.daysTracked || 0,
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
