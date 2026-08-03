'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type PUser = { id: string; email: string; premiumOverride: boolean };

export default function PremiumManager({ users }: { users: PUser[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [local, setLocal] = useState<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {};
    for (const u of users) out[u.id] = !!u.premiumOverride;
    return out;
  });

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return users;
    return users.filter((u) => (u.email || '').toLowerCase().includes(s) || u.id.toLowerCase().includes(s));
  }, [q, users]);

  // Toggle Premium : optimistic UI + rollback + alert sur échec.
  async function toggle(u: PUser) {
    const next = !local[u.id];
    setBusy(u.id);
    const prev = local;
    setLocal({ ...local, [u.id]: next });
    try {
      const res = await fetch('/api/premium', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: u.id, value: next }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      router.refresh();
    } catch {
      setLocal(prev);
      if (typeof window !== 'undefined') window.alert('Échec de la mise à jour Premium — réessaie.');
    }
    setBusy(null);
  }

  return (
    <>
      <div style={{ margin: '4px 0 14px' }}>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher par email ou id…"
          style={{ width: '100%', maxWidth: 360, padding: '9px 12px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14 }}
        />
      </div>
      <div className="card">
        {filtered.length === 0 ? (
          <div className="empty">Aucun utilisateur{q ? ' pour cette recherche' : ''}.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Utilisateur</th><th>Statut</th><th style={{ textAlign: 'right' }}>Action</th></tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const on = local[u.id];
                  const disabled = busy === u.id;
                  return (
                    <tr key={u.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{u.email || '—'}</div>
                        <div className="umail">{u.id}</div>
                      </td>
                      <td>
                        {on
                          ? <span className="badge">★ Premium</span>
                          : <span className="umail">Standard</span>}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          onClick={() => toggle(u)}
                          disabled={disabled}
                          style={{ minWidth: 150, padding: '8px 14px', borderRadius: 20, cursor: 'pointer', fontWeight: 700, color: '#fff', background: on ? '#cbd5e1' : '#2E8B57', border: 'none' }}
                        >
                          {disabled ? '…' : on ? 'Retirer Premium' : 'Accorder Premium'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
