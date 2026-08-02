// SUIVI GLYCÉMIE / TENSION — boucle santé reliée au régime médical.
// 100% Firestore, best-effort (aucune exception ne remonte au caller).
//
// MODÈLE :
//  - Sous-collections privées du user (couvertes par la règle
//    users/{uid}/{document=**} = isOwner) :
//      users/{uid}/glucose         { ts, mgdl, context, date }
//      users/{uid}/blood_pressure  { ts, systolic, diastolic, pulse?, date }
//    `uid` = email sanitizé (emailToDocId) — même convention que partout.
//    On stocke `ts` (number, ms) POUR le tri/filtre client (robuste hors-ligne)
//    en plus de `timestamp` (serverTimestamp) et `date` (YYYY-MM-DD) pour rester
//    cohérent avec lib/tracking.ts et les autres sous-collections.
//
// ALERTES : reliées aux conditions déclarées (dietPrefs.conditions) —
//  glucose hors [70,180] mg/dL, ou BP > 140/90. Chaque alerte porte un conseil
//  conservateur ("parle à ton médecin") — guidance, PAS un diagnostic.
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  where,
  limit as qlimit,
  serverTimestamp,
  doc,
  deleteDoc,
} from 'firebase/firestore';
import { db, emailToDocId } from './firebase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Contexte d'une mesure de glycémie. */
export type GlucoseContext = 'fasting' | 'pre_meal' | 'post_meal' | 'bedtime' | 'random';

export interface GlucoseEntry {
  id?: string;
  ts: number;              // ms epoch (source de vérité pour tri/filtre)
  mgdl: number;            // glycémie en mg/dL
  context: GlucoseContext;
  date?: string;           // YYYY-MM-DD (cohérence tracking)
}

export interface BPEntry {
  id?: string;
  ts: number;              // ms epoch
  systolic: number;        // mmHg (haute)
  diastolic: number;       // mmHg (basse)
  pulse?: number;          // bpm (optionnel)
  date?: string;
}

/** Tendance agrégée d'une série de valeurs. */
export interface Trend {
  count: number;
  avg: number;
  min: number;
  max: number;
  latest: number;
  /** Pente normalisée : 'up' | 'down' | 'flat' (régression simple sur ts↦valeur). */
  direction: 'up' | 'down' | 'flat';
  /** Variation absolue estimée du début→fin de la fenêtre (unité de la valeur). */
  slope: number;
}

/** Alerte de valeur hors-plage, reliée (ou non) à une condition déclarée. */
export interface VitalAlert {
  kind: 'glucose_low' | 'glucose_high' | 'bp_high' | 'bp_low';
  severity: 'warning' | 'danger';
  /** Vrai si l'utilisateur a déclaré la condition liée (diabetes / hypertension). */
  related: boolean;
  /** Valeur fautive (mg/dL pour glucose, "sys/dia" pour BP). */
  value: string;
}

// ---------------------------------------------------------------------------
// Seuils cliniques (guidance conservatrice — PAS un diagnostic)
// ---------------------------------------------------------------------------
export const GLUCOSE_LOW = 70;    // < 70 mg/dL = hypoglycémie
export const GLUCOSE_HIGH = 180;  // > 180 mg/dL = hyperglycémie (post-repas)
export const BP_SYS_HIGH = 140;   // systolique > 140 mmHg
export const BP_DIA_HIGH = 90;    // diastolique > 90 mmHg
export const BP_SYS_LOW = 90;     // systolique < 90 mmHg = hypotension
export const BP_DIA_LOW = 60;     // diastolique < 60 mmHg

const DAY_MS = 24 * 60 * 60 * 1000;

