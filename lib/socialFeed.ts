// Social Feed + Kudos — 100% Firestore, privacy-safe, best-effort (try/catch partout).
//
// DESIGN (zéro exposition de données privées) :
//  - Le FLUX se construit à partir d'un champ `recentActivity[]` (résumés NON sensibles :
//    type + km + heure — JAMAIS repas/poids) stocké dans le profil PUBLIC
//    `public_profiles/{docId}` (cf. lib/publicProfile.ts), lisible par tout utilisateur
//    connecté et écrit uniquement par son propriétaire. Le doc user reste PRIVÉ (verrouillé
//    en lecture à son propriétaire) → aucune donnée sensible ne peut fuiter au feed.
//  - Les KUDOS vivent dans une collection top-level `kudos` (un doc par {activité, donneur}),
//    écrite uniquement par son auteur (règle scopée : request.resource.data.fromId == auth.uid).
//
// Seul l'utilisateur écrit sa propre `recentActivity` (isOwner) et son propre kudo (fromId==uid).
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  getCountFromServer,
} from 'firebase/firestore';
import { db, emailToDocId } from './firebase';
import { readPublicProfile, writePublicProfile } from './publicProfile';

const norm = (e: string) => (e || '').trim().toLowerCase();

export interface FeedItem {
  id: string;              // id stable de l'activité (persisté dans recentActivity)
  ownerEmail: string;      // email du copain qui a produit l'activité
  ownerDocId: string;      // docId (= email sanitizé) — clé pour les kudos
  name: string;            // nom affichable du copain
  imageUrl?: string;
  type: string;            // type d'activité (ex: run_completed, race_finished, medal…)
  data?: Record<string, any>; // { km, label } — non sensible
  at: number;              // timestamp en ms (tri + "il y a …")
}

export interface ActivitySummary {
  type: string;            // run_completed | race_finished | medal | challenge_joined …
  km?: number | null;
  label?: string;
}

const FEED_CAP = 12;

// GARDE-FOU CONFIDENTIALITÉ : seuls ces types d'activité peuvent être publiés au feed.
// meal_logged / weight_logged / health… ne passeront JAMAIS, même si un futur code tente
// de les publier — aucune donnée privée (repas, poids, santé) ne peut atteindre les amis.
const PUBLISHABLE_TYPES = new Set([
  'run_completed', 'race_finished', 'race_joined', 'medal', 'challenge_joined', 'streak', 'goal_reached',
]);

/**
 * Publie une activité NON SENSIBLE dans mon profil PUBLIC (public_profiles, champ
 * recentActivity). Garde les 12 dernières. À appeler à la fin d'une course/run/jalon —
 * jamais pour des données privées (repas, poids…). Best-effort : n'échoue jamais.
 */
export async function publishActivity(email: string, item: ActivitySummary): Promise<void> {
  const me = norm(email);
  if (!me || !item?.type) return;
  if (!PUBLISHABLE_TYPES.has(item.type)) {
    console.warn('[socialFeed] type non publiable (confidentialité):', item.type);
    return; // refuse repas/poids/santé : ne jamais exposer aux amis
  }
  try {
    const docId = emailToDocId(me);
    const pp = await readPublicProfile(docId);
    const cur: any[] = Array.isArray(pp?.recentActivity) ? pp!.recentActivity : [];
    const now = Date.now();
    const id = `${docId}__${now}__${Math.floor(Math.random() * 1e6)}`;
    const entry = {
      id,
      type: item.type,
      km: typeof item.km === 'number' ? Math.round(item.km * 100) / 100 : null,
      label: (item.label || '').slice(0, 40), // borne : pas de payload libre volumineux
      at: now,
    };
    const next = [entry, ...cur].slice(0, FEED_CAP);
    await writePublicProfile(docId, { recentActivity: next });
  } catch (e) {
    console.warn('[socialFeed] publishActivity failed', e);
  }
}

/**
 * Lit le FLUX d'activités récentes des amis depuis leur profil PUBLIC (public_profiles,
 * champ `recentActivity`). Fusionne et trie par date décroissante. Best-effort.
 * La liste d'amis (emails) est lue sur MON propre doc user (lecture de soi autorisée).
 */
export async function getFriendsFeed(email: string, max = 30): Promise<FeedItem[]> {
  const me = norm(email);
  if (!me) return [];
  try {
    const mysnap = await getDoc(doc(db, 'users', emailToDocId(me)));
    const my: any = mysnap.data() || {};
    const friends: string[] = ((my.friends as string[]) || []).map(norm).filter((f) => f && f !== me);
    if (friends.length === 0) return [];

    const lists = await Promise.all(
      friends.map(async (fe) => {
        try {
          const fdocId = emailToDocId(fe);
          const pp = await readPublicProfile(fdocId);
          if (!pp) return [] as FeedItem[];
          const fname = pp.name || fe.split('@')[0];
          const fimg = pp.imageUrl || undefined;
          const acts: any[] = Array.isArray(pp.recentActivity) ? pp.recentActivity : [];
          return acts.map((a) => ({
            id: a.id || `${fdocId}__${a.at || 0}`,
            ownerEmail: fe,
            ownerDocId: fdocId,
            name: fname,
            imageUrl: fimg,
            type: a.type || 'activity',
            data: { km: a.km, label: a.label },
            at: typeof a.at === 'number' ? a.at : 0,
          } as FeedItem));
        } catch {
          return [] as FeedItem[];
        }
      })
    );

    const merged = lists.flat();
    merged.sort((a, b) => b.at - a.at);
    return merged.slice(0, max);
  } catch (e) {
    console.warn('[socialFeed] getFriendsFeed failed', e);
    return [];
  }
}

