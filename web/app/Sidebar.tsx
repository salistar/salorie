'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import ThemeToggle from './ThemeToggle';
import { sectionsVisibles, libelleRole, type Role, type Scope } from '../lib/scopes';

// Le menu n'est plus une liste figee : il est DERIVE des droits du compte connecte
// (cf. lib/scopes.ts, source unique partagee avec le middleware et les routes API).
// Un admin cantonne a la moderation ne voit donc que la moderation — et s'il tape
// l'URL d'une autre section a la main, le middleware l'en detourne.
type Session = { email: string; role: Role; scopes: Scope[] } | null;

export default function Sidebar() {
  const path = usePathname() || '/';
  const [session, setSession] = useState<Session>(null);

  useEffect(() => {
    let vivant = true;
    fetch('/api/session')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (vivant && d?.ok) setSession({ email: d.email, role: d.role, scopes: d.scopes || [] });
      })
      .catch(() => {
        /* pas de session : les pages sont de toute facon protegees par le middleware */
      });
    return () => {
      vivant = false;
    };
  }, []);

  if (path === '/login' || path === '/register') return null; // pages plein écran
  // /me est l'espace des UTILISATEURS, pas du back-office : il porte sa propre
  // navigation (cf. app/me/MeNav.tsx) et ne doit rien laisser filtrer de l'admin.
  if (path === '/me' || path.startsWith('/me/')) return null;
  // Les pages PUBLIQUES (landing fusionnee) n'ont pas de chrome d'admin.
  const PUBLIQUES = ['/', '/ar', '/en', '/contact', '/privacy', '/terms', '/refund', '/delete-account'];
  if (PUBLIQUES.some((r) => path === r || path.startsWith(r + '/'))) return null;

  // Tant que la session n'est pas connue, on affiche le menu du role le plus
  // RESTREINT plutot que le plus large : mieux vaut un lien qui apparait une demi-
  // seconde plus tard qu'un lien interdit qui clignote a l'ecran.
  const sections = session ? sectionsVisibles(session.role, session.scopes) : [];
  const isActive = (href: string) =>
    href === '/admin' ? path === '/admin' || path.startsWith('/users') : path.startsWith(href);

  return (
    <aside className="sidebar">
      {/* La marque devient un LIEN vers le site public. Depuis le back-office,
          rien ne ramenait a salorie.com : il fallait retaper l'adresse. Le logo
          est l'endroit ou chacun clique d'instinct pour « rentrer ». */}
      <a className="sb-brand" href="/" title="Retour au site public" style={{ textDecoration: 'none', color: 'inherit' }}>
        <span className="sb-logo">🔥</span>
        <div>
          <div className="sb-name">Salorie</div>
          {/* « Back-office » n'est pas decoratif : c'est ce qui empeche de
              confondre cette interface avec l'espace membre, alors que les deux
              vivent sur le meme domaine et partagent la meme marque. */}
          <div className="sb-sub">Back-office</div>
        </div>
      </a>
      <nav className="sb-nav">
        {sections.map((n) => (
          <a key={n.href} href={n.href} className={`sb-link${isActive(n.href) ? ' active' : ''}`}>
            <span className="sb-ico">{n.icone}</span>
            {n.label}
          </a>
        ))}
      </nav>
      <div className="sb-foot">
        {session ? (
          <div className="sb-compte" title={session.email}>
            <span className={`sb-role r-${session.role}`}>{libelleRole(session.role)}</span>
            <span className="sb-email">{session.email}</span>
          </div>
        ) : null}
        <ThemeToggle />
        <form action="/api/auth/logout" method="post">
          <button type="submit" className="sb-logout">⎋ Déconnexion</button>
        </form>
      </div>
    </aside>
  );
}
