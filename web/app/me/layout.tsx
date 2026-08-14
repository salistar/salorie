import type { ReactNode } from 'react';
import MeProvider from './MeProvider';
import MeNav from './MeNav';

// L'espace personnel est un site dans le site : il ne partage avec le back-office
// que la feuille de style et le shell HTML. La barre laterale d'administration
// s'efface d'elle-meme sous /me (cf. app/Sidebar.tsx) et le portail d'admin par
// jeton la laisse passer (cf. middleware.ts) — /me a son propre gardien, Clerk.
export const metadata = {
  title: 'Salorie — mon espace',
  description: 'Ton journal, tes analyses et tes courses Salorie, sur le web.',
};

export default function MeLayout({ children }: { children: ReactNode }) {
  return (
    <MeProvider>
      <div className="me-shell">
        <MeNav />
        <main className="me-contenu">{children}</main>
      </div>
    </MeProvider>
  );
}
