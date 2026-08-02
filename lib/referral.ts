// Parrainage / Referral — moteur de croissance, 100% Firestore, best-effort.
//
// MODÈLE :
//  - Chaque user possède un CODE DE PARRAINAGE stable dérivé de son uid (= email
//    sanitizé, même convention de clé que partout dans l'app). Le code est
//    DÉTERMINISTE (hash de l'uid → 6 caractères alphanumériques lisibles), donc
//    identique à chaque calcul, sans lecture Firestore — pas de collision de clé
//    doc (voir plus bas la stratégie anti-collision côté doc `referrals`).
//  - `referrals/{code}` { ownerUid, code, count, updatedAt } : le compteur de
//    filleuls d'un parrain. Le doc est CRÉÉ paresseusement (getMyCode l'assure) et
//    incrémenté à chaque réclamation validée.
//  - `referrals_claims/{newUid}` { code, ownerUid, ts } : la réclamation d'un
//    NOUVEAU user. La clé = uid du filleul → un user ne peut réclamer QU'UNE
//    seule fois (create-only : les règles Firestore refusent l'écrasement).
//
// ANTI-ABUS :
//  - anti-auto-parrainage : on refuse si le code appartient à l'appelant.
//  - anti-double : la clé du claim = uid du filleul (1 seul claim possible) +
//    on vérifie l'existence avant d'écrire.
//
// RÉCOMPENSES (paliers) : purement dérivées du `count` de filleuls — aucun état
// supplémentaire à stocker. Voir REWARD_TIERS / getReferralStats.
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  increment,
} from 'firebase/firestore';
import { db, emailToDocId, logEvent } from './firebase';
import { auth } from './firebaseAuth';

const norm = (e: string) => (e || '').trim().toLowerCase();

// Alphabet lisible (sans 0/O/1/I/L pour éviter les confusions à la saisie).
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LEN = 6;

/**
 * Code de parrainage STABLE dérivé de l'uid (email sanitizé). Déterministe :
 * même uid → même code, sans aucune lecture réseau. Hash simple (FNV-1a 32 bits)
 * étalé sur CODE_LEN caractères de l'alphabet lisible. Pas cryptographique — juste
 * un identifiant de partage court, stable et peu ambigu.
 */
