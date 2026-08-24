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

/**
 * Invite quelqu'un a devenir ami. La personne doit ACCEPTER.
 *
 * Avant le 24/08/2026 cette fonction s'appelait `addFriend` et portait bien son
 * nom : elle inscrivait l'invitant dans la liste de l'invite, sans rien lui
 * demander. Connaitre une adresse e-mail suffisait donc a voir le mur de son
 * proprietaire et a pouvoir le rejoindre en appel.
 *
 * Deux ecritures, et l'ordre compte :
 *   1. MON `friend_pending` — mon consentement, dans mon propre document. C'est
 *      lui que la regle Firestore lira quand la personne acceptera : sans cette
 *      ligne, elle ne POURRA pas s'inscrire dans mes amis.
 *   2. SA `friend_requests` — la sonnette. Elle n'accorde rien par elle-meme.
 */
export async function inviterAmi(
  email: string,
  friendEmailRaw: string,
): Promise<{ ok: boolean; name?: string; reason?: 'self' | 'notfound' | 'deja' | 'envoyee' | 'error' }> {
  const friendEmail = norm(friendEmailRaw);
  const moi = norm(email);
  if (!friendEmail || friendEmail === moi) return { ok: false, reason: 'self' };
  try {
    const friendDocId = emailToDocId(friendEmail);
    // SECURITE : le doc user prive d'autrui n'est plus lisible. L'existence se verifie via
    // le profil PUBLIC (cree au 1er publishStats). Un compte jamais ouvert n'est pas invitable.
    const fp = await readPublicProfile(friendDocId);
    if (!fp) return { ok: false, reason: 'notfound' };

    // Deja ami, ou deja invite : le dire plutot que d'ecrire une seconde fois.
    // `arrayUnion` serait sans effet, mais l'ecran annoncerait une invitation qui
    // n'a pas ete envoyee — et la personne attendrait une sonnette qui a deja sonne.
    const monRef = doc(db, 'users', emailToDocId(moi));
    const mien: any = (await getDoc(monRef)).data() || {};
    const dedans = (v: unknown) => ((v as string[]) || []).map(norm).includes(friendEmail);
    if (dedans(mien.friends)) return { ok: false, reason: 'deja' };
    if (dedans(mien.friend_pending)) return { ok: false, reason: 'envoyee' };

    await setDoc(monRef, { friend_pending: arrayUnion(friendEmail) }, { merge: true });
    await setDoc(doc(db, 'users', friendDocId), { friend_requests: arrayUnion(moi) }, { merge: true });

    const name = fp?.name || friendEmail.split('@')[0];
    return { ok: true, name };
  } catch (e) {
    console.warn('[social] inviterAmi failed', e);
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
