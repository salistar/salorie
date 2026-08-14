'use client';
// Navigation de l'espace personnel — les memes sections que les onglets du mobile,
// pour qu'un utilisateur qui passe du telephone au web ne se reapprenne rien.
import { usePathname } from 'next/navigation';
import { UserButton } from '@clerk/clerk-react';

const SECTIONS = [
  { href: '/me', label: 'Accueil', icone: '🏠' },
  { href: '/me/diary', label: 'Journal', icone: '🍽️' },
  { href: '/me/scan', label: 'Scanner', icone: '📷' },
  { href: '/me/analytics', label: 'Analyses', icone: '📈' },
  { href: '/me/races', label: 'Courses', icone: '🏁' },
];

export default function MeNav() {
  const chemin = usePathname() || '/me';
  const actif = (href: string) => (href === '/me' ? chemin === '/me' : chemin.startsWith(href));

  return (
    <header className="me-nav">
      <a className="me-nav-marque" href="/me">
        <span className="me-nav-logo">🥗</span>
        <span>Salorie</span>
      </a>
      <nav className="me-nav-liens">
        {SECTIONS.map((s) => (
          <a key={s.href} href={s.href} className={`me-nav-lien${actif(s.href) ? ' actif' : ''}`}>
            <span aria-hidden>{s.icone}</span>
            {s.label}
          </a>
        ))}
      </nav>
      <div className="me-nav-compte">
        <UserButton afterSignOutUrl="/me" />
      </div>
    </header>
  );
}
