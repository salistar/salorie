'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';

type Pending = {
  _id?: string;
  id?: string;
  barcode?: string;
  proposedName?: string;
  name?: string;
  photo?: string;
  photoUrl?: string;
  imageUrl?: string;
  createdAt?: string;
};

type Stats = {
  total?: number;
  corrected?: number;
  gold?: number;
  byLabel?: Record<string, number> | { label: string; count: number }[];
};

const pid = (p: Pending) => (p._id || p.id || '') as string;
const pname = (p: Pending) => p.proposedName || p.name || '(nom proposé manquant)';
const pphoto = (p: Pending) => p.photo || p.photoUrl || p.imageUrl || '';

export default function ModerationPage() {
  const [pending, setPending] = useState<Pending[]>([]);
  const [stats, setStats] = useState<Stats>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const r = await fetch('/api/moderation', { cache: 'no-store' });
      const j = await r.json();
      if (j.error) { setErr(j.error); }
      else { setPending(Array.isArray(j.pending) ? j.pending : []); setStats(j.stats || {}); }
    } catch (e: any) { setErr(e?.message || 'erreur réseau'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (p: Pending, action: 'validate' | 'reject') => {
    const id = pid(p);
    if (!id) return;
    if (action === 'reject' && !confirm(`Rejeter le produit « ${pname(p)} » ?`)) return;
    setBusy(id); setMsg(null);
    try {
      const r = await fetch(`/api/moderation/pending/${encodeURIComponent(id)}?action=${action}`, { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        setPending((cur) => cur.filter((x) => pid(x) !== id));
        setMsg(action === 'validate' ? '✅ Produit validé.' : '🗑️ Produit rejeté.');
      } else { setMsg(`❌ ${j.error || j.message || 'échec de l’action'}`); }
    } catch (e: any) { setMsg(`❌ ${e?.message || 'erreur réseau'}`); }
    finally { setBusy(null); }
  };

  const train = async () => {
    setBusy('train'); setMsg(null);
    try {
      const r = await fetch('/api/moderation/train', { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      setMsg(r.ok ? `✅ ${j.message || 'Demande enregistrée.'}` : `❌ ${j.error || 'échec'}`);
    } catch (e: any) { setMsg(`❌ ${e?.message || 'erreur réseau'}`); }
    finally { setBusy(null); }
  };

  // Normalise byLabel en liste triée (accepte objet {label:count} ou tableau).
  const labels = useMemo(() => {
    const bl = stats.byLabel;
    if (!bl) return [];
    const arr = Array.isArray(bl)
      ? bl.map((x) => ({ label: x.label, count: x.count }))
      : Object.entries(bl).map(([label, count]) => ({ label, count: Number(count) }));
    return arr.sort((a, b) => b.count - a.count);
  }, [stats]);

  return (
    <main className="container">
      <p className="foot"><a href="/" style={{ color: '#2E8B57' }}>← Dashboard</a></p>
      <h2>Modération</h2>
      <p className="foot">Validation des produits inconnus (barcodes) et pilotage de la boucle active-learning (plats inconnus corrigés).</p>
      {msg && <p style={{ fontWeight: 600, color: msg.startsWith('✅') || msg.startsWith('🗑️') ? '#2E8B57' : '#e11d48' }}>{msg}</p>}

      {/* (a) Produits inconnus ------------------------------------------------ */}
      <h3 style={{ marginTop: 22 }}>📦 Produits inconnus {loading ? '…' : `(${pending.length})`}</h3>
      <p className="foot">Étiquettes scannées sans correspondance. Valider crée le produit ; rejeter l’écarte.</p>
      {err ? <div className="card empty">⚠️ {err}</div> : (
        <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
          {pending.map((p) => (
            <div key={pid(p)} className="card" style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
              {pphoto(p)
                ? <img src={pphoto(p)} alt="étiquette" style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover', border: '1px solid #e5e7eb' }} />
                : <div style={{ width: 56, height: 56, borderRadius: 10, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🏷️</div>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>{pname(p)}</div>
                <div className="foot">Code-barres : {p.barcode || '—'}</div>
              </div>
              <button disabled={busy === pid(p)} onClick={() => act(p, 'validate')} style={btnSm}>✅ Valider</button>
              <button disabled={busy === pid(p)} onClick={() => act(p, 'reject')} style={{ ...btnSm, color: '#e11d48', borderColor: '#fecaca' }}>Rejeter</button>
            </div>
          ))}
          {!loading && !pending.length && <div className="card empty">Aucun produit en attente. 🎉</div>}
        </div>
      )}

      {/* (b) Plats inconnus (active-learning) -------------------------------- */}
      <h3 style={{ marginTop: 28 }}>🧪 Plats inconnus (active-learning)</h3>
      <p className="foot">Corrections faites par les utilisateurs, qui alimentent le ré-entraînement du modèle de reconnaissance.</p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
        <Stat label="Total" value={stats.total} />
        <Stat label="Corrigés" value={stats.corrected} />
        <Stat label="Gold (vérifiés)" value={stats.gold} />
      </div>

      {labels.length > 0 && (
        <div className="card" style={{ padding: 14, marginTop: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Regroupement par label corrigé</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {labels.map((l) => (
              <div key={l.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span style={{ color: '#334155' }}>{l.label}</span>
                <span style={{ fontWeight: 700, color: '#2E8B57' }}>{l.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 14, marginTop: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 700 }}>Ré-entraîner le modèle</div>
          <div className="foot">Enregistre une demande. L’exécution du script se fait manuellement sur srv3.</div>
        </div>
        <button disabled={busy === 'train'} onClick={train} style={{ ...btnSm, background: '#2E8B57', color: '#fff', borderColor: '#2E8B57' }}>
          {busy === 'train' ? '…' : '🚀 Lancer l’entraînement'}
        </button>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <div className="card" style={{ padding: '12px 18px', minWidth: 120, textAlign: 'center' }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: '#2E8B57' }}>{value ?? '—'}</div>
      <div className="foot">{label}</div>
    </div>
  );
}

const btnSm: any = { padding: '8px 12px', borderRadius: 9, border: '1px solid #e5e7eb', background: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', color: '#2E8B57' };
