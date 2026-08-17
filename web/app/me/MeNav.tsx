'use client';
// Navigation de l'espace personnel — les memes sections que les onglets du mobile,
// pour qu'un utilisateur qui passe du telephone au web ne se reapprenne rien.
import { usePathname } from 'next/navigation';
import { UserButton } from '@clerk/clerk-react';

const SECTIONS = [
  { href: '/me', label: 'Accueil', icone: '🏠' },
  { href: '/me/diary', label: 'Journal', icone: '🍽️' },
  { href: '/me/scan', label: 'Scanner', icone: '📷' },
  { href: '/me/plans', label: 'Plans', icone: '🗓️' },
  { href: '/me/aliments', label: 'Aliments', icone: '🥗' },
  { href: '/me/analytics', label: 'Analyses', icone: '📈' },
  { href: '/me/races', label: 'Courses', icone: '🏁' },
  { href: '/me/coach', label: 'Coach', icone: '💬' },
  { href: '/me/mur', label: 'Mur', icone: '📝' },
  { href: '/me/amis', label: 'Amis', icone: '👥' },
  { href: '/me/famille', label: 'Famille', icone: '🏡' },
  { href: '/me/medailles', label: 'Médailles', icone: '🏅' },
  { href: '/me/parrainage', label: 'Parrainage', icone: '🎁' },
  { href: '/me/import', label: 'Import', icone: '📥' },
  { href: '/me/rapport', label: 'Rapport', icone: '🩺' },
  { href: '/me/profile', label: 'Profil', icone: '⚙️' },
];

export default function MeNav() {
  const chemin = usePathname() || '/me';
  const actif = (href: string) => (href === '/me' ? chemin === '/me' : chemin.startsWith(href));

  return (
    <header className="me-nav">
      <a className="me-nav-marque" href="/me">
        {/* Le VRAI logo, pas un emoji. `logo.png` est l'exact fichier que porte
            l'app mobile (`assets/images/fire.png`, au bit près) : la marque doit
            être la même des deux côtés, sinon l'espace web a l'air d'un autre
            produit. Il ne servait jusqu'ici que sur l'écran de connexion. */}
        <img className="me-nav-logo" src="/me/logo.png" alt="" width={26} height={26} />
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
