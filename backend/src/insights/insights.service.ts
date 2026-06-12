import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { FirebaseService } from '../firebase.service';

// Mirrors lib/InsightsService.ts on the app so the precomputed docs are read
// instantly by the mobile app (0 AI on open).
@Injectable()
export class InsightsService {
  private readonly logger = new Logger('Insights');
  private genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
  private model = process.env.GEMINI_LITE_MODEL || 'gemini-2.0-flash-lite';

  constructor(private fb: FirebaseService) {}

  // ── ISO week key, identical to the app's buildPeriodKey('week') ──
  weekKey(ref = new Date()): string {
    const d = new Date(Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `week_${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  }
  monthKey(ref = new Date()): string {
    return `month_${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}`;
  }

  private offline(logs: any[], periodLabel: string) {
    const meals = logs.filter((l) => l.type === 'meal');
    const activities = logs.filter((l) => l.type === 'activity');
    const waters = logs.filter((l) => l.type === 'water');
    const burnedKcal = activities.reduce((a, l) => a + (l.calories || 0), 0);
    const totalWaterMl = waters.reduce((a, l) => a + (l.calories || 0), 0);
    const days = new Set(logs.map((l) => l.date)).size || 1;
    const avgWaterMl = Math.round(totalWaterMl / days);
    const freq: Record<string, number> = {};
    for (const m of meals) freq[m.name] = (freq[m.name] || 0) + 1;
    const topFood = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
    const healthScore = Math.max(0, Math.min(100, Math.round(40 + (meals.length > 0 ? 20 : 0) + activities.length * 3 + avgWaterMl / 100)));
    const hyd = (en: string, fr: string, ar: string) => (avgWaterMl >= 2200 ? ['Excellent', 'Excellent', 'ممتاز'] : avgWaterMl >= 1500 ? ['Good', 'Bon', 'جيد'] : avgWaterMl >= 800 ? ['Low', 'Faible', 'منخفض'] : ['Dehydrated', 'Déshydraté', 'جفاف']);
    const [hEN, hFR, hAR] = hyd('', '', '');
    return {
      healthScore,
      en: { summary: `${meals.length} meals and ${activities.length} workouts over ${days} day(s).`, topFood, hydrationStatus: hEN, recommendation: avgWaterMl < 1500 ? 'Add 500 ml of water tomorrow.' : activities.length < 3 ? 'Aim for 3 workouts this period.' : 'Keep up the consistency!', exerciseAnalysis: activities.length ? `${activities.length} sessions, ~${burnedKcal} kcal burned.` : 'No activity logged.' },
      fr: { summary: `${meals.length} repas et ${activities.length} séances sur ${days} jour(s).`, topFood, hydrationStatus: hFR, recommendation: avgWaterMl < 1500 ? "Ajoute 500 ml d'eau demain." : activities.length < 3 ? 'Vise 3 séances sur la période.' : 'Continue comme ça !', exerciseAnalysis: activities.length ? `${activities.length} séances, ~${burnedKcal} kcal brûlées.` : 'Aucune activité enregistrée.' },
      ar: { summary: `${meals.length} وجبات و ${activities.length} تمارين خلال ${days} يوم.`, topFood, hydrationStatus: hAR, recommendation: avgWaterMl < 1500 ? 'أضف 500 مل من الماء غدًا.' : activities.length < 3 ? 'استهدف 3 جلسات.' : 'استمر هكذا!', exerciseAnalysis: activities.length ? `${activities.length} جلسات، ~${burnedKcal} سعرة.` : 'لا يوجد نشاط مسجل.' },
      source: 'computed' as const,
    };
  }

  async generate(profile: any, logs: any[], periodLabel: string) {
    if (!this.genAI || logs.length === 0) return this.offline(logs, periodLabel);
    // RGPD/anonymisation : on n'envoie à Gemini AUCUN identifiant (ni nom, ni email,
    // ni uid) — uniquement l'objectif et un poids ARRONDI, plus les aliments loggés.
    const goal = String(profile?.goal || 'general health').slice(0, 40);
    const weightRounded = Math.round(Number(profile?.weight) || 0) || 'unknown';
    const logsSummary = logs.slice(-200).map((l) => `${l.date}: ${l.name} (${l.calories} ${l.type === 'water' ? 'ml' : 'kcal'}, ${l.type}${l.intensity ? ', ' + l.intensity : ''})`).join('\n');
    const prompt = `You are a nutrition & fitness analyst. Analyse the user's ${periodLabel} logs.
User goal: ${goal}
Current weight: ${weightRounded}kg
Logs (${logs.length}):
${logsSummary || 'No logs yet.'}
Return ONLY strict JSON, no backticks, with this exact shape:
{"healthScore": number, "en": {"summary":"...","topFood":"...","hydrationStatus":"...","recommendation":"...","exerciseAnalysis":"..."}, "fr": {...}, "ar": {...}}
Rules: summary=1 sentence; topFood=most frequent food or "—"; hydrationStatus=one word; recommendation<15 words; exerciseAnalysis=1-2 sentences. fr in French, ar in Arabic, en in English.`;
    try {
      const model = this.genAI.getGenerativeModel({ model: this.model });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('no json');
      const parsed = JSON.parse(m[0]);
      const off = this.offline(logs, periodLabel);
      for (const l of ['en', 'fr', 'ar']) {
        parsed[l] = parsed[l] || {};
        for (const k of ['summary', 'topFood', 'hydrationStatus', 'recommendation', 'exerciseAnalysis']) {
          if (!parsed[l][k] || typeof parsed[l][k] !== 'string' || !parsed[l][k].trim()) parsed[l][k] = (off as any)[l][k];
        }
      }
      if (typeof parsed.healthScore !== 'number') parsed.healthScore = off.healthScore;
      return { ...parsed, source: 'ai' as const };
    } catch (e: any) {
      this.logger.warn('Gemini failed, offline fallback: ' + e.message);
      return this.offline(logs, periodLabel);
    }
  }

  // ── Nightly precompute for active users → Firestore (app reads it, 0 AI) ──
  @Cron(process.env.INSIGHTS_CRON || '0 3 * * *')
  async nightly() {
    this.logger.log('Nightly insights precompute starting…');
    await this.precomputeAll();
  }

  async precomputeAll(max = 1000) {
    const db = this.fb.db();
    const users = await db.collection('users').limit(max).get();
    const wKey = this.weekKey();
    const mKey = this.monthKey();
    const since = new Date(Date.now() - 35 * 24 * 3600 * 1000).toISOString().slice(0, 10); // YYYY-MM-DD
    let done = 0, skipped = 0;
    for (const u of users.docs) {
      try {
        const profile = u.data();
        const logsSnap = await db.collection('users').doc(u.id).collection('logs').where('date', '>=', since).get();
        const logs = logsSnap.docs.map((d) => d.data());
        if (!logs.length) { skipped++; continue; } // inactive — don't waste a call
        for (const [scope, key, label] of [['week', wKey, 'this week'], ['month', mKey, 'this month']] as const) {
          const ins = await this.generate(profile, logs, label);
          await db.collection('users').doc(u.id).collection('ai_insights').doc(key).set(
            { ...ins, scope, periodKey: key, updatedAt: Date.now(), generatedAt: Date.now(), stale: false },
            { merge: true },
          );
        }
        done++;
      } catch (e: any) { this.logger.warn(`user ${u.id}: ${e.message}`); }
    }
    const res = { weekKey: wKey, monthKey: mKey, users: users.size, precomputed: done, skipped };
    this.logger.log(`Insights precompute done: ${JSON.stringify(res)}`);
    return res;
  }
}
