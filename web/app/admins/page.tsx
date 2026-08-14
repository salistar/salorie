'use client';
// Gouvernance des comptes du back-office — reservee au super-admin.
// La page est l'unique endroit ou l'on peut elargir des droits ; toutes ses actions
// repassent par `requireSuperadmin` cote serveur (cf. app/api/admins/route.ts), le
// masquage du menu n'etant qu'un confort, jamais une protection.
import { useCallback, useEffect, useState } from 'react';
import { SCOPES_ATTRIBUABLES, libelleRole, type Role, type Scope } from '../../lib/scopes';

type Compte = { email: string; role: Role; scopes: Scope[]; createdAt?: string };

const ROLES: { valeur: Role; label: string; aide: string }[] = [
  { valeur: 'owner', label: 'Super-admin', aide: 'Tout, y compris les comptes et les clés IA' },
  { valeur: 'admin', label: 'Admin', aide: 'Lecture + écriture, limité à ses périmètres' },
  { valeur: 'viewer', label: 'Lecture seule', aide: 'Consulte sans jamais modifier' },
];

function Perimetres({
  valeurs,
  onChange,
  desactive,
}: {
  valeurs: Scope[];
  onChange: (s: Scope[]) => void;
  desactive?: boolean;
}) {
  const bascule = (s: Scope) =>
    onChange(valeurs.includes(s) ? valeurs.filter((v) => v !== s) : [...valeurs, s]);
  return (
    <div className="perimetres">
      {SCOPES_ATTRIBUABLES.map(({ scope, label }) => (
        <label key={scope} className={`perimetre${valeurs.includes(scope) ? ' actif' : ''}`}>
          <input
            type="checkbox"
            checked={valeurs.includes(scope)}
            disabled={desactive}
            onChange={() => bascule(scope)}
          />
          {label}
        </label>
      ))}
    </div>
  );
}

export default function PageAdmins() {
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');

  // Formulaire de creation
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [role, setRole] = useState<Role>('admin');
  const [scopes, setScopes] = useState<Scope[]>([]);

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const r = await fetch('/api/admins');
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || 'Accès refusé');
      setComptes(d.comptes);
      setErreur('');
    } catch (e: any) {
      setErreur(e.message);
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  const appeler = async (methode: string, corps: object, succes: string) => {
    setMessage('');
    setErreur('');
    const r = await fetch('/api/admins', {
      method: methode,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
    });
    const d = await r.json();
    if (!d.ok) {
      setErreur(d.error || 'Erreur');
      return false;
    }
    setMessage(succes);
    await charger();
    return true;
  };

  const creer = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await appeler(
      'POST',
      { email, password: motDePasse, role, scopes: role === 'admin' ? scopes : [] },
      `Compte ${email} créé.`,
    );
    if (ok) {
      setEmail('');
      setMotDePasse('');
      setScopes([]);
    }
  };

  return (
    <main className="container">
      <h1>Comptes back-office</h1>
      <p className="sous-titre">
        Trois niveaux : le <b>super-admin</b> gouverne l'outil (comptes, clés IA), l'<b>admin</b>{' '}
        travaille dans les périmètres qu'on lui donne, la <b>lecture seule</b> observe. Les
        utilisateurs de l'app, eux, n'ont pas de compte ici — ils se connectent sur{' '}
        <a href="/me">/me</a> avec leur compte Salorie.
      </p>

      {erreur ? <div className="card empty">⚠️ {erreur}</div> : null}
      {message ? <div className="card ok-msg">✅ {message}</div> : null}

      <h2>Créer un compte</h2>
      <form className="card form-admin" onSubmit={creer}>
        <div className="ligne-champs">
          <label>
            <span>Email</span>
            <input
              className="input"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="collegue@salistar.com"
            />
          </label>
          <label>
            <span>Mot de passe (12 caractères minimum)</span>
            <input
              className="input"
              type="password"
              required
              minLength={12}
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              autoComplete="new-password"
            />
          </label>
        </div>

        <div className="ligne-roles">
          {ROLES.map((r) => (
            <label key={r.valeur} className={`carte-role${role === r.valeur ? ' actif' : ''}`}>
              <input
                type="radio"
                name="role"
                checked={role === r.valeur}
                onChange={() => setRole(r.valeur)}
              />
              <b>{r.label}</b>
              <span>{r.aide}</span>
            </label>
          ))}
        </div>

        {role === 'admin' ? (
          <div>
            <div className="titre-perimetres">
              Périmètres — <span>aucun coché = accès à tout (compatibilité)</span>
            </div>
            <Perimetres valeurs={scopes} onChange={setScopes} />
          </div>
        ) : null}

        <button className="btn btn-primary" type="submit">
          Créer le compte
        </button>
      </form>

      <h2>Comptes existants</h2>
      {chargement ? (
        <div className="card empty">Chargement…</div>
      ) : (
        <div className="liste-comptes">
          {comptes.map((c) => (
            <LigneCompte key={c.email} compte={c} onAction={appeler} />
          ))}
          {!comptes.length ? <div className="card empty">Aucun compte.</div> : null}
        </div>
      )}
    </main>
  );
}

