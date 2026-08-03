// flagsAdmin — écriture RICHE des feature-flags (au-delà du simple on/off), audit
// trail (qui/quoi/quand + revert), et gestion Premium par utilisateur.
// Le schéma RichFlag est LE MÊME que celui lu par l'app mobile (lib/featureFlags.ts) :
//   boolean | { enabled?, premium?, rollout?(0..100), minVersion?, config? }
// L'app ne masque une feature que si explicitement désactivée / hors rollout / version
// trop ancienne → défaut permissif conservé.
import { db } from './firebaseAdmin';

export type RichFlag =
  | boolean
  | {
      enabled?: boolean;
      premium?: boolean;
      rollout?: number;
      minVersion?: string;
      config?: Record<string, any>;
    };

export type FlagMap = Record<string, RichFlag>;

const FEATURES = () => db().collection('config').doc('features');
const AUDIT = () => db().collection('flag_audit');

export async function getRichFlags(): Promise<FlagMap> {
  try {
    const d = await FEATURES().get();
    return (d.exists ? (d.data() as any) : {}) || {};
  } catch {
    return {};
  }
}

/** Normalise un patch (venant du form) en RichFlag propre. Se réduit à un booléen
 * quand le flag n'a pas d'attribut avancé (compat legacy + doc plus léger). */
export function normalizeFlag(input: any): RichFlag {
  if (typeof input === 'boolean') return input;
  if (!input || typeof input !== 'object') return true;
  const out: any = {};
  out.enabled = input.enabled === false ? false : true;
  if (input.premium === true) out.premium = true;
  const r = Number(input.rollout);
  if (Number.isFinite(r) && r >= 0 && r < 100) out.rollout = Math.round(r);
  if (typeof input.minVersion === 'string' && input.minVersion.trim()) out.minVersion = input.minVersion.trim();
  if (input.config && typeof input.config === 'object' && Object.keys(input.config).length) out.config = input.config;
  const keys = Object.keys(out);
  if (keys.length === 1 && out.enabled === true) return true;   // {enabled:true} → true (legacy)
  if (keys.length === 1 && out.enabled === false) return false; // {enabled:false} → false
  return out;
}

export interface AuditEntry {
  id: string; ts: number; actor: string; key: string;
  action: 'set' | 'revert' | 'premium'; before: any; after: any; target?: string;
}

async function writeAudit(e: Omit<AuditEntry, 'id' | 'ts'>): Promise<void> {
  // Best-effort : l'audit ne doit JAMAIS bloquer une écriture de flag.
  try { await AUDIT().add({ ...e, ts: Date.now() }); } catch { /* noop */ }
}

export async function setFlagRich(key: string, patch: RichFlag, actor: string): Promise<void> {
  const flags = await getRichFlags();
  const before = flags[key];
  const after = normalizeFlag(patch);
  await FEATURES().set({ [key]: after }, { merge: true });
  await writeAudit({ actor, key, action: 'set', before: before ?? null, after });
}

export async function getFlagAudit(limit = 60): Promise<AuditEntry[]> {
  try {
    const snap = await AUDIT().orderBy('ts', 'desc').limit(limit).get();
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  } catch {
    return [];
  }
}

/** Annule une entrée d'audit : restaure la valeur `before`. Gère flags ET premium. */
export async function revertFlag(auditId: string, actor: string): Promise<{ key: string }> {
  const d = await AUDIT().doc(auditId).get();
  if (!d.exists) throw new Error('entrée audit introuvable');
  const e = d.data() as any;

  if (e.action === 'premium') {
    const target = e.target as string;
    const before = e.before || {};
    await db().collection('users').doc(target).set(
      { premiumOverride: before.premiumOverride === true, premiumTrialUntil: before.premiumTrialUntil ?? null },
      { merge: true },
    );
    await writeAudit({ actor, key: 'premium', action: 'revert', before: e.after, after: e.before, target });
    return { key: 'premium:' + target };
  }

  const cur = await getRichFlags();
  const nowVal = cur[e.key];
  const restore = e.before === null || e.before === undefined ? true : e.before; // absent avant → défaut activé
  await FEATURES().set({ [e.key]: restore }, { merge: true });
  await writeAudit({ actor, key: e.key, action: 'revert', before: nowVal ?? null, after: restore });
  return { key: e.key };
}

// ── Premium par utilisateur (users/{docId}.premiumOverride + premiumTrialUntil) ──
// docId = email en minuscules (emailToDocId côté app). L'app lit premiumOverride ;
// on ajoute premiumTrialUntil (ms epoch) pour un essai à durée limitée.
export interface UserLite {
  id: string; email: string; premiumOverride: boolean; premiumTrialUntil?: number | null;
}

function toLite(id: string, dt: any): UserLite {
  return {
    id,
    email: dt?.email || id,
    premiumOverride: dt?.premiumOverride === true,
    premiumTrialUntil: dt?.premiumTrialUntil ?? null,
  };
}

export async function findUsers(query: string, limit = 20): Promise<UserLite[]> {
  const q = (query || '').trim().toLowerCase();
  if (!q) return [];
  const out: UserLite[] = [];
  try {
    // 1) lookup direct : docId == email en minuscules.
    const direct = await db().collection('users').doc(q).get();
    if (direct.exists) out.push(toLite(direct.id, direct.data()));
    // 2) sinon scan borné + filtre "contient".
    if (out.length === 0) {
      const snap = await db().collection('users').limit(1000).get();
      snap.docs.forEach((doc) => {
        if (out.length >= limit) return;
        const dt = doc.data() as any;
        const em = String(dt?.email || doc.id).toLowerCase();
        if (em.includes(q) || doc.id.toLowerCase().includes(q)) out.push(toLite(doc.id, dt));
      });
    }
  } catch { /* renvoie ce qu'on a */ }
  return out;
}

export async function setPremium(docId: string, on: boolean, actor: string, trialDays?: number): Promise<void> {
  const ref = db().collection('users').doc(docId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('utilisateur introuvable : ' + docId);
  const cur = snap.data() as any;
  const before = { premiumOverride: cur?.premiumOverride === true, premiumTrialUntil: cur?.premiumTrialUntil ?? null };
  const trialUntil = on && trialDays && trialDays > 0 ? Date.now() + trialDays * 86400000 : null;
  const after = { premiumOverride: on, premiumTrialUntil: trialUntil };
  await ref.set(after, { merge: true });
  await writeAudit({ actor, key: 'premium', action: 'premium', before, after, target: docId });
}
