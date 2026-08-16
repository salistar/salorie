// Modération UGC — SIGNALEMENT + BLOCAGE (exigence Google Play pour tout contenu utilisateur :
// marketplace + fil social). Auth Firestore = bridge custom-token après Clerk, donc
// request.auth.uid == emailToDocId(email).
//  - Signalement : doc dans la collection top-level `reports` (créable par tout connecté,
//    JAMAIS relisible côté client → traité par l'admin/back-office). Voir firestore.rules.
//  - Blocage : doc `users/{monUid}/blocked/{uidBloqué}` (géré par le propriétaire — déjà couvert
//    par la règle users/{uid}/{document=**}). Sert à MASQUER le contenu des bloqués côté client.
import { collection, addDoc, doc, setDoc, deleteDoc, getDocs, serverTimestamp } from 'firebase/firestore';
import { db, emailToDocId } from './firebase';

// 'ai' ajoute le 15 aout 2026 : la politique Google Play sur le contenu genere par
// IA exige un moyen de SIGNALER une reponse produite par un modele. C'est un type a
// part et non un 'comment' — il n'a pas d'auteur a bloquer, et sa moderation ne
// consiste pas a sanctionner quelqu'un mais a corriger un systeme.
export type ReportTargetType = 'listing' | 'feed' | 'user' | 'comment' | 'route' | 'ai';

// Motifs de signalement (clés i18n dans le composant). 'other' autorise une note libre.
export const REPORT_REASONS = ['spam', 'inappropriate', 'harassment', 'scam', 'false_info', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/**
 * Signale un contenu/utilisateur. `targetOwnerDocId` = docId du propriétaire (déjà sanitizé,
 * ex FeedItem.ownerDocId / MarketplaceListing.ownerUid) — passé tel quel. Best-effort.
 */
export async function reportContent(
  reporterEmail: string,
  args: { targetType: ReportTargetType; targetId: string; targetOwnerDocId?: string; reason: ReportReason; note?: string },
): Promise<boolean> {
  const uid = emailToDocId(reporterEmail || '');
  if (!uid || !args.targetId) return false;
  try {
    await addDoc(collection(db, 'reports'), {
      reporterId: uid,
      targetType: args.targetType,
      targetId: String(args.targetId),
      targetOwner: args.targetOwnerDocId || '',
      reason: args.reason,
      note: (args.note || '').slice(0, 300),
      status: 'pending',
      at: serverTimestamp(),
    });
    return true;
  } catch (e) {
    console.warn('[moderation] report failed:', (e as Error).message);
    return false;
  }
}

/** Bloque un utilisateur (masque son contenu). `targetDocId` = docId déjà sanitizé. */
export async function blockUser(myEmail: string, targetDocId: string, name?: string): Promise<boolean> {
  const uid = emailToDocId(myEmail || '');
  const other = (targetDocId || '').trim();
  if (!uid || !other || uid === other) return false;
  try {
    await setDoc(doc(db, 'users', uid, 'blocked', other), { at: serverTimestamp(), name: name || '' });
    return true;
  } catch (e) {
    console.warn('[moderation] block failed:', (e as Error).message);
    return false;
  }
}

export async function unblockUser(myEmail: string, targetDocId: string): Promise<boolean> {
  const uid = emailToDocId(myEmail || '');
  const other = (targetDocId || '').trim();
  if (!uid || !other) return false;
  try {
    await deleteDoc(doc(db, 'users', uid, 'blocked', other));
    return true;
  } catch {
    return false;
  }
}

/** Ensemble des docIds bloqués par l'utilisateur — pour filtrer feed + marketplace côté client. */
export async function getBlockedSet(myEmail: string): Promise<Set<string>> {
  const uid = emailToDocId(myEmail || '');
  if (!uid) return new Set<string>();
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'blocked'));
    const s = new Set<string>();
    snap.forEach((d) => s.add(d.id));
    return s;
  } catch {
    return new Set<string>();
  }
}
