// Ligues hebdomadaires (rétention façon Duolingo) — 100% Firestore, best-effort.
//
// MODÈLE :
//  - Une LIGUE vit par SEMAINE ISO : collection `leagues/{weekId}/members/{uid}`
//    où weekId = `YYYY-Www` (année-semaine ISO, ex: 2026-W27) et uid = email sanitizé
//    (emailToDocId) — même convention de clé que partout dans l'app.
//  - Chaque membre = { uid, name, xp, tier } :
//      • xp   = points d'activité de la semaine (incrémentés via addXp(uid, n)) ;
//      • tier = palier courant (bronze/silver/gold/diamond), persisté sur le doc membre
//               pour que le classement d'un tier se lise en UN where sans lookups croisés.
//  - Le classement d'un tier = query `where tier == X orderBy xp desc`.
//
// XP — SOURCE DÉRIVÉE DE L'ACTIVITÉ :
//  Il n'existe pas (encore) de compteur d'XP unifié dans lib/social.ts. On expose donc
//  addXp(uid, n) : les écrans d'activité (log repas, run terminé, streak…) l'appellent
//  pour créditer des points. Le doc membre est créé à la volée (upsert) à la 1re activité
//  de la semaine, avec le tier hérité de la semaine précédente (ou bronze par défaut).
//
// PROMOTION / RELÉGATION (clôture de semaine) :
//  computeTierChange() est une FONCTION PURE (testable, sans I/O) : à partir du rang dans
//  le tier et de la taille du groupe, top 5 montent d'un palier, bottom 5 descendent.
//  L'application réelle des changements (écrire le nouveau tier dans la semaine suivante)
//  se fait côté admin/serveur au tournant de semaine ; le mobile ne fait que LIRE.
//
// LIMITE : la collection `leagues/{weekId}/members/{uid}` exige une règle Firestore dédiée
//  (lecture signedIn, écriture bornée à uid == auth.uid). Cf. needsRule du lot. Tant que la
//  règle n'existe pas, addXp/getMyLeague/leaderboard échouent silencieusement (best-effort).
import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  increment,
  serverTimestamp,
  limit as firestoreLimit,
} from 'firebase/firestore';
import { db, emailToDocId } from './firebase';
import { readPublicProfile } from './publicProfile';

const norm = (e: string) => (e || '').trim().toLowerCase();

export type Tier = 'bronze' | 'silver' | 'gold' | 'diamond';

export const TIERS: Tier[] = ['bronze', 'silver', 'gold', 'diamond'];

export interface LeagueMember {
  uid: string;    // = email sanitizé (emailToDocId)
  name: string;
  xp: number;
  tier: Tier;
}

export interface LeagueRow extends LeagueMember {
  rank: number;   // 1-based, dans le tier
  isMe: boolean;
}

export interface MyLeague {
  weekId: string;
  tier: Tier;
  me: LeagueRow | null;   // ma ligne (null si je n'ai pas encore d'XP cette semaine)
  rows: LeagueRow[];      // classement complet de MON tier, trié xp desc
  msLeft: number;         // millisecondes avant la clôture de semaine
}

// Combien montent / descendent à la clôture (Duolingo-like).
export const PROMOTE_COUNT = 5;
export const RELEGATE_COUNT = 5;

// --- Semaine ISO ---------------------------------------------------------------

/**
 * weekId ISO stable : `YYYY-Www` (ex: 2026-W27). Utilise le jeudi de la semaine
 * pour déterminer l'année ISO (règle ISO-8601 : la semaine appartient à l'année
 * de son jeudi). Insensible au fuseau via UTC → même weekId sur tous les appareils.
 */
