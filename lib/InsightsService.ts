/**
 * InsightsService — period-scoped AI analysis with 3-language storage,
 * cache-first reads and a 7-day sync token.
 *
 * Data shape in Firestore:
 *   users/{docId}/ai_insights/{periodKey}
 *     scope: 'week' | 'month' | 'all'
 *     healthScore: number
 *     en: { summary, topFood, hydrationStatus, recommendation, exerciseAnalysis }
 *     fr: { ... }  ar: { ... }
 *     updatedAt: number (ms)     // monotonic clock for cache-vs-server compare
 *     generatedAt: number (ms)
 *     stale: boolean             // flipped by writers when a new log lands
 *
 * AsyncStorage mirror:
 *   insights_{docId}_{periodKey}         → full doc (all 3 languages)
 *   insights_synced_{docId}              → ms timestamp of last full sync
 *
 * Strategy on analytics mount:
 *   1. Read cache → render immediately (any language available for free)
 *   2. If TTL < 7 days: compare cache.updatedAt vs server.updatedAt;
 *      if server newer, refresh cache. If `stale` true or doc missing,
 *      regenerate via Gemini in 3 langs, then save back to Firestore + cache.
 *   3. If TTL ≥ 7 days: force a full resync + regenerate.
 *
 * On every log mutation (meal / activity / water):
 *   markInsightsStale(email) → flips stale=true on week + month docs so the
 *   next analytics open regenerates. The cache is not deleted so the user
 *   still sees yesterday's data instantly while new data is computed.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db, emailToDocId, UserProfile } from './firebase';
import { generateMultilangBentoInsights, MultilangBentoInsight } from './AiModel';

export type InsightScope = 'week' | 'month' | 'all';
export type Lang = 'en' | 'fr' | 'ar';

const TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Deterministic period keys so the Firestore doc id stays stable and can be
 *  updated in place (setDoc + merge). */
