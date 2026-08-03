'use client';
import { useEffect, useState, useCallback } from 'react';
import RaceForm from './RaceForm';
import { buildMedalSvg } from '../../lib/medalFrames';

// Badge médaille (remplace l'émoji) — rend le modèle de la course en petit.
const medalBadge = (r: any) => buildMedalSvg({ ...(r.medalSpec || {}), frame: r.medalSpec ? undefined : r.medalFrame, mode: 'template', title: r.name || '', km: r.totalKm || 0 }).replace('width="264" height="384"', 'width="40" height="58"');

export default function RacesPage() {
  const [races, setRaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [actMsg, setActMsg] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const r = await fetch('/api/races', { cache: 'no-store' });
      const j = await r.json();
      if (Array.isArray(j)) setRaces(j);
      else setErr(j.error || 'backend injoignable');
    } catch (e: any) { setErr(e?.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const del = async (id: string) => {
    if (!confirm('Supprimer cette course ?')) return;
    if (pendingId) return;
    setPendingId(id);
    try {
      const r = await fetch(`/api/races/${id}`, { method: 'DELETE' });
      if (!r.ok) { setActMsg('❌ échec de la suppression'); return; }
      load();
    } catch { setActMsg('❌ backend injoignable'); }
    finally { setPendingId(null); }
  };
  const genMedals = async (id: string) => {
    if (pendingId) return;
    setPendingId(id); setActMsg('Génération…');
    try {
      const r = await fetch(`/api/races/${id}`, { method: 'POST' });
      const j = await r.json();
      setActMsg(j.count != null ? `✅ ${j.count} médaille(s) générée(s) avec classement.` : `❌ ${j.message || j.error || 'erreur'}`);
    } catch { setActMsg('❌ backend injoignable'); }
    finally { setPendingId(null); }
  };

  return (
    <main className="container">
      <p className="foot"><a href="/" style={{ color: '#2E8B57' }}>← Dashboard</a></p>
      <h2>Courses virtuelles</h2>
      <p className="foot">Crée une course (parcours avec arrêts géolocalisés + cadre médaille). À la fin, génère les médailles avec classement.</p>

      <RaceForm onCreated={load} />

      <h3 style={{ marginTop: 28 }}>Courses existantes {loading ? '…' : `(${races.length})`}</h3>
      {actMsg && <p style={{ fontWeight: 600, color: actMsg.startsWith('✅') ? '#2E8B57' : '#e11d48' }}>{actMsg}</p>}
      {err ? <div className="card empty">⚠️ {err}</div> : (
        <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
          {races.map((r) => (
            <div key={r._id} className="card" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span dangerouslySetInnerHTML={{ __html: medalBadge(r) }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{r.name}</div>
                <div className="foot">{r.totalKm} km · {r.waypoints?.length || 0} points · cadre « {r.medalFrame} » · {r.active ? 'active' : 'inactive'}</div>
              </div>
              <button disabled={pendingId === r._id} onClick={() => genMedals(r._id)} style={{ ...btnSm, opacity: pendingId === r._id ? 0.55 : 1, cursor: pendingId === r._id ? 'not-allowed' : 'pointer' }}>{pendingId === r._id ? '…' : '🏅 Médailles'}</button>
              <button disabled={pendingId === r._id} onClick={() => del(r._id)} style={{ ...btnSm, color: '#e11d48', borderColor: '#fecaca', opacity: pendingId === r._id ? 0.55 : 1, cursor: pendingId === r._id ? 'not-allowed' : 'pointer' }}>Supprimer</button>
            </div>
          ))}
          {!loading && !races.length && <div className="card empty">Aucune course. Crée la première ci-dessus.</div>}
        </div>
      )}
    </main>
  );
}
const btnSm: any = { padding: '8px 12px', borderRadius: 9, border: '1px solid #e5e7eb', background: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', color: '#2E8B57' };