function todayStr(ts = Date.now()): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function num(v: unknown, def = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

const GLUCOSE_CONTEXTS: GlucoseContext[] = ['fasting', 'pre_meal', 'post_meal', 'bedtime', 'random'];
const sanitizeContext = (c?: string): GlucoseContext =>
  (GLUCOSE_CONTEXTS as string[]).includes(c || '') ? (c as GlucoseContext) : 'random';

// ---------------------------------------------------------------------------
// Écritures
// ---------------------------------------------------------------------------

/** Enregistre une mesure de glycémie (mg/dL + contexte). Best-effort. */
export async function logGlucose(
  email: string,
  { mgdl, context }: { mgdl: number; context?: GlucoseContext },
): Promise<boolean> {
  try {
    const uid = emailToDocId(email);
    const v = num(mgdl);
    if (!uid || !(v > 0)) return false;
    const ts = Date.now();
    await addDoc(collection(db, 'users', uid, 'glucose'), {
      ts,
      mgdl: Math.round(v),
      context: sanitizeContext(context),
      date: todayStr(ts),
      timestamp: serverTimestamp(),
    });
    return true;
  } catch (e) {
    console.warn('[vitals] logGlucose failed', e);
    return false;
  }
}

/** Enregistre une mesure de tension (systolique/diastolique + pouls optionnel). Best-effort. */
export async function logBP(
  email: string,
  { systolic, diastolic, pulse }: { systolic: number; diastolic: number; pulse?: number },
): Promise<boolean> {
  try {
    const uid = emailToDocId(email);
    const sys = num(systolic);
    const dia = num(diastolic);
    if (!uid || !(sys > 0) || !(dia > 0)) return false;
    const ts = Date.now();
    const payload: Record<string, any> = {
      ts,
      systolic: Math.round(sys),
      diastolic: Math.round(dia),
      date: todayStr(ts),
      timestamp: serverTimestamp(),
    };
    const p = num(pulse);
    if (p > 0) payload.pulse = Math.round(p);
    await addDoc(collection(db, 'users', uid, 'blood_pressure'), payload);
    return true;
  } catch (e) {
    console.warn('[vitals] logBP failed', e);
    return false;
  }
}

/** Supprime une mesure (glycémie ou tension). Best-effort. */
export async function deleteVital(
  email: string,
  kind: 'glucose' | 'blood_pressure',
  entryId: string,
): Promise<boolean> {
  try {
    const uid = emailToDocId(email);
    if (!uid || !entryId) return false;
    await deleteDoc(doc(db, 'users', uid, kind, entryId));
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Lectures (fenêtre glissante en jours)
// ---------------------------------------------------------------------------

async function listSub(uid: string, sub: string, days: number, max = 200): Promise<any[]> {
  const since = Date.now() - days * DAY_MS;
  try {
    // Filtre sur `ts` (number) → pas de dépendance à serverTimestamp (robuste
    // hors-ligne) et pas d'index composite requis (un seul champ trié).
    const snap = await getDocs(
      query(
        collection(db, 'users', uid, sub),
        where('ts', '>=', since),
        orderBy('ts', 'desc'),
        qlimit(max),
      ),
    );
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  } catch {
    // Fallback si `ts` absent sur d'anciens docs / index manquant : on liste par
    // timestamp puis on filtre côté client.
    try {
      const snap = await getDocs(
        query(collection(db, 'users', uid, sub), orderBy('timestamp', 'desc'), qlimit(max)),
      );
      return snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }))
        .filter((e) => {
          const ts = num(e.ts, (e.timestamp?.seconds || 0) * 1000);
          return ts >= since;
        });
    } catch (e) {
      console.warn('[vitals] listSub failed', sub, e);
      return [];
    }
  }
}

/** Liste les glycémies des `days` derniers jours (plus récent d'abord). */
export async function listGlucose(email: string, days = 30): Promise<GlucoseEntry[]> {
  const uid = emailToDocId(email);
  if (!uid) return [];
  const rows = await listSub(uid, 'glucose', days);
  return rows.map((r) => ({
    id: r.id,
    ts: num(r.ts, (r.timestamp?.seconds || 0) * 1000),
    mgdl: num(r.mgdl),
    context: sanitizeContext(r.context),
    date: r.date,
  }));
}

/** Liste les tensions des `days` derniers jours (plus récent d'abord). */
export async function listBP(email: string, days = 30): Promise<BPEntry[]> {
  const uid = emailToDocId(email);
  if (!uid) return [];
  const rows = await listSub(uid, 'blood_pressure', days);
  return rows.map((r) => ({
    id: r.id,
    ts: num(r.ts, (r.timestamp?.seconds || 0) * 1000),
    systolic: num(r.systolic),
    diastolic: num(r.diastolic),
    pulse: num(r.pulse) > 0 ? num(r.pulse) : undefined,
    date: r.date,
  }));
}

// ---------------------------------------------------------------------------
// Tendances (moyenne, min/max, direction)
// ---------------------------------------------------------------------------

/**
 * Calcule une tendance à partir d'une série de points {ts, value}.
 * `direction` via une régression linéaire simple (moindres carrés) sur ts↦value :
 * la pente signée sur la fenêtre donne up/down/flat (seuil = 5% de la moyenne).
 */