export function isoWeekId(d: Date = new Date()): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  // Jour ISO : lundi=1 … dimanche=7.
  const day = date.getUTCDay() || 7;
  // Décale sur le jeudi de la semaine courante.
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const year = date.getUTCFullYear();
  const yearStart = Date.UTC(year, 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/**
 * Instant de clôture de la semaine ISO courante = lundi 00:00 UTC prochain.
 * Sert au compte à rebours "temps restant avant clôture".
 */
export function weekEndMs(now: Date = new Date()): number {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = date.getUTCDay() || 7; // lundi=1 … dimanche=7
  // Jours jusqu'au prochain lundi (début de la semaine suivante).
  const daysToNextMonday = 8 - day;
  date.setUTCDate(date.getUTCDate() + daysToNextMonday);
  return date.getTime(); // lundi 00:00:00 UTC
}

/** Millisecondes restantes avant la clôture de la semaine ISO courante. */
export function msUntilWeekEnd(now: Date = new Date()): number {
  return Math.max(0, weekEndMs(now) - now.getTime());
}

// --- Tiers (logique pure) ------------------------------------------------------

const sanitizeTier = (t?: string): Tier =>
  t === 'silver' || t === 'gold' || t === 'diamond' ? t : 'bronze';

const tierIndex = (t: Tier): number => Math.max(0, TIERS.indexOf(t));

/** Palier au-dessus (borné au sommet : diamant reste diamant). */
export function promoteTier(t: Tier): Tier {
  return TIERS[Math.min(TIERS.length - 1, tierIndex(t) + 1)];
}

/** Palier en-dessous (borné au plancher : bronze reste bronze). */
export function relegateTier(t: Tier): Tier {
  return TIERS[Math.max(0, tierIndex(t) - 1)];
}

/**
 * PURE : calcule le nouveau tier d'un membre à la clôture, à partir de son rang
 * (1-based) dans son groupe, de la taille du groupe et de son tier courant.
 * - rang <= PROMOTE_COUNT           → montée d'un palier (sauf déjà diamant).
 * - rang > groupSize - RELEGATE_COUNT → descente d'un palier (sauf déjà bronze).
 * - sinon                            → inchangé.
 * Robuste aux petits groupes : si la zone de promo et de relégation se recouvrent
 * (groupe < PROMOTE_COUNT + RELEGATE_COUNT), la PROMOTION prime.
 */
export function computeTierChange(rank: number, groupSize: number, tier: Tier): Tier {
  const t = sanitizeTier(tier);
  if (rank <= PROMOTE_COUNT) return promoteTier(t);
  if (rank > groupSize - RELEGATE_COUNT) return relegateTier(t);
  return t;
}

/** Zone d'un rang donné dans le classement (pour colorer l'UI). */
export function zoneForRank(rank: number, groupSize: number): 'promotion' | 'relegation' | 'neutral' {
  if (rank <= PROMOTE_COUNT) return 'promotion';
  if (rank > groupSize - RELEGATE_COUNT) return 'relegation';
  return 'neutral';
}

// --- Firestore accès -----------------------------------------------------------

const memberRef = (weekId: string, uid: string) =>
  doc(db, 'leagues', weekId, 'members', uid);

/**
 * Retrouve le tier de la semaine PRÉCÉDENTE (pour hériter du palier au 1er XP de la
 * semaine). Best-effort : bronze par défaut si introuvable.
 */
async function inheritedTier(prevWeekId: string, uid: string): Promise<Tier> {
  try {
    const snap = await getDoc(memberRef(prevWeekId, uid));
    if (snap.exists()) return sanitizeTier((snap.data() as any)?.tier);
  } catch {}
  return 'bronze';
}

/** weekId de la semaine précédant celle passée (7 jours en arrière). */
function prevWeekIdOf(weekId: string): string {
  // On repart d'un instant "maintenant - 7j" ; suffisant car isoWeekId est déterministe.
  return isoWeekId(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
}

/**
 * Crédite `n` points d'XP au membre pour la semaine ISO courante (upsert atomique).
 * Crée le doc membre s'il n'existe pas, en héritant du tier de la semaine précédente.
 * Best-effort : n'échoue jamais (ne bloque pas l'écran appelant).
 */
export async function addXp(email: string, n: number, weekId: string = isoWeekId()): Promise<void> {
  const me = norm(email);
  const amount = Math.round(Number(n) || 0);
  if (!me || amount === 0) return;
  try {
    const uid = emailToDocId(me);
    const ref = memberRef(weekId, uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      // Doc déjà là → incrément atomique de l'XP uniquement.
      await setDoc(ref, { xp: increment(amount), updatedAt: serverTimestamp() }, { merge: true });
      return;
    }
    // 1re activité de la semaine : on crée le doc membre avec nom + tier hérité.
    // Nom depuis le profil PUBLIC (public_profiles) — on ne lit plus le doc user privé ici ;
    // `leagues/{week}/members/{uid}` porte déjà {uid,name,xp,tier}, on n'ajoute que le name.
    let name = me.split('@')[0];
    try {
      const pp = await readPublicProfile(uid);
      if (pp?.name) name = pp.name;
    } catch {}
    const tier = await inheritedTier(prevWeekIdOf(weekId), uid);
    await setDoc(
      ref,
      { uid, name, xp: Math.max(0, amount), tier, updatedAt: serverTimestamp() },
      { merge: true }
    );
  } catch (e) {
    console.warn('[leagues] addXp failed', e);
  }
}

/**
 * Classement d'un TIER pour une semaine : membres triés par XP décroissant.
 * Best-effort : renvoie [] en cas d'échec. `myEmail` sert à marquer isMe.
 */
export async function leaderboard(
  tier: Tier,
  weekId: string = isoWeekId(),
  myEmail?: string,
  max = 100
): Promise<LeagueRow[]> {
  const meId = myEmail ? emailToDocId(norm(myEmail)) : '';
  try {
    const col = collection(db, 'leagues', weekId, 'members');
    let docs: any[] = [];
    try {
      // Chemin rapide : filtre + tri serveur (nécessite un index simple, auto-proposé).
      const q = query(col, where('tier', '==', tier), orderBy('xp', 'desc'), firestoreLimit(max));
      const snap = await getDocs(q);
      docs = snap.docs.map((d) => d.data());
    } catch {
      // Fallback sans index composite : on filtre/trie côté client.
      const snap = await getDocs(query(col, firestoreLimit(500)));
      docs = snap.docs
        .map((d) => d.data())
        .filter((d: any) => sanitizeTier(d?.tier) === tier);
    }
    const members: LeagueMember[] = docs.map((d: any) => ({
      uid: d?.uid || '',
      name: d?.name || (d?.uid ? String(d.uid).split('@')[0] : '?'),
      xp: typeof d?.xp === 'number' ? d.xp : 0,
      tier: sanitizeTier(d?.tier),
    }));
    members.sort((a, b) => b.xp - a.xp || a.name.localeCompare(b.name));
    return members.slice(0, max).map((m, i) => ({
      ...m,
      rank: i + 1,
      isMe: !!meId && m.uid === meId,
    }));
  } catch (e) {
    console.warn('[leagues] leaderboard failed', e);
    return [];
  }
}

/**
 * MA ligue cette semaine : lit mon doc membre (tier), puis le classement complet de ce
 * tier. Si je n'ai pas encore d'XP cette semaine, je pars en bronze (me = null tant que
 * je n'ai pas joué). Best-effort.
 */
export async function getMyLeague(email: string, weekId: string = isoWeekId()): Promise<MyLeague> {
  const me = norm(email);
  const base: MyLeague = { weekId, tier: 'bronze', me: null, rows: [], msLeft: msUntilWeekEnd() };
  if (!me) return base;
  try {
    const uid = emailToDocId(me);
    let tier: Tier = 'bronze';
    try {
      const snap = await getDoc(memberRef(weekId, uid));
      if (snap.exists()) tier = sanitizeTier((snap.data() as any)?.tier);
      else tier = await inheritedTier(prevWeekIdOf(weekId), uid); // affiche le bon tier même sans XP encore
    } catch {}

    const rows = await leaderboard(tier, weekId, me);
    const mine = rows.find((r) => r.isMe) || null;
    return { weekId, tier, me: mine, rows, msLeft: msUntilWeekEnd() };
  } catch (e) {
    console.warn('[leagues] getMyLeague failed', e);
    return base;
  }
}
