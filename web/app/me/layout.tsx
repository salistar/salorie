import type { ReactNode } from 'react';
import MeProvider from './MeProvider';
import MeNav from './MeNav';
import { BandeauHorsLigne } from '../../components/ui';

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
        {/* Premiere tabulation : sauter la navigation plutot que la retraverser. */}
        <a href="#contenu" className="saut-nav">Aller au contenu</a>
        <MeNav />
        {/* Une SEULE fois, dans la mise en page : place sur chaque page, il
            faudrait le maintenir 70 fois et il finirait par manquer quelque
            part. L'espace membre lit et ecrit Firestore en direct — sans ce
            bandeau, une saisie hors reseau semble enregistree alors qu'elle
            attend, et rien ne le dit a l'utilisateur. */}
        <BandeauHorsLigne />
        <main className="me-contenu" id="contenu">{children}</main>
      </div>
    </MeProvider>
  );
}
