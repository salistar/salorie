'use client';
import { useEffect, useState, useCallback } from 'react';

const TYPES = [
  { v: 'coach', label: 'Coach / diététicien', icon: '🧑‍⚕️', invite: 'client' },
  { v: 'club', label: 'Club / salle', icon: '🏋️', invite: 'member' },
  { v: 'insurer', label: 'Assureur / employeur', icon: '🏢', invite: 'member' },
  { v: 'whitelabel', label: 'White-label', icon: '🏷️', invite: 'admin' },
];

export default function OrgsPage() {
  const [orgs, setOrgs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  // form
  const [type, setType] = useState('coach');
  const [name, setName] = useState('');
  const [color, setColor] = useState('#2E8B57');
  const [logoUrl, setLogoUrl] = useState('');
  const [domain, setDomain] = useState('');
  const [ownerUserId, setOwnerUserId] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // per-org
  const [open, setOpen] = useState<string | null>(null);
  const [members, setMembers] = useState<Record<string, any[]>>({});
  const [invite, setInvite] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const j = await (await fetch('/api/orgs', { cache: 'no-store' })).json();
      if (Array.isArray(j)) setOrgs(j); else setErr(j.error || 'backend injoignable');
    } catch (e: any) { setErr(e?.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!name.trim()) { setMsg('⚠️ Nom requis.'); return; }
    setBusy(true); setMsg(null);
    try {
      const body: any = { type, name, branding: { primaryColor: color, logoUrl, domain }, plan: 'trial' };
      if (ownerUserId) body.ownerUserId = ownerUserId;
      const j = await (await fetch('/api/orgs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
      if (j._id) { setMsg(`✅ « ${j.name} » créée.`); setName(''); load(); }
      else setMsg('❌ ' + (j.message || j.error));
    } catch (e: any) { setMsg('❌ ' + e?.message); } finally { setBusy(false); }
  };

  const toggle = async (id: string) => {
    if (open === id) { setOpen(null); return; }
    setOpen(id);
    if (!members[id]) {
      const j = await (await fetch(`/api/orgs/${id}`, { cache: 'no-store' })).json();
      setMembers((m) => ({ ...m, [id]: Array.isArray(j) ? j : [] }));
    }
  };
  const mkInvite = async (id: string, role: string) => {
    const j = await (await fetch(`/api/orgs/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) })).json();
    if (j.code) setInvite((i) => ({ ...i, [id]: j.code }));
  };
  const del = async (id: string) => { if (confirm('Supprimer cette organisation ?')) { await fetch(`/api/orgs/${id}`, { method: 'DELETE' }); load(); } };

  return (
    <main className="container">
      <p className="foot"><a href="/" style={{ color: '#2E8B57' }}>← Dashboard</a></p>
      <h2>Organisations B2B</h2>
      <p className="foot">Coachs, clubs, assureurs, white-label — chaque organisation a ses membres, rôles, branding et invitations.</p>

      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {TYPES.map((t) => (
            <button key={t.v} onClick={() => setType(t.v)} style={chip(type === t.v)}>{t.icon} {t.label}</button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Nom"><input style={inp} value={name} onChange={(e) => setName(e.target.value)} placeholder="Coach Karim / FC Atlas…" /></Field>
          <Field label="Couleur (branding)"><input style={{ ...inp, padding: 4, height: 42 }} type="color" value={color} onChange={(e) => setColor(e.target.value)} /></Field>
          <Field label="Logo URL"><input style={inp} value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…" /></Field>
          {type === 'whitelabel' && <Field label="Domaine"><input style={inp} value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="app.monclub.com" /></Field>}
          <Field label="Owner userId (optionnel)"><input style={inp} value={ownerUserId} onChange={(e) => setOwnerUserId(e.target.value)} placeholder="uid Firebase" /></Field>
        </div>
        <button onClick={create} disabled={busy} style={btnMain}>{busy ? 'Création…' : '➕ Créer l\'organisation'}</button>
        {msg && <p style={{ marginTop: 10, fontWeight: 600, color: msg.startsWith('✅') ? '#2E8B57' : '#e11d48' }}>{msg}</p>}
      </div>

      <h3 style={{ marginTop: 26 }}>Organisations {loading ? '…' : `(${orgs.length})`}</h3>
      {err ? <div className="card empty">⚠️ {err}</div> : (
        <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
          {orgs.map((o) => {
            const tdef = TYPES.find((t) => t.v === o.type) || TYPES[0];
            return (
              <div key={o._id} className="card" style={{ padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 22 }}>{tdef.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{o.name} <span style={{ fontSize: 11, color: '#fff', background: o.branding?.primaryColor || '#2E8B57', padding: '2px 8px', borderRadius: 999, marginLeft: 6 }}>{tdef.label}</span></div>
                    <div className="foot">{o.plan} · {o.slug || '—'}</div>
                  </div>
                  <button onClick={() => toggle(o._id)} style={btnSm}>{open === o._id ? 'Masquer' : 'Membres'}</button>
                  <button onClick={() => mkInvite(o._id, tdef.invite)} style={btnSm}>+ Invitation</button>
                  <button onClick={() => del(o._id)} style={{ ...btnSm, color: '#e11d48' }}>Suppr.</button>
                </div>
                {invite[o._id] && <p style={{ marginTop: 8, fontWeight: 700, color: '#2E8B57' }}>Code d'invitation : <code style={{ background: '#eef7f1', padding: '3px 8px', borderRadius: 6 }}>{invite[o._id]}</code> (rôle {tdef.invite})</p>}
                {open === o._id && (
                  <div style={{ marginTop: 10, borderTop: '1px solid #eef2f7', paddingTop: 10 }}>
                    {(members[o._id] || []).length ? members[o._id].map((m, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13 }}>
                        <span>{m.userName || m.email || m.userId}</span><span className="foot">{m.role}</span>
                      </div>
                    )) : <span className="foot">Aucun membre. Crée une invitation.</span>}
                  </div>
                )}
              </div>
            );
          })}
          {!loading && !orgs.length && <div className="card empty">Aucune organisation. Crée la première ci-dessus.</div>}
        </div>
      )}
    </main>
  );
}

function Field({ label, children }: { label: string; children: any }) { return <div><label style={lbl}>{label}</label>{children}</div>; }
const lbl: any = { display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', margin: '4px 0 5px' };
const inp: any = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box' };
const chip = (a: boolean): any => ({ padding: '8px 14px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, color: a ? '#fff' : '#64748b', background: a ? '#2E8B57' : '#eef2f7' });
const btnMain: any = { width: '100%', padding: 13, borderRadius: 12, border: 'none', background: '#2E8B57', color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer', marginTop: 14 };
const btnSm: any = { padding: '7px 11px', borderRadius: 9, border: '1px solid #e5e7eb', background: '#fff', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', color: '#2E8B57' };
