'use client';
import { useEffect, useState, useCallback } from 'react';

const KINDS = [
  { v: 'news', label: '📰 Actu' },
  { v: 'race', label: '🏁 Course à venir' },
  { v: 'challenge', label: '🏆 Défi' },
  { v: 'update', label: '✨ Nouveauté app' },
];

export default function NewsAdmin() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [kind, setKind] = useState('news');
  const [imageUrl, setImageUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const j = await (await fetch('/api/news', { cache: 'no-store' })).json();
      if (Array.isArray(j)) setItems(j); else setErr(j.error || 'backend injoignable');
    } catch (e: any) { setErr(e?.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const publish = async () => {
    if (!title.trim()) return;
    setBusy(true);
    await fetch('/api/news', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, body, kind, imageUrl: imageUrl.trim() }) });
    setTitle(''); setBody(''); setImageUrl(''); setBusy(false); load();
  };
  const toggle = async (n: any) => {
    if (rowBusy) return;
    setRowBusy(n._id);
    try { await fetch('/api/news', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: n._id, active: !n.active }) }); load(); }
    finally { setRowBusy(null); }
  };
  const del = async (id: string) => {
    if (!confirm('Supprimer cette actu ?')) return;
    if (rowBusy) return;
    setRowBusy(id);
    try { await fetch('/api/news', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }); load(); }
    finally { setRowBusy(null); }
  };

  return (
    <main className="container">
      <p className="foot"><a href="/" style={{ color: '#2E8B57' }}>← Dashboard</a></p>
      <h2>Journal de l'app</h2>
      <p className="foot">Publie des actualités visibles dans l'écran « Journal » de l'app : annonces de courses, défis, nouveautés.</p>

      <div className="card" style={{ padding: 16, marginTop: 10 }}>
        <div className="grid-2col">
          <div><label style={lbl}>Titre</label><input style={inp} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nouvelle course : Route de l'Atlas !" /></div>
          <div><label style={lbl}>Type</label>
            <select style={inp} value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map((k) => <option key={k.v} value={k.v}>{k.label}</option>)}</select>
          </div>
        </div>
        <label style={lbl}>Texte</label>
        <textarea style={{ ...inp, height: 70 }} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Détails de l'annonce…" />
        <label style={lbl}>Image (URL — affichée en grand dans l'app)</label>
        <input style={inp} value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…/photo.jpg" />
        {imageUrl.trim() ? <img src={imageUrl.trim()} alt="" style={{ maxHeight: 120, borderRadius: 10, marginTop: 8 }} /> : null}
        <button onClick={publish} disabled={busy || !title.trim()} style={{ marginTop: 10, padding: '10px 18px', borderRadius: 10, border: 'none', background: '#2E8B57', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
          {busy ? '…' : '📣 Publier dans l\'app'}
        </button>
      </div>

      <h3 style={{ marginTop: 24 }}>Publications {loading ? '…' : `(${items.length})`}</h3>
      {err ? <div className="card empty">⚠️ {err}</div> : (
        <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
          {items.map((n) => (
            <div key={n._id} className="card" style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 10, opacity: n.active ? 1 : 0.5 }}>
              <span>{(KINDS.find((k) => k.v === n.kind) || KINDS[0]).label.split(' ')[0]}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{n.title}</div>
                {n.body ? <div className="foot">{n.body}</div> : null}
              </div>
              <button disabled={rowBusy === n._id} onClick={() => toggle(n)} style={btnSm}>{n.active ? 'Masquer' : 'Réactiver'}</button>
              <button disabled={rowBusy === n._id} onClick={() => del(n._id)} style={{ ...btnSm, color: '#e11d48', borderColor: '#fecaca' }}>Supprimer</button>
            </div>
          ))}
          {!loading && !items.length && <div className="card empty">Aucune publication. Publie la première ci-dessus.</div>}
        </div>
      )}
    </main>
  );
}
const lbl: any = { display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', margin: '10px 0 6px' };
const inp: any = { width: '100%', padding: '9px 11px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' };
const btnSm: any = { padding: '7px 11px', borderRadius: 9, border: '1px solid #e5e7eb', background: '#fff', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', color: '#2E8B57' };
