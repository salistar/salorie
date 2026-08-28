'use client';
import { useCallback, useEffect, useState } from 'react';

type SportField = {
  id: string;
  name?: string;
  sport?: string;
  address?: string;
  city?: string;
  lat?: number;
  lng?: number;
  photo?: string;
  photoUrl?: string;
  imageUrl?: string;
  ownerUid?: string;
  createdBy?: string;
  userId?: string;
  createdAt?: any;
};

type SportMatch = {
  id: string;
  fieldName?: string;
  fieldId?: string;
  sport?: string;
  title?: string;
  hostUid?: string;
  hostId?: string;
  createdBy?: string;
  userId?: string;
  participants?: any[];
  players?: any[];
  maxPlayers?: number;
  startAt?: any;
  createdAt?: any;
};

const photoOf = (f: SportField) => f.photo || f.photoUrl || f.imageUrl || '';

function when(ts: any): string {
  try {
    const ms = ts?._seconds ? ts._seconds * 1000 : (ts?.seconds ? ts.seconds * 1000 : (typeof ts === 'number' ? ts : Date.parse(ts)));
    if (!ms) return '';
    return new Date(ms).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

export default function SportFieldsPage() {
  const [fields, setFields] = useState<SportField[]>([]);
  const [matches, setMatches] = useState<SportMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const r = await fetch('/api/sport-fields', { cache: 'no-store' });
      const j = await r.json();
      if (j.error) { setErr(j.error); }
      else { setFields(Array.isArray(j.fields) ? j.fields : []); setMatches(Array.isArray(j.matches) ? j.matches : []); }
    } catch (e: any) { setErr(e?.message || 'erreur réseau'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (f: SportField, action: 'approve' | 'reject') => {
    const id = f.id;
    if (!id) return;
    if (action === 'reject' && !confirm(`Rejeter (supprimer) le terrain « ${f.name || id} » ?`)) return;
    setBusy(id); setMsg(null);
    try {
      const r = await fetch('/api/sport-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        setFields((cur) => cur.filter((x) => x.id !== id));
        setMsg(action === 'approve' ? '✅ Terrain approuvé.' : '🗑️ Terrain rejeté.');
      } else { setMsg(`❌ ${j.error || j.message || 'échec de l’action'}`); }
    } catch (e: any) { setMsg(`❌ ${e?.message || 'erreur réseau'}`); }
    finally { setBusy(null); }
  };

  return (
    <main className="container">
      <p className="foot"><a href="/" style={{ color: '#2E8B57' }}>← Dashboard</a></p>
      <h2>Terrains & matchs</h2>
      <p className="foot">Modération des sports de groupe : approuve ou rejette les terrains proposés par les utilisateurs, et suis les matchs récents.</p>
      {msg && <p style={{ fontWeight: 600, color: msg.startsWith('✅') || msg.startsWith('🗑️') ? '#2E8B57' : '#e11d48' }}>{msg}</p>}

      {/* (a) Terrains en attente ---------------------------------------------- */}
      <h3 style={{ marginTop: 22 }}>⚽ Terrains en attente {loading ? '…' : `(${fields.length})`}</h3>
      <p className="foot">Terrains proposés par les users (non encore approuvés). Approuver les rend visibles dans l’app ; rejeter les supprime.</p>
      {err ? <div className="card empty">⚠️ {err}</div> : (
        <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
          {fields.map((f) => (
            <div key={f.id} className="card" style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
              {photoOf(f)
                ? <img loading="lazy" decoding="async" src={photoOf(f)} alt="terrain" style={{ width: 64, height: 64, borderRadius: 10, objectFit: 'cover', border: '1px solid #e5e7eb' }} />
                : <div style={{ width: 64, height: 64, borderRadius: 10, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>⚽</div>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {f.name || '(sans nom)'}{f.sport ? <span className="badge" style={{ marginLeft: 8 }}>{f.sport}</span> : null}
                </div>
                <div className="foot">{[f.address, f.city].filter(Boolean).join(', ') || (f.lat != null && f.lng != null ? `${f.lat.toFixed(4)}, ${f.lng.toFixed(4)}` : '—')}</div>
                <div className="foot">Proposé par {f.ownerUid || f.createdBy || f.userId || '—'} · {when(f.createdAt)}</div>
              </div>
              <button disabled={busy === f.id} onClick={() => act(f, 'approve')} style={{ ...btnSm, background: '#2E8B57', color: '#fff', borderColor: '#2E8B57' }}>✅ Approuver</button>
              <button disabled={busy === f.id} onClick={() => act(f, 'reject')} style={{ ...btnSm, color: '#e11d48', borderColor: '#fecaca' }}>Rejeter</button>
            </div>
          ))}
          {!loading && !fields.length && <div className="card empty">Aucun terrain en attente. 🎉</div>}
        </div>
      )}

      {/* (b) Matchs récents --------------------------------------------------- */}
      <h3 style={{ marginTop: 28 }}>📅 Matchs récents {loading ? '…' : `(${matches.length})`}</h3>
      <p className="foot">Derniers matchs organisés par les utilisateurs (lecture seule).</p>
      <div className="card">
        {matches.length === 0 ? (
          <div className="empty">{loading ? 'Chargement…' : 'Aucun match récent.'}</div>
        ) : (
          <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Match</th><th>Sport</th><th>Terrain</th><th>Joueurs</th><th>Organisateur</th><th>Quand</th></tr>
            </thead>
            <tbody>
              {matches.map((m) => {
                const list = Array.isArray(m.participants) ? m.participants : (Array.isArray(m.players) ? m.players : null);
                const nPlayers = list ? list.length : (typeof (m as any).playerCount === 'number' ? (m as any).playerCount : null);
                return (
                  <tr key={m.id}>
                    <td>{m.title || '—'}</td>
                    <td>{m.sport ? <span className="badge">{m.sport}</span> : '—'}</td>
                    <td className="umail">{m.fieldName || m.fieldId || '—'}</td>
                    <td className="umail">{nPlayers != null ? `${nPlayers}${m.maxPlayers ? ` / ${m.maxPlayers}` : ''}` : '—'}</td>
                    <td className="umail">{m.hostUid || m.hostId || m.createdBy || '—'}</td>
                    <td className="umail">{when(m.startAt || m.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <p className="foot" style={{ marginTop: 18 }}>Salorie Admin · sports de groupe · Firestore en direct</p>
    </main>
  );
}

const btnSm: any = { padding: '8px 12px', borderRadius: 9, border: '1px solid #e5e7eb', background: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', color: '#2E8B57' };