export function buildPeriodKey(scope: InsightScope, ref: Date = new Date()): string {
  if (scope === 'all') return 'all_time';
  if (scope === 'month') {
    return `month_${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}`;
  }
  // week: ISO week number
  const d = new Date(Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `week_${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export interface StoredInsight extends MultilangBentoInsight {
  scope: InsightScope;
  periodKey: string;
  updatedAt: number;
  generatedAt: number;
  stale?: boolean;
  /** Provenance tag: 'ai' = Gemini output, 'computed' = offline fallback from
   *  real logs. Any doc without this field is treated as legacy hardcoded
   *  seed data and forcibly regenerated on next read. */
  source?: 'ai' | 'computed';
}

const cacheKey = (docId: string, periodKey: string) => `insights_${docId}_${periodKey}`;
const syncedKey = (docId: string) => `insights_synced_${docId}`;

// ── cache I/O ──────────────────────────────────────────────────────────────
export async function readCache(docId: string, periodKey: string): Promise<StoredInsight | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(docId, periodKey));
    return raw ? (JSON.parse(raw) as StoredInsight) : null;
  } catch { return null; }
}

export async function writeCache(docId: string, ins: StoredInsight): Promise<void> {
  try { await AsyncStorage.setItem(cacheKey(docId, ins.periodKey), JSON.stringify(ins)); } catch {}
}

// ── server I/O ─────────────────────────────────────────────────────────────
export async function readServer(docId: string, periodKey: string): Promise<StoredInsight | null> {
  try {
    console.log('\x1b[32m[API→Firestore] ai_insights/get\x1b[0m', { docId, periodKey });
    const t0 = Date.now();
    const snap = await getDoc(doc(db, 'users', docId, 'ai_insights', periodKey));
    if (!snap.exists()) {
      console.log('\x1b[34m[API←Firestore] ai_insights MISS\x1b[0m', { periodKey, ms: Date.now() - t0 });
      return null;
    }
    const data = snap.data() as StoredInsight;
    console.log('\x1b[34m[API←Firestore] ai_insights HIT\x1b[0m', {
      periodKey, ms: Date.now() - t0,
      source: data.source, healthScore: data.healthScore,
      updatedAt: data.updatedAt, stale: data.stale,
    });
    return data;
  } catch (e) {
    console.warn('\x1b[34m[API←Firestore] ai_insights/get FAILED:\x1b[0m', (e as Error).message);
    return null;
  }
}

export async function writeServer(docId: string, ins: StoredInsight): Promise<void> {
  try {
    console.log('\x1b[32m[API→Firestore] ai_insights/set\x1b[0m', {
      docId, periodKey: ins.periodKey, source: ins.source, healthScore: ins.healthScore,
    });
    const t0 = Date.now();
    await setDoc(doc(db, 'users', docId, 'ai_insights', ins.periodKey), ins, { merge: true });
    console.log('\x1b[34m[API←Firestore] ai_insights/set OK\x1b[0m', { periodKey: ins.periodKey, ms: Date.now() - t0 });
  } catch (e) {
    console.warn('\x1b[34m[API←Firestore] ai_insights/set FAILED:\x1b[0m', (e as Error).message);
  }
}

// ── staleness flag (called by log mutation writers) ────────────────────────
export async function markInsightsStale(email: string): Promise<void> {
  const docId = emailToDocId(email);
  if (!docId) return;
  const weekKey = buildPeriodKey('week');
  const monthKey = buildPeriodKey('month');
  for (const k of [weekKey, monthKey, 'all_time']) {
    try {
      await updateDoc(doc(db, 'users', docId, 'ai_insights', k), { stale: true, updatedAt: Date.now() });
    } catch { /* doc may not exist yet — fine */ }
    try {
      const cached = await readCache(docId, k);
      if (cached) { cached.stale = true; await writeCache(docId, cached); }
    } catch {}
  }
}

// ── TTL helpers ────────────────────────────────────────────────────────────
export async function isTtlExpired(docId: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(syncedKey(docId));
    if (!raw) return true;
    const age = Date.now() - Number(raw);
    return age > TTL_MS;
  } catch { return true; }
}

export async function touchSyncToken(docId: string): Promise<void> {
  try { await AsyncStorage.setItem(syncedKey(docId), String(Date.now())); } catch {}
}

// ── main orchestrator ──────────────────────────────────────────────────────
export interface GetInsightsArgs {
  email: string;
  scope: InsightScope;
  profile: Partial<UserProfile>;
  logs: any[];
  /** Forces a regenerate even if cache is fresh. */
  force?: boolean;
  /** Called with cache data immediately (so the UI paints fast) while the
   *  server refresh runs in the background. */
  onCacheHit?: (ins: StoredInsight) => void;
}

/**
 * Returns the best-known insight for (email, scope). Emits the cached version
 * synchronously via `onCacheHit` and resolves with the final one (which may be
 * a regenerated doc). Guarantees all 3 languages are populated.
 */
export async function getInsights({ email, scope, profile, logs, force, onCacheHit }: GetInsightsArgs): Promise<StoredInsight | null> {
  const docId = emailToDocId(email);
  if (!docId) return null;
  const periodKey = buildPeriodKey(scope);
  const now = Date.now();

  // 1. Cache
  const cached = await readCache(docId, periodKey);
  if (cached) onCacheHit?.(cached);

  const ttlExpired = await isTtlExpired(docId);

  // A cached doc is "empty" if ANY required field is missing/placeholder in
  // ANY of the 3 languages, OR if it's a legacy hardcoded seed (no `source`
  // tag). Triggers regen from real logs. This is stricter than just checking
  // `summary` — we need `exerciseAnalysis` etc. to never be empty.
  const isBad = (v: any) => !v || typeof v !== 'string' || !v.trim() || v === '—' || v === '-' || v === '...';
  const isEmpty = (ins: StoredInsight | null): boolean => {
    if (!ins) return true;
    if (!ins.source) return true; // legacy / hardcoded
    const langs: Array<'en' | 'fr' | 'ar'> = ['en', 'fr', 'ar'];
    const keys = ['summary', 'topFood', 'hydrationStatus', 'recommendation', 'exerciseAnalysis'] as const;
    for (const l of langs) {
      const sub = (ins as any)[l];
      if (!sub) return true;
      for (const k of keys) if (isBad(sub[k])) return true;
    }
    return false;
  };

  // Decide whether we can skip any server work.
  //   - force: always refresh
  //   - ttl expired: refresh
  //   - cache stale flag: refresh
  //   - no cache: refresh
  //   - cache has placeholder dashes (old failed AI run): refresh
  const mustRefresh = force || ttlExpired || !cached || cached.stale || isEmpty(cached);

  if (!mustRefresh) return cached!;

  // 2. Server fetch → compare. Skip if the server doc itself is just a
  // placeholder written by a previous failed run.
  const server = await readServer(docId, periodKey);
  if (server && !isEmpty(server) && (!cached || server.updatedAt > cached.updatedAt) && !server.stale) {
    await writeCache(docId, server);
    await touchSyncToken(docId);
    console.log('[InsightsService] server hit for', periodKey);
    return server;
  }

  // 3. Regenerate via Gemini in 3 langs (with offline fallback inside)
  console.log('[InsightsService] regenerating', periodKey, '— logs:', logs.length);
  try {
    const label = scope === 'week' ? 'this week' : scope === 'month' ? 'this month' : 'all time';
    const multi = await generateMultilangBentoInsights(profile, logs, label);
    const fresh: StoredInsight = {
      ...multi,
      scope,
      periodKey,
      updatedAt: now,
      generatedAt: now,
      stale: false,
    };
    await writeServer(docId, fresh);
    await writeCache(docId, fresh);
    await touchSyncToken(docId);
    console.log('[InsightsService] regenerated + saved', periodKey, '— summary:', fresh.en?.summary);
    return fresh;
  } catch (e) {
    console.warn('[InsightsService] regenerate failed:', (e as Error).message);
    return cached || server || null;
  }
}

/** Pick the right language subtree from a stored insight, with PER-FIELD
 *  fallback to EN. Guards against cases where Gemini returned a partial
 *  response in one language (e.g. fr missing `exerciseAnalysis`) — the EN
 *  subtree is always the most reliable, so any missing/empty field gets
 *  backfilled from EN rather than leaving the UI blank. */
export function pickLang(ins: StoredInsight | null | undefined, lang: Lang) {
  if (!ins) return null;
  const primary = (ins as any)[lang] || {};
  const en = (ins as any).en || {};
  const keys = ['summary', 'topFood', 'hydrationStatus', 'recommendation', 'exerciseAnalysis'] as const;
  const merged: any = {};
  let anyValue = false;
  for (const k of keys) {
    const v = primary[k];
    const good = typeof v === 'string' && v.trim() && v !== '—' && v !== '-' && v !== '...';
    merged[k] = good ? v : en[k];
    if (merged[k]) anyValue = true;
  }
  return anyValue ? merged : (en || null);
}
