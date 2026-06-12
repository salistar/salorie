'use client';
import { useEffect, useState, useCallback } from 'react';
import { buildMedalSvg } from '../../lib/medalFrames';

const svg = (m: any, w: number) => buildMedalSvg({ ...(m.spec || {}), frame: m.frame, title: m.raceName, km: m.distanceKm, time: m.timeLabel, name: m.userName, rank: m.rank }).replace('width="264" height="384"', `width="${w}" height="${Math.round((w * 384) / 264)}"`);

export default function MedalsHistory() {
  const [medals, setMedals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  // Pagination côté client : on rend 60 cartes à la fois (le SVG par carte rend
  // le DOM lourd au-delà).
  const [visible, setVisible] = useState(60);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const j = await (await fetch('/api/medals-history', { cache: 'no-store' })).json();
      if (Array.isArray(j)) setMedals(j); else setErr(j.error || 'backend injoignable');
    } catch (e: any) { setErr(e?.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <main className="container">
      <p className="foot"><a href="/" style={{ color: '#2E8B57' }}>← Dashboard</a></p>
      <h2>Historique des médailles</h2>
      <p className="foot">Toutes les médailles gagnées par les utilisateurs (par email), avec leur modèle, classement et temps. Stockées en base.</p>
      {loading ? <p className="foot">Chargement…</p>
        : err ? <div className="card empty">⚠️ {err}</div>
        : !medals.length ? <div className="card empty">Aucune médaille gagnée pour l'instant.</div>
        : (
          <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 14, marginTop: 12 }}>
            {medals.slice(0, visible).map((m) => (
              <div key={m._id} className="card" style={{ padding: 10, textAlign: 'center' }}>
                <div dangerouslySetInnerHTML={{ __html: svg(m, 120) }} />
                <div style={{ fontWeight: 700, fontSize: 13, marginTop: 4 }}>{m.raceName}</div>
                <div className="foot" style={{ fontSize: 11 }}>{m.userName || m.email || m.userId}</div>
                <div className="foot" style={{ fontSize: 11 }}>{m.rank}ᵉ · {m.timeLabel || '—'} · {m.distanceKm} km</div>
              </div>
            ))}
          </div>
          {medals.length > visible && (
            <p style={{ textAlign: 'center', marginTop: 14 }}>
              <button onClick={() => setVisible((v) => v + 60)} style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', fontWeight: 700, cursor: 'pointer', color: '#2E8B57' }}>
                Voir {Math.min(60, medals.length - visible)} de plus ({medals.length - visible} restantes)
              </button>
            </p>
          )}
          </>
        )}
    </main>
  );
}