export function codeForUid(uid: string): string {
  const u = norm(uid);
  if (!u) return '';
  // FNV-1a 32 bits
  let h = 0x811c9dc5;
  for (let i = 0; i < u.length; i++) {
    h ^= u.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // On dérive CODE_LEN caractères en re-mélangeant le hash à chaque position pour
  // mieux étaler l'entropie (sinon les derniers caractères tournent peu).
  let out = '';
  for (let i = 0; i < CODE_LEN; i++) {
    out += CODE_ALPHABET[h % CODE_ALPHABET.length];
    h = (Math.imul(h ^ (h >>> 13), 0x01000193) >>> 0) + i + 1;
    h = h >>> 0;
  }
  return out;
}

/** Code de parrainage de l'utilisateur courant (dérivé de son email). */
export function codeForEmail(email: string): string {
  return codeForUid(emailToDocId(norm(email)));
}

export interface ReferralReward {
  tier: number;          // palier atteint (0 = aucun)
  label: string;         // libellé du palier atteint (récompense débloquée)
  emoji: string;
}

export interface ReferralStats {
  code: string;          // mon code de parrainage
  count: number;         // nombre de filleuls confirmés
  reward: ReferralReward;   // récompense actuellement débloquée
  nextAt: number | null;    // nb de filleuls pour le PROCHAIN palier (null si max)
  nextLabel: string | null; // libellé du prochain palier
}

// Paliers de récompense (dérivés du seul `count`). `min` = nb de filleuls requis.
export const REWARD_TIERS: { min: number; emoji: string; label: { en: string; fr: string; ar: string } }[] = [
  { min: 1, emoji: '🥉', label: { en: 'Bronze badge', fr: 'Badge bronze', ar: 'وسام برونزي' } },
  { min: 3, emoji: '🥈', label: { en: 'Silver badge', fr: 'Badge argent', ar: 'وسام فضي' } },
  { min: 5, emoji: '🥇', label: { en: '1 month Premium', fr: '1 mois Premium', ar: 'شهر Premium' } },
  { min: 10, emoji: '💎', label: { en: '3 months Premium', fr: '3 mois Premium', ar: '3 أشهر Premium' } },
];

type Lang = 'en' | 'fr' | 'ar';

/** Palier atteint pour un `count` donné, dans la langue demandée. */
function rewardForCount(count: number, lang: Lang = 'en'): ReferralReward {
  let current: ReferralReward = { tier: 0, label: '', emoji: '' };
  for (let i = 0; i < REWARD_TIERS.length; i++) {
    if (count >= REWARD_TIERS[i].min) {
      current = { tier: i + 1, label: REWARD_TIERS[i].label[lang], emoji: REWARD_TIERS[i].emoji };
    }
  }
  return current;
}

/** Prochain palier (nb requis + libellé) après un `count` donné, null si déjà au max. */
function nextTier(count: number, lang: Lang = 'en'): { at: number; label: string } | null {
  for (const t of REWARD_TIERS) {
    if (count < t.min) return { at: t.min, label: t.label[lang] };
  }
  return null;
}

const referralRef = (code: string) => doc(db, 'referrals', code);
const claimRef = (newUid: string) => doc(db, 'referrals_claims', newUid);

/**
 * Renvoie MON code de parrainage (stable) et s'assure que le doc `referrals/{code}`
 * existe (création paresseuse, best-effort). Utilisé à l'ouverture de l'écran.
 */
export async function getMyCode(email: string): Promise<string> {
  const uid = emailToDocId(norm(email));
  const code = codeForUid(uid);
  if (!uid || !code) return code;
  try {
    const ref = referralRef(code);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      // Premier accès : on matérialise le doc (count=0). merge:true → idempotent.
      await setDoc(ref, { ownerUid: uid, code, count: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
    }
  } catch (e) {
    console.warn('[referral] getMyCode ensure-doc failed', e);
  }
  return code;
}

export type ClaimReason = 'empty' | 'self' | 'notfound' | 'already' | 'error';

/**
 * Réclame un parrainage : l'utilisateur courant (newEmail) déclare avoir été
 * parrainé par le détenteur de `code`.
 *  - anti-vide : code requis.
 *  - anti-auto-parrainage : le code ne doit pas être le mien.
 *  - anti-double : je ne peux réclamer qu'une fois (claim keyed by mon uid).
 * En cas de succès : incrémente le compteur du parrain + écrit mon claim.
 * Best-effort. Renvoie { ok, ownerUid?, reason? }.
 */
export async function claimReferral(
  code: string,
  newEmail: string
): Promise<{ ok: boolean; ownerUid?: string; reason?: ClaimReason; trialUntil?: number | null }> {
  const raw = (code || '').trim().toUpperCase();
  const newUid = emailToDocId(norm(newEmail));
  if (!raw || !newUid) return { ok: false, reason: 'empty' };

  // anti-auto-parrainage : mon propre code ne peut pas me parrainer.
  if (raw === codeForUid(newUid)) return { ok: false, reason: 'self' };

  try {
    // 1) le parrain existe-t-il ? (doc referrals/{code} matérialisé par getMyCode)
    const rref = referralRef(raw);
    const rsnap = await getDoc(rref);
    if (!rsnap.exists()) return { ok: false, reason: 'notfound' };
    const ownerUid: string = (rsnap.data() as any)?.ownerUid || '';

    // garde-fou supplémentaire : si le doc pointe vers moi, c'est de l'auto-parrainage.
    if (ownerUid && norm(ownerUid) === newUid) return { ok: false, reason: 'self' };

    // 2) anti-double : ai-je déjà réclamé ?
    const cref = claimRef(newUid);
    const csnap = await getDoc(cref);
    if (csnap.exists()) return { ok: false, reason: 'already' };

    // 3) écrit mon claim (create-only côté règles) puis incrémente le parrain.
    await setDoc(cref, { code: raw, ownerUid, ts: serverTimestamp() });
    try {
      await setDoc(rref, { count: increment(1), updatedAt: serverTimestamp() }, { merge: true });
    } catch (e) {
      // Le claim est écrit (l'anti-double tient) ; l'incrément est best-effort.
      console.warn('[referral] increment count failed', e);
    }

    logEvent(newEmail, 'referral_claimed', { code: raw, ownerUid }); // Event Bus

    // 4) CRÉDITER les 7 jours Premium aux deux parties. Impossible côté client : accorder
    //    le Premium = écrire `premiumTrialUntil`, y compris sur le doc du PARRAIN, ce que
    //    les règles Firestore interdisent (et à raison — sinon chacun s'abonne seul).
    //    Le backend le fait avec le SDK Admin. Best-effort : si l'appel échoue, le claim
    //    reste écrit et l'octroi est rejouable (la route est idempotente).
    const granted = await grantReferralBonus().catch(() => null);
    return { ok: true, ownerUid, trialUntil: granted?.trialUntil ?? null };
  } catch (e) {
    console.warn('[referral] claimReferral failed', e);
    return { ok: false, reason: 'error' };
  }
}

/**
 * Statistiques de parrainage de l'utilisateur : son code, son nombre de filleuls
 * et la récompense débloquée (+ prochain palier). Best-effort ; en cas d'échec de
 * lecture on renvoie 0 filleul (jamais d'erreur remontée à l'écran).
 */
export async function getReferralStats(email: string, lang: Lang = 'en'): Promise<ReferralStats> {
  const code = codeForEmail(email);
  let count = 0;
  try {
    const snap = await getDoc(referralRef(code));
    if (snap.exists()) count = Number((snap.data() as any)?.count) || 0;
  } catch (e) {
    console.warn('[referral] getReferralStats failed', e);
  }
  const reward = rewardForCount(count, lang);
  const nxt = nextTier(count, lang);
  return {
    code,
    count,
    reward,
    nextAt: nxt ? nxt.at : null,
    nextLabel: nxt ? nxt.label : null,
  };
}

// ── OCTROI DU PREMIUM (serveur) ───────────────────────────────────────────────
//
// Les paliers de REWARD_TIERS annonçaient « 1 mois Premium », « 3 mois Premium »… sans
// qu'aucune ligne ne les accorde : `rewardForCount` ne renvoie qu'un libellé. C'est ce
// que ces deux fonctions viennent combler, en déléguant au backend (seul autorisé à
// écrire `premiumTrialUntil`).
const API = (process.env.EXPO_PUBLIC_API_URL || '').trim();

async function referralFetch(path: string, method = 'GET'): Promise<any> {
  if (!API) throw new Error('API non configurée');
  const tok = await auth.currentUser?.getIdToken().catch(() => null);
  if (!tok) throw new Error('Non connecté');
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message || `Erreur ${res.status}`);
  return body;
}

/**
 * Crédite les 7 jours aux deux parties pour une réclamation déjà écrite.
 * Idempotent côté serveur : rappeler cette route ne réempile pas de semaines.
 */
export function grantReferralBonus(): Promise<{ ok: true; trialUntil: number; ownerBonusDays: number }> {
  return referralFetch('/referral/grant', 'POST');
}

/** Fin d'essai Premium en cours (ms), pour afficher « Premium jusqu'au … ». */
export function getReferralPremiumStatus(): Promise<{ trialUntil: number | null; referredBy: string | null }> {
  return referralFetch('/referral/status');
}
