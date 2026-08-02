// Compte famille (foyer multi-profils + défi km partagé) — 100% Firestore, best-effort.
//
// MODÈLE :
//  - Un FOYER = doc top-level `families/{familyId}` :
//      { ownerUid, name, code, members:[{uid,email,name,role}], createdAt, updatedAt }
//    `uid` = email sanitizé (emailToDocId) — même convention de clé que partout dans l'app.
//  - Un user ne peut appartenir qu'à UN foyer à la fois : on mémorise `familyId` sur son
//    doc users/{docId} (champ déjà lisible par signedIn) pour retrouver son foyer vite.
//  - INVITATION : un `code` court (6 caractères) généré à la création. On peut rejoindre
//    par CODE (scan de `families where code == X`) OU par EMAIL de l'owner (pattern amis
//    de social.ts : on ajoute le membre au tableau `members`).
//
// DÉFI FAMILIAL — km de la semaine :
//  familyWeeklyKm() agrège les km PUBLICS des membres EXACTEMENT comme socialFeed :
//  on lit le champ `recentActivity[]` du profil PUBLIC de chaque membre
//  (public_profiles/{docId}, lisible par tout utilisateur connecté) et on somme les `km`
//  des activités de course des 7 derniers jours. Aucune donnée privée (repas/poids) n'est
//  touchée : le doc user reste verrouillé en lecture à son propriétaire.
//
// LIMITE (cf. skipped) : la collection top-level `families` exige une règle Firestore
//  dédiée (lecture/écriture signedIn) — non déployable depuis ce lot. Tant que la règle
//  n'existe pas, create/join/get échouent silencieusement (best-effort) côté mobile.
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  limit as firestoreLimit,
} from 'firebase/firestore';
import { db, emailToDocId } from './firebase';
import { readPublicProfile } from './publicProfile';

const norm = (e: string) => (e || '').trim().toLowerCase();

export type FamilyRole = 'adulte' | 'enfant' | 'senior';

export interface FamilyMember {
  uid: string;            // = email sanitizé (emailToDocId)
  email: string;
  name: string;
  role: FamilyRole;
}

export interface Family {
  id: string;
  ownerUid: string;
  name: string;
  code: string;
  members: FamilyMember[];
  createdAt?: any;
}

export interface FamilyKmRow {
  uid: string;
  name: string;
  role: FamilyRole;
  imageUrl?: string;
  km: number;             // km de course cumulés sur les 7 derniers jours
  isMe: boolean;
}

