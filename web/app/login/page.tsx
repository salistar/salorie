'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(''); setLoading(true);
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const j = await r.json();
      if (j.ok) { router.push('/'); router.refresh(); }
      else setErr(j.error || 'Identifiants invalides');
    } catch { setErr('Erreur réseau'); }
    finally { setLoading(false); }
  };

  return (
    <div style={S.wrap}>
      <form onSubmit={submit} style={S.card}>
        <div style={S.brand}>🔥 Salorie <span style={{ color: '#64748b', fontWeight: 400 }}>Admin</span></div>
        <h1 style={S.h1}>Connexion</h1>
        <input style={S.input} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input style={S.input} type="password" placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {err && <div style={S.err}>{err}</div>}
        <button style={{ ...S.btn, opacity: loading ? 0.6 : 1 }} disabled={loading}>{loading ? '…' : 'Se connecter'}</button>
        <div style={S.foot}>Pas de compte ? <Link href="/register" style={S.link}>Créer un compte</Link></div>
      </form>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#EAF4EE,#fff)', fontFamily: 'system-ui, sans-serif' },
  card: { width: 360, background: '#fff', borderRadius: 20, padding: 32, boxShadow: '0 10px 40px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column', gap: 14 },
  brand: { fontSize: 20, fontWeight: 800, color: '#2E8B57', marginBottom: 4 },
  h1: { fontSize: 24, fontWeight: 800, color: '#0F172A', margin: '0 0 8px' },
  input: { padding: '13px 14px', borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 15, outline: 'none' },
  btn: { padding: '14px', borderRadius: 12, border: 'none', background: '#2E8B57', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', marginTop: 4 },
  err: { color: '#B42318', background: '#FEF3F2', borderRadius: 10, padding: 10, fontSize: 13 },
  foot: { fontSize: 14, color: '#64748b', textAlign: 'center', marginTop: 4 },
  link: { color: '#2E8B57', fontWeight: 700, textDecoration: 'none' },
};
