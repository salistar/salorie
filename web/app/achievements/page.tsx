'use client';
import { useEffect, useState, useCallback } from 'react';

const METRICS = [
  { v: 'streak', label: 'Série (jours consécutifs)' },
  { v: 'daysTracked', label: 'Jours suivis' },
  { v: 'weighIns', label: 'Pesées' },
  { v: 'totalLogs', label: 'Logs au total' },
];

// Les 10 achievements par défaut (proposés si Firestore vide) — éditables.
const DEFAULTS = [
  { key: 'first_log', icon: '🍽️', metric: 'totalLogs', threshold: 1, titleFr: 'Premier pas', descFr: 'Logue ton premier repas', titleEn: 'First step', descEn: 'Log your first meal', enabled: true },
  { key: 'streak_3', icon: '🔥', metric: 'streak', threshold: 3, titleFr: "C'est parti", descFr: 'Série de 3 jours', titleEn: 'Getting started', descEn: '3-day streak', enabled: true },
  { key: 'streak_7', icon: '🔥', metric: 'streak', threshold: 7, titleFr: 'Lancé', descFr: 'Série de 7 jours', titleEn: 'On a roll', descEn: '7-day streak', enabled: true },
  { key: 'streak_14', icon: '⚡', metric: 'streak', threshold: 14, titleFr: 'Engagé', descFr: 'Série de 14 jours', titleEn: 'Committed', descEn: '14-day streak', enabled: true },
  { key: 'streak_30', icon: '🏆', metric: 'streak', threshold: 30, titleFr: 'Inarrêtable', descFr: 'Série de 30 jours', titleEn: 'Unstoppable', descEn: '30-day streak', enabled: true },
  { key: 'days_7', icon: '📅', metric: 'daysTracked', threshold: 7, titleFr: 'Première semaine', descFr: '7 jours suivis', titleEn: 'First week', descEn: '7 days tracked', enabled: true },
  { key: 'days_30', icon: '📆', metric: 'daysTracked', threshold: 30, titleFr: 'Habitude prise', descFr: '30 jours suivis', titleEn: 'Habit formed', descEn: '30 days tracked', enabled: true },
  { key: 'weigh_1', icon: '⚖️', metric: 'weighIns', threshold: 1, titleFr: 'Sur la balance', descFr: 'Première pesée', titleEn: 'Step on', descEn: 'First weigh-in', enabled: true },
  { key: 'weigh_5', icon: '📉', metric: 'weighIns', threshold: 5, titleFr: 'Tendance', descFr: '5 pesées', titleEn: 'Trend setter', descEn: '5 weigh-ins', enabled: true },
  { key: 'logs_50', icon: '💪', metric: 'totalLogs', threshold: 50, titleFr: 'Logger pro', descFr: '50 logs au total', titleEn: 'Power logger', descEn: '50 logs total', enabled: true },
];

export default function AchievementsPage() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await (await fetch('/api/achievements', { cache: 'no-store' })).json();
      setList(Array.isArray(j) && j.length ? j : DEFAULTS);
    } catch { setList(DEFAULTS); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (i: number, k: string, v: any) => setList((a) => a.map((x, idx) => idx === i ? { ...x, [k]: v } : x));
  const add = () => setList((a) => [...a, { key: 'new_' + a.length, icon: '🏅', metric: 'streak', threshold: 5, titleFr: '', descFr: '', titleEn: '', descEn: '', enabled: true }]);
  const del = (i: number) => setList((a) => a.filter((_, idx) => idx !== i));

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const j = await (await fetch('/api/achievements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ list }) })).json();
      setMsg(j.ok ? `✅ ${j.count} achievement(s) enregistré(s). L'app les utilisera (fallback sur les défauts sinon).` : `❌ ${j.error}`);
    } catch (e: any) { setMsg('❌ ' + e?.message); } finally { setBusy(false); }
  };

  return (
    <main className="container">
      <p className="foot"><a href="/" style={{ color: '#2E8B57' }}>← Dashboard</a></p>
      <h2>Achievements</h2>
      <p className="foot">Définis les badges débloqués par les users. Métrique + seuil ; l'app évalue automatiquement (série, jours suivis, pesées, logs). Désactive sans supprimer via la case.</p>

      {loading ? <p className="foot">Chargement…</p> : (
        <>
          <div style={{ display: 'grid', gap: 10 }}>
            {list.map((a, i) => (
              <div key={i} className="card" style={{ padding: 12, opacity: a.enabled === false ? 0.55 : 1 }}>
                <div className="ach-row">
                  <input style={inp} value={a.icon} onChange={(e) => set(i, 'icon', e.target.value)} title="emoji" />
                  <input style={inp} value={a.key} onChange={(e) => set(i, 'key', e.target.value)} placeholder="clé unique" />
                  <select style={inp} value={a.metric} onChange={(e) => set(i, 'metric', e.target.value)}>
                    {METRICS.map((m) => <option key={m.v} value={m.v}>{m.label}</option>)}
                  </select>
                  <input style={inp} type="number" value={a.threshold} onChange={(e) => set(i, 'threshold', Number(e.target.value))} title="seuil ≥" />
                  <input type="checkbox" checked={a.enabled !== false} onChange={(e) => set(i, 'enabled', e.target.checked)} title="activé" />
                </div>
                <div className="ach-i18n">
                  <input style={inp} value={a.titleFr || ''} onChange={(e) => set(i, 'titleFr', e.target.value)} placeholder="Titre (FR)" />
                  <input style={inp} value={a.descFr || ''} onChange={(e) => set(i, 'descFr', e.target.value)} placeholder="Description (FR)" />
                  <input style={inp} value={a.titleEn || ''} onChange={(e) => set(i, 'titleEn', e.target.value)} placeholder="Title (EN)" />
                  <input style={inp} value={a.descEn || ''} onChange={(e) => set(i, 'descEn', e.target.value)} placeholder="Description (EN)" />
                </div>
                <div style={{ textAlign: 'right', marginTop: 4 }}>
                  <button onClick={() => del(i)} style={{ border: 'none', background: 'none', color: '#e11d48', cursor: 'pointer', fontSize: 13 }}>Supprimer</button>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button onClick={add} style={btnGhost}>+ Ajouter un achievement</button>
            <button onClick={save} disabled={busy} style={btnMain}>{busy ? 'Enregistrement…' : '💾 Enregistrer tout'}</button>
          </div>
          {msg && <p style={{ marginTop: 12, fontWeight: 600, color: msg.startsWith('✅') ? '#2E8B57' : '#e11d48' }}>{msg}</p>}
        </>
      )}
    </main>
  );
}
const inp: any = { width: '100%', padding: '8px 10px', borderRadius: 9, border: '1px solid #e5e7eb', fontSize: 13, boxSizing: 'border-box' };
const btnGhost: any = { padding: '10px 16px', borderRadius: 11, border: '1.5px solid #2E8B57', background: 'none', color: '#2E8B57', fontWeight: 700, cursor: 'pointer' };
const btnMain: any = { flex: 1, padding: '11px', borderRadius: 11, border: 'none', background: '#2E8B57', color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer' };
