'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthShell from '../AuthShell';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(''); setLoading(true);
    try {
      const r = await fetch('/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const j = await r.json();
      if (j.ok) { router.push('/'); router.refresh(); }
      else setErr(j.error || 'Erreur');
    } catch { setErr('Erreur réseau'); }
    finally { setLoading(false); }
  };

  return (
    <AuthShell
      image="/auth/register.jpg"
      accroche="Un back-office, pas un compte utilisateur."
      sousTitre="L'inscription n'est ouverte qu'au tout premier administrateur, ou avec une clé d'installation. L'application, elle, se télécharge sur salorie.com."
    >
      <h1 className="auth-title">Créer un compte</h1>
      <p className="auth-sub">Compte administrateur du back-office Salorie.</p>

      <form onSubmit={submit} noValidate>
        <div className="field">
          <label className="label" htmlFor="email">Adresse e-mail</label>
          <input
            className="input" id="email" name="email" type="email"
            autoComplete="username" required autoFocus
            aria-invalid={!!err} aria-describedby={err ? 'auth-err' : undefined}
            value={email} onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="password">Mot de passe</label>
          {/* `new-password` : le gestionnaire PROPOSE un mot de passe fort au lieu de
              tenter de remplir avec un ancien. Le minimum de 12 est celui qu'applique
              createUser côté serveur — l'annoncer ici évite un aller-retour inutile. */}
          <input
            className="input" id="password" name="password" type="password"
            autoComplete="new-password" required minLength={12}
            aria-invalid={!!err} aria-describedby={err ? 'auth-err' : 'pwd-hint'}
            value={password} onChange={(e) => setPassword(e.target.value)}
          />
          <span className="hint" id="pwd-hint">12 caractères minimum.</span>
        </div>

        {err && <div className="msg msg-err" id="auth-err" role="alert">{err}</div>}

        <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={loading}>
          {loading ? 'Création…' : 'Créer le compte'}
        </button>
      </form>

      <div className="auth-foot">
        Déjà un compte ? <Link href="/login">Se connecter</Link>
      </div>
    </AuthShell>
  );
}
