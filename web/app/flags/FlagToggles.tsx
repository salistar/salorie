'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Key = { key: string; label: string };

export default function FlagToggles({ flags, keys }: { flags: Record<string, boolean>; keys: Key[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [local, setLocal] = useState<Record<string, boolean>>(flags || {});

  async function toggle(key: string) {
    const currentlyOn = local[key] !== false; // défaut = activé
    const next = !currentlyOn;
    setBusy(key);
    setLocal({ ...local, [key]: next });
    try {
      await fetch('/api/flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: next }),
      });
      router.refresh();
    } catch { /* revert visuel léger ignoré */ }
    setBusy(null);
  }

  return (
    <div className="card">
      {keys.map((k) => {
        const on = local[k.key] !== false;
        return (
          <div key={k.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 4px', borderBottom: '1px solid #eef2f7' }}>
            <div>
              <div style={{ fontWeight: 600 }}>{k.label}</div>
              <div className="umail">{k.key}</div>
            </div>
            <button
              onClick={() => toggle(k.key)}
              disabled={busy === k.key}
              style={{ minWidth: 110, padding: '8px 16px', borderRadius: 20, border: 'none', cursor: 'pointer', fontWeight: 700, color: '#fff', background: on ? '#2E8B57' : '#cbd5e1' }}
            >
              {busy === k.key ? '…' : on ? '✓ Activé' : 'Désactivé'}
            </button>
          </div>
        );
      })}
    </div>
  );
}