function LigneCompte({
  compte,
  onAction,
}: {
  compte: Compte;
  onAction: (m: string, c: object, s: string) => Promise<boolean>;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [role, setRole] = useState<Role>(compte.role);
  const [scopes, setScopes] = useState<Scope[]>(compte.scopes || []);

  return (
    <div className="card compte">
      <div className="compte-tete">
        <div>
          <div className="compte-email">{compte.email}</div>
          <div className="compte-detail">
            <span className={`sb-role r-${compte.role}`}>{libelleRole(compte.role)}</span>
            {compte.role === 'admin' ? (
              <span className="compte-scopes">
                {compte.scopes?.length
                  ? compte.scopes
                      .map((s) => SCOPES_ATTRIBUABLES.find((x) => x.scope === s)?.label || s)
                      .join(' · ')
                  : 'tous périmètres'}
              </span>
            ) : null}
          </div>
        </div>
        <div className="compte-actions">
          <button className="btn btn-sm" onClick={() => setOuvert((o) => !o)}>
            {ouvert ? 'Fermer' : 'Modifier'}
          </button>
          <button
            className="btn btn-sm btn-danger"
            onClick={() => {
              if (confirm(`Supprimer définitivement ${compte.email} ?`)) {
                onAction('DELETE', { email: compte.email }, `${compte.email} supprimé.`);
              }
            }}
          >
            Supprimer
          </button>
        </div>
      </div>

      {ouvert ? (
        <div className="compte-edition">
          <div className="ligne-roles">
            {ROLES.map((r) => (
              <label key={r.valeur} className={`carte-role${role === r.valeur ? ' actif' : ''}`}>
                <input
                  type="radio"
                  name={`role-${compte.email}`}
                  checked={role === r.valeur}
                  onChange={() => setRole(r.valeur)}
                />
                <b>{r.label}</b>
                <span>{r.aide}</span>
              </label>
            ))}
          </div>
          {role === 'admin' ? <Perimetres valeurs={scopes} onChange={setScopes} /> : null}
          <div className="compte-actions">
            <button
              className="btn btn-primary btn-sm"
              onClick={() =>
                onAction(
                  'PATCH',
                  { email: compte.email, role, scopes: role === 'admin' ? scopes : [] },
                  `${compte.email} mis à jour.`,
                )
              }
            >
              Enregistrer
            </button>
          </div>
          <p className="compte-note">
            Les droits voyagent dans le jeton de session : la modification prend effet à la
            prochaine connexion de la personne, au plus tard sous 7 jours.
          </p>
        </div>
      ) : null}
    </div>
  );
}
