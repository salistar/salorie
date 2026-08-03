'use client';
import { useCallback, useEffect, useState } from 'react';

type Listing = {
  id: string;
  title?: string;
  category?: string;
  price?: number;
  currency?: string;
  description?: string;
  photo?: string;
  photoUrl?: string;
  imageUrl?: string;
  ownerUid?: string;
  createdBy?: string;
  userId?: string;
  status?: string;
  approved?: boolean;
  createdAt?: any;
};

const photoOf = (l: Listing) => l.photo || l.photoUrl || l.imageUrl || '';

function price(l: Listing): string {
  if (l.price == null || Number.isNaN(l.price)) return '—';
  const cur = l.currency || 'MAD';
  return `${l.price} ${cur}`;
}

function when(ts: any): string {
  try {
    const ms = ts?._seconds ? ts._seconds * 1000 : (ts?.seconds ? ts.seconds * 1000 : (typeof ts === 'number' ? ts : Date.parse(ts)));
    if (!ms) return '';
    return new Date(ms).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

export default function MarketplacePage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const r = await fetch('/api/marketplace', { cache: 'no-store' });
      const j = await r.json();
      if (j.error) { setErr(j.error); }
      else { setListings(Array.isArray(j.listings) ? j.listings : []); }
    } catch (e: any) { setErr(e?.message || 'erreur réseau'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (l: Listing, action: 'approve' | 'reject') => {
    const id = l.id;
    if (!id) return;
    if (action === 'reject' && !confirm(`Rejeter l’annonce « ${l.title || id} » ?`)) return;
    setBusy(id); setMsg(null);
    try {
      const r = await fetch('/api/marketplace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        setListings((cur) => cur.filter((x) => x.id !== id));
        setMsg(action === 'approve' ? '✅ Annonce approuvée.' : '🗑️ Annonce rejetée.');
      } else { setMsg(`❌ ${j.error || j.message || 'échec de l’action'}`); }
    } catch (e: any) { setMsg(`❌ ${e?.message || 'erreur réseau'}`); }
    finally { setBusy(null); }
  };

  return (
    <main className="container">
      <p className="foot"><a href="/" style={{ color: '#2E8B57' }}>← Dashboard</a></p>
      <h2>Marketplace</h2>
      <p className="foot">Modération des petites annonces proposées par les utilisateurs. Approuver les rend visibles dans l’app ; rejeter les retire.</p>
      {msg && <p style={{ fontWeight: 600, color: msg.startsWith('✅') || msg.startsWith('🗑️') ? '#2E8B57' : '#e11d48' }}>{msg}</p>}

      <h3 style={{ marginTop: 22 }}>🛒 Annonces en attente {loading ? '…' : `(${listings.length})`}</h3>
      <p className="foot">Annonces proposées par les users (non encore approuvées). Approuver les publie ; rejeter les marque « removed ».</p>
      {err ? <div className="card empty">⚠️ {err}</div> : (
        <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
          {listings.map((l) => (
            <div key={l.id} className="card" style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
              {photoOf(l)
                ? <img src={photoOf(l)} alt="annonce" style={{ width: 64, height: 64, borderRadius: 10, objectFit: 'cover', border: '1px solid #e5e7eb' }} />
                : <div style={{ width: 64, height: 64, borderRadius: 10, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>🛒</div>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {l.title || '(sans titre)'}
                  {l.category ? <span className="badge" style={{ marginLeft: 8 }}>{l.category}</span> : null}
                </div>
                <div className="foot" style={{ fontWeight: 600 }}>{price(l)}</div>
                <div className="foot">Proposé par {l.ownerUid || l.createdBy || l.userId || '—'} · {when(l.createdAt)}</div>
              </div>
              <button disabled={busy === l.id} onClick={() => act(l, 'approve')} style={{ ...btnSm, background: '#2E8B57', color: '#fff', borderColor: '#2E8B57' }}>✅ Approuver</button>
              <button disabled={busy === l.id} onClick={() => act(l, 'reject')} style={{ ...btnSm, color: '#e11d48', borderColor: '#fecaca' }}>Rejeter</button>
            </div>
          ))}
          {!loading && !listings.length && <div className="card empty">Aucune annonce en attente. 🎉</div>}
        </div>
      )}

      <p className="foot" style={{ marginTop: 18 }}>Salorie Admin · marketplace · Firestore en direct</p>
    </main>
  );
}

const btnSm: any = { padding: '8px 12px', borderRadius: 9, border: '1px solid #e5e7eb', background: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', color: '#2E8B57' };