// --- KUDOS : collection top-level `kudos`, 1 doc par {activité, donneur} ----------
// docId = `${ownerDocId}__${eventId}__${fromId}` (déterministe → 1 kudo / personne).
// kudoKey = `${ownerDocId}__${eventId}` → compteur via un seul where (index auto).
const kudoDocId = (ownerDocId: string, eventId: string, fromId: string) =>
  `${ownerDocId}__${eventId}__${fromId}`;
const kudoKey = (ownerDocId: string, eventId: string) => `${ownerDocId}__${eventId}`;

/** Ajoute mon kudos (👏) sur l'activité d'un ami. Best-effort. */
export async function addKudos(ownerDocId: string, eventId: string, fromEmail: string): Promise<boolean> {
  try {
    const fromId = emailToDocId(fromEmail);
    if (!ownerDocId || !eventId || !fromId) return false;
    await setDoc(
      doc(db, 'kudos', kudoDocId(ownerDocId, eventId, fromId)),
      { kudoKey: kudoKey(ownerDocId, eventId), ownerDocId, eventId, fromId, at: Date.now() },
      { merge: true }
    );
    return true;
  } catch (e) {
    console.warn('[socialFeed] addKudos failed', e);
    return false;
  }
}

/** Retire mon kudos. Best-effort. */
export async function removeKudos(ownerDocId: string, eventId: string, fromEmail: string): Promise<boolean> {
  try {
    const fromId = emailToDocId(fromEmail);
    if (!ownerDocId || !eventId || !fromId) return false;
    await deleteDoc(doc(db, 'kudos', kudoDocId(ownerDocId, eventId, fromId)));
    return true;
  } catch (e) {
    console.warn('[socialFeed] removeKudos failed', e);
    return false;
  }
}

/** Nombre total de kudos sur une activité (compteur serveur, fallback getDocs). */
export async function getKudosCount(ownerDocId: string, eventId: string): Promise<number> {
  try {
    if (!ownerDocId || !eventId) return 0;
    const q = query(collection(db, 'kudos'), where('kudoKey', '==', kudoKey(ownerDocId, eventId)));
    try {
      const agg = await getCountFromServer(q);
      return agg.data().count || 0;
    } catch {
      const snap = await getDocs(q);
      return snap.size;
    }
  } catch {
    return 0;
  }
}

export interface KudosState {
  count: number;
  mine: boolean;
}

/** Lit le compteur + l'état "j'ai déjà liké" pour une activité. */
export async function getKudosState(ownerDocId: string, eventId: string, myEmail: string): Promise<KudosState> {
  try {
    if (!ownerDocId || !eventId) return { count: 0, mine: false };
    const myId = emailToDocId(myEmail);
    const [count, mineSnap] = await Promise.all([
      getKudosCount(ownerDocId, eventId),
      myId
        ? getDoc(doc(db, 'kudos', kudoDocId(ownerDocId, eventId, myId)))
        : Promise.resolve({ exists: () => false } as any),
    ]);
    return { count, mine: !!mineSnap.exists?.() };
  } catch {
    return { count: 0, mine: false };
  }
}

/**
 * Etat kudos de PLUSIEURS activites en une poignee de requetes (fix N+1).
 *
 * AVANT : getKudosState() par item => getCountFromServer + getDoc, soit 2 requetes x N.
 * Sur un feed de 30 items rejoue a chaque focus, cela faisait ~60 requetes Firestore.
 * ICI : on interroge `kudoKey in [...]` par paquets de 10 (limite Firestore pour `in`),
 * puis on compte et on detecte "mine" cote client => ~1 requete par tranche de 10 items.
 * Jamais de throw : en cas d'echec on renvoie des etats neutres (feed toujours affiche).
 */
export async function getKudosStatesBatch(
  items: { id: string; ownerDocId: string }[],
  myEmail: string,
): Promise<Record<string, KudosState>> {
  const out: Record<string, KudosState> = {};
  for (const it of items) out[it.id] = { count: 0, mine: false };
  try {
    const myId = emailToDocId(myEmail);
    const keys = items.filter((i) => i.ownerDocId && i.id).map((i) => kudoKey(i.ownerDocId, i.id));
    const byKeyToEvent: Record<string, string> = {};
    items.forEach((i) => { if (i.ownerDocId && i.id) byKeyToEvent[kudoKey(i.ownerDocId, i.id)] = i.id; });

    for (let i = 0; i < keys.length; i += 10) {
      const chunk = keys.slice(i, i + 10);
      if (!chunk.length) continue;
      const snap = await getDocs(query(collection(db, 'kudos'), where('kudoKey', 'in', chunk)));
      snap.forEach((d) => {
        const x: any = d.data();
        const evId = byKeyToEvent[x?.kudoKey];
        if (!evId || !out[evId]) return;
        out[evId].count += 1;
        if (myId && x?.fromId === myId) out[evId].mine = true;
      });
    }
  } catch { /* etats neutres deja en place */ }
  return out;
}

/** Toggle : ajoute ou retire mon kudos, puis relit l'état réel (serveur). */
export async function toggleKudos(
  ownerDocId: string,
  eventId: string,
  myEmail: string,
  currentlyMine: boolean
): Promise<KudosState> {
  try {
    if (currentlyMine) await removeKudos(ownerDocId, eventId, myEmail);
    else await addKudos(ownerDocId, eventId, myEmail);
  } catch (e) {
    console.warn('[socialFeed] toggleKudos failed', e);
  }
  return getKudosState(ownerDocId, eventId, myEmail);
}