export interface FamilyWeekly {
  totalKm: number;        // somme des km de tous les membres (7 jours)
  rows: FamilyKmRow[];    // détail par membre, trié décroissant
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Types d'activité qui comptent comme distance parcourue (mêmes que le feed social).
const RUN_TYPES = new Set(['run_completed', 'race_finished', 'race_completed']);

/** Code d'invitation court (6 caractères, sans 0/O/1/I pour la lisibilité). */
function genCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

const sanitizeRole = (r?: string): FamilyRole =>
  r === 'enfant' || r === 'senior' ? r : 'adulte';

/** id de doc famille stable + lisible : `fam_<ownerUid>` (1 foyer / owner). */
const familyDocId = (ownerUid: string) => `fam_${ownerUid}`;

/** Pointe le doc user vers son foyer (best-effort, champ déjà signedIn-readable). */
async function linkUserToFamily(email: string, familyId: string): Promise<void> {
  try {
    const ref = doc(db, 'users', emailToDocId(email));
    await setDoc(ref, { familyId }, { merge: true });
  } catch (e) {
    console.warn('[family] linkUserToFamily failed', e);
  }
}

/** Nom affichable d'un user à partir de son doc (publicStats → firstName/lastName → email). */
function displayNameFromDoc(d: any, email: string): string {
  const ps = d?.publicStats || {};
  return (
    ps.name ||
    [d?.firstName, d?.lastName].filter(Boolean).join(' ') ||
    email.split('@')[0]
  );
}

/**
 * Crée un foyer dont l'appelant est l'owner (rôle adulte par défaut).
 * Best-effort : renvoie le foyer créé, ou null en cas d'échec (ex: règle Firestore absente).
 */
export async function createFamily(
  email: string,
  name: string,
  role: FamilyRole = 'adulte'
): Promise<Family | null> {
  const me = norm(email);
  if (!me) return null;
  try {
    const uid = emailToDocId(me);
    const id = familyDocId(uid);
    // Nom affichable de l'owner depuis son doc user.
    let myName = me.split('@')[0];
    try {
      const usnap = await getDoc(doc(db, 'users', uid));
      if (usnap.exists()) myName = displayNameFromDoc(usnap.data(), me);
    } catch {}

    const code = genCode();
    const family: Family = {
      id,
      ownerUid: uid,
      name: (name || '').trim() || myName,
      code,
      members: [{ uid, email: me, name: myName, role: sanitizeRole(role) }],
    };
    await setDoc(
      doc(db, 'families', id),
      { ...family, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
      { merge: true }
    );
    await linkUserToFamily(me, id);
    return family;
  } catch (e) {
    console.warn('[family] createFamily failed', e);
    return null;
  }
}

/** Lit un foyer par id (best-effort). */
async function getFamilyById(familyId: string): Promise<Family | null> {
  try {
    const snap = await getDoc(doc(db, 'families', familyId));
    if (!snap.exists()) return null;
    const d: any = snap.data() || {};
    return {
      id: snap.id,
      ownerUid: d.ownerUid || '',
      name: d.name || '',
      code: d.code || '',
      members: Array.isArray(d.members) ? d.members : [],
      createdAt: d.createdAt,
    };
  } catch (e) {
    console.warn('[family] getFamilyById failed', e);
    return null;
  }
}

/**
 * Récupère MON foyer : d'abord via `familyId` mémorisé sur mon doc user (1 lecture),
 * sinon fallback en scannant `families` où je figure comme owner. Best-effort.
 */
export async function getMyFamily(email: string): Promise<Family | null> {
  const me = norm(email);
  if (!me) return null;
  try {
    const uid = emailToDocId(me);
    // 1) pointeur rapide sur mon doc user
    try {
      const usnap = await getDoc(doc(db, 'users', uid));
      const famId = usnap.exists() ? (usnap.data() as any)?.familyId : undefined;
      if (famId) {
        const fam = await getFamilyById(famId);
        if (fam && fam.members.some((m) => norm(m.email) === me)) return fam;
      }
    } catch {}
    // 2) fallback : foyer dont je suis l'owner (id déterministe)
    const owned = await getFamilyById(familyDocId(uid));
    if (owned) return owned;
    return null;
  } catch (e) {
    console.warn('[family] getMyFamily failed', e);
    return null;
  }
}

/**
 * Rejoint un foyer par CODE d'invitation OU par EMAIL de l'owner.
 * - codeOrEmail contient un '@' → traité comme email d'owner (doc id déterministe).
 * - sinon → traité comme code (scan `families where code ==`).
 * M'ajoute au tableau `members` (idempotent) puis pointe mon doc user dessus.
 * Best-effort. Renvoie { ok, family?, reason? }.
 */
export async function joinFamily(
  email: string,
  codeOrEmail: string,
  role: FamilyRole = 'adulte'
): Promise<{ ok: boolean; family?: Family; reason?: 'empty' | 'notfound' | 'already' | 'error' }> {
  const me = norm(email);
  const raw = (codeOrEmail || '').trim();
  if (!me || !raw) return { ok: false, reason: 'empty' };
  try {
    const uid = emailToDocId(me);
    let family: Family | null = null;

    if (raw.includes('@')) {
      // rejoindre par email de l'owner
      family = await getFamilyById(familyDocId(emailToDocId(raw)));
    } else {
      // rejoindre par code (insensible à la casse)
      const code = raw.toUpperCase();
      const q = query(collection(db, 'families'), where('code', '==', code), firestoreLimit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const ds = snap.docs[0];
        const d: any = ds.data() || {};
        family = {
          id: ds.id,
          ownerUid: d.ownerUid || '',
          name: d.name || '',
          code: d.code || '',
          members: Array.isArray(d.members) ? d.members : [],
          createdAt: d.createdAt,
        };
      }
    }

    if (!family) return { ok: false, reason: 'notfound' };

    const already = family.members.some((m) => norm(m.email) === me);
    if (already) {
      await linkUserToFamily(me, family.id);
      return { ok: true, family, reason: 'already' };
    }

    // Nom affichable depuis mon doc user.
    let myName = me.split('@')[0];
    try {
      const usnap = await getDoc(doc(db, 'users', uid));
      if (usnap.exists()) myName = displayNameFromDoc(usnap.data(), me);
    } catch {}

    const nextMembers = [...family.members, { uid, email: me, name: myName, role: sanitizeRole(role) }];
    await setDoc(
      doc(db, 'families', family.id),
      { members: nextMembers, updatedAt: serverTimestamp() },
      { merge: true }
    );
    await linkUserToFamily(me, family.id);
    return { ok: true, family: { ...family, members: nextMembers } };
  } catch (e) {
    console.warn('[family] joinFamily failed', e);
    return { ok: false, reason: 'error' };
  }
}

/**
 * Ajoute un PROFIL LOCAL au foyer (ex: un enfant/senior sans compte propre).
 * Crée un membre avec un uid local synthétique (pas d'agrégation km — pas de doc user).
 * Best-effort. Renvoie le foyer mis à jour ou null.
 */
export async function addMemberLocalProfile(
  family: Family,
  name: string,
  role: FamilyRole
): Promise<Family | null> {
  if (!family?.id) return null;
  const clean = (name || '').trim();
  if (!clean) return null;
  try {
    const localUid = `local_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const member: FamilyMember = { uid: localUid, email: '', name: clean.slice(0, 40), role: sanitizeRole(role) };
    const nextMembers = [...family.members, member];
    await setDoc(
      doc(db, 'families', family.id),
      { members: nextMembers, updatedAt: serverTimestamp() },
      { merge: true }
    );
    return { ...family, members: nextMembers };
  } catch (e) {
    console.warn('[family] addMemberLocalProfile failed', e);
    return null;
  }
}

/**
 * Agrège les km PUBLICS des membres sur les 7 derniers jours (défi familial).
 * Même source privacy-safe que socialFeed : champ `recentActivity[]` du doc user
 * (déjà lisible par signedIn). Aucune donnée privée touchée. Best-effort : un membre
 * illisible compte 0 km et n'interrompt pas l'agrégat. Les profils LOCAUX (sans email)
 * comptent 0 km (pas de doc user à lire).
 */
export async function familyWeeklyKm(family: Family, myEmail?: string): Promise<FamilyWeekly> {
  const me = norm(myEmail || '');
  const since = Date.now() - WEEK_MS;
  if (!family?.members?.length) return { totalKm: 0, rows: [] };
  try {
    const rows: FamilyKmRow[] = await Promise.all(
      family.members.map(async (m) => {
        const email = norm(m.email);
        const base: FamilyKmRow = {
          uid: m.uid,
          name: m.name || (email ? email.split('@')[0] : '?'),
          role: sanitizeRole(m.role),
          km: 0,
          isMe: !!email && email === me,
        };
        if (!email) return base; // profil local → 0 km
        try {
          // Autres membres : on ne lit QUE leur profil PUBLIC (name/avatar/km via recentActivity),
          // jamais leur doc user privé.
          const pp = await readPublicProfile(emailToDocId(email));
          if (!pp) return base;
          base.name = m.name || pp.name || email.split('@')[0];
          base.imageUrl = pp.imageUrl || undefined;
          const acts: any[] = Array.isArray(pp.recentActivity) ? pp.recentActivity : [];
          let km = 0;
          for (const a of acts) {
            const at = typeof a?.at === 'number' ? a.at : 0;
            const k = typeof a?.km === 'number' ? a.km : 0;
            if (at >= since && k > 0 && RUN_TYPES.has(a?.type)) km += k;
          }
          base.km = Math.round(km * 100) / 100;
          return base;
        } catch {
          return base;
        }
      })
    );
    rows.sort((a, b) => b.km - a.km);
    const totalKm = Math.round(rows.reduce((s, r) => s + r.km, 0) * 100) / 100;
    return { totalKm, rows };
  } catch (e) {
    console.warn('[family] familyWeeklyKm failed', e);
    return { totalKm: 0, rows: [] };
  }
}
