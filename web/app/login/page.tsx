'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthShell from '../AuthShell';
import ConnexionGoogle from './ConnexionGoogle';

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
      if (j.ok) { router.push('/admin'); router.refresh(); }
      else setErr(j.error || 'Identifiants invalides');
    } catch { setErr('Erreur réseau'); }
    finally { setLoading(false); }
  };

  return (
    <AuthShell
      image="/auth/login.jpg"
      accroche="Ce que vos utilisateurs mangent, vous le voyez ici."
      sousTitre="Le back-office de Salorie : comptes, contenus signalés, activation des fonctionnalités et courses virtuelles."
    >
      {/* Les champs portent un <label> lié par htmlFor, un name et un autoComplete :
          sans eux, un gestionnaire de mots de passe ne sait NI reconnaître le
          formulaire NI le remplir — et un lecteur d'écran annonce « champ de saisie »
          sans dire lequel. */}
      <h1 className="auth-title">Connexion</h1>
      <p className="auth-sub">Accès réservé aux administrateurs.</p>

      {/* Google d'abord : c'est le chemin le plus court pour qui a déjà sa
          session ouverte. Le formulaire e-mail reste dessous, entier — il ne
          dépend ni de Clerk ni du réseau Google, et reste le seul recours si
          l'un des deux tombe. */}
      <ConnexionGoogle />

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
          <input
            className="input" id="password" name="password" type="password"
            autoComplete="current-password" required
            aria-invalid={!!err} aria-describedby={err ? 'auth-err' : undefined}
            value={password} onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {/* role=alert : l'erreur est annoncée dès son apparition, sans déplacer le focus. */}
        {err && <div className="msg msg-err" id="auth-err" role="alert">{err}</div>}

        <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={loading}>
          {loading ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>

      <div className="auth-foot">
        Pas encore de compte ? <Link href="/register">Créer un compte</Link>
      </div>
    </AuthShell>
  );
}