export function trend(points: { ts: number; value: number }[]): Trend | null {
  const pts = (points || []).filter((p) => Number.isFinite(p.value));
  const n = pts.length;
  if (!n) return null;
  const values = pts.map((p) => p.value);
  const sum = values.reduce((s, v) => s + v, 0);
  const avg = sum / n;
  const min = Math.min(...values);
  const max = Math.max(...values);
  // Les points arrivent triés décroissant (plus récent d'abord) → latest = [0].
  const latest = pts[0].value;

  let slope = 0;
  if (n >= 2) {
    // Régression sur un axe temps NORMALISÉ (0=plus ancien, 1=plus récent) pour
    // éviter les problèmes d'échelle des ms ; slope = variation début→fin.
    const tMin = Math.min(...pts.map((p) => p.ts));
    const tMax = Math.max(...pts.map((p) => p.ts));
    const span = tMax - tMin || 1;
    const xs = pts.map((p) => (p.ts - tMin) / span);
    const mx = xs.reduce((s, x) => s + x, 0) / n;
    const my = avg;
    let numr = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      numr += (xs[i] - mx) * (values[i] - my);
      den += (xs[i] - mx) ** 2;
    }
    slope = den > 0 ? numr / den : 0; // variation totale sur la fenêtre (x∈[0,1])
  }

  const eps = Math.max(1, Math.abs(avg) * 0.05);
  const direction: Trend['direction'] = slope > eps ? 'up' : slope < -eps ? 'down' : 'flat';
  return {
    count: n,
    avg: Math.round(avg * 10) / 10,
    min: Math.round(min * 10) / 10,
    max: Math.round(max * 10) / 10,
    latest: Math.round(latest * 10) / 10,
    direction,
    slope: Math.round(slope * 10) / 10,
  };
}

/** Tendance glycémie (mg/dL) sur les mesures fournies. */
export function glucoseTrend(entries: GlucoseEntry[]): Trend | null {
  return trend((entries || []).map((e) => ({ ts: e.ts, value: e.mgdl })));
}

/** Tendances tension : systolique + diastolique (+ pouls si dispo). */
export function bpTrend(entries: BPEntry[]): {
  systolic: Trend | null;
  diastolic: Trend | null;
  pulse: Trend | null;
} {
  const es = entries || [];
  return {
    systolic: trend(es.map((e) => ({ ts: e.ts, value: e.systolic }))),
    diastolic: trend(es.map((e) => ({ ts: e.ts, value: e.diastolic }))),
    pulse: trend(es.filter((e) => (e.pulse || 0) > 0).map((e) => ({ ts: e.ts, value: e.pulse as number }))),
  };
}

// ---------------------------------------------------------------------------
// Alertes (reliées aux conditions déclarées)
// ---------------------------------------------------------------------------

/**
 * Évalue une mesure de glycémie. Renvoie une alerte si hors [70,180] mg/dL.
 * `conditions` = dietPrefs.conditions ; 'diabetes' déclaré → related=true (le
 * conseil est plus appuyé). severity = danger si franchement hors seuil.
 */
export function glucoseAlert(mgdl: number, conditions: string[] = []): VitalAlert | null {
  const v = num(mgdl);
  if (!(v > 0)) return null;
  const related = (conditions || []).map((c) => String(c).toLowerCase()).includes('diabetes');
  if (v < GLUCOSE_LOW) {
    return { kind: 'glucose_low', severity: v < 54 ? 'danger' : 'warning', related, value: `${Math.round(v)} mg/dL` };
  }
  if (v > GLUCOSE_HIGH) {
    return { kind: 'glucose_high', severity: v > 250 ? 'danger' : 'warning', related, value: `${Math.round(v)} mg/dL` };
  }
  return null;
}

/**
 * Évalue une mesure de tension. Renvoie une alerte si > 140/90 (ou hypotension
 * < 90/60). 'hypertension' déclaré → related=true.
 */
export function bpAlert(
  systolic: number,
  diastolic: number,
  conditions: string[] = [],
): VitalAlert | null {
  const sys = num(systolic);
  const dia = num(diastolic);
  if (!(sys > 0) || !(dia > 0)) return null;
  const related = (conditions || []).map((c) => String(c).toLowerCase()).includes('hypertension');
  const val = `${Math.round(sys)}/${Math.round(dia)}`;
  if (sys > BP_SYS_HIGH || dia > BP_DIA_HIGH) {
    const danger = sys >= 180 || dia >= 120; // crise hypertensive
    return { kind: 'bp_high', severity: danger ? 'danger' : 'warning', related, value: val };
  }
  if (sys < BP_SYS_LOW || dia < BP_DIA_LOW) {
    return { kind: 'bp_low', severity: 'warning', related, value: val };
  }
  return null;
}
