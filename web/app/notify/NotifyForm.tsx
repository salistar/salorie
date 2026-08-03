'use client';
import { useState } from 'react';

type U = { id: string; email?: string; firstName?: string };

export default function NotifyForm({ users }: { users: U[] }) {
  const [title, setTitle] = useState('Salorie');
  const [message, setMessage] = useState('');
  const [mode, setMode] = useState<'all' | 'select'>('all');
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const selectedIds = Object.keys(sel).filter((k) => sel[k]);
  const recipients = mode === 'all' ? users.length : selectedIds.length;

  const send = async () => {
    if (!message.trim() || busy) return;
    if (mode === 'select' && !selectedIds.length) { setResult('⚠️ Sélectionne au moins un user.'); return; }
    setBusy(true); setResult(null);
    try {
      const res = await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, message, userIds: mode === 'select' ? selectedIds : undefined }),
      });
      const j = await res.json();
      if (j.error) setResult('❌ ' + j.error);
      else {
        const errs = ([] as string[]).concat(j.fcmErrors || [], j.errors || []);
        setResult(
          `✅ ${j.inApp ?? 0} in-app · ${j.fcmSent ?? 0}/${j.fcmTargets ?? 0} push (FCM)` +
          `${j.pushSent ? ` · ${j.pushSent} Expo` : ''} · ${j.total ?? 0} cible(s).` +
          (errs.length ? ` ⚠️ ${errs.slice(0, 3).join(', ')}` : '')
        );
      }
    } catch (e: any) { setResult('❌ ' + (e?.message || 'erreur')); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <div className="card" style={{ padding: 20, marginBottom: 18 }}>
        <label style={lbl}>Titre</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} style={inp} placeholder="Salorie" />
        <label style={lbl}>Message</label>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} style={{ ...inp, height: 90, resize: 'vertical' }} placeholder="Ton message aux utilisateurs…" />

        <label style={lbl}>Destinataires</label>
        <div style={{ display: 'flex', gap: 10, marginBottom: 6 }}>
          <button onClick={() => setMode('all')} style={chip(mode === 'all')}>Tous les users ({users.length})</button>
          <button onClick={() => setMode('select')} style={chip(mode === 'select')}>Sélection</button>
        </div>
      </div>

      {mode === 'select' && (
        <div className="card" style={{ padding: 8, marginBottom: 18, maxHeight: 320, overflowY: 'auto' }}>
          {users.map((u) => (
            <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #eef2f7' }}>
              <input type="checkbox" checked={!!sel[u.id]} onChange={(e) => setSel((s) => ({ ...s, [u.id]: e.target.checked }))} />
              <span style={{ fontWeight: 600 }}>{u.firstName || (u.email ? u.email.split('@')[0] : u.id)}</span>
              <span className="umail">{u.email || u.id}</span>
            </label>
          ))}
        </div>
      )}

      <button onClick={send} disabled={busy || !message.trim()} style={sendBtn(busy || !message.trim())}>
        {busy ? 'Envoi…' : `📣 Envoyer à ${recipients} user(s)`}
      </button>
      {result && <p style={{ marginTop: 14, fontWeight: 600, color: result.startsWith('✅') ? '#2E8B57' : '#E11D48' }}>{result}</p>}
    </div>
  );
}

const lbl: any = { display: 'block', fontSize: 13, fontWeight: 700, color: '#64748b', marginBottom: 6, marginTop: 12 };
const inp: any = { width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' };
const chip = (active: boolean): any => ({ padding: '10px 16px', borderRadius: 12, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14, color: active ? '#fff' : '#64748b', background: active ? '#2E8B57' : '#eef2f7' });
const sendBtn = (dis: boolean): any => ({ width: '100%', padding: '15px', borderRadius: 14, border: 'none', cursor: dis ? 'default' : 'pointer', fontWeight: 800, fontSize: 16, color: '#fff', background: dis ? '#cbd5e1' : '#2E8B57' });
