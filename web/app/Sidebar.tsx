'use client';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/', label: 'Vue d\'ensemble', icon: '📊' },
  { href: '/notify', label: 'Notifications', icon: '📣' },
  { href: '/races', label: 'Courses virtuelles', icon: '🏁' },
  { href: '/orgs', label: 'Organisations B2B', icon: '🏢' },
  { href: '/feedback', label: 'Feedback users', icon: '💬' },
  { href: '/medals-history', label: 'Médailles gagnées', icon: '🥇' },
  { href: '/achievements', label: 'Achievements', icon: '🏅' },
  { href: '/medal-builder', label: 'Builder médailles', icon: '🥇' },
  { href: '/flags', label: 'Feature Flags', icon: '🎛️' },
];

export default function Sidebar() {
  const path = usePathname() || '/';
  if (path === '/login' || path === '/register') return null; // pages plein écran
  const isActive = (href: string) => (href === '/' ? path === '/' || path.startsWith('/users') : path.startsWith(href));

  return (
    <aside className="sidebar">
      <div className="sb-brand">
        <span className="sb-logo">🔥</span>
        <div>
          <div className="sb-name">Salorie</div>
          <div className="sb-sub">Back-office</div>
        </div>
      </div>
      <nav className="sb-nav">
        {NAV.map((n) => (
          <a key={n.href} href={n.href} className={`sb-link${isActive(n.href) ? ' active' : ''}`}>
            <span className="sb-ico">{n.icon}</span>{n.label}
          </a>
        ))}
      </nav>
      <form action="/api/auth/logout" method="post" className="sb-foot">
        <button type="submit" className="sb-logout">⎋ Déconnexion</button>
      </form>
    </aside>
  );
}
