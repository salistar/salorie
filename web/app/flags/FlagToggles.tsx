'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Key = { key: string; label: string; cat?: string };

// Valeur riche par flag. La valeur brute (doc Firestore) peut être un boolean
// (legacy) OU un objet { enabled, premium, rollout, minVersion }.
type Rich = { enabled: boolean; premium: boolean; rollout: number; minVersion: string };

// Normalise une valeur brute (boolean | objet) → Rich. Défauts : enabled=true,
// premium=false, rollout=100.
function normalize(v: any): Rich {
  if (typeof v === 'object' && v !== null) {
    return {
      enabled: v.enabled !== false,
      premium: v.premium === true,
      rollout: typeof v.rollout === 'number' ? v.rollout : 100,
      minVersion: typeof v.minVersion === 'string' ? v.minVersion : '',
    };
  }
  // boolean (ou absent) : enabled reflète le boolean, reste au défaut.
  return { enabled: v !== false, premium: false, rollout: 100, minVersion: '' };
}

type Patch = Partial<Pick<Rich, 'enabled' | 'premium' | 'rollout' | 'minVersion'>>;

export default function FlagToggles({ flags, keys }: { flags: Record<string, any>; keys: Key[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [local, setLocal] = useState<Record<string, Rich>>(() => {
    const out: Record<string, Rich> = {};
    for (const k of keys) out[k.key] = normalize(flags?.[k.key]);
    return out;
  });

  // Applique un patch riche à un flag : optimistic UI + rollback sur échec.
  async function patch(key: string, p: Patch) {
    setBusy(key);
    const prev = local;
    setLocal({ ...local, [key]: { ...local[key], ...p } });
    try {
      const res = await fetch('/api/flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, patch: p }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      router.refresh();
    } catch {
      setLocal(prev); // échec d'écriture → on revient à l'état réel
      if (typeof window !== 'undefined') window.alert('Échec de la mise à jour du flag — réessaie.');
    }
    setBusy(null);
  }

  return (
    <div className="card">
      {keys.map((k) => {
        const r = local[k.key] || normalize(flags?.[k.key]);
        const disabled = busy === k.key;
        return (
          <div
            key={k.key}
            style={{
              display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
              justifyContent: 'space-between', padding: '12px 4px', borderBottom: '1px solid #eef2f7',
            }}
          >
            <div style={{ minWidth: 180, flex: '1 1 200px' }}>
              <div style={{ fontWeight: 600 }}>{k.label}</div>
              <div className="umail">{k.key}</div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {/* (a) On/Off */}
              <button
                onClick={() => patch(k.key, { enabled: !r.enabled })}
                disabled={disabled}
                style={{ minWidth: 104, padding: '8px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontWeight: 700, color: '#fff', background: r.enabled ? '#2E8B57' : '#cbd5e1' }}
              >
                {disabled ? '…' : r.enabled ? '✓ Activé' : 'Désactivé'}
              </button>

              {/* (b) Premium */}
              <button
                onClick={() => patch(k.key, { premium: !r.premium })}
                disabled={disabled}
                title="Réservé aux comptes Premium"
                style={{ minWidth: 96, padding: '8px 12px', borderRadius: 20, cursor: 'pointer', fontWeight: 700, background: r.premium ? '#2E8B57' : '#fff', color: r.premium ? '#fff' : '#2E8B57', border: '1px solid #2E8B57' }}
              >
                {r.premium ? '★ Premium' : 'Premium'}
              </button>

              {/* (c) Rollout % */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#64748b' }}>
                Rollout
                <input
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={r.rollout}
                  disabled={disabled}
                  onBlur={(e) => {
                    let n = Math.round(Number(e.target.value));
                    if (!Number.isFinite(n)) n = 100;
                    n = Math.max(0, Math.min(100, n));
                    e.target.value = String(n);
                    if (n !== r.rollout) patch(k.key, { rollout: n });
                  }}
                  style={{ width: 60, padding: '6px 8px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
                />
                %
              </label>

              {/* (d) minVersion */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#64748b' }}>
                min v.
                <input
                  type="text"
                  placeholder="—"
                  defaultValue={r.minVersion}
                  disabled={disabled}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v !== r.minVersion) patch(k.key, { minVersion: v });
                  }}
                  style={{ width: 84, padding: '6px 8px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }}
                />
              </label>
            </div>
          </div>
        );
      })}
    </div>
  );
}
