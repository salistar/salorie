'use client';
import { useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { toast, confirmDialog } from '../Toaster';

type KeyDef = { key: string; label: string };
type Rich =
  | boolean
  | { enabled?: boolean; premium?: boolean; rollout?: number; minVersion?: string; config?: any };
type Audit = {
  id: string; ts: number; actor: string; key: string;
  action: string; before: any; after: any; target?: string;
};

type Row = { enabled: boolean; premium: boolean; rollout: number; minVersion: string; config: string };

function toRow(v: Rich | undefined): Row {
  if (v === undefined) return { enabled: true, premium: false, rollout: 100, minVersion: '', config: '' };
  if (typeof v === 'boolean') return { enabled: v !== false, premium: false, rollout: 100, minVersion: '', config: '' };
  return {
    enabled: v.enabled !== false,
    premium: v.premium === true,
    rollout: typeof v.rollout === 'number' ? v.rollout : 100,
    minVersion: v.minVersion || '',
    config: v.config ? JSON.stringify(v.config, null, 2) : '',
  };
}

// Badges d'état — CLASSES du design system (contrastes AA garantis, dark mode inclus).
// Avant : couleurs en dur avec texte blanc sur fond clair (#cbd5e1 → ratio ~1.6:1, illisible).
function badges(r: Row) {
  const b: { t: string; c: string }[] = [];
  b.push(r.enabled ? { t: 'Activé', c: 'badge-on' } : { t: 'Désactivé', c: 'badge-off' });
  if (r.enabled && r.rollout < 100) b.push({ t: `Rollout ${r.rollout}%`, c: 'badge-warn' });
  if (r.premium) b.push({ t: 'Premium', c: 'badge-info' });
  if (r.minVersion) b.push({ t: `≥ v${r.minVersion}`, c: 'badge-info' });
  if (r.config) b.push({ t: 'Params', c: 'badge-off' });
  return b;
}

export default function FlagsAdmin({
  flags, keys, audit,
}: { flags: Record<string, Rich>; keys: KeyDef[]; audit: Audit[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, Row>>(() => {
    const m: Record<string, Row> = {};
    keys.forEach((k) => { m[k.key] = toRow(flags[k.key]); });
    return m;
  });

  function upd(key: string, patch: Partial<Row>) {
    setRows((s) => ({ ...s, [key]: { ...s[key], ...patch } }));
  }

  async function save(key: string) {
    const r = rows[key];
    let config: any = undefined;
    if (r.config.trim()) {
      try { config = JSON.parse(r.config); }
      catch { toast.err('Params JSON invalide pour « ' + key + ' » — corrige la syntaxe.'); return; }
    }
    setBusy(key);
    try {
      const res = await fetch('/api/flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key,
          patch: { enabled: r.enabled, premium: r.premium, rollout: r.rollout, minVersion: r.minVersion || undefined, config },
        }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      setOpen(null);
      router.refresh();
    } catch { toast.err('Échec de la sauvegarde de « ' + key + ' ».'); }
    setBusy(null);
  }

  async function revert(id: string) {
    const ok = await confirmDialog({ title: 'Annuler ce changement', message: 'La valeur précédente de ce flag sera restaurée.', confirmLabel: 'Restaurer' });
    if (!ok) return;
    setBusy('audit:' + id);
    try {
      const res = await fetch('/api/flags/revert', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      router.refresh();
    } catch { toast.err('Échec du revert.'); }
    setBusy(null);
  }

  // Conservé pour compat : les champs utilisent désormais la classe .input du
  // design system (focus visible + dark mode). Ce style ne porte plus de couleur.
  const inputStyle: CSSProperties = {
    fontSize: 14, width: '100%',
  };

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div className="card" style={{ padding: 0 }}>
        {keys.map((k) => {
          const r = rows[k.key];
          const isOpen = open === k.key;
          return (
            <div key={k.key} style={{ borderBottom: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{k.label}</div>
                  <div className="umail" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                    <span style={{ opacity: 0.6 }}>{k.key}</span>
                    {badges(r).map((bd, i) => (
                      <span key={i} className={`badge ${bd.c}`} style={{ fontSize: 11, padding: '2px 9px' }}>{bd.t}</span>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button
                    onClick={() => { upd(k.key, { enabled: !r.enabled }); }}
                    title="Bascule rapide activé/désactivé (pense à Enregistrer)"
                    className={`btn btn-sm ${r.enabled ? 'btn-primary' : 'btn-ghost'}`}
                    aria-pressed={r.enabled}
                    style={{ minWidth: 104 }}
                  >
                    {r.enabled ? '✓ Activé' : 'Désactivé'}
                  </button>
                  <button
                    onClick={() => setOpen(isOpen ? null : k.key)}
                    className="btn btn-sm btn-ghost"
                    aria-expanded={isOpen}
                  >
                    {isOpen ? 'Fermer' : '⚙️ Avancé'}
                  </button>
                </div>
              </div>

              {isOpen && (
                <div style={{ padding: '4px 16px 18px', display: 'grid', gap: 14, background: 'var(--bg-soft)' }}>
                  <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 600 }}>
                      <input type="checkbox" checked={r.enabled} onChange={(e) => upd(k.key, { enabled: e.target.checked })} /> Activé
                    </label>
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 600 }}>
                      <input type="checkbox" checked={r.premium} onChange={(e) => upd(k.key, { premium: e.target.checked })} /> Réservé Premium
                    </label>
                  </div>

                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, minWidth: 130 }}>Rollout : {r.rollout}%</span>
                    <input aria-label="Pourcentage de deploiement (curseur)" type="range" min={0} max={100} step={5} value={r.rollout} onChange={(e) => upd(k.key, { rollout: Number(e.target.value) })} style={{ flex: 1, minWidth: 180 }} />
                    <input aria-label="Pourcentage de deploiement" className="input" type="number" min={0} max={100} value={r.rollout} onChange={(e) => upd(k.key, { rollout: Math.max(0, Math.min(100, Number(e.target.value))) })} style={{ ...inputStyle, width: 80 }} />
                  </div>
                  <div className="umail" style={{ opacity: 0.7 }}>0 % = personne (kill), 100 % = tout le monde. Bucket stable par utilisateur (hash déterministe).</div>

                  <div style={{ display: 'grid', gap: 6 }}>
                    <label style={{ fontWeight: 600 }} htmlFor="flags-version-minimale-de-l-app-option">Version minimale de l'app (optionnel)</label>
                    <input id="flags-version-minimale-de-l-app-option" aria-label="ex. 1.4.0" className="input" placeholder="ex. 1.4.0" value={r.minVersion} onChange={(e) => upd(k.key, { minVersion: e.target.value })} style={{ ...inputStyle, maxWidth: 200 }} />
                  </div>

                  <div style={{ display: 'grid', gap: 6 }}>
                    <label style={{ fontWeight: 600 }}>Params (JSON) — seuils lus par l'écran</label>
                    <textarea className="textarea"
                      placeholder={'{\n  "logQuota": 200,\n  "quietHours": [22, 7]\n}'}
                      value={r.config}
                      onChange={(e) => upd(k.key, { config: e.target.value })}
                      rows={5}
                      style={{ ...inputStyle, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13 }}
                    />
                  </div>

                  <div>
                    <button
                      onClick={() => save(k.key)}
                      disabled={busy === k.key}
                      style={{ padding: '10px 22px', borderRadius: 12, border: 'none', cursor: 'pointer', fontWeight: 800, color: '#fff', background: '#2E8B57' }}
                    >
                      {busy === k.key ? 'Enregistrement…' : 'Enregistrer'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div>
        <h2>Journal des changements (audit)</h2>
        <p className="foot">Qui a changé quoi et quand. « Annuler » restaure la valeur précédente.</p>
        <div className="card" style={{ padding: 0 }}>
          {audit.length === 0 ? (
            <div style={{ padding: 16 }} className="umail">Aucun changement enregistré pour l'instant.</div>
          ) : audit.map((a) => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 16px', borderBottom: '1px solid #eef2f7' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>
                  {a.action === 'premium' ? `Premium → ${a.target}` : a.key}
                  <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: a.action === 'revert' ? '#d97706' : '#475569' }}>
                    {a.action}
                  </span>
                </div>
                <div className="umail" style={{ marginTop: 2 }}>
                  {new Date(a.ts).toLocaleString('fr-FR')} · {a.actor} · {JSON.stringify(a.before)} → {JSON.stringify(a.after)}
                </div>
              </div>
              <button
                onClick={() => revert(a.id)}
                disabled={busy === 'audit:' + a.id}
                style={{ flexShrink: 0, padding: '6px 14px', borderRadius: 20, border: '1px solid #d7dee8', cursor: 'pointer', fontWeight: 700, background: '#fff' }}
              >
                {busy === 'audit:' + a.id ? '…' : '↩ Annuler'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
