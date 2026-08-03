'use client';
import { useEffect, useState } from 'react';

type Provider = { key: string; label: string; hint: string };
type Status = Record<string, { set: boolean; masked?: string }>;

export default function AiKeysPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [status, setStatus] = useState<Status>({});
  const [vals, setVals] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/ai-keys', { cache: 'no-store' });
      const j = await r.json();
      setProviders(j.providers || []);
      setStatus(j.status || {});
    } catch { setMsg('Erreur de chargement'); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    // On n'envoie QUE les champs remplis (pour ne pas écraser une clé déjà posée avec du vide).
    const keys: Record<string, string> = {};
    for (const [k, v] of Object.entries(vals)) { if (v && v.trim()) keys[k] = v.trim(); }
    if (!Object.keys(keys).length) { setMsg('Rien à enregistrer — colle au moins une clé.'); return; }
    setSaving(true); setMsg('');
    try {
      const r = await fetch('/api/ai-keys', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys }),
      });
      const j = await r.json();
      if (j.ok) { setStatus(j.status || {}); setVals({}); setMsg('✅ Clés enregistrées. Le backend les utilisera automatiquement.'); }
      else setMsg(j.error || 'Erreur');
    } catch { setMsg('Erreur réseau'); }
    setSaving(false);
  };

  const clearOne = async (key: string) => {
    setSaving(true); setMsg('');
    try {
      const r = await fetch('/api/ai-keys', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: { [key]: '' } }),
      });
      const j = await r.json();
      if (j.ok) { setStatus(j.status || {}); setMsg('Clé retirée.'); }
    } catch { setMsg('Erreur'); }
    setSaving(false);
  };

  return (
    <div style={S.wrap}>
      <h1 style={S.h1}>🔑 Clés IA (providers LLM)</h1>
      <p style={S.sub}>
        Colle tes clés API ici. Elles sont stockées de façon sécurisée (Firestore verrouillé,
        jamais lisible par l'app mobile) et le <b>Coach IA</b> les utilise automatiquement, avec
        repli d'un provider à l'autre. Laisse vide pour ne pas changer une clé déjà posée.
      </p>
      {loading ? <div style={S.muted}>Chargement…</div> : (
        <>
          <div style={S.grid}>
            {providers.map((p) => {
              const st = status[p.key] || { set: false };
              return (
                <div key={p.key} style={S.card}>
                  <div style={S.row}>
                    <label style={S.label}>{p.label}</label>
                    {st.set
                      ? <span style={S.badgeOk}>✔ configurée {st.masked}</span>
                      : <span style={S.badgeNo}>non configurée</span>}
                  </div>
                  <input
                    style={S.input}
                    type="password"
                    autoComplete="new-password"
                    placeholder={st.set ? '•••••••• (laisse vide pour garder)' : p.hint}
                    value={vals[p.key] || ''}
                    onChange={(e) => setVals((v) => ({ ...v, [p.key]: e.target.value }))}
                  />
                  {st.set && (
                    <button style={S.clear} onClick={() => clearOne(p.key)} disabled={saving}>Retirer</button>
                  )}
                </div>
              );
            })}
          </div>
          <div style={S.footer}>
            <button style={{ ...S.save, opacity: saving ? 0.6 : 1 }} onClick={save} disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer les clés'}
            </button>
            {msg && <span style={S.msg}>{msg}</span>}
          </div>
          <p style={S.note}>
            Ordre d'usage du Coach : Anthropic → DeepSeek → Qwen → OpenAI → … → Cloudflare (gratuit, repli).
            Configurable côté serveur via <code>LLM_TEXT_ORDER</code>. Ne mets jamais ces clés dans GitHub.
          </p>
        </>
      )}
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  wrap: { maxWidth: 820, padding: '8px 4px' },
  h1: { fontSize: 26, fontWeight: 800, color: '#0F172A', margin: '4px 0 6px' },
  sub: { color: '#475569', fontSize: 14, lineHeight: 1.5, marginBottom: 18 },
  muted: { color: '#94a3b8' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))', gap: 14 },
  card: { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  label: { fontWeight: 700, color: '#0F172A', fontSize: 14 },
  badgeOk: { fontSize: 12, fontWeight: 700, color: '#166534', background: '#DCFCE7', borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap' },
  badgeNo: { fontSize: 12, fontWeight: 700, color: '#64748b', background: '#F1F5F9', borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap' },
  input: { padding: '11px 12px', borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 14, outline: 'none', fontFamily: 'monospace' },
  clear: { alignSelf: 'flex-start', background: 'none', border: 'none', color: '#B42318', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 },
  footer: { display: 'flex', alignItems: 'center', gap: 14, marginTop: 20 },
  save: { padding: '13px 24px', borderRadius: 12, border: 'none', background: '#2E8B57', color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer' },
  msg: { fontSize: 14, color: '#0F172A', fontWeight: 600 },
  note: { marginTop: 18, fontSize: 12, color: '#94a3b8', lineHeight: 1.5 },
};
